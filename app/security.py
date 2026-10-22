"""
Cryptographic security helpers for symmetric encryption of Groq API keys and token hashing.
"""
import hashlib
import secrets
from cryptography.fernet import Fernet, InvalidToken


def generate_fernet_key() -> str:
    """Generate a fresh URL-safe base64-encoded 32-byte Fernet key."""
    return Fernet.generate_key().decode()


def get_fernet(key: str) -> Fernet:
    """Instantiate a Fernet cipher given an encryption key."""
    if not key or not key.strip():
        raise ValueError("Encryption key cannot be empty.")
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except Exception as e:
        raise ValueError(f"Invalid Fernet encryption key: {e}") from e


def encrypt_api_key(plain_key: str, encryption_key: str) -> str:
    """
    Encrypt a Groq API key using Fernet authenticated symmetric encryption.
    Returns ciphertext as a utf-8 string.
    """
    if not plain_key or not plain_key.strip():
        raise ValueError("Plaintext API key cannot be empty.")
    cipher = get_fernet(encryption_key)
    ciphertext = cipher.encrypt(plain_key.strip().encode("utf-8"))
    return ciphertext.decode("utf-8")


def decrypt_api_key(encrypted_key: str, encryption_key: str) -> str:
    """
    Decrypt a ciphertext into plain Groq API key using Fernet.
    """
    if not encrypted_key or not encrypted_key.strip():
        raise ValueError("Encrypted key cannot be empty.")
    cipher = get_fernet(encryption_key)
    try:
        decrypted = cipher.decrypt(encrypted_key.encode("utf-8"))
        return decrypted.decode("utf-8")
    except InvalidToken as e:
        raise ValueError("Failed to decrypt API key: invalid token or wrong encryption key") from e


def generate_secure_token(length_bytes: int = 32) -> str:
    """Generate a cryptographically random, URL-safe single-use token."""
    return secrets.token_urlsafe(length_bytes)


def hash_token(raw_token: str) -> str:
    """
    Compute SHA-256 hash of a raw token.
    Only token hashes are stored in the database.
    """
    return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()


def mask_api_key(key: str) -> str:
    """Return a masked representation of an API key for safe display (e.g. gsk_...1234)."""
    if not key:
        return ""
    clean = key.strip()
    if len(clean) <= 8:
        return "****"
    return f"{clean[:4]}...{clean[-4:]}"
