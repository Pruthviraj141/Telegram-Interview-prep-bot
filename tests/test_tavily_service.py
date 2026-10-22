"""
Tests for TavilyService: caching, rate limits, quota enforcement, and privacy sanitization.
"""
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, patch, MagicMock
import httpx
from app.config import Settings
from app.database import Database
from app.services.tavily_service import TavilyService, sanitize_search_query


@pytest_asyncio.fixture
async def tavily_setup(tmp_path):
    db = Database(str(tmp_path / "test_tavily.db"))
    await db.init_db()
    settings = Settings(
        APP_ENV="testing",
        TELEGRAM_BOT_TOKEN="mock_bot_token",
        ENCRYPTION_KEY="mock_enc_key_32_bytes_test_valid_key=",
        TAVILY_API_KEY="tvly-mock-secret-key-12345",
        TAVILY_MAX_DAILY_SEARCHES_PER_USER=2,
        TAVILY_MONTHLY_CREDIT_BUDGET=10
    )
    svc = TavilyService(settings, db)
    return svc, db, settings


def test_sanitize_search_query_strips_sensitive_data():
    raw = "Research IBM for candidate john.doe@example.com phone +91-9876543210 with key gsk_123456789012345678901234567890"
    clean = sanitize_search_query(raw)
    assert "john.doe@example.com" not in clean
    assert "9876543210" not in clean
    assert "gsk_" not in clean
    assert "Research IBM for candidate" in clean


@pytest.mark.asyncio
async def test_missing_tavily_key_returns_graceful_status(tmp_path):
    db = Database(str(tmp_path / "test_no_key.db"))
    await db.init_db()
    settings = Settings(
        APP_ENV="testing",
        TELEGRAM_BOT_TOKEN="mock_bot_token",
        ENCRYPTION_KEY="mock_enc_key_32_bytes_test_valid_key=",
        TAVILY_API_KEY=""  # No key
    )
    svc = TavilyService(settings, db)
    res = await svc.search("Google interview process", telegram_id=123)
    assert res.status == "missing_key"
    assert len(res.sources) == 0
    assert "not configured" in res.message.lower()


@pytest.mark.asyncio
async def test_live_search_success_and_caching(tavily_setup):
    svc, db, _ = tavily_setup

    mock_resp_data = {
        "results": [
            {
                "title": "IBM Careers & Interview Process",
                "url": "https://www.ibm.com/employment",
                "content": "Official guidance on software engineering interviews.",
                "published_date": "2026-01-15"
            },
            {
                "title": "GeeksforGeeks IBM Experience",
                "url": "https://geeksforgeeks.org/ibm-experience",
                "content": "Candidate shared technical rounds in Java and DSA."
            }
        ]
    }

    mock_http_response = MagicMock(spec=httpx.Response)
    mock_http_response.status_code = 200
    mock_http_response.json.return_value = mock_resp_data

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_http_response

        # 1. Fresh search
        res1 = await svc.search("IBM Software Engineer", telegram_id=999)
        assert res1.status == "success"
        assert not res1.is_cached
        assert len(res1.sources) == 2
        assert res1.sources[0].source_id == "source_1"
        assert res1.sources[0].title == "IBM Careers & Interview Process"
        assert res1.sources[0].published_date == "2026-01-15"
        assert res1.sources[1].published_date is None
        assert mock_post.call_count == 1

        # 2. Duplicate search should hit SQLite cache without calling HTTP again
        res2 = await svc.search("IBM Software Engineer", telegram_id=999)
        assert res2.status == "success"
        assert res2.is_cached
        assert len(res2.sources) == 2
        assert mock_post.call_count == 1  # Not incremented!


@pytest.mark.asyncio
async def test_daily_user_quota_enforced(tavily_setup):
    svc, db, _ = tavily_setup

    mock_resp = MagicMock(spec=httpx.Response)
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"results": [{"title": "R1", "url": "https://example.com/1", "content": "C1"}]}

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_resp

        # Search 1 (fresh)
        r1 = await svc.search("Query 1", telegram_id=777)
        assert r1.status == "success"

        # Search 2 (fresh)
        r2 = await svc.search("Query 2", telegram_id=777)
        assert r2.status == "success"

        # Search 3 (user reached limit of 2)
        r3 = await svc.search("Query 3", telegram_id=777)
        assert r3.status == "quota_exceeded"
        assert "daily live web research quota" in r3.message
        assert mock_post.call_count == 2


@pytest.mark.asyncio
async def test_monthly_global_budget_enforced(tavily_setup):
    svc, db, settings = tavily_setup
    # Manually record 10 credits used in SQLite
    for i in range(10):
        await db.record_tavily_usage(telegram_id=i, query=f"q{i}", search_depth="basic", credits=1)

    res = await svc.search("New search after budget exhausted", telegram_id=888)
    assert res.status == "quota_exceeded"
    assert "monthly capacity" in res.message


@pytest.mark.asyncio
async def test_tavily_timeout_handled_gracefully(tavily_setup):
    svc, _, _ = tavily_setup

    with patch("httpx.AsyncClient.post", side_effect=httpx.TimeoutException("Read timed out")):
        res = await svc.search("Timeout test", telegram_id=123)
        assert res.status == "error"
        assert "timed out" in res.message
