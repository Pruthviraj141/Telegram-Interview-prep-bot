import time
import pytest
from unittest.mock import patch
from httpx import AsyncClient, ASGITransport
from app.config import Settings
from app.database import Database
from app.security import generate_fernet_key, generate_secure_token, hash_token, decrypt_api_key
from app.web import create_app


@pytest.mark.asyncio
async def test_health_endpoint(tmp_path):
    db_file = str(tmp_path / "test_health.db")
    db = Database(db_file)
    await db.init_db()

    settings = Settings(
        APP_ENV="development",
        TELEGRAM_BOT_TOKEN="token",
        ENCRYPTION_KEY=generate_fernet_key()
    )
    app = create_app(settings, db)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://localhost") as client:
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert "token" not in str(data)
        assert "key" not in str(data)


@pytest.mark.asyncio
async def test_https_guard_in_production(tmp_path):
    db_file = str(tmp_path / "test_prod.db")
    db = Database(db_file)
    await db.init_db()

    settings = Settings(
        APP_ENV="production",
        TELEGRAM_BOT_TOKEN="token",
        ENCRYPTION_KEY=generate_fernet_key()
    )
    app = create_app(settings, db)

    # Insecure HTTP request from remote client in production should be blocked
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://192.168.1.100") as client:
        resp = await client.get("/setup-key?token=sometoken")
        assert resp.status_code == 403
        assert "HTTPS" in resp.text


@pytest.mark.asyncio
async def test_key_setup_flow_and_consumption(tmp_path):
    db_file = str(tmp_path / "test_setup.db")
    db = Database(db_file)
    await db.init_db()

    enc_key = generate_fernet_key()
    settings = Settings(
        APP_ENV="development",
        TELEGRAM_BOT_TOKEN="token",
        ENCRYPTION_KEY=enc_key
    )
    app = create_app(settings, db)

    user_id = 12345
    await db.get_or_create_user(user_id)
    await db.update_onboarding_state(user_id, "AWAITING_GROQ_KEY")

    # Generate token
    raw_token = generate_secure_token()
    token_h = hash_token(raw_token)
    await db.create_key_setup_token(token_h, user_id, time.time() + 300)

    # Mock Groq validation
    with patch("app.web.validate_groq_key", return_value=True):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://localhost") as client:
            # 1. View setup page
            get_resp = await client.get(f"/setup-key?token={raw_token}")
            assert get_resp.status_code == 200
            assert "Connect Groq API Key" in get_resp.text

            # 2. Submit API Key
            post_resp = await client.post(
                "/setup-key",
                data={"token": raw_token, "groq_key": "gsk_my_secret_key_12345"}
            )
            assert post_resp.status_code == 200
            assert "Success! Groq Key Connected" in post_resp.text

            # 3. Verify credentials saved in DB and encrypted
            creds = await db.get_credentials(user_id)
            assert creds is not None
            assert creds["encrypted_groq_key"] != "gsk_my_secret_key_12345"
            decrypted = decrypt_api_key(creds["encrypted_groq_key"], enc_key)
            assert decrypted == "gsk_my_secret_key_12345"

            # 4. State should be updated
            user = await db.get_or_create_user(user_id)
            assert user["onboarding_state"] == "KEY_SAVED"

            # 5. Re-submitting same token must fail (single-use)
            post_again = await client.post(
                "/setup-key",
                data={"token": raw_token, "groq_key": "gsk_another_key"}
            )
            assert post_again.status_code == 400
            assert "Expired or Invalid" in post_again.text
