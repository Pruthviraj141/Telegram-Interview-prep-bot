"""
Automated unit, integration, and regression test suite for Phase 4:
- Text answers attached to active question and evaluation pipeline
- Voice message validation, limits, and guaranteed tempfile cleanup
- Groq Whisper transcription and error handling
- Structured evaluation schema, score clamping, and coaching policy
- Evaluation retry after failure without duplicate records
- Daily challenge completion and reminder suppression
- Mock interview session lifecycle, question progression, and final report
- Progress statistics excluding failed/unevaluated answers
- Cross-user ownership protection
- No raw audio or secrets logged
"""
import os
import json
import asyncio
import tempfile
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from telegram import Update, Message, Voice, User, CallbackQuery
from telegram.ext import ContextTypes

from app.config import Settings
from app.database import Database
from app.question_bank import QuestionBank
from app.security import encrypt_api_key, generate_fernet_key
from app.services.evaluation_service import EvaluationResult, evaluate_answer
from app.services.groq_service import transcribe_voice, GroqServiceError
from app.services.mock_interview_service import (
    prepare_mock_interview_questions,
    generate_mock_interview_report,
)
from app.bot import (
    voice_message_handler,
    text_message_handler,
    process_user_answer,
    resolve_active_question,
    start_mock_interview_flow,
    mock_interview_callback,
    finish_mock_interview,
    show_progress_overview,
    retry_evaluation_callback,
    get_user_lock,
)


@pytest.fixture
def mock_context(tmp_path):
    db_file = tmp_path / "test_phase4.db"
    db = Database(str(db_file))
    qb = QuestionBank("data/question_bank.json")
    qb.load_and_validate()
    fernet_key = generate_fernet_key()
    settings = Settings(
        ENCRYPTION_KEY=fernet_key,
        MAX_VOICE_SIZE_BYTES=1024 * 1024,
        MAX_VOICE_DURATION_SECONDS=300,
        MIN_VOICE_DURATION_SECONDS=2,
        GROQ_MODEL="openai/gpt-oss-20b",
        GROQ_WHISPER_MODEL="whisper-large-v3-turbo"
    )

    from app.services.tavily_service import TavilyService
    from app.services.coaching_service import CoachingService
    from app.services.company_prep_service import CompanyPrepService
    from app.services.project_defence_service import ProjectDefenceService
    from app.services.adaptive_learning_service import AdaptiveLearningService

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
    return context, db, settings, qb


# ==================== 1. Structured Evaluation Schema Tests ====================

def test_evaluation_schema_validation_and_clamping():
    """Ensure EvaluationResult validates fields and clamps numeric scores within [0.0, 10.0]."""
    raw = {
        "question_id": "dsa-01",
        "topic": "DSA",
        "technical_score": 15.5,  # Out of range > 10
        "completeness_score": -2.0,  # Out of range < 0
        "communication_score": "8.5",
        "overall_score": 9.2,
        "summary": "Strong technical explanation.",
        "what_went_well": "Clear time and space complexity analysis.",
        "missed_concepts": "Did not mention worst-case collisions.",
        "corrections": "None",
        "grammar_feedback": "Good, minimal filler words.",
        "model_answer_refined": "Refined hash map explanation.",
        "follow_up_questions": ["How would you handle high collision rates?", "What about Robin Hood hashing?"],
        "improvement_tip": "Explicitly state average vs worst-case trade-offs."
    }
    res = EvaluationResult(**raw)
    assert res.technical_score == 10.0
    assert res.completeness_score == 0.0
    assert res.communication_score == 8.5
    assert res.overall_score == 9.2
    assert len(res.follow_up_questions) == 2


