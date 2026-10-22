"""
Tavily Search API service with caching, privacy sanitization, and quota controls.
Uses async httpx client to call official Tavily REST API directly.
"""
import hashlib
import json
import logging
import re
import time
from typing import Dict, Any, List, Optional
from dataclasses import dataclass, asdict
import httpx

from app.config import Settings
from app.database import Database

logger = logging.getLogger(__name__)

TAVILY_API_ENDPOINT = "https://api.tavily.com/search"


@dataclass
class NormalizedSource:
    source_id: str
    title: str
    url: str
    snippet: str
    published_date: Optional[str] = None


@dataclass
class SearchResult:
    sources: List[NormalizedSource]
    is_cached: bool
    status: str  # 'success', 'quota_exceeded', 'missing_key', 'error', 'empty'
    message: str


def sanitize_search_query(query: str) -> str:
    """
    Sanitize query to prevent leaking sensitive information:
    strips email addresses, phone numbers, API keys, and excessive length.
    """
    q = query.strip()
    # Strip emails
    q = re.sub(r'[\w\.-]+@[\w\.-]+\.\w+', '', q)
    # Strip potential phone numbers (sequences of 10+ digits)
    q = re.sub(r'\+?\d{1,4}?[-.\s]?\(?\d{1,3}?\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}', '', q)
    # Strip potential API keys (e.g. gsk_..., tvly-...)
    q = re.sub(r'(gsk_|tvly-)[A-Za-z0-9_-]*', '', q)
    # Remove control characters and excessive whitespace
    q = re.sub(r'\s+', ' ', q).strip()
    return q[:300]


def hash_search_request(query: str, search_depth: str, max_results: int) -> str:
    norm = f"{query.lower().strip()}|{search_depth.lower()}|{max_results}"
    return hashlib.sha256(norm.encode("utf-8")).hexdigest()


class TavilyService:
    def __init__(self, settings: Settings, db: Database):
        self.settings = settings
        self.db = db

    def is_configured(self) -> bool:
        return bool(self.settings.TAVILY_API_KEY and self.settings.TAVILY_API_KEY.strip())

    async def search(
        self,
        query: str,
        telegram_id: Optional[int] = None,
        is_company_prep: bool = False,
        search_depth: Optional[str] = None,
        max_results: Optional[int] = None
    ) -> SearchResult:
        """
        Execute search with cache-first lookup, quota enforcement, and sanitized query.
        """
        depth = search_depth or self.settings.TAVILY_SEARCH_DEPTH
        results_count = max_results or self.settings.TAVILY_MAX_RESULTS

        clean_query = sanitize_search_query(query)
        if not clean_query:
            return SearchResult(
                sources=[],
                is_cached=False,
                status="empty",
                message="Search query was empty or contained only sensitive/invalid content."
            )

        query_hash = hash_search_request(clean_query, depth, results_count)

        # 1. Check SQLite Cache
        cached = await self.db.get_tavily_cache(query_hash)
        if cached:
            sources = [NormalizedSource(**s) for s in cached.get("results", [])]
            return SearchResult(
                sources=sources,
                is_cached=True,
                status="success",
                message="Retrieved from local cache."
            )

        # 2. Check if Tavily key is configured
        if not self.is_configured():
            logger.info("Tavily search skipped: TAVILY_API_KEY not configured on server.")
            return SearchResult(
                sources=[],
                is_cached=False,
                status="missing_key",
                message="Live web research is not configured on this server. Proceeding with foundational knowledge."
            )

        # 3. Check Quotas
        # Monthly global budget check
        monthly_credits = await self.db.get_total_tavily_credits_this_month()
        if monthly_credits >= self.settings.TAVILY_MONTHLY_CREDIT_BUDGET:
            logger.warning(f"Tavily monthly budget exhausted ({monthly_credits}/{self.settings.TAVILY_MONTHLY_CREDIT_BUDGET}).")
            return SearchResult(
                sources=[],
                is_cached=False,
                status="quota_exceeded",
                message="Live web research is temporarily unavailable due to monthly capacity. Using internal knowledge base."
            )

        # Per-user daily check
        if telegram_id:
            user_today_searches = await self.db.get_user_tavily_searches_today(telegram_id)
            if user_today_searches >= self.settings.TAVILY_MAX_DAILY_SEARCHES_PER_USER:
                logger.info(f"User {telegram_id} reached daily fresh search limit ({user_today_searches}).")
                return SearchResult(
                    sources=[],
                    is_cached=False,
                    status="quota_exceeded",
                    message="You have used your daily live web research quota (2/2). Using internal knowledge base."
                )

        # 4. Perform Live Search via HTTP
        payload = {
            "api_key": self.settings.TAVILY_API_KEY.strip(),
            "query": clean_query,
            "search_depth": depth,
            "max_results": results_count,
            "include_answer": False,
            "include_raw_content": False
        }

        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.post(TAVILY_API_ENDPOINT, json=payload)

            if resp.status_code == 429:
                logger.warning("Tavily rate limit exceeded (429).")
                return SearchResult(
                    sources=[],
                    is_cached=False,
                    status="error",
                    message="Live web research provider is currently rate-limited. Using foundational knowledge."
                )

            if resp.status_code != 200:
                logger.error(f"Tavily API returned error status {resp.status_code}: {resp.text[:200]}")
                return SearchResult(
                    sources=[],
                    is_cached=False,
                    status="error",
                    message="Could not retrieve external search results at this time."
                )

            data = resp.json()
            raw_results = data.get("results", [])

            sources: List[NormalizedSource] = []
            for idx, r in enumerate(raw_results, 1):
                url = r.get("url", "")
                title = r.get("title") or url
                snippet = r.get("content", "")
                pub_date = r.get("published_date") or None

                if url and url.startswith("http"):
                    sources.append(NormalizedSource(
                        source_id=f"source_{idx}",
                        title=title.strip(),
                        url=url.strip(),
                        snippet=snippet.strip(),
                        published_date=pub_date
                    ))

            # Record usage in SQLite
            credits_spent = 2 if depth == "advanced" else 1
            await self.db.record_tavily_usage(
                telegram_id=telegram_id,
                query=clean_query,
                search_depth=depth,
                credits=credits_spent
            )

            # Determine cache TTL (hours)
            ttl_hours = self.settings.TAVILY_COMPANY_CACHE_HOURS if is_company_prep else self.settings.TAVILY_GENERAL_CACHE_HOURS
            expires_at = time.time() + (ttl_hours * 3600)

            # Save in SQLite cache
            sources_json = json.dumps([asdict(s) for s in sources])
            await self.db.save_tavily_cache(
                query_hash=query_hash,
                query=clean_query,
                search_depth=depth,
                results_json=sources_json,
                expires_at=expires_at
            )

            return SearchResult(
                sources=sources,
                is_cached=False,
                status="success" if sources else "empty",
                message="Search completed successfully." if sources else "No relevant web sources found."
            )

        except httpx.TimeoutException:
            logger.warning(f"Tavily search timed out for query '{clean_query}'.")
            return SearchResult(
                sources=[],
                is_cached=False,
                status="error",
                message="Web research request timed out. Proceeding with foundational knowledge."
            )
        except Exception as e:
            logger.error(f"Unexpected error calling Tavily API: {e}", exc_info=False)
            return SearchResult(
                sources=[],
                is_cached=False,
                status="error",
                message="An unexpected error occurred during web research. Proceeding with internal knowledge."
            )
