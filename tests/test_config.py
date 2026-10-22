import os
import pytest
from app.config import Settings


def test_settings_default_values(monkeypatch):
    monkeypatch.delenv("APP_ENV", raising=False)
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)
    s = Settings(
        APP_ENV="development",
        TELEGRAM_BOT_TOKEN="mock_bot_token",
        ENCRYPTION_KEY="mock_fernet_key"
    )
    assert s.APP_ENV == "development"
    assert s.TELEGRAM_BOT_TOKEN == "mock_bot_token"
    assert s.MAX_RESUME_SIZE_BYTES == 5 * 1024 * 1024


def test_settings_invalid_env():
    with pytest.raises(ValueError):
        Settings(APP_ENV="invalid_environment")
