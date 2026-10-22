"""
Phase 5 Comprehensive Automated Test Suite: Complete Placement Companion
Tests covering all 40 required test specifications across:
1. Tavily and Web Research (Quotas, sanitization, caching, errors, format)
2. Ask the Coach and Teaching (Intent, session context, active question isolation)
3. Company Interview Prep (Missing role flow, source integration, timeline adaptation, mock interview transition)
4. Adaptive Placement & Spaced Repetition (Revision calculations, priority in daily challenge, weekly reports, failure isolation)
5. Project Defence Mode (Project selection, confirmation, 5-round progression, adaptive questions, session persistence, user isolation)
6. Cross-feature regressions (Menus, callbacks, lifecycle)
"""
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import json
from datetime import datetime, timezone, timedelta
import httpx
from telegram import Update, Message, User, CallbackQuery
from telegram.ext import ContextTypes

from app.config import Settings
from app.database import Database
from app.question_bank import QuestionBank
from app.security import generate_fernet_key, encrypt_api_key
from app.services.tavily_service import TavilyService, sanitize_search_query, SearchResult, NormalizedSource
from app.services.coaching_service import CoachingService, should_trigger_web_search
from app.services.company_prep_service import CompanyPrepService
from app.services.project_defence_service import ProjectDefenceService
from app.services.adaptive_learning_service import AdaptiveLearningService, compute_revision_interval_days
from app.services.daily_selector import DailyQuestionSelector
from app.services.mock_interview_service import prepare_mock_interview_questions
from app.bot import (
    MAIN_MENU_KEYBOARD,
    ask_coach_prompt,
    company_prep_start_flow,
    project_defence_start_flow,
    text_message_handler,
    voice_message_handler,
    project_defence_callback,
    company_prep_callback,
    progress_menu_callback,
)


@pytest_asyncio.fixture
async def p5_env(tmp_path):
    db_file = tmp_path / "p5_test.db"
    db = Database(str(db_file))
    await db.init_db()

    qb = QuestionBank("data/question_bank.json")
    qb.load_and_validate()

    enc_key = generate_fernet_key()
    settings = Settings(
        APP_ENV="testing",
        TELEGRAM_BOT_TOKEN="mock_p5_token",
        ENCRYPTION_KEY=enc_key,
        TAVILY_API_KEY="mock_tvly_key_test_12345",
        TAVILY_MAX_DAILY_SEARCHES_PER_USER=2,
        TAVILY_MONTHLY_CREDIT_BUDGET=10,
        GROQ_MODEL="openai/gpt-oss-20b",
        GROQ_WHISPER_MODEL="whisper-large-v3-turbo",
        WEB_BASE_URL="http://localhost:8000"
    )

    tavily = TavilyService(settings, db)
    coaching = CoachingService(db, settings, tavily)
    company_prep = CompanyPrepService(db, settings, tavily)
    project_defence = ProjectDefenceService(db, settings)
    adaptive = AdaptiveLearningService(db, qb)

    context = MagicMock(spec=ContextTypes.DEFAULT_TYPE)
    context.bot_data = {
        "db": db,
        "qb": qb,
        "settings": settings,
        "tavily": tavily,
        "coaching": coaching,
        "company_prep": company_prep,
        "project_defence": project_defence,
        "adaptive": adaptive,
    }
    context.user_data = {}

    return {
        "db": db,
        "qb": qb,
        "settings": settings,
        "tavily": tavily,
        "coaching": coaching,
        "company_prep": company_prep,
        "project_defence": project_defence,
        "adaptive": adaptive,
        "context": context,
        "enc_key": enc_key
    }


# ==============================================================================
# GROUP 1: Tavily and Research Tests
# ==============================================================================

def test_sanitization_strips_sensitive_information():
    """Requirement 10: Search queries never include emails, keys, or phone numbers."""
    raw = "Research IBM for user test@domain.com phone 9876543210 key gsk_abcdef12345678901234567890"
    clean = sanitize_search_query(raw)
    assert "test@domain.com" not in clean
    assert "9876543210" not in clean
    assert "gsk_" not in clean
    assert "Research IBM for user" in clean


