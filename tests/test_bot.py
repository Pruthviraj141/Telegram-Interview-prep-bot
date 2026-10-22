import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from telegram import Update, User, Message, Document
from app.config import Settings
from app.database import Database
from app.question_bank import QuestionBank
from app.services.practice_service import PracticeService
from app.security import generate_fernet_key, encrypt_api_key
from app.bot import (
    start_handler,
    resume_document_handler,
    check_key_callback,
    confirm_role_callback,
    change_role_callback,
    topic_selection_callback,
    practice_question_callback,
    start_choose_topics_flow,
    start_random_practice,
    start_teach_topic_flow,
    execute_teach_topic,
    text_message_handler,
    delete_key_command,
    delete_resume_command,
    resume_action_callback,
)


@pytest.fixture
def mock_context(tmp_path):
    context = MagicMock()
    enc_key = generate_fernet_key()
    settings = Settings(
        APP_ENV="testing",
        TELEGRAM_BOT_TOKEN="mock_bot_token",
        ENCRYPTION_KEY=enc_key,
        WEB_BASE_URL="http://localhost:8000"
    )
    db = Database(str(tmp_path / "bot_test.db"))
    qb = QuestionBank("data/question_bank.json")
    qb.load_and_validate()
    practice = PracticeService(qb, db)
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

    context.bot_data = {
        "settings": settings,
        "db": db,
        "qb": qb,
        "practice": practice,
        "tavily": tavily,
        "coaching": coaching,
        "company_prep": company_prep,
        "project_defence": project_defence,
        "adaptive": adaptive,
    }
    context.user_data = {}
    return context, db, settings, qb


@pytest.mark.asyncio
async def test_start_handler_new_user(mock_context):
    context, db, _, _ = mock_context
    await db.init_db()

    update = MagicMock(spec=Update)
    user = MagicMock(spec=User)
    user.id = 1111
    user.first_name = "Alex"
    update.effective_user = user

    message = AsyncMock(spec=Message)
    update.message = message

    await start_handler(update, context)

    user_row = await db.get_or_create_user(1111)
    assert user_row["onboarding_state"] == "AWAITING_GROQ_KEY"
    assert message.reply_text.call_count >= 1
    assert "Step 1 of 3: Connect your Groq API Key (Mandatory)" in message.reply_text.call_args_list[0][0][0]


@pytest.mark.asyncio
async def test_start_handler_user_with_key_awaits_resume(mock_context):
    context, db, settings, _ = mock_context
    await db.init_db()

    user_id = 1112
    enc = encrypt_api_key("gsk_sample_key_123", settings.ENCRYPTION_KEY)
    await db.save_credentials(user_id, enc, "gsk_..._123")

    update = MagicMock(spec=Update)
    user = MagicMock(spec=User)
    user.id = user_id
    user.first_name = "Alex"
    update.effective_user = user

    message = AsyncMock(spec=Message)
    update.message = message

    await start_handler(update, context)

    user_row = await db.get_or_create_user(user_id)
    assert user_row["onboarding_state"] == "AWAITING_RESUME"
    assert "Step 2 of 3: Upload your resume" in message.reply_text.call_args_list[0][0][0]


@pytest.mark.asyncio
async def test_resume_upload_and_key_prompt(mock_context):
    context, db, _, _ = mock_context
    await db.init_db()
    await db.get_or_create_user(2222)

    update = MagicMock(spec=Update)
    user = MagicMock(spec=User)
    user.id = 2222
    update.effective_user = user

    doc = MagicMock(spec=Document)
    doc.file_name = "resume.pdf"
    doc.file_size = 1000
    doc.file_id = "mock_file_id"

    message = AsyncMock(spec=Message)
    message.document = doc
    status_msg = AsyncMock()
    message.reply_text.return_value = status_msg
    update.message = message

    mock_bot_file = AsyncMock()
    mock_bot_file.download_as_bytearray.return_value = bytearray(b"dummy pdf bytes")
    context.bot.get_file = AsyncMock(return_value=mock_bot_file)

    with patch("app.bot.extract_resume_text", return_value=("Extracted resume text", "pdf")):
        await resume_document_handler(update, context)

    user_row = await db.get_or_create_user(2222)
    assert user_row["onboarding_state"] == "AWAITING_GROQ_KEY"

    resume_row = await db.get_resume(2222)
    assert resume_row is not None
    assert resume_row["extracted_text"] == "Extracted resume text"


@pytest.mark.asyncio
async def test_check_key_callback_runs_analysis_and_caches(mock_context):
    context, db, settings, _ = mock_context
    await db.init_db()
    user_id = 3333
    await db.get_or_create_user(user_id)
    await db.save_resume(user_id, "Sample resume content", "pdf", 100)

    enc = encrypt_api_key("gsk_valid_key_123", settings.ENCRYPTION_KEY)
    await db.save_credentials(user_id, enc, "gsk_..._123")

    update = MagicMock(spec=Update)
    query = AsyncMock()
    query.from_user.id = user_id
    query.data = f"check_key:{user_id}"
    update.callback_query = query

    mock_profile = {
        "primary_role": "Backend Lead",
        "target_roles": ["Backend Lead"],
        "programming_languages": ["Python", "Go"],
        "frameworks_and_tools": ["FastAPI", "Docker"],
        "database_technologies": ["PostgreSQL"],
        "notable_projects": ["Distributed Queue"],
        "years_of_experience": "5 years",
        "recommended_topics": ["DSA", "DBMS / SQL"]
    }

    with patch("app.bot.analyze_resume_comprehensive", return_value=mock_profile) as mock_analyze:
        await check_key_callback(update, context)
        assert mock_analyze.call_count == 1

        # Second call should use cached analysis without calling LLM
        await check_key_callback(update, context)
        assert mock_analyze.call_count == 1  # Still 1 because cached!


