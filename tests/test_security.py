import pytest
from app.security import (
    generate_fernet_key,
    encrypt_api_key,
    decrypt_api_key,
    generate_secure_token,
    hash_token,
    mask_api_key,
)


def test_encryption_roundtrip():
    key = generate_fernet_key()
    original_api_key = "gsk_test123456789abcdefghijklmnopqrstuvwxyz"
    
    ciphertext = encrypt_api_key(original_api_key, key)
    # Stored credentials must not be plaintext
    assert original_api_key not in ciphertext
    assert ciphertext != original_api_key

    decrypted = decrypt_api_key(ciphertext, key)
    assert decrypted == original_api_key


def test_encryption_invalid_key():
    key1 = generate_fernet_key()
    key2 = generate_fernet_key()
    ciphertext = encrypt_api_key("gsk_secret_123", key1)
    
    with pytest.raises(ValueError, match="Failed to decrypt"):
        decrypt_api_key(ciphertext, key2)


def test_encryption_empty_inputs():
    key = generate_fernet_key()
    with pytest.raises(ValueError):
        encrypt_api_key("", key)
    with pytest.raises(ValueError):
        decrypt_api_key("", key)


def test_token_hashing_and_randomness():
    token1 = generate_secure_token()
    token2 = generate_secure_token()
    assert token1 != token2
    assert len(token1) >= 32

    hash1 = hash_token(token1)
    hash2 = hash_token(token2)
    assert hash1 != hash2
    assert hash1 == hash_token(token1)


def test_mask_api_key():
    assert mask_api_key("gsk_1234567890abcdef") == "gsk_...cdef"
    assert mask_api_key("short") == "****"
    assert mask_api_key("") == ""