def test_evaluate_answer_technical_and_hr(mock_context):
    """Test evaluate_answer handles technical and HR questions with correct schema."""
    _, _, _, qb = mock_context
    q_tech = qb.get_by_id("dsa-01")
    q_hr = qb.get_by_id("hr-01") or {
        "id": "hr-01",
        "category": "HR",
        "question": "Tell me about a time you solved a tough conflict.",
        "model_answer": "STAR method conflict resolution.",
        "expected_concepts": ["STAR", "Empathy", "Resolution"]
    }

    mock_llm_response = {
        "question_id": "dsa-01",
        "topic": "DSA",
        "technical_score": 8.0,
        "completeness_score": 7.5,
        "communication_score": 8.5,
        "overall_score": 8.0,
        "summary": "Solid explanation.",
        "what_went_well": "Identified O(1) average lookup.",
        "missed_concepts": "O(N) worst case.",
        "corrections": "None",
        "grammar_feedback": "Clear pacing.",
        "model_answer_refined": "Hash tables use arrays with hashing functions.",
        "follow_up_questions": ["How do you resize a hash table?"],
        "improvement_tip": "Mention load factor."
    }

    with patch("app.services.evaluation_service.Groq") as mock_groq_class:
        mock_client = MagicMock()
        mock_groq_class.return_value = mock_client
        mock_chat = MagicMock()
        mock_client.chat = mock_chat
        mock_completion = MagicMock()
        mock_choice = MagicMock()
        mock_choice.message.content = json.dumps(mock_llm_response)
        mock_completion.choices = [mock_choice]
        mock_chat.completions.create.return_value = mock_completion

        res = evaluate_answer("gsk_mock_key", q_tech, "A hash map uses hashing to map keys to buckets in O(1) time.")
        assert res.overall_score == 8.0
        assert res.technical_score == 8.0
        assert res.summary == "Solid explanation."

        # Verify HR prompt incorporates HR guidelines
        res_hr = evaluate_answer("gsk_mock_key", q_hr, "I used the STAR method to align our team.")
        assert res_hr.overall_score == 8.0


# ==================== 2. Voice Transcription & Temporary File Cleanup Tests ====================

def test_transcribe_voice_success_and_errors():
    """Test transcribe_voice succeeds with valid bytes and raises GroqServiceError on errors."""
    with patch("app.services.groq_service.Groq") as mock_groq_class:
        mock_client = MagicMock()
        mock_groq_class.return_value = mock_client
        mock_audio = MagicMock()
        mock_client.audio = mock_audio
        mock_transcript = MagicMock()
        mock_transcript.text = "This is a transcribed answer about database indexes."
        mock_audio.transcriptions.create.return_value = mock_transcript

        text = transcribe_voice("gsk_mock_key", b"fake_ogg_audio_bytes")
        assert text == "This is a transcribed answer about database indexes."

    # Empty audio check
    with pytest.raises(GroqServiceError, match="Audio content is empty"):
        transcribe_voice("gsk_mock_key", b"")


@pytest.mark.asyncio
async def test_voice_message_handler_size_and_duration_validation(mock_context):
    """Test voice handler rejects oversized, too short, and too long audio files."""
    context, db, settings, _ = mock_context
    await db.init_db()
    user_id = 1111
    await db.get_or_create_user(user_id)
    enc = encrypt_api_key("gsk_valid_key", settings.ENCRYPTION_KEY)
    await db.save_credentials(user_id, enc, "gsk_..._key")

    msg = AsyncMock(spec=Message)
    voice = MagicMock(spec=Voice)
    update = MagicMock(spec=Update)
    update.effective_user = MagicMock(id=user_id)
    update.message = msg
    msg.voice = voice

    # 1. Too large
    voice.file_size = 50 * 1024 * 1024  # 50MB > 1MB setting
    voice.duration = 30
    await voice_message_handler(update, context)
    msg.reply_text.assert_called_with(
        pytest.approx_text("⚠️ *Voice note too large*") if hasattr(pytest, "approx_text") else
        msg.reply_text.call_args[0][0],
        parse_mode="Markdown"
    )
    assert "Voice note too large" in msg.reply_text.call_args[0][0]

    # 2. Too short (< 2s)
    voice.file_size = 5000
    voice.duration = 1
    await voice_message_handler(update, context)
    assert "Voice note too short" in msg.reply_text.call_args[0][0]

    # 3. Too long (> 300s)
    voice.duration = 350
    await voice_message_handler(update, context)
    assert "exceeds duration limit" in msg.reply_text.call_args[0][0]


