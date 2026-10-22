import pytest
import time
from app.database import Database
from app.security import (
    generate_fernet_key,
    encrypt_api_key,
    decrypt_api_key,
    generate_secure_token,
    hash_token,
)


@pytest.mark.asyncio
async def test_stored_credential_persists_independently_of_token_expiration(tmp_path):
    """
    Verify:
    1. A single-use setup token expires after its TTL (e.g., 900s).
    2. The saved encrypted API key in user_credentials does NOT expire or get deleted
       when the token expires or across DB reconnects.
    3. The key remains persistently accessible until explicitly replaced or deleted.
    """
    db_file = str(tmp_path / "persistence_test.db")
    db = Database(db_file)
    await db.init_db()

    enc_key = generate_fernet_key()
    user_id = 987654
    await db.get_or_create_user(user_id)

    # 1. Issue setup token with short TTL (e.g. 5 seconds for testing)
    raw_token = generate_secure_token()
    token_h = hash_token(raw_token)
    token_ttl = 5.0
    expires_at = time.time() + token_ttl
    await db.create_key_setup_token(token_h, user_id, expires_at)

    # 2. User submits and consumes token before expiry
    consumed_user = await db.consume_token(token_h, time.time())
    assert consumed_user == user_id

    # 3. Encrypt and store API key in user_credentials
    secret_api_key = "gsk_permanent_user_api_key_1234567890"
    encrypted_blob = encrypt_api_key(secret_api_key, enc_key)
    await db.save_credentials(user_id, encrypted_blob, "gsk_...7890")

    # 4. Simulate passage of time past token expiry (e.g., 20 seconds later)
    simulated_future_time = time.time() + 20.0
    # Any token lookup in the future fails
    assert await db.consume_token(token_h, simulated_future_time) is None

    # 5. Simulate application restart with a fresh Database connection instance
    restarted_db = Database(db_file)
    creds_after_restart = await restarted_db.get_credentials(user_id)

    # Credentials must be intact and valid
    assert creds_after_restart is not None
    assert creds_after_restart["telegram_id"] == user_id
    assert creds_after_restart["encrypted_groq_key"] == encrypted_blob
    assert creds_after_restart["key_masked"] == "gsk_...7890"

    # Decrypt only when needed
    decrypted = decrypt_api_key(creds_after_restart["encrypted_groq_key"], enc_key)
    assert decrypted == secret_api_key

    # 6. Verify credentials only deleted when user explicitly issues delete command
    await restarted_db.delete_credentials(user_id)
    assert await restarted_db.get_credentials(user_id) is None
