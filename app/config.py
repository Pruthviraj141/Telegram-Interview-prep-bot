"""
Application configuration loaded from environment variables.
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, field_validator, AliasChoices


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    APP_ENV: str = Field(default="development", description="'development' or 'production'")
    TELEGRAM_BOT_TOKEN: str = Field(default="", description="Telegram Bot API Token")
    WEB_BASE_URL: str = Field(default="http://127.0.0.1:8000", description="Public/Local base URL for key setup web pages")
    ENCRYPTION_KEY: str = Field(default="", description="Fernet encryption key for Groq API keys at rest")
    DATABASE_PATH: str = Field(default="app.db", description="Path to SQLite database file")
    WEB_HOST: str = Field(default="127.0.0.1", description="FastAPI host")
    WEB_PORT: int = Field(default=8000, description="FastAPI port")
    MAX_RESUME_SIZE_BYTES: int = Field(default=5 * 1024 * 1024, description="Max allowed resume size (5MB)")
    KEY_SETUP_TOKEN_EXPIRY_SECONDS: int = Field(
        default=900,
        description="Lifetime (seconds) strictly for the one-time web setup token link. Stored credentials never expire automatically."
    )
    TESTING_GROQ_API_KEY: str = Field(default="", description="Optional fallback Groq API key for local testing")
    GROQ_MODEL: str = Field(default="openai/gpt-oss-20b", description="Default Groq LLM model")
    GROQ_WHISPER_MODEL: str = Field(default="whisper-large-v3-turbo", description="Groq Whisper model for audio")
    MAX_VOICE_SIZE_BYTES: int = Field(default=25 * 1024 * 1024, description="Max allowed voice message size (25MB)")
    MAX_VOICE_DURATION_SECONDS: int = Field(default=300, description="Max allowed voice duration in seconds (5 minutes)")
    MIN_VOICE_DURATION_SECONDS: int = Field(default=2, description="Min voice message duration in seconds")

    # Tavily Web Research Configuration
    TAVILY_API_KEY: str = Field(
        default="",
        validation_alias=AliasChoices("TAVILY_API_KEY", "tavily", "TAVILY", "tavily_api_key"),
        description="Shared Tavily Search API key"
    )
    TAVILY_SEARCH_DEPTH: str = Field(default="basic", description="Search depth: 'basic' or 'advanced'")
    TAVILY_MAX_RESULTS: int = Field(default=5, description="Max results per search")
    TAVILY_MAX_DAILY_SEARCHES_PER_USER: int = Field(default=2, description="Max fresh searches per user per day")
    TAVILY_MONTHLY_CREDIT_BUDGET: int = Field(default=800, description="Estimated monthly credit budget")
    TAVILY_GENERAL_CACHE_HOURS: int = Field(default=12, description="Cache lifetime (hours) for general research")
    TAVILY_COMPANY_CACHE_HOURS: int = Field(default=6, description="Cache lifetime (hours) for company/hiring research")

    # Clerk & Web Frontend Configuration
    CLERK_SECRET_KEY: str = Field(default="", description="Clerk Backend Secret Key")
    CLERK_PUBLISHABLE_KEY: str = Field(default="", description="Clerk Frontend Publishable Key")
    FRONTEND_ORIGIN: str = Field(default="http://localhost:3000", description="Allowed CORS origin for Next.js frontend")


    @field_validator("APP_ENV")
    @classmethod
    def validate_app_env(cls, v: str) -> str:
        env = v.lower().strip()
        if env not in {"development", "production", "testing"}:
            raise ValueError("APP_ENV must be 'development', 'production', or 'testing'")
        return env

    @field_validator("TAVILY_API_KEY", mode="before")
    @classmethod
    def validate_tavily_key(cls, v: str) -> str:
        if v and v.strip():
            return v.strip()
        import os
        fallback = os.getenv("tavily") or os.getenv("TAVILY") or ""
        return fallback.strip()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