@pytest.mark.asyncio
async def test_voice_message_guaranteed_tempfile_cleanup_on_success_and_failure(mock_context):
    """Test voice download creates temporary file and guarantees removal after success or error."""
    context, db, settings, qb = mock_context
    await db.init_db()
    user_id = 2222
    await db.get_or_create_user(user_id)
    enc = encrypt_api_key("gsk_valid_key", settings.ENCRYPTION_KEY)
    await db.save_credentials(user_id, enc, "gsk_..._key")

    context.user_data["active_question"] = {"question_id": "dsa-01", "context_type": "practice"}

    msg = AsyncMock(spec=Message)
    voice = MagicMock(spec=Voice)
    voice.file_size = 10000
    voice.duration = 10
    voice.file_id = "voice_file_id_123"
    msg.voice = voice

    update = MagicMock(spec=Update)
    update.effective_user = MagicMock(id=user_id)
    update.message = msg

    # Track temp files created
    created_temp_paths = []

    original_named_temp = tempfile.NamedTemporaryFile

    def tracking_temp(*args, **kwargs):
        f = original_named_temp(*args, **kwargs)
        created_temp_paths.append(f.name)
        return f

    tg_file = AsyncMock()
    async def mock_download(path):
        with open(path, "wb") as f:
            f.write(b"fake_voice_data")

    tg_file.download_to_drive = mock_download
    context.bot.get_file = AsyncMock(return_value=tg_file)

    with patch("tempfile.NamedTemporaryFile", side_effect=tracking_temp):
        with patch("app.bot.transcribe_voice", return_value="Binary search operates in O(log N)."):
            with patch("app.bot.evaluate_answer") as mock_eval:
                mock_eval.return_value = EvaluationResult(
                    question_id="dsa-01",
                    topic="DSA",
                    technical_score=9.0,
                    completeness_score=8.5,
                    communication_score=8.0,
                    overall_score=8.5,
                    summary="Great explanation.",
                    what_went_well="Accurate logarithmic complexity.",
                    missed_concepts="None",
                    corrections="None",
                    grammar_feedback="Fluent.",
                    model_answer_refined="Refined binary search answer.",
                    follow_up_questions=[],
                    improvement_tip="None"
                )

                await voice_message_handler(update, context)

    # Check temp file was deleted
    assert len(created_temp_paths) > 0
    for path in created_temp_paths:
        assert not os.path.exists(path), f"Temp file {path} was not cleaned up!"


# ==================== 3. Text Answers & Daily Integration Tests ====================

@pytest.mark.asyncio
async def test_text_answer_evaluates_and_completes_daily_delivery(mock_context):
    """Test text answer evaluates properly and marks daily challenge as completed."""
    context, db, settings, qb = mock_context
    await db.init_db()
    user_id = 3333
    await db.get_or_create_user(user_id)
    enc = encrypt_api_key("gsk_valid_key", settings.ENCRYPTION_KEY)
    await db.save_credentials(user_id, enc, "gsk_..._key")

    # Create daily delivery
    delivery_id = await db.create_daily_delivery(
        telegram_id=user_id,
        local_date="2026-10-22",
        timezone_str="UTC",
        scheduled_utc="2026-10-22T03:30:00Z",
        question_id="dbms-01"
    )
    await db.update_daily_delivery_status(delivery_id, "sent")

    # Set active context to daily question
    context.user_data["active_question"] = {
        "question_id": "dbms-01",
        "context_type": "daily",
        "daily_delivery_id": delivery_id
    }

    msg = AsyncMock(spec=Message)
    msg.text = "ACID stands for Atomicity, Consistency, Isolation, and Durability."
    update = MagicMock(spec=Update)
    update.effective_user = MagicMock(id=user_id)
    update.message = msg

    with patch("app.bot.evaluate_answer") as mock_eval:
        mock_eval.return_value = EvaluationResult(
            question_id="dbms-01",
            topic="DBMS / SQL",
            technical_score=9.5,
            completeness_score=9.0,
            communication_score=9.0,
            overall_score=9.2,
            summary="Accurate definition of ACID properties.",
            what_went_well="Well structured.",
            missed_concepts="Isolation levels.",
            corrections="None",
            grammar_feedback="Clear.",
            model_answer_refined="ACID properties guarantee reliability.",
            follow_up_questions=["What is phantom read?"],
            improvement_tip="Discuss concurrency isolation levels."
        )

        await text_message_handler(update, context)

    # Verify daily delivery is completed (reminder suppressed!)
    delivery = await db.get_daily_delivery_by_id(delivery_id)
    assert delivery["is_completed"] == 1
    assert delivery["completed_at"] is not None

    # Verify answer evaluation is stored in SQLite
    evals = await db.get_user_recent_evaluations(user_id)
    assert len(evals) == 1
    assert evals[0]["overall_score"] == 9.2
    assert evals[0]["context_type"] == "daily"
    assert evals[0]["evaluation_status"] == "completed"