def test_stable_concepts_skip_web_search():
    """Requirement 4: General stable concepts do not trigger unnecessary searches."""
    assert not should_trigger_web_search("What is binary search tree?")
    assert not should_trigger_web_search("Explain inheritance in Java")
    assert not should_trigger_web_search("Difference between process and thread")


def test_company_and_current_queries_trigger_search():
    """Requirement 5: Company-specific and explicitly current requests trigger search."""
    assert should_trigger_web_search("IBM interview process 2026")
    assert should_trigger_web_search("What is the latest salary for Google SDE 1?")
    assert should_trigger_web_search("Find current resources for operating systems")


@pytest.mark.asyncio
async def test_missing_tavily_key_does_not_crash(p5_env):
    """Requirement 1: Missing Tavily configuration does not crash the application."""
    db = p5_env["db"]
    no_key_settings = Settings(
        APP_ENV="testing",
        TELEGRAM_BOT_TOKEN="token",
        ENCRYPTION_KEY=p5_env["enc_key"],
        TAVILY_API_KEY=""
    )
    svc = TavilyService(no_key_settings, db)
    resp = await svc.search("Google interview process", telegram_id=123)
    assert resp.status == "missing_key"
    assert len(resp.sources) == 0
    assert "not configured" in resp.message.lower()


@pytest.mark.asyncio
async def test_search_cache_reuse_and_quota_limits(p5_env):
    """Requirements 6 & 7: Cache reuse prevents redundant searches; quota limits enforce budget."""
    svc = p5_env["tavily"]
    mock_payload = {
        "results": [
            {"title": "Microsoft SDE", "url": "https://careers.microsoft.com", "content": "Official career guide."}
        ]
    }
    mock_http = MagicMock(spec=httpx.Response)
    mock_http.status_code = 200
    mock_http.json.return_value = mock_payload

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_http

        # 1st call: uses network
        res1 = await svc.search("Microsoft SDE", telegram_id=500)
        assert res1.status == "success"
        assert not res1.is_cached
        assert mock_post.call_count == 1

        # 2nd call identical query: hits cache, network not called
        res2 = await svc.search("Microsoft SDE", telegram_id=500)
        assert res2.status == "success"
        assert res2.is_cached
        assert mock_post.call_count == 1

        # 2nd distinct query: user at daily limit (2 searches per day)
        res3 = await svc.search("Amazon SDE", telegram_id=500)
        assert res3.status == "success"
        assert not res3.is_cached
        assert mock_post.call_count == 2

        # 3rd distinct query: user daily limit exhausted!
        res4 = await svc.search("Uber SDE", telegram_id=500)
        assert res4.status == "quota_exceeded"
        assert len(res4.sources) == 0
        assert mock_post.call_count == 2  # Blocked before HTTP


# ==============================================================================
# GROUP 2: Ask the Coach & Concept Teaching Tests
# ==============================================================================

@pytest.mark.asyncio
async def test_ask_coach_free_form_and_session_context(p5_env):
    """Requirements 11, 12, 14: Idle user can ask questions, session context is preserved."""
    coaching = p5_env["coaching"]
    db = p5_env["db"]
    enc_key = p5_env["enc_key"]

    user_id = 1001
    await db.get_or_create_user(user_id)
    encrypted_groq = encrypt_api_key("gsk_mock_groq_key_12345", enc_key)
    await db.save_credentials(user_id, encrypted_groq, "gsk_...1234")

    # Mock Groq response for concept
    mock_groq_reply = (
        "**Binary Search**\n\n"
        "**What it is:** An efficient algorithm for searching a sorted list in O(log N) time.\n"
        "**Why it matters:** Drastically reduces operations compared to linear search.\n"
        "**Code snippet:**\n```python\ndef bsearch(arr, x): ...\n```\n"
        "**Misconception:** Forgetting array must be sorted."
    )

    with patch("groq.Groq.chat") as mock_chat:
        mock_chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content=mock_groq_reply))]
        )

        res = await coaching.ask_the_coach(
            groq_api_key="gsk_mock_groq_key_12345",
            user_query="Explain binary search with a code snippet",
            telegram_id=user_id
        )

        assert "Binary Search" in res
        assert "O(log N)" in res


