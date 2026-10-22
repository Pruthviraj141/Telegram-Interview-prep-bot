import os
import io
import pytest
import pytest_asyncio
from unittest.mock import patch
from httpx import AsyncClient, ASGITransport
from app.config import Settings
from app.database import Database
from app.question_bank import QuestionBank
from app.security import generate_fernet_key, encrypt_api_key
from app.web import create_app

@pytest_asyncio.fixture
async def privacy_fixture(tmp_path):
    db_file = str(tmp_path / "privacy_test.db")
    db = Database(db_file)
    await db.init_db()

    qb = QuestionBank("data/question_bank.json")
    qb.load_and_validate()

    settings = Settings(
        APP_ENV="testing",
        ENCRYPTION_KEY=generate_fernet_key(),
        TELEGRAM_BOT_TOKEN="mock_token"
    )
    app = create_app(settings, db, qb)
    return app, db, settings

@pytest.mark.asyncio
async def test_database_schema_has_no_audio_video_persistence(privacy_fixture):
    """Verify that no database table contains columns for raw audio/video retention."""
    _, db, _ = privacy_fixture
    import aiosqlite
    async with aiosqlite.connect(db.db_path) as conn:
        cursor = await conn.execute("SELECT name, sql FROM sqlite_master WHERE type='table'")
        tables = await cursor.fetchall()
        for name, sql in tables:
            sql_lower = sql.lower()
            assert "raw_audio" not in sql_lower
            assert "audio_blob" not in sql_lower
            assert "audio_bytes" not in sql_lower
            assert "raw_video" not in sql_lower
            assert "video_blob" not in sql_lower


@pytest.mark.asyncio
async def test_transcribe_audio_zero_file_persistence(privacy_fixture, tmp_path):
    """Verify that audio transcription operates strictly in-memory without persistent temp files."""
    app, db, settings = privacy_fixture
    clerk_id = "user_clerk_privacy_test"
    headers = {"X-Clerk-User-Id": clerk_id}

    # Setup user in COMPLETED onboarding state
    await db.get_or_create_web_user(clerk_id)
    encrypted_key = encrypt_api_key("gsk_mock_valid_key_12345", settings.ENCRYPTION_KEY)
    await db.save_web_credentials(clerk_id, encrypted_key, "gsk_...1234")
    await db.update_web_user(clerk_id, onboarding_state="COMPLETED")

    audio_bytes = b"MOCK_OGG_WEBM_AUDIO_STREAM_DATA" * 50
    files = {"audio": ("test_voice.webm", audio_bytes, "audio/webm")}

    # Track directory state
    files_before = set(os.listdir(str(tmp_path)))

    with patch("app.web_routes.transcribe_voice", return_value="This is transcribed text.") as mock_transcribe:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://localhost") as client:
            resp = await client.post("/api/interview/transcribe", headers=headers, files=files)
            assert resp.status_code == 200
            data = resp.json()
            assert data["transcript"] == "This is transcribed text."

            # Verify mock was called with in-memory bytes
            mock_transcribe.assert_called_once()
            call_args = mock_transcribe.call_args
            assert call_args[1]["audio_bytes"] == audio_bytes

    # Ensure no new audio files leaked onto disk
    files_after = set(os.listdir(str(tmp_path)))
    new_files = files_after - files_before
    for f in new_files:
        assert not f.endswith((".webm", ".ogg", ".mp3", ".wav", ".m4a"))

@pytest.mark.asyncio
async def test_privacy_consent_logging(privacy_fixture):
    """Verify explicit informed consent logging."""
    app, db, _ = privacy_fixture
    clerk_id = "user_consent_123"
    headers = {"X-Clerk-User-Id": clerk_id}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://localhost") as client:
        # Check initial consent
        c1 = await client.get("/api/consent", headers=headers)
        assert c1.status_code == 200
        assert c1.json()["has_consented"] is False

        # Record consent
        c2 = await client.post(
            "/api/consent",
            headers=headers,
            json={"consent_type": "audio_transient_processing"}
        )
        assert c2.status_code == 200
        assert c2.json()["consent_recorded"] is True

        # Check again
        c3 = await client.get("/api/consent", headers=headers)
        assert c3.json()["has_consented"] is True