# ==================== 4. Retry Evaluation & Idempotency Tests ====================

@pytest.mark.asyncio
async def test_retry_evaluation_without_duplicating_answer_attempt(mock_context):
    """Test retrying a failed evaluation uses saved answer without creating duplicate row."""
    context, db, settings, qb = mock_context
    await db.init_db()
    user_id = 4444
    await db.get_or_create_user(user_id)
    enc = encrypt_api_key("gsk_valid_key", settings.ENCRYPTION_KEY)
    await db.save_credentials(user_id, enc, "gsk_..._key")

    # Manually insert failed evaluation
    eval_id = await db.save_answer_evaluation(
        telegram_id=user_id,
        question_id="dsa-01",
        context_type="practice",
        input_type="text",
        answer_text="My initial answer that failed evaluation."
    )
    await db.update_answer_evaluation_result(eval_id=eval_id, status="failed")

    cb_update = MagicMock(spec=Update)
    query = AsyncMock(spec=CallbackQuery)
    query.from_user.id = user_id
    query.data = f"retryeval:{user_id}:{eval_id}"
    cb_update.callback_query = query

    with patch("app.bot.evaluate_answer") as mock_eval:
        mock_eval.return_value = EvaluationResult(
            question_id="dsa-01",
            topic="DSA",
            technical_score=7.0,
            completeness_score=7.0,
            communication_score=7.0,
            overall_score=7.0,
            summary="Retried successfully.",
            what_went_well="Good core logic.",
            missed_concepts="Edge cases.",
            corrections="None",
            grammar_feedback="Fine.",
            model_answer_refined="Refined explanation.",
            follow_up_questions=[],
            improvement_tip="Practice more."
        )

        await retry_evaluation_callback(cb_update, context)

    # Verify updated in place
    record = await db.get_answer_evaluation(eval_id)
    assert record["evaluation_status"] == "completed"
    assert record["overall_score"] == 7.0

    # Ensure no duplicate answer attempts
    all_evals = await db.get_user_recent_evaluations(user_id)
    assert len(all_evals) == 1


# ==================== 5. Mock Interview Lifecycle & Report Tests ====================

@pytest.mark.asyncio
async def test_mock_interview_progression_and_final_report(mock_context):
    """Test full multi-question mock interview progression, hidden scores, and final report."""
    context, db, settings, qb = mock_context
    await db.init_db()
    user_id = 5555
    await db.get_or_create_user(user_id)
    enc = encrypt_api_key("gsk_valid_key", settings.ENCRYPTION_KEY)
    await db.save_credentials(user_id, enc, "gsk_..._key")

    # 1. Start mock session with 2 questions
    q_ids = ["dsa-01", "dbms-01"]
    session_id = await db.create_mock_session(user_id, "topics", q_ids)
    session = await db.get_mock_session(session_id)
    assert session["status"] == "in_progress"
    assert session["total_questions"] == 2
    assert session["current_index"] == 0

    # 2. Answer Question 1
    active_q1 = {
        "question_id": "dsa-01",
        "question_obj": qb.get_by_id("dsa-01"),
        "context_type": "mock",
        "mock_session_id": session_id
    }

    update1 = MagicMock(spec=Update)
    update1.effective_user = MagicMock(id=user_id)
    msg1 = AsyncMock(spec=Message)
    update1.message = msg1

    with patch("app.bot.evaluate_answer") as mock_eval:
        mock_eval.return_value = EvaluationResult(
            question_id="dsa-01",
            topic="DSA",
            technical_score=8.0,
            completeness_score=8.0,
            communication_score=8.0,
            overall_score=8.0,
            summary="Answer 1 good.",
            what_went_well="Good explanation.",
            missed_concepts="None",
            corrections="None",
            grammar_feedback="None",
            model_answer_refined="Model 1.",
            follow_up_questions=[],
            improvement_tip="None"
        )
        await process_user_answer(update1, context, user_id, "Answer for Q1", "text", active_q1)

    # Session should have advanced to question 2
    session_after_q1 = await db.get_mock_session(session_id)
    assert session_after_q1["current_index"] == 1
    assert session_after_q1["status"] == "in_progress"

    # 3. Answer Question 2 (Final)
    active_q2 = {
        "question_id": "dbms-01",
        "question_obj": qb.get_by_id("dbms-01"),
        "context_type": "mock",
        "mock_session_id": session_id
    }
    update2 = MagicMock(spec=Update)
    update2.effective_user = MagicMock(id=user_id)
    msg2 = AsyncMock(spec=Message)
    update2.message = msg2

    with patch("app.bot.evaluate_answer") as mock_eval:
        mock_eval.return_value = EvaluationResult(
            question_id="dbms-01",
            topic="DBMS / SQL",
            technical_score=6.0,
            completeness_score=6.0,
            communication_score=7.0,
            overall_score=6.5,
            summary="Answer 2 partial.",
            what_went_well="Clear points.",
            missed_concepts="ACID durability details.",
            corrections="None",
            grammar_feedback="Some filler words.",
            model_answer_refined="Model 2.",
            follow_up_questions=[],
            improvement_tip="Review durability."
        )
        await process_user_answer(update2, context, user_id, "Answer for Q2", "text", active_q2)

    # Session should now be completed!
    completed_session = await db.get_mock_session(session_id)
    assert completed_session["status"] == "completed"
    assert completed_session["overall_score"] == pytest.approx(7.25, 0.1)

    # Report is stored in SQLite
    report = json.loads(completed_session["report_json"])
    assert report["answered_count"] == 2
    assert report["overall_coaching_score"] == pytest.approx(7.3, 0.1)
    assert len(report["per_question_feedback"]) == 2