@pytest.mark.asyncio
async def test_topic_selection_toggle_and_save(mock_context):
    context, db, _, _ = mock_context
    await db.init_db()
    user_id = 4444
    await db.get_or_create_user(user_id)

    # 1. Start flow
    msg = AsyncMock(spec=Message)
    update = MagicMock(spec=Update)
    update.effective_user = MagicMock(id=user_id)
    update.message = msg
    await start_choose_topics_flow(update, context, user_id)
    assert context.user_data["draft_topics"] == []

    # 2. Toggle 'dsa' on
    cb_update = MagicMock(spec=Update)
    query = AsyncMock()
    query.from_user.id = user_id
    query.data = f"topictog:{user_id}:dsa"
    cb_update.callback_query = query

    await topic_selection_callback(cb_update, context)
    assert "dsa" in context.user_data["draft_topics"]

    # 3. Toggle 'os' on
    query.data = f"topictog:{user_id}:os"
    await topic_selection_callback(cb_update, context)
    assert set(context.user_data["draft_topics"]) == {"dsa", "os"}

    # 4. Save
    query.data = f"topicsave:{user_id}"
    await topic_selection_callback(cb_update, context)
    saved = await db.get_user_topics(user_id)
    assert set(saved) == {"dsa", "os"}


@pytest.mark.asyncio
async def test_callback_cross_user_ownership_guard(mock_context):
    context, db, _, _ = mock_context
    await db.init_db()
    owner_id = 5555
    attacker_id = 9999

    cb_update = MagicMock(spec=Update)
    query = AsyncMock()
    query.from_user.id = attacker_id  # Different user!
    query.data = f"topictog:{owner_id}:dsa"
    cb_update.callback_query = query

    await topic_selection_callback(cb_update, context)
    query.answer.assert_called_with("⚠️ You cannot interact with another user's topic selection.", show_alert=True)


@pytest.mark.asyncio
async def test_random_practice_flow_and_reveal_answer(mock_context):
    context, db, _, qb = mock_context
    await db.init_db()
    user_id = 6666
    await db.get_or_create_user(user_id)
    await db.set_user_topics(user_id, ["dsa"])

    # 1. Start practice
    msg = AsyncMock(spec=Message)
    update = MagicMock(spec=Update)
    update.effective_user = MagicMock(id=user_id)
    update.message = msg
    await start_random_practice(update, context, user_id)
    msg.reply_text.assert_called_once()
    content = msg.reply_text.call_args[0][0]
    assert "Interview Practice" in content
    assert "Model Answer" not in content  # Hidden initially!

    # 2. Reveal answer
    cb_update = MagicMock(spec=Update)
    query = AsyncMock()
    query.from_user.id = user_id
    query.data = f"pqans:{user_id}:dsa-01"
    cb_update.callback_query = query

    await practice_question_callback(cb_update, context)
    query.edit_message_text.assert_called_once()
    revealed_text = query.edit_message_text.call_args[0][0]
    assert "Model Answer:" in revealed_text


@pytest.mark.asyncio
async def test_teach_me_a_topic_flow(mock_context):
    context, db, settings, _ = mock_context
    await db.init_db()
    user_id = 7777
    await db.get_or_create_user(user_id)
    enc = encrypt_api_key("gsk_valid_key_123", settings.ENCRYPTION_KEY)
    await db.save_credentials(user_id, enc, "gsk_..._123")

    msg = AsyncMock(spec=Message)
    update = MagicMock(spec=Update)
    update.effective_user = MagicMock(id=user_id)
    update.message = msg

    # Start teach topic flow
    await start_teach_topic_flow(update, context, user_id)
    user = await db.get_or_create_user(user_id)
    assert user["onboarding_state"] == "AWAITING_TEACH_TOPIC"

    # User sends topic text
    text_update = MagicMock(spec=Update)
    text_update.effective_user = MagicMock(id=user_id)
    text_msg = AsyncMock(spec=Message)
    text_msg.text = "Kafka Consumer Groups"
    status_msg = AsyncMock()
    text_msg.reply_text.return_value = status_msg
    text_update.message = text_msg

    mock_lesson = {
        "topic": "Kafka Consumer Groups",
        "definition": "A mechanism for scaling message consumption in Kafka.",
        "step_by_step": ["Partitions assigned to consumers", "Heartbeats maintain membership"],
        "analogy_or_example": "Like checkout lanes in a supermarket.",
        "interview_explanation": "Consumer groups balance partition reads across members.",
        "practice_questions": ["What triggers a rebalance?"]
    }

    with patch("app.bot.generate_topic_lesson", return_value=mock_lesson):
        await text_message_handler(text_update, context)
        status_msg.edit_text.assert_called_once()
        lesson_text = status_msg.edit_text.call_args[0][0]
        assert "Kafka Consumer Groups" in lesson_text
        assert "Definition:" in lesson_text


@pytest.mark.asyncio
async def test_delete_key_and_resume_commands(mock_context):
    context, db, settings, _ = mock_context
    await db.init_db()
    user_id = 8888
    await db.get_or_create_user(user_id)
    await db.save_resume(user_id, "Text", "pdf", 100)
    enc = encrypt_api_key("gsk_key", settings.ENCRYPTION_KEY)
    await db.save_credentials(user_id, enc, "gsk_..._key")

    update = MagicMock(spec=Update)
    user = MagicMock(spec=User)
    user.id = user_id
    update.effective_user = user
    update.message = AsyncMock()

    await delete_key_command(update, context)
    assert await db.get_credentials(user_id) is None

    await delete_resume_command(update, context)
    assert await db.get_resume(user_id) is None