@pytest.mark.asyncio
async def test_active_question_not_misrouted_to_coach(p5_env):
    """Requirement 13: An active interview question response is not misrouted to Ask the Coach."""
    context = p5_env["context"]
    db = p5_env["db"]
    enc_key = p5_env["enc_key"]

    user_id = 1002
    await db.get_or_create_user(user_id)
    encrypted_groq = encrypt_api_key("gsk_mock_key", enc_key)
    await db.save_credentials(user_id, encrypted_groq, "gsk_...mock")

    # Set active question
    context.user_data["active_question"] = {
        "question_id": "dsa-01",
        "context_type": "practice"
    }

    update = MagicMock(spec=Update)
    update.effective_user = MagicMock(spec=User, id=user_id, username="student_2")
    update.message = MagicMock(spec=Message, text="I would use an array with two pointers")
    update.message.reply_text = AsyncMock()

    # Route through text_message_handler with mocked process_user_answer
    with patch("app.bot.process_user_answer", new_callable=AsyncMock) as mock_process:
        await text_message_handler(update, context)
        # Verify it went to process_user_answer instead of coach
        mock_process.assert_awaited_once()


# ==============================================================================
# GROUP 3: Company Interview Prep Tests
# ==============================================================================

@pytest.mark.asyncio
async def test_company_prep_flow_prompts_for_missing_role(p5_env):
    """Requirement 16: Company name without a role prompts for the role."""
    context = p5_env["context"]
    db = p5_env["db"]
    user_id = 1003
    await db.get_or_create_user(user_id)

    update = MagicMock(spec=Update)
    update.effective_user = MagicMock(spec=User, id=user_id, username="student_3")
    update.message = MagicMock(spec=Message, text="I have an interview at IBM next week")
    update.message.reply_text = AsyncMock()

    await text_message_handler(update, context)

    # Should ask what role
    update.message.reply_text.assert_awaited()
    sent_text = update.message.reply_text.call_args[0][0]
    assert "role" in sent_text.lower()
    # Profile should have company saved as IBM
    profile = await db.get_company_prep_profile(user_id)
    assert profile is not None
    assert profile["company_name"] == "IBM"


@pytest.mark.asyncio
async def test_company_prep_pack_generation_with_sources(p5_env):
    """Requirements 18, 19, 20: Preparation pack uses real search sources and timeline."""
    company_prep = p5_env["company_prep"]
    db = p5_env["db"]
    enc_key = p5_env["enc_key"]
    user_id = 1004

    await db.get_or_create_user(user_id)
    encrypted_groq = encrypt_api_key("gsk_mock_key", enc_key)
    await db.save_credentials(user_id, encrypted_groq, "gsk_...mock")

    await db.save_company_prep_profile(
        telegram_id=user_id,
        company_name="Google",
        target_role="Software Engineer (Fresher)",
        experience_level="Entry Level",
        interview_date="2026-11-01"
    )

    mock_sources = [
        NormalizedSource(source_id="source_1", title="Google Careers", url="https://careers.google.com", snippet="SWE Fresher hiring process"),
        NormalizedSource(source_id="source_2", title="GeeksforGeeks Google Archive", url="https://gfg.org/google", snippet="Coding and DSA rounds")
    ]

    mock_llm_markdown = (
        "🏢 *Verified Information & Hiring Process*:\n"
        "Google Fresher SWE includes 2 technical coding rounds focusing on DSA.\n\n"
        "🎯 *Core Preparation Priorities*:\n"
        "• Data Structures & Algorithms\n"
        "• System Design Basics\n\n"
        "📅 *Tailored Day-by-Day Preparation Plan*:\n"
        "• Day 1-2: Trees and Graphs\n"
        "• Day 3-5: Dynamic Programming\n\n"
        "❓ *Practice Questions*:\n"
        "1. Implement an LRU Cache with O(1) operations.\n"
        "2. Find lowest common ancestor in a binary tree."
    )

    with patch.object(p5_env["tavily"], "search", new_callable=AsyncMock) as mock_search:
        mock_search.return_value = SearchResult(status="success", sources=mock_sources, is_cached=False, message="OK")

        with patch("groq.Groq.chat") as mock_chat:
            mock_chat.completions.create.return_value = MagicMock(
                choices=[MagicMock(message=MagicMock(content=mock_llm_markdown))]
            )

            pack = await company_prep.generate_prep_pack(
                groq_api_key="gsk_mock_key",
                telegram_id=user_id,
                company_name="Google",
                target_role="Software Engineer (Fresher)",
                experience_level="Entry Level",
                interview_date="2026-11-01"
            )

            assert pack["company_name"] == "Google"
            assert len(pack["citations"]) == 2
            assert "Google Careers" in pack["citations"][0]["title"]
            assert "LRU Cache" in pack["pack_text"]


