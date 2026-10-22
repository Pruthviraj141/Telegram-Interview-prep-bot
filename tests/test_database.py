import os
import pytest
import time
from app.database import Database


@pytest.mark.asyncio
async def test_database_idempotent_init(tmp_path):
    db_file = str(tmp_path / "test.db")
    db = Database(db_file)

    # Initialize twice without errors or loss
    await db.init_db()
    user = await db.get_or_create_user(12345)
    assert user["telegram_id"] == 12345
    assert user["onboarding_state"] == "NEW"

    # Second init should be completely safe
    await db.init_db()
    user_after = await db.get_or_create_user(12345)
    assert user_after["telegram_id"] == 12345


@pytest.mark.asyncio
async def test_user_onboarding_state_transitions(tmp_path):
    db_file = str(tmp_path / "test_user.db")
    db = Database(db_file)
    await db.init_db()

    user_id = 999
    user = await db.get_or_create_user(user_id)
    assert user["onboarding_state"] == "NEW"

    await db.update_onboarding_state(user_id, "AWAITING_RESUME")
    user = await db.get_or_create_user(user_id)
    assert user["onboarding_state"] == "AWAITING_RESUME"

    await db.update_onboarding_state(
        user_id,
        "COMPLETED",
        target_role="Full Stack Engineer",
        target_skills="Python, React",
        target_topics="System Design"
    )
    user = await db.get_or_create_user(user_id)
    assert user["onboarding_state"] == "COMPLETED"
    assert user["target_role"] == "Full Stack Engineer"


@pytest.mark.asyncio
async def test_credentials_save_and_delete(tmp_path):
    db_file = str(tmp_path / "test_creds.db")
    db = Database(db_file)
    await db.init_db()

    user_id = 555
    await db.get_or_create_user(user_id)

    await db.save_credentials(user_id, "encrypted_blob_xyz", "gsk_...1234")
    creds = await db.get_credentials(user_id)
    assert creds is not None
    assert creds["encrypted_groq_key"] == "encrypted_blob_xyz"
    assert creds["key_masked"] == "gsk_...1234"

    # Test safe deletion
    await db.delete_credentials(user_id)
    assert await db.get_credentials(user_id) is None


@pytest.mark.asyncio
async def test_key_setup_token_single_use_and_expiry(tmp_path):
    db_file = str(tmp_path / "test_tokens.db")
    db = Database(db_file)
    await db.init_db()

    user_id = 777
    await db.get_or_create_user(user_id)

    token_hash = "sample_sha256_hash_value"
    expires_at = time.time() + 60.0  # 1 min in future

    await db.create_key_setup_token(token_hash, user_id, expires_at)

    # First consumption succeeds
    consumed_user = await db.consume_token(token_hash, time.time())
    assert consumed_user == user_id

    # Second consumption fails (single-use)
    reused = await db.consume_token(token_hash, time.time())
    assert reused is None

    # Expired token test
    expired_hash = "expired_token_hash"
    await db.create_key_setup_token(expired_hash, user_id, time.time() - 10.0)
    assert await db.consume_token(expired_hash, time.time()) is None