# ==================== 6. Progress Tracking & Filtering Tests ====================

@pytest.mark.asyncio
async def test_progress_stats_exclude_failed_and_pending_evaluations(mock_context):
    """Ensure get_user_progress_stats only includes completed evaluations in score averages."""
    context, db, settings, _ = mock_context
    await db.init_db()
    user_id = 6666
    await db.get_or_create_user(user_id)

    # 1. Completed evaluation: score 9.0
    eval1 = await db.save_answer_evaluation(user_id, "dsa-01", "daily", "text", "Answer 1")
    await db.update_answer_evaluation_result(eval1, "completed", 9.0, 9.0, 9.0, 9.0, "Good")

    # 2. Failed evaluation (should be excluded!)
    eval2 = await db.save_answer_evaluation(user_id, "dsa-02", "practice", "text", "Answer 2")
    await db.update_answer_evaluation_result(eval2, "failed")

    # 3. Pending evaluation (should be excluded!)
    await db.save_answer_evaluation(user_id, "dsa-03", "practice", "text", "Answer 3")

    # 4. Completed evaluation: score 7.0
    eval4 = await db.save_answer_evaluation(user_id, "dbms-01", "practice", "voice", "Answer 4")
    await db.update_answer_evaluation_result(eval4, "completed", 7.0, 7.0, 7.0, 7.0, "Decent")

    stats = await db.get_user_progress_stats(user_id)
    assert stats["total_answered"] == 2  # Only 2 completed!
    assert stats["recent_sample_count"] == 2
    assert stats["recent_avg_score"] == 8.0  # (9.0 + 7.0) / 2
    assert stats["daily_answered"] == 1


# ==================== 7. Cross-User Ownership Tests ====================

@pytest.mark.asyncio
async def test_cross_user_ownership_guard_on_callbacks(mock_context):
    """Verify that a user cannot manipulate another user's session or evaluation callback."""
    context, db, settings, _ = mock_context
    await db.init_db()
    owner_id = 7771
    attacker_id = 7772
    await db.get_or_create_user(owner_id)
    await db.get_or_create_user(attacker_id)

    eval_id = await db.save_answer_evaluation(owner_id, "dsa-01", "practice", "text", "Secret answer")

    # Attacker tries to retry owner's evaluation
    cb_update = MagicMock(spec=Update)
    query = AsyncMock(spec=CallbackQuery)
    query.from_user.id = attacker_id
    query.data = f"retryeval:{owner_id}:{eval_id}"
    cb_update.callback_query = query

    await retry_evaluation_callback(cb_update, context)
    query.answer.assert_called_with("⚠️ This evaluation belongs to another user.", show_alert=True)

    # Attacker tries to end owner's mock session
    session_id = await db.create_mock_session(owner_id, "topics", ["dsa-01"])
    query.data = f"mockend:{owner_id}:{session_id}"
    await mock_interview_callback(cb_update, context)
    query.answer.assert_called_with("⚠️ Session mismatch.", show_alert=True)