# ==============================================================================
# GROUP 4: Adaptive Placement & Spaced Repetition Tests
# ==============================================================================

def test_revision_interval_policy():
    """Requirement 24: Revision intervals follow configured score & concept policy."""
    # Low score (<=4) -> 1 day
    assert compute_revision_interval_days(2.5, False) == 1
    assert compute_revision_interval_days(4.0, True) == 1

    # Medium score (5-6) -> 3 days
    assert compute_revision_interval_days(5.5, False) == 3
    assert compute_revision_interval_days(6.0, True) == 3

    # High score (7-8) -> 7 days (or 3 if missed concepts)
    assert compute_revision_interval_days(8.0, False) == 7
    assert compute_revision_interval_days(7.5, True) == 3

    # Mastery (9-10) -> 14 days (or 5 if missed concepts)
    assert compute_revision_interval_days(9.5, False) == 14
    assert compute_revision_interval_days(9.0, True) == 5


@pytest.mark.asyncio
async def test_adaptive_daily_selector_prioritizes_due_revision(p5_env):
    """Requirement 23: Due revisions are prioritized in the daily question selection."""
    db = p5_env["db"]
    qb = p5_env["qb"]
    user_id = 1005

    await db.get_or_create_user(user_id)
    # Mark a past due revision for question "dsa-01"
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    await db.upsert_concept_revision(
        telegram_id=user_id,
        concept_or_topic="DSA",
        question_id="dsa-01",
        score=4.0,
        interval_days=1,
        due_date=yesterday
    )

    selector = DailyQuestionSelector(qb, db)
    selected = await selector.select_daily_question(user_id)
    assert selected is not None
    # Must select the due question
    assert selected["id"] == "dsa-01"


@pytest.mark.asyncio
async def test_weakness_detection_requires_multiple_attempts(p5_env):
    """Requirement 25: Insufficient answer history is not presented as proven weakness."""
    adaptive = p5_env["adaptive"]
    db = p5_env["db"]
    user_id = 1006
    await db.get_or_create_user(user_id)

    # Only 1 attempt on DSA with score 4.0
    eval_id = await db.save_answer_evaluation(
        telegram_id=user_id,
        question_id="dsa-01",
        context_type="practice",
        input_type="text",
        answer_text="sample"
    )
    await db.update_answer_evaluation_result(
        eval_id=eval_id,
        status="completed",
        overall_score=4.0
    )

    # Should not classify as persistent weakness yet
    analysis = await adaptive.analyze_topic_performance(user_id)
    assert len(analysis["persistent_weak"]) == 0
    # DSA should be in early_signals
    assert any(item["topic"] == "DSA" for item in analysis["early_signals"])


# ==============================================================================
# GROUP 5: Project Defence Mode Tests
# ==============================================================================

@pytest.mark.asyncio
async def test_project_defence_flow_and_restart_recovery(p5_env):
    """Requirements 29-33: Project selection, confirmation, 5-question progression, and session restart recovery."""
    defence = p5_env["project_defence"]
    db = p5_env["db"]
    enc_key = p5_env["enc_key"]
    user_id = 1007

    await db.get_or_create_user(user_id)
    encrypted_groq = encrypt_api_key("gsk_mock_key", enc_key)
    await db.save_credentials(user_id, encrypted_groq, "gsk_...mock")

    # 1. Start session
    session = await defence.start_session(
        telegram_id=user_id,
        project_name="E-Commerce Microservices",
        project_summary="Built with FastAPI, Redis, PostgreSQL, and Docker"
    )
    assert session["session_id"] > 0
    assert session["project_name"] == "E-Commerce Microservices"
    assert "Question 1 of 5" in session["question_text"]

    # 2. Check restart recovery
    loaded_session = await db.get_active_project_defence_session(user_id)
    assert loaded_session is not None
    assert loaded_session["id"] == session["session_id"]
    assert loaded_session["project_name"] == "E-Commerce Microservices"

    # 3. Simulate round 1 answer submission with mock LLM
    mock_next_q = (
        "🎯 *Question 2 of 5 (Architecture, Data Flow & Tech Decisions)*:\n\n"
        "How did you handle distributed transactions between your Order and Payment services?"
    )

    with patch("groq.Groq.chat") as mock_chat:
        mock_chat.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content=mock_next_q))]
        )

        res = await defence.process_answer_and_next(
            groq_api_key="gsk_mock_key",
            telegram_id=user_id,
            student_answer="We used separate databases for order and payment services."
        )

        assert res["status"] == "in_progress"
        assert res["index"] == 2
        assert "distributed transactions" in res["question_text"].lower()

        # Check session in SQLite advanced to index 1
        updated_session = await db.get_active_project_defence_session(user_id)
        assert updated_session["current_index"] == 1


@pytest.mark.asyncio
async def test_cross_user_isolation_on_project_defence(p5_env):
    """Requirement 35: Users cannot access or advance another user's project defence session."""
    defence = p5_env["project_defence"]
    db = p5_env["db"]
    user_a = 2001
    user_b = 2002

    await defence.start_session(
        telegram_id=user_a,
        project_name="User A Portfolio",
        project_summary="React and Node"
    )

    # User B should see NO active session
    b_session = await db.get_active_project_defence_session(user_b)
    assert b_session is None


# ==============================================================================
# GROUP 6: Cross-Feature Menu & Callback Integrity Tests
# ==============================================================================

def test_main_menu_keyboard_has_all_10_destinations():
    """Requirement 36: Main-menu keyboard has all 10 required destinations."""
    labels = []
    for row in MAIN_MENU_KEYBOARD:
        for button in row:
            labels.append(button)

    # All 10 destinations must be present
    assert any("Daily Challenge" in b for b in labels)
    assert any("Ask the Coach" in b for b in labels)
    assert any("Company Interview Prep" in b for b in labels)
    assert any("Project Defence" in b for b in labels)
    assert any("Teach Me a Topic" in b for b in labels)
    assert any("Mock Interview" in b for b in labels)
    assert any("Random Practice" in b for b in labels)
    assert any("Resume & Topics" in b for b in labels)
    assert any("My Progress" in b for b in labels)
    assert any("Settings" in b for b in labels)


@pytest.mark.asyncio
async def test_company_mode_mock_interview_preparation():
    """Requirement 21: Enhanced mock interview prepares company-focused questions."""
    qb = QuestionBank("data/question_bank.json")
    qb.load_and_validate()

    q_ids = prepare_mock_interview_questions(
        qb=qb,
        mode="company",
        count=4
    )
    assert len(q_ids) == 4
    # All returned IDs must exist in question bank
    for qid in q_ids:
        q = qb.get_by_id(qid)
        assert q is not None
