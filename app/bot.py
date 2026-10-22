"""
Telegram Bot handlers for Phase 1 & Phase 2:
- Phase 1: Onboarding state machine, resume upload (PDF/DOCX), secure BYOK Groq key setup, encrypted credentials.
- Phase 2:
    Feature A: Resume personalization (analyze existing resume, cache in SQLite, invalidate on update/delete).
    Feature B: 90-question curated question bank across 9 categories.
    Feature C: Choose Topics inline keyboard with multi-select toggle, persistence, ownership check.
    Feature D: Random Topic Practice with repeat-avoidance, Show Hint, Reveal Model Answer, Next Question.
    Feature E: Teach Me A Topic on-demand lesson generator using user BYOK Groq key, message chunking, retry/error handling.
"""
import os
import re
import json
import asyncio
import tempfile
import time
import hashlib
import inspect
import logging
from typing import Optional, List, Dict, Any
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, ReplyKeyboardMarkup, CallbackQuery, Message
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ContextTypes,
    filters,
)
from app.config import Settings
from app.database import Database
from app.question_bank import QuestionBank, VALID_CATEGORIES, SLUG_TO_CATEGORY
from app.security import generate_secure_token, hash_token, decrypt_api_key
from app.resume_parser import extract_resume_text, ResumeExtractionError
from app.services.groq_service import (
    analyze_resume_profile,
    analyze_resume_comprehensive,
    generate_topic_lesson,
    transcribe_voice,
    GroqServiceError,
)
from app.services.practice_service import PracticeService
from app.services.evaluation_service import evaluate_answer, EvaluationResult
from app.services.mock_interview_service import (
    prepare_mock_interview_questions,
    generate_mock_interview_report,
)
from app.services.tavily_service import TavilyService
from app.services.coaching_service import CoachingService
from app.services.company_prep_service import CompanyPrepService
from app.services.project_defence_service import ProjectDefenceService
from app.services.adaptive_learning_service import AdaptiveLearningService

logger = logging.getLogger(__name__)

# Main Menu Keyboard - Complete Placement Companion
MAIN_MENU_KEYBOARD = [
    ["📅 Daily Challenge", "💬 Ask the Coach"],
    ["🏢 Company Interview Prep", "🛡️ Project Defence"],
    ["💡 Teach Me a Topic", "🎯 Mock Interview"],
    ["🎲 Random Practice", "📄 Resume & Topics"],
    ["📊 My Progress", "⚙️ Settings & Notifications"]
]

TOPIC_SLUG_ORDER = [
    "dsa", "dbms", "oop", "os", "networks",
    "ai", "resume_projects", "hr", "web_backend"
]

TOPIC_SHORT_NAMES = {
    "dsa": "DSA",
    "dbms": "DBMS / SQL",
    "oop": "OOP / Java",
    "os": "Operating Systems",
    "networks": "Networks",
    "ai": "AI / ML",
    "resume_projects": "Resume & Projects",
    "hr": "HR & Aptitude",
    "web_backend": "Web & Backend"
}


async def get_effective_groq_key(db: Database, settings: Settings, telegram_id: int) -> Optional[str]:
    """
    Retrieve user's own decrypted Groq API key.
    If the user has not connected their own key and TESTING_GROQ_API_KEY is configured in .env,
    falls back to the testing key for local development.
    """
    creds = await db.get_credentials(telegram_id)
    if creds and creds.get("encrypted_groq_key"):
        try:
            return decrypt_api_key(creds["encrypted_groq_key"], settings.ENCRYPTION_KEY)
        except Exception as e:
            logger.error(f"Failed to decrypt stored Groq key for {telegram_id}: {e}")
            return None
    
    # Fallback to TESTING_GROQ_API_KEY if configured in .env
    if settings.TESTING_GROQ_API_KEY:
        logger.info(f"Using TESTING_GROQ_API_KEY fallback for user {telegram_id}")
        return settings.TESTING_GROQ_API_KEY.strip()

    return None


def build_topic_selection_keyboard(user_id: int, selected_slugs: List[str]) -> InlineKeyboardMarkup:
    """Build multi-select inline keyboard for topic preferences."""
    keyboard = []
    selected_set = set(selected_slugs)

    for slug in TOPIC_SLUG_ORDER:
        is_selected = slug in selected_set
        prefix = "✅ " if is_selected else "⬜ "
        display_name = TOPIC_SHORT_NAMES.get(slug, slug)
        cb_data = f"topictog:{user_id}:{slug}"
        keyboard.append([InlineKeyboardButton(f"{prefix}{display_name}", callback_data=cb_data)])

    # Action row: Save, Select All, Clear
    action_row = [
        InlineKeyboardButton("💾 Save Topics", callback_data=f"topicsave:{user_id}"),
        InlineKeyboardButton("❌ Cancel", callback_data=f"topiccancel:{user_id}")
    ]
    keyboard.append(action_row)
    return InlineKeyboardMarkup(keyboard)


def chunk_telegram_text(text: str, max_chunk_size: int = 4000) -> List[str]:
    """Split long text safely on newline boundaries for Telegram 4096 character limits."""
    if len(text) <= max_chunk_size:
        return [text]

    chunks = []
    lines = text.split("\n")
    current_chunk = []
    current_len = 0

    for line in lines:
        line_len = len(line) + 1
        if current_len + line_len > max_chunk_size and current_chunk:
            chunks.append("\n".join(current_chunk))
            current_chunk = [line]
            current_len = line_len
        else:
            current_chunk.append(line)
            current_len += line_len

    if current_chunk:
        chunks.append("\n".join(current_chunk))
    return chunks


async def safe_edit_message(target: Any, text: str, reply_markup=None, parse_mode: Optional[str] = "Markdown"):
    """Edit message safely falling back to plain text if Markdown entity parsing fails."""
    is_query = isinstance(target, CallbackQuery) or ('data' in getattr(target, "__dict__", {}))
    if is_query:
        edit_func = getattr(target, "edit_message_text", None) or getattr(target, "edit_text", None)
    else:
        edit_func = getattr(target, "edit_text", None) or getattr(target, "edit_message_text", None)
    if not edit_func:
        return None
    try:
        res = edit_func(text, reply_markup=reply_markup, parse_mode=parse_mode)
        if inspect.isawaitable(res):
            return await res
        return res
    except Exception as e:
        if "can't parse entities" in str(e).lower() or "entity" in str(e).lower() or "bad request" in str(e).lower():
            try:
                res = edit_func(text, reply_markup=reply_markup, parse_mode=None)
                if inspect.isawaitable(res):
                    return await res
                return res
            except Exception:
                pass
        raise


async def safe_reply_message(msg_or_update: Any, text: str, reply_markup=None, parse_mode: Optional[str] = "Markdown"):
    """Reply safely falling back to plain text if Markdown entity parsing fails."""
    target = msg_or_update
    if getattr(msg_or_update, "message", None):
        target = msg_or_update.message
    elif getattr(msg_or_update, "callback_query", None) and getattr(msg_or_update.callback_query, "message", None):
        target = msg_or_update.callback_query.message
    elif getattr(msg_or_update, "effective_message", None):
        target = msg_or_update.effective_message

    reply_func = getattr(target, "reply_text", None)
    if not reply_func:
        return None
    try:
        res = reply_func(text, reply_markup=reply_markup, parse_mode=parse_mode)
        if inspect.isawaitable(res):
            return await res
        return res
    except Exception as e:
        if "can't parse entities" in str(e).lower() or "entity" in str(e).lower() or "bad request" in str(e).lower():
            try:
                res = reply_func(text, reply_markup=reply_markup, parse_mode=None)
                if inspect.isawaitable(res):
                    return await res
                return res
            except Exception:
                pass
        raise


# ==================== Phase 1 Core Handlers ====================

async def start_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle /start command. Initialize or retrieve user."""
    if not update.effective_user or not update.message:
        return

    telegram_id = update.effective_user.id
    db: Database = context.bot_data["db"]
    user = await db.get_or_create_user(telegram_id)
    onboarding_state = user.get("onboarding_state", "NEW")

    if onboarding_state == "COMPLETED":
        reply_markup = ReplyKeyboardMarkup(MAIN_MENU_KEYBOARD, resize_keyboard=True)
        selected_topics = await db.get_user_topics(telegram_id)
        topic_str = ", ".join(TOPIC_SHORT_NAMES.get(t, t) for t in selected_topics) if selected_topics else "None selected yet"

        await update.message.reply_text(
            f"Welcome back, {update.effective_user.first_name}!\n\n"
            f"🎯 *Target Role:* {user.get('target_role', 'Not set')}\n"
            f"💡 *Selected Topics:* {topic_str}\n\n"
            "Select an option from the menu below:",
            reply_markup=reply_markup,
            parse_mode="Markdown"
        )
        return

    # User is in onboarding
    creds = await db.get_credentials(telegram_id)
    if not creds:
        await db.update_onboarding_state(telegram_id, "AWAITING_GROQ_KEY")
        welcome_text = (
            f"👋 Welcome to the *AI Interview Coach*, {update.effective_user.first_name}!\n\n"
            "I'm here to help you prepare and practice for tech interviews tailored specifically to your background.\n\n"
            "🔑 *Step 1 of 3: Connect your Groq API Key (Mandatory)*\n"
            "A personal Groq API key is required to power your AI questions, voice evaluation, and resume analysis.\n\n"
            "Please use the link below to securely connect your key."
        )
        await update.message.reply_text(welcome_text, parse_mode="Markdown")
        await send_key_setup_prompt(update, context, telegram_id)
        return

    resume_data = await db.get_resume(telegram_id)
    if not resume_data or not resume_data.get("extracted_text"):
        await db.update_onboarding_state(telegram_id, "AWAITING_RESUME")
        welcome_text = (
            f"👋 Welcome back, {update.effective_user.first_name}!\n\n"
            "✅ *Groq API Key is connected!*\n\n"
            "📄 *Step 2 of 3: Upload your resume*\n"
            "Please send your resume as a *PDF (.pdf)* or *Word document (.docx)*.\n"
            "_(Max size: 5 MB)_"
        )
        await update.message.reply_text(welcome_text, parse_mode="Markdown")
        return

    await prompt_resume_analysis(update, context, telegram_id)


async def resume_document_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle resume document uploads."""
    if not update.effective_user or not update.message or not update.message.document:
        return

    telegram_id = update.effective_user.id
    doc = update.message.document
    filename = doc.file_name or "resume.pdf"
    file_size = doc.file_size or 0

    settings: Settings = context.bot_data["settings"]
    db: Database = context.bot_data["db"]

    if file_size > settings.MAX_RESUME_SIZE_BYTES:
        await update.message.reply_text(
            f"⚠️ File is too large ({file_size // 1024 // 1024}MB). "
            f"Please upload a document under {settings.MAX_RESUME_SIZE_BYTES // 1024 // 1024}MB."
        )
        return

    status_msg = await update.message.reply_text("📥 Downloading and validating resume...")

    try:
        tg_file = await context.bot.get_file(doc.file_id)
        file_bytes = await tg_file.download_as_bytearray()

        extracted_text, file_type = extract_resume_text(
            bytes(file_bytes),
            filename,
            settings.MAX_RESUME_SIZE_BYTES
        )

        await db.save_resume(
            telegram_id=telegram_id,
            extracted_text=extracted_text,
            file_type=file_type,
            file_size_bytes=len(file_bytes)
        )

        # Invalidate old analysis cache for this user
        await db.invalidate_resume_analysis(telegram_id)

        user = await db.get_or_create_user(telegram_id)
        creds = await db.get_credentials(telegram_id)

        if not creds:
            await db.update_onboarding_state(telegram_id, "AWAITING_GROQ_KEY")
            await status_msg.edit_text(
                "✅ *Resume saved successfully!*\n\n"
                "⚠️ *Mandatory Step Required:* You must connect your personal Groq API key before we can analyze your resume or start interview prep.",
                parse_mode="Markdown"
            )
            await send_key_setup_prompt(update, context, telegram_id)
        else:
            await status_msg.edit_text("✅ Resume updated successfully!")
            # Trigger analysis options
            await prompt_resume_analysis(update, context, telegram_id)

    except ResumeExtractionError as e:
        await status_msg.edit_text(
            f"❌ *Resume Extraction Failed*\n\n{str(e)}\n\n"
            "Please send a valid, uncorrupted PDF or DOCX file to retry.",
            parse_mode="Markdown"
        )
    except Exception as e:
        logger.error(f"Error handling document: {e}", exc_info=True)
        await status_msg.edit_text(
            f"❌ An error occurred while processing your file: {e}\n\nPlease try again."
        )


async def send_key_setup_prompt(update: Update, context: ContextTypes.DEFAULT_TYPE, telegram_id: int) -> None:
    """Generate a single-use setup token and send link to the user."""
    settings: Settings = context.bot_data["settings"]
    db: Database = context.bot_data["db"]

    token = generate_secure_token()
    token_h = hash_token(token)
    expires_at = time.time() + settings.KEY_SETUP_TOKEN_EXPIRY_SECONDS

    await db.create_key_setup_token(token_h, telegram_id, expires_at)

    # Telegram Bot API rejects URLs with 'localhost'. Always normalize to 127.0.0.1 or domain.
    base_url = settings.WEB_BASE_URL.rstrip('/')
    if "://localhost" in base_url:
        base_url = base_url.replace("://localhost", "://127.0.0.1")

    setup_url = f"{base_url}/setup-key?token={token}"

    keyboard = [
        [InlineKeyboardButton("🔑 Connect Groq API Key", url=setup_url)],
        [InlineKeyboardButton("🔄 I have connected my key (Continue)", callback_data=f"check_key:{telegram_id}")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    msg_text = (
        "🔑 *Connect your Groq API Key (Mandatory)*\n\n"
        "To provide high-quality AI analysis and interviews, this bot requires your personal Groq API key.\n\n"
        "🔒 *Security Guarantee*:\n"
        "• Your key is *never* sent through Telegram chat.\n"
        "• It is encrypted at rest using AES Fernet encryption.\n"
        "• Decrypted in-memory only when making API calls.\n\n"
        f"👉 [Click here to open Key Setup page]({setup_url})\n\n"
        f"Or copy and open this link in your browser:\n`{setup_url}`\n\n"
        "_(Link expires in 15 minutes. Once submitted, click Continue below.)_"
    )

    try:
        if update.message:
            await update.message.reply_text(msg_text, reply_markup=reply_markup, parse_mode="Markdown")
        elif update.callback_query and update.callback_query.message:
            await update.callback_query.message.reply_text(msg_text, reply_markup=reply_markup, parse_mode="Markdown")
    except Exception as e:
        logger.warning(f"Could not send inline button with URL ({e}); sending fallback keyboard.")
        fallback_keyboard = [
            [InlineKeyboardButton("🔄 I have connected my key (Continue)", callback_data=f"check_key:{telegram_id}")]
        ]
        fallback_markup = InlineKeyboardMarkup(fallback_keyboard)
        if update.message:
            await update.message.reply_text(msg_text, reply_markup=fallback_markup, parse_mode="Markdown")
        elif update.callback_query and update.callback_query.message:
            await update.callback_query.message.reply_text(msg_text, reply_markup=fallback_markup, parse_mode="Markdown")


# ==================== Feature A: Resume Personalization ====================

async def prompt_resume_analysis(update: Update, context: ContextTypes.DEFAULT_TYPE, telegram_id: int) -> None:
    """Prompt user to analyze their uploaded resume with their own Groq key."""
    keyboard = [
        [InlineKeyboardButton("🧠 Analyze Resume with Groq", callback_data=f"resanalyze:{telegram_id}")],
        [InlineKeyboardButton("📄 Replace Resume", callback_data=f"resupdate:{telegram_id}")]
    ]
    markup = InlineKeyboardMarkup(keyboard)
    msg = (
        "📄 *Resume Management*\n\n"
        "Your resume is saved securely. Would you like to run AI personalization to detect your target role, "
        "programming skills, and recommended interview topics?"
    )
    if update.message:
        await update.message.reply_text(msg, reply_markup=markup, parse_mode="Markdown")
    elif update.callback_query and update.callback_query.message:
        await update.callback_query.message.reply_text(msg, reply_markup=markup, parse_mode="Markdown")


async def resume_action_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle resume analysis and update callbacks with ownership check."""
    query = update.callback_query
    if not query:
        return
    await query.answer()

    data = query.data or ""
    parts = data.split(":")
    action = parts[0]
    expected_user_id = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else query.from_user.id

    # Ownership check
    if query.from_user.id != expected_user_id:
        await query.answer("⚠️ This button belongs to another user session.", show_alert=True)
        return

    telegram_id = query.from_user.id
    db: Database = context.bot_data["db"]
    settings: Settings = context.bot_data["settings"]

    if action == "resupdate":
        await db.update_onboarding_state(telegram_id, "AWAITING_RESUME")
        await query.edit_message_text("📄 Please upload your new resume as a PDF or DOCX document:")
        return

    if action == "resanalyze":
        await run_and_display_resume_analysis(query, context, telegram_id)


async def run_and_display_resume_analysis(query: Any, context: ContextTypes.DEFAULT_TYPE, telegram_id: int) -> None:
    """Execute or retrieve cached structured resume analysis."""
    db: Database = context.bot_data["db"]
    settings: Settings = context.bot_data["settings"]

    raw_key = await get_effective_groq_key(db, settings, telegram_id)
    if not raw_key:
        await query.edit_message_text("⚠️ No Groq API key found. Please connect your key using /setup_key first.")
        return

    resume_data = await db.get_resume(telegram_id)
    if not resume_data or not resume_data.get("extracted_text"):
        await query.edit_message_text("⚠️ No resume found. Please upload a PDF or DOCX resume first.")
        return

    resume_text = resume_data["extracted_text"]
    resume_hash = hashlib.sha256(resume_text.encode("utf-8")).hexdigest()

    # Check cache first
    cached = await db.get_cached_resume_analysis(telegram_id, resume_hash)
    if cached:
        profile = cached
        header_note = "⚡ *(Loaded from cached analysis)*"
    else:
        await query.edit_message_text("🔍 Running AI resume personalization with Groq AI...")
        try:
            profile = analyze_resume_comprehensive(raw_key, resume_text, model=settings.GROQ_MODEL)
            # Cache result in SQLite
            await db.save_cached_resume_analysis(telegram_id, resume_hash, profile)
            header_note = "✨ *(Fresh AI analysis)*"
        except GroqServiceError as e:
            retry_keyboard = [
                [InlineKeyboardButton("🔄 Retry Analysis", callback_data=f"resanalyze:{telegram_id}")],
                [InlineKeyboardButton("🔑 Reconnect Key", callback_data=f"reconnect_key:{telegram_id}")]
            ]
            await query.edit_message_text(
                f"❌ *Analysis Failed*: {str(e)}\n\nYour resume is safely saved. Would you like to retry?",
                reply_markup=InlineKeyboardMarkup(retry_keyboard),
                parse_mode="Markdown"
            )
            return
        except Exception as e:
            logger.error(f"Unexpected resume analysis error: {e}")
            await query.edit_message_text("❌ An unexpected error occurred. Please try again.")
            return

    primary_role = profile.get("primary_role", "Software Engineer")
    langs = ", ".join(profile.get("programming_languages", [])) or "None detected"
    frameworks = ", ".join(profile.get("frameworks_and_tools", [])) or "None detected"
    dbs = ", ".join(profile.get("database_technologies", [])) or "None detected"
    exp = profile.get("years_of_experience", "Not specified")
    topics = ", ".join(profile.get("recommended_topics", [])) or "General Engineering"

    summary_msg = (
        f"🎯 *Resume Intelligence Profile* {header_note}\n\n"
        f"👤 *Target Role:* {primary_role}\n"
        f"⏳ *Experience:* {exp}\n"
        f"💻 *Languages:* {langs}\n"
        f"🛠 *Frameworks & Tools:* {frameworks}\n"
        f"🗄 *Databases:* {dbs}\n"
        f"📚 *Recommended Topics:* {topics}\n\n"
        "Would you like to confirm this target role or customize it?"
    )

    confirm_keyboard = [
        [InlineKeyboardButton(f"✅ Confirm Role: {primary_role}", callback_data=f"confirm_role:{telegram_id}:{primary_role}")],
        [InlineKeyboardButton("✏️ Customize Role", callback_data=f"change_role:{telegram_id}")]
    ]
    await query.edit_message_text(
        summary_msg,
        reply_markup=InlineKeyboardMarkup(confirm_keyboard),
        parse_mode="Markdown"
    )


# ==================== Phase 1 Check Key & Role Callbacks ====================

async def check_key_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if not query:
        return
    await query.answer()

    data = query.data or ""
    parts = data.split(":")
    expected_user_id = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else query.from_user.id
    if query.from_user.id != expected_user_id:
        await query.answer("⚠️ Session mismatch.", show_alert=True)
        return

    telegram_id = query.from_user.id
    db: Database = context.bot_data["db"]
    creds = await db.get_credentials(telegram_id)
    if not creds:
        await query.edit_message_text(
            "⚠️ *No Groq key detected yet.*\n\nPlease submit your key via the setup link, then click continue.",
            parse_mode="Markdown"
        )
        await send_key_setup_prompt(update, context, telegram_id)
        return

    # Check if user has uploaded a resume
    resume_data = await db.get_resume(telegram_id)
    if not resume_data or not resume_data.get("extracted_text"):
        await db.update_onboarding_state(telegram_id, "AWAITING_RESUME")
        await query.edit_message_text(
            "✅ *Groq API Key verified and securely saved!*\n\n"
            "📄 *Step 2 of 3: Upload your resume*\n"
            "Please send your resume as a *PDF (.pdf)* or *Word document (.docx)* to begin AI personalization.\n"
            "_(Max size: 5 MB)_",
            parse_mode="Markdown"
        )
        return

    # Trigger resume intelligence
    await run_and_display_resume_analysis(query, context, telegram_id)


async def confirm_role_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if not query:
        return
    await query.answer()

    data = query.data or ""
    parts = data.split(":")
    expected_user_id = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else query.from_user.id
    role = parts[2] if len(parts) > 2 else "Software Engineer"

    if query.from_user.id != expected_user_id:
        await query.answer("⚠️ Session mismatch.", show_alert=True)
        return

    telegram_id = query.from_user.id
    db: Database = context.bot_data["db"]
    await db.update_onboarding_state(telegram_id, "COMPLETED", target_role=role)

    # If user has no topics selected, pre-seed with default topics
    current_topics = await db.get_user_topics(telegram_id)
    if not current_topics:
        await db.set_user_topics(telegram_id, ["dsa", "dbms", "web_backend"])

    reply_markup = ReplyKeyboardMarkup(MAIN_MENU_KEYBOARD, resize_keyboard=True)
    await query.edit_message_text(f"✅ Target role confirmed as: *{role}*!", parse_mode="Markdown")

    sched_inline = InlineKeyboardMarkup([
        [InlineKeyboardButton("⏰ Configure Daily Questions Now", callback_data=f"schedcfg:{telegram_id}")]
    ])

    await query.message.reply_text(
        f"🚀 *Setup Complete!*\n\n"
        f"Target Role: *{role}*\n\n"
        "Welcome to your AI Interview Coach. Choose an option from the menu below to begin practicing.\n\n"
        "💡 *Tip:* You can enable automatic daily interview questions to receive a fresh challenge every morning!",
        reply_markup=sched_inline,
        parse_mode="Markdown"
    )
    # Send persistent keyboard menu
    await query.message.reply_text(
        "Main menu ready:",
        reply_markup=reply_markup
    )


async def change_role_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if not query:
        return
    await query.answer()

    data = query.data or ""
    parts = data.split(":")
    expected_user_id = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else query.from_user.id

    if query.from_user.id != expected_user_id:
        await query.answer("⚠️ Session mismatch.", show_alert=True)
        return

    telegram_id = query.from_user.id
    db: Database = context.bot_data["db"]
    await db.update_onboarding_state(telegram_id, "ENTERING_CUSTOM_ROLE")

    await query.edit_message_text(
        "✏️ Please send me your target role as a message (e.g. *Senior Backend Engineer*, *Full Stack Developer*, *ML Engineer*):",
        parse_mode="Markdown"
    )


# ==================== Feature C: Choose Topics ====================

async def start_choose_topics_flow(update: Update, context: ContextTypes.DEFAULT_TYPE, telegram_id: int) -> None:
    """Display interactive topic selection keyboard."""
    db: Database = context.bot_data["db"]
    selected = await db.get_user_topics(telegram_id)
    # Store draft in user_data for active toggle session
    context.user_data["draft_topics"] = list(selected)

    markup = build_topic_selection_keyboard(telegram_id, selected)
    msg_text = (
        "🎯 *Choose Interview Topics*\n\n"
        "Tap the topics you want to practice. Tap again to deselect.\n"
        "When finished, click *Save Topics* below."
    )
    if update.message:
        await update.message.reply_text(msg_text, reply_markup=markup, parse_mode="Markdown")
    elif update.callback_query and update.callback_query.message:
        await update.callback_query.message.reply_text(msg_text, reply_markup=markup, parse_mode="Markdown")


async def topic_selection_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle topic toggle, save, and cancel callbacks with ownership check."""
    query = update.callback_query
    if not query:
        return
    await query.answer()

    data = query.data or ""
    parts = data.split(":")
    action = parts[0]
    expected_user_id = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else query.from_user.id

    # Cross-user ownership guard
    if query.from_user.id != expected_user_id:
        await query.answer("⚠️ You cannot interact with another user's topic selection.", show_alert=True)
        return

    telegram_id = query.from_user.id
    db: Database = context.bot_data["db"]

    # Retrieve draft or fallback to DB
    draft = context.user_data.get("draft_topics")
    if draft is None:
        draft = await db.get_user_topics(telegram_id)
        context.user_data["draft_topics"] = draft

    if action == "topictog":
        slug = parts[2]
        if slug in draft:
            draft.remove(slug)
        else:
            draft.append(slug)
        context.user_data["draft_topics"] = draft

        # Re-render updated keyboard
        markup = build_topic_selection_keyboard(telegram_id, draft)
        await query.edit_message_reply_markup(reply_markup=markup)

    elif action == "topicsave":
        # Save to DB
        await db.set_user_topics(telegram_id, draft)
        context.user_data.pop("draft_topics", None)
        selected_names = [TOPIC_SHORT_NAMES.get(s, s) for s in draft]
        selected_str = ", ".join(selected_names) if selected_names else "None (select at least one)"

        await query.edit_message_text(
            f"✅ *Topics Saved Successfully!*\n\n"
            f"Active Topics ({len(draft)}):\n{selected_str}\n\n"
            "You are all set for Random Practice!",
            parse_mode="Markdown"
        )

    elif action == "topiccancel":
        context.user_data.pop("draft_topics", None)
        await query.edit_message_text("❌ Topic selection cancelled.")


# ==================== Feature D: Random Topic Practice ====================

async def start_random_practice(update: Update, context: ContextTypes.DEFAULT_TYPE, telegram_id: int) -> None:
    """Fetch next random practice question and present to user."""
    practice: PracticeService = context.bot_data["practice"]
    db: Database = context.bot_data["db"]

    user_topics = await db.get_user_topics(telegram_id)
    if not user_topics:
        guide_markup = InlineKeyboardMarkup([
            [InlineKeyboardButton("🎯 Choose Topics Now", callback_data=f"gototopics:{telegram_id}")]
        ])
        msg = "⚠️ *No Topics Selected*\n\nPlease select at least one topic before starting random practice."
        if update.message:
            await update.message.reply_text(msg, reply_markup=guide_markup, parse_mode="Markdown")
        elif update.callback_query and update.callback_query.message:
            await update.callback_query.message.reply_text(msg, reply_markup=guide_markup, parse_mode="Markdown")
        return

    question = await practice.get_next_practice_question(telegram_id, user_topics)
    if not question:
        if update.message:
            await update.message.reply_text("⚠️ No questions found for your selected topics.")
        elif update.callback_query and update.callback_query.message:
            await update.callback_query.message.reply_text("⚠️ No questions found for your selected topics.")
        return

    await present_practice_question(update, context, telegram_id, question)


async def present_practice_question(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    telegram_id: int,
    question: Dict[str, Any],
    revealed: bool = False,
    show_hint: bool = False,
    edit_existing: bool = False
) -> None:
    """Render question text and navigation controls."""
    q_id = question["id"]
    category = question["category"]
    difficulty = question["difficulty"]
    q_text = question["question"]

    diff_badge = {"Easy": "🟢 Easy", "Medium": "🟡 Medium", "Hard": "🔴 Hard"}.get(difficulty, difficulty)

    body_parts = [
        f"🎲 *Interview Practice* | {diff_badge}",
        f"📚 *Topic:* {category}",
        f"\n❓ *Question:*\n{q_text}\n"
    ]

    if show_hint:
        body_parts.append(f"💡 *Hint:* {question.get('hint', 'Think about core principles.')}\n")

    if revealed:
        body_parts.append(f"📖 *Model Answer:*\n{question['model_answer']}\n")
        concepts = ", ".join(question.get("expected_concepts", []))
        if concepts:
            body_parts.append(f"🔑 *Key Concepts:* {concepts}\n")

    msg_content = "\n".join(body_parts)

    # Track active question for answer evaluation
    context.user_data["active_question"] = {
        "question_id": q_id,
        "context_type": "practice"
    }

    # Control buttons
    controls = []
    if not revealed:
        btn_row = [
            InlineKeyboardButton("✍️ Submit Answer", callback_data=f"pqanswer:{telegram_id}:{q_id}")
        ]
        if not show_hint:
            btn_row.append(InlineKeyboardButton("💡 Hint", callback_data=f"pqhint:{telegram_id}:{q_id}"))
        btn_row.append(InlineKeyboardButton("📖 Show Answer", callback_data=f"pqans:{telegram_id}:{q_id}"))
        controls.append(btn_row)

    nav_row = [
        InlineKeyboardButton("➡️ Next Question", callback_data=f"pqnext:{telegram_id}"),
        InlineKeyboardButton("🎯 Change Topics", callback_data=f"gototopics:{telegram_id}")
    ]
    controls.append(nav_row)
    markup = InlineKeyboardMarkup(controls)

    if edit_existing and update.callback_query:
        await safe_edit_message(update.callback_query, msg_content, reply_markup=markup, parse_mode="Markdown")
    else:
        await safe_reply_message(update, msg_content, reply_markup=markup, parse_mode="Markdown")


async def practice_question_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle practice question button actions: hint, answer, next, change topics."""
    query = update.callback_query
    if not query:
        return
    await query.answer()

    data = query.data or ""
    parts = data.split(":")
    action = parts[0]
    expected_user_id = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else query.from_user.id

    # Ownership check
    if query.from_user.id != expected_user_id:
        await query.answer("⚠️ This practice session belongs to another user.", show_alert=True)
        return

    telegram_id = query.from_user.id
    qb: QuestionBank = context.bot_data["qb"]
    practice: PracticeService = context.bot_data["practice"]

    if action == "pqnext":
        await start_random_practice(update, context, telegram_id)

    elif action == "pqhint":
        q_id = parts[2]
        question = qb.get_by_id(q_id)
        if question:
            await present_practice_question(update, context, telegram_id, question, revealed=False, show_hint=True, edit_existing=True)

    elif action == "pqans":
        q_id = parts[2]
        question = qb.get_by_id(q_id)
        if question:
            await practice.record_revealed_answer(telegram_id, q_id)
            await present_practice_question(update, context, telegram_id, question, revealed=True, show_hint=False, edit_existing=True)

    elif action == "pqanswer":
        q_id = parts[2]
        question = qb.get_by_id(q_id)
        if question:
            context.user_data["active_question"] = {
                "question_id": q_id,
                "context_type": "practice"
            }
            await query.message.reply_text(
                f"✍️ *Ready for your answer:*\n"
                f"*{question['category']}* — _{question['question']}_\n\n"
                "💬 Send your answer by typing a message or recording a voice note.",
                parse_mode="Markdown"
            )

    elif action == "gototopics":
        await start_choose_topics_flow(update, context, telegram_id)


# ==================== Feature E: Teach Me A Topic ====================

async def start_teach_topic_flow(update: Update, context: ContextTypes.DEFAULT_TYPE, telegram_id: int) -> None:
    """Prompt user for a technical topic to teach."""
    db: Database = context.bot_data["db"]
    settings: Settings = context.bot_data["settings"]
    key = await get_effective_groq_key(db, settings, telegram_id)
    if not key:
        await update.message.reply_text(
            "⚠️ *Groq API Key Required*\n\n"
            "Teach Me a Topic uses your personal Groq key to generate interactive lessons.\n"
            "Please connect your key first using /setup_key.",
            parse_mode="Markdown"
        )
        return

    await db.update_onboarding_state(telegram_id, "AWAITING_TEACH_TOPIC")
    msg = (
        "💡 *Teach Me a Topic*\n\n"
        "What tech concept would you like to learn today?\n\n"
        "Examples:\n"
        "• _B+ Tree indexing in PostgreSQL_\n"
        "• _Kafka consumer group rebalancing_\n"
        "• _Java Garbage Collection generations_\n"
        "• _TCP 3-Way Handshake and TIME\\_WAIT_\n"
        "• _Distributed Rate Limiting with Redis_\n\n"
        "Type your topic name below:"
    )
    await safe_reply_message(update, msg, parse_mode="Markdown")


async def execute_teach_topic(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    telegram_id: int,
    topic_name: str
) -> None:
    """Generate and deliver lesson on the requested topic."""
    db: Database = context.bot_data["db"]
    settings: Settings = context.bot_data["settings"]

    raw_key = await get_effective_groq_key(db, settings, telegram_id)
    if not raw_key:
        await update.message.reply_text("⚠️ No Groq API key found. Use /setup_key to connect one.")
        return

    status_msg = await update.message.reply_text(f"📖 Preparing lesson on *{topic_name}* with Groq AI...", parse_mode="Markdown")

    try:
        lesson = generate_topic_lesson(raw_key, topic_name, model=settings.GROQ_MODEL)

        steps_text = "\n".join(f"{idx+1}. {step}" for idx, step in enumerate(lesson.get("step_by_step", [])))
        questions_text = "\n".join(f"• {q}" for q in lesson.get("practice_questions", []))

        full_lesson_markdown = (
            f"🎓 *Lesson: {lesson.get('topic', topic_name)}*\n\n"
            f"📌 *1. Definition:*\n{lesson.get('definition')}\n\n"
            f"🪜 *2. Step-by-Step Breakdown:*\n{steps_text}\n\n"
            f"💡 *3. Analogy & Practical Example:*\n{lesson.get('analogy_or_example')}\n\n"
            f"🗣️ *4. Interview-Ready Explanation:*\n_{lesson.get('interview_explanation')}_\n\n"
            f"🎯 *5. Practice Questions:*\n{questions_text}"
        )

        chunks = chunk_telegram_text(full_lesson_markdown)
        await safe_edit_message(status_msg, chunks[0], parse_mode="Markdown")

        for extra_chunk in chunks[1:]:
            await safe_reply_message(update.message, extra_chunk, parse_mode="Markdown")

        # Action buttons
        actions = [
            [InlineKeyboardButton("💡 Teach Another Topic", callback_data=f"teachagain:{telegram_id}")],
            [InlineKeyboardButton("🎲 Practice Random Questions", callback_data=f"pqnext:{telegram_id}")]
        ]
        await update.message.reply_text(
            "What would you like to do next?",
            reply_markup=InlineKeyboardMarkup(actions)
        )

        # Reset state back to COMPLETED
        await db.update_onboarding_state(telegram_id, "COMPLETED")

    except GroqServiceError as e:
        retry_markup = InlineKeyboardMarkup([
            [InlineKeyboardButton("🔄 Retry Topic", callback_data=f"teachagain:{telegram_id}")],
            [InlineKeyboardButton("🔑 Reconnect Key", callback_data=f"reconnect_key:{telegram_id}")]
        ])
        await status_msg.edit_text(
            f"❌ *Failed to generate lesson*: {str(e)}\n\nWould you like to retry?",
            reply_markup=retry_markup,
            parse_mode="Markdown"
        )
    except Exception as e:
        logger.error(f"Error in execute_teach_topic: {e}")
        await status_msg.edit_text("❌ An unexpected error occurred while preparing your lesson.")


# ==================== Phase 5 Flow Controllers & Submenus ====================

async def ask_coach_prompt(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Prompt student for free-form educational or placement queries."""
    prompt = (
        "💬 *Ask the Placement Coach*\n\n"
        "Ask me *anything* about tech interviews, coding concepts, or career prep!\n\n"
        "💡 *Examples you can ask*:\n"
        "• _Explain clustered vs non-clustered indexes in SQL_\n"
        "• _What are the latest fresher hiring rounds at IBM?_\n"
        "• _How does Java HashMap handle collisions?_\n"
        "• _What are the best resources to prepare for Operating Systems?_\n\n"
        "👇 *Type your question below:* "
    )
    if update.message:
        await update.message.reply_text(prompt, parse_mode="Markdown")
    elif update.callback_query and getattr(update.callback_query, "message", None):
        await update.callback_query.message.reply_text(prompt, parse_mode="Markdown")


async def ask_coach_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await ask_coach_prompt(update, context)


async def company_prep_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_user:
        await company_prep_start_flow(update, context, update.effective_user.id)


async def project_defence_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update.effective_user:
        await project_defence_start_flow(update, context, update.effective_user.id)


async def company_prep_start_flow(update: Update, context: ContextTypes.DEFAULT_TYPE, telegram_id: int) -> None:
    """Start company interview prep or review saved preparation pack."""
    db: Database = context.bot_data["db"]
    saved_profile = await db.get_company_prep_profile(telegram_id)

    if saved_profile and saved_profile.get("prep_pack"):
        comp = saved_profile["company_name"]
        role = saved_profile["target_role"]
        summary = (
            f"🏢 *Active Company Target:* **{comp}**\n"
            f"👤 *Role:* {role}\n"
            f"📅 *Interview Date:* {saved_profile.get('interview_date') or 'Within 7 days'}\n\n"
            "Would you like to review your preparation pack or research a new company?"
        )
        markup = InlineKeyboardMarkup([
            [InlineKeyboardButton(f"📖 View {comp} Prep Pack", callback_data=f"comppack:{telegram_id}")],
            [InlineKeyboardButton(f"🎙️ Start {comp} Mock", callback_data=f"mockmode:{telegram_id}:company")],
            [InlineKeyboardButton("🔄 Switch / New Company", callback_data=f"compnew:{telegram_id}")]
        ])
        if update.message:
            await update.message.reply_text(summary, reply_markup=markup, parse_mode="Markdown")
        elif update.callback_query and getattr(update.callback_query, "message", None):
            await update.callback_query.message.reply_text(summary, reply_markup=markup, parse_mode="Markdown")
        return

    await db.update_onboarding_state(telegram_id, "AWAITING_COMPANY_NAME")
    prompt = (
        "🏢 *Company Interview Preparation*\n\n"
        "Targeted interview preparation backed by verified web research and role requirements.\n\n"
        "Which company are you preparing for?\n"
        "_(e.g., IBM, TCS, Google, Infosys, Amazon)_"
    )
    if update.message:
        await update.message.reply_text(prompt, parse_mode="Markdown")
    elif update.callback_query and getattr(update.callback_query, "message", None):
        await update.callback_query.message.reply_text(prompt, parse_mode="Markdown")


async def generate_and_display_company_pack(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    telegram_id: int,
    company_name: str,
    target_role: str,
    interview_date: Optional[str] = None
) -> None:
    """Generate company prep pack via live research and display to student."""
    db: Database = context.bot_data["db"]
    settings: Settings = context.bot_data["settings"]
    comp_svc: CompanyPrepService = context.bot_data.get("company_prep")

    raw_key = await get_effective_groq_key(db, settings, telegram_id)
    if not raw_key:
        await send_key_setup_prompt(update, context, telegram_id)
        return

    status_msg = None
    if update.message:
        status_msg = await update.message.reply_text(
            f"🔍 *Researching {company_name} hiring process & interview rounds with live web intelligence...*",
            parse_mode="Markdown"
        )
    elif update.callback_query and getattr(update.callback_query, "message", None):
        status_msg = await update.callback_query.message.reply_text(
            f"🔍 *Researching {company_name} hiring process & interview rounds with live web intelligence...*",
            parse_mode="Markdown"
        )

    pack_data = await comp_svc.generate_prep_pack(
        groq_api_key=raw_key,
        telegram_id=telegram_id,
        company_name=company_name,
        target_role=target_role,
        experience_level="fresher",
        interview_date=interview_date
    )

    pack_text = pack_data.get("pack_text", "Company prep pack generated.")
    chunks = chunk_telegram_text(pack_text)

    markup = InlineKeyboardMarkup([
        [InlineKeyboardButton(f"🎙️ Start {company_name} Mock Interview", callback_data=f"mockmode:{telegram_id}:company")],
        [InlineKeyboardButton("🛡️ Defend a Relevant Project", callback_data=f"pdcustom:{telegram_id}")],
        [InlineKeyboardButton("🔄 New Company Search", callback_data=f"compnew:{telegram_id}")]
    ])

    await db.update_onboarding_state(telegram_id, "COMPLETED")

    if status_msg:
        await safe_edit_message(status_msg, chunks[0], reply_markup=markup if len(chunks) == 1 else None, parse_mode="Markdown")
        for idx, c in enumerate(chunks[1:]):
            is_last = (idx == len(chunks) - 2)
            await safe_reply_message(status_msg, c, reply_markup=markup if is_last else None, parse_mode="Markdown")
    elif update.message:
        for idx, c in enumerate(chunks):
            is_last = (idx == len(chunks) - 1)
            await safe_reply_message(update.message, c, reply_markup=markup if is_last else None, parse_mode="Markdown")


async def company_prep_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle company prep callbacks."""
    query = update.callback_query
    if not query:
        return
    await query.answer()

    data = query.data or ""
    parts = data.split(":")
    action = parts[0]
    expected_user_id = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else query.from_user.id

    if query.from_user.id != expected_user_id:
        await query.answer("⚠️ Session mismatch.", show_alert=True)
        return

    telegram_id = query.from_user.id
    db: Database = context.bot_data["db"]

    if action == "compnew":
        await db.update_onboarding_state(telegram_id, "AWAITING_COMPANY_NAME")
        await query.edit_message_text(
            "🏢 Which company are you preparing for?\n"
            "_(e.g. IBM, TCS, Google, Infosys, Amazon)_"
        )
    elif action == "comppack":
        saved = await db.get_company_prep_profile(telegram_id)
        if saved and saved.get("prep_pack"):
            pack_text = saved["prep_pack"].get("pack_text", "No pack found.")
            chunks = chunk_telegram_text(pack_text)
            comp_name = saved.get("company_name", "Target")
            markup = InlineKeyboardMarkup([
                [InlineKeyboardButton(f"🎙️ Start {comp_name} Mock", callback_data=f"mockmode:{telegram_id}:company")],
                [InlineKeyboardButton("🔄 New Company Search", callback_data=f"compnew:{telegram_id}")]
            ])
            await query.edit_message_text(chunks[0], reply_markup=markup if len(chunks) == 1 else None, parse_mode="Markdown")
            for idx, c in enumerate(chunks[1:]):
                is_last = (idx == len(chunks) - 2)
                await query.message.reply_text(c, reply_markup=markup if is_last else None, parse_mode="Markdown")


async def project_defence_start_flow(update: Update, context: ContextTypes.DEFAULT_TYPE, telegram_id: int) -> None:
    """Start Project Defence Mode by detecting projects or prompting user."""
    db: Database = context.bot_data["db"]
    pd_svc: ProjectDefenceService = context.bot_data.get("project_defence")

    # Check active session
    active_session = await db.get_active_project_defence_session(telegram_id)
    if active_session:
        pname = active_session["project_name"]
        curr = active_session["current_index"] + 1
        total = active_session["total_questions"]
        markup = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("▶️ Resume Defence", callback_data=f"pdresume:{telegram_id}:{active_session['id']}"),
                InlineKeyboardButton("❌ Cancel Defence", callback_data=f"pdcancel:{telegram_id}:{active_session['id']}")
            ]
        ])
        msg = (
            f"🛡️ *Active Project Defence Session*\n\n"
            f"Project: **{pname}**\n"
            f"Progress: Question {curr} of {total}\n\n"
            "Would you like to resume your defence round?"
        )
        if update.message:
            await update.message.reply_text(msg, reply_markup=markup, parse_mode="Markdown")
        elif update.callback_query and getattr(update.callback_query, "message", None):
            await update.callback_query.message.reply_text(msg, reply_markup=markup, parse_mode="Markdown")
        return

    # Check projects from resume
    projects = []
    if pd_svc:
        projects = await pd_svc.get_resume_projects(telegram_id)

    if projects:
        buttons = [
            [InlineKeyboardButton(f"📌 {p[:28]}", callback_data=f"pdsel:{telegram_id}:{idx}")]
            for idx, p in enumerate(projects[:4])
        ]
        buttons.append([InlineKeyboardButton("✏️ Other / Custom Project", callback_data=f"pdcustom:{telegram_id}")])
        markup = InlineKeyboardMarkup(buttons)
        text = (
            "🛡️ *Project Defence Mode*\n\n"
            "Test whether you can confidently defend your projects against real technical scrutiny!\n\n"
            "Select which project from your resume you want to defend:"
        )
        if update.message:
            await update.message.reply_text(text, reply_markup=markup, parse_mode="Markdown")
        elif update.callback_query and getattr(update.callback_query, "message", None):
            await update.callback_query.message.reply_text(text, reply_markup=markup, parse_mode="Markdown")
    else:
        await db.update_onboarding_state(telegram_id, "AWAITING_PROJECT_NAME")
        text = (
            "🛡️ *Project Defence Mode*\n\n"
            "Test whether you can confidently defend your projects in an interview!\n\n"
            "Please send the **name of your project** and a 1-2 line description:"
        )
        if update.message:
            await update.message.reply_text(text, parse_mode="Markdown")
        elif update.callback_query and getattr(update.callback_query, "message", None):
            await update.callback_query.message.reply_text(text, parse_mode="Markdown")


async def project_defence_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle project defence callbacks."""
    query = update.callback_query
    if not query:
        return
    await query.answer()

    data = query.data or ""
    parts = data.split(":")
    action = parts[0]
    expected_user_id = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else query.from_user.id

    if query.from_user.id != expected_user_id:
        await query.answer("⚠️ Session mismatch.", show_alert=True)
        return

    telegram_id = query.from_user.id
    db: Database = context.bot_data["db"]
    pd_svc: ProjectDefenceService = context.bot_data.get("project_defence")

    if action == "pdsel":
        proj_idx = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0
        projects = await pd_svc.get_resume_projects(telegram_id)
        chosen_project = projects[proj_idx] if proj_idx < len(projects) else "My Project"

        res = await pd_svc.start_session(telegram_id, chosen_project, f"Resume project: {chosen_project}")
        markup = InlineKeyboardMarkup([
            [InlineKeyboardButton("🛑 Exit Defence", callback_data=f"pdcancel:{telegram_id}:{res['session_id']}")]
        ])
        await query.edit_message_text(
            f"🛡️ *Project Defence Started!*\nProject: **{chosen_project}**\n\n"
            f"{res['question_text']}\n\n"
            "💬 _Reply by typing or sending a voice note below._",
            reply_markup=markup,
            parse_mode="Markdown"
        )

    elif action == "pdcustom":
        await db.update_onboarding_state(telegram_id, "AWAITING_PROJECT_NAME")
        await query.edit_message_text(
            "🛡️ *Project Defence Mode*\n\n"
            "Please send the **name of your project** and a 1-2 line description:"
        )

    elif action == "pdcancel":
        sess_id = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0
        await db.update_project_defence_session(sess_id, 0, "cancelled", [])
        await query.edit_message_text("❌ Project defence session cancelled.")

    elif action == "pdresume":
        sess_id = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0
        active_sess = await db.get_active_project_defence_session(telegram_id)
        if active_sess and active_sess["id"] == sess_id:
            curr_idx = active_sess.get("current_index", 0)
            hist = active_sess.get("history", [])
            last_q = hist[curr_idx]["q"] if curr_idx < len(hist) else "Please describe your project implementation."
            markup = InlineKeyboardMarkup([
                [InlineKeyboardButton("🛑 Exit Defence", callback_data=f"pdcancel:{telegram_id}:{sess_id}")]
            ])
            await query.edit_message_text(
                f"🛡️ *Resuming Project Defence ({active_sess['project_name']})*\n\n"
                f"{last_q}\n\n"
                "💬 _Reply by typing or sending a voice note below._",
                reply_markup=markup,
                parse_mode="Markdown"
            )


async def resume_and_topics_submenu(update: Update, context: ContextTypes.DEFAULT_TYPE, telegram_id: int) -> None:
    """Submenu for managing resume and preparation topics."""
    db: Database = context.bot_data["db"]
    user = await db.get_or_create_user(telegram_id)
    resume = await db.get_resume(telegram_id)
    selected_topics = await db.get_user_topics(telegram_id)

    role = user.get("target_role", "Not specified")
    has_res = "✅ Saved" if (resume and resume.get("extracted_text")) else "❌ Missing"
    topic_str = ", ".join([TOPIC_SHORT_NAMES.get(t, t) for t in selected_topics]) if selected_topics else "None selected"

    text = (
        "📄 *Resume & Preparation Topics*\n\n"
        f"🎯 *Target Role:* {role}\n"
        f"📄 *Resume Status:* {has_res}\n"
        f"📚 *Selected Topics:* {topic_str}\n\n"
        "What would you like to update?"
    )
    markup = InlineKeyboardMarkup([
        [InlineKeyboardButton("📄 Update Resume", callback_data=f"resupdate:{telegram_id}")],
        [InlineKeyboardButton("🧠 Re-analyze Resume", callback_data=f"resanalyze:{telegram_id}")],
        [InlineKeyboardButton("🎯 Choose Topics", callback_data=f"gototopics:{telegram_id}")]
    ])
    if update.message:
        await update.message.reply_text(text, reply_markup=markup, parse_mode="Markdown")
    elif update.callback_query and getattr(update.callback_query, "message", None):
        await update.callback_query.message.reply_text(text, reply_markup=markup, parse_mode="Markdown")


# ==================== Text Message & Menu Dispatcher ====================

async def text_message_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle text messages for menu options, interactive sessions, and free-form questions."""
    if not update.effective_user or not update.message or not update.message.text:
        return

    text = update.message.text.strip()
    telegram_id = update.effective_user.id
    db: Database = context.bot_data["db"]
    settings: Settings = context.bot_data["settings"]
    user = await db.get_or_create_user(telegram_id)
    state = user.get("onboarding_state")

    # 1. State: entering custom target role
    if state == "ENTERING_CUSTOM_ROLE":
        await db.update_onboarding_state(telegram_id, "COMPLETED", target_role=text)
        reply_markup = ReplyKeyboardMarkup(MAIN_MENU_KEYBOARD, resize_keyboard=True)
        await update.message.reply_text(
            f"✅ Target role updated to: *{text}*!\n\n🚀 *Setup Complete!*",
            reply_markup=reply_markup,
            parse_mode="Markdown"
        )
        return

    # 2. State: awaiting topic name for Teach Me a Topic
    if state == "AWAITING_TEACH_TOPIC":
        await execute_teach_topic(update, context, telegram_id, text)
        return

    # 3. State: awaiting company name
    if state == "AWAITING_COMPANY_NAME":
        context.user_data["company_name"] = text
        user_role = user.get("target_role")
        if user_role:
            await generate_and_display_company_pack(update, context, telegram_id, text, user_role)
        else:
            await db.update_onboarding_state(telegram_id, "AWAITING_COMPANY_ROLE")
            await update.message.reply_text(
                f"🏢 Company: *{text}*\n\n"
                "What is your target role? (e.g. Software Engineer, SDE Intern, Backend Developer):",
                parse_mode="Markdown"
            )
        return

    # 4. State: awaiting company role
    if state == "AWAITING_COMPANY_ROLE":
        company = context.user_data.get("company_name", "Target Company")
        await generate_and_display_company_pack(update, context, telegram_id, company, text)
        return

    # 5. State: awaiting project name / description for Project Defence
    if state == "AWAITING_PROJECT_NAME":
        await db.update_onboarding_state(telegram_id, "COMPLETED")
        pd_svc: ProjectDefenceService = context.bot_data.get("project_defence")
        if pd_svc:
            res = await pd_svc.start_session(telegram_id, text, text)
            markup = InlineKeyboardMarkup([
                [InlineKeyboardButton("🛑 Exit Defence", callback_data=f"pdcancel:{telegram_id}:{res['session_id']}")]
            ])
            await update.message.reply_text(
                f"🛡️ *Project Defence Round Started!*\nProject: **{text}**\n\n"
                f"{res['question_text']}\n\n"
                "💬 _Reply by typing or sending a voice note below._",
                reply_markup=markup,
                parse_mode="Markdown"
            )
        return

    # Main menu dispatches (supporting new and legacy labels)
    if text in ("📅 Daily Challenge", "📅 Daily Question"):
        await daily_question_menu_command(update, context)
    elif text == "💬 Ask the Coach":
        await ask_coach_prompt(update, context)
    elif text == "🏢 Company Interview Prep":
        await company_prep_start_flow(update, context, telegram_id)
    elif text == "🛡️ Project Defence":
        await project_defence_start_flow(update, context, telegram_id)
    elif text in ("📄 Resume & Topics", "📄 Add/Update Resume"):
        await resume_and_topics_submenu(update, context, telegram_id)
    elif text == "🎯 Choose Topics":
        await start_choose_topics_flow(update, context, telegram_id)
    elif text in ("🎲 Random Practice", "🎲 Random Topic Practice"):
        await start_random_practice(update, context, telegram_id)
    elif text == "💡 Teach Me a Topic":
        await start_teach_topic_flow(update, context, telegram_id)
    elif text in ("🎯 Mock Interview", "🎙️ Mock Interview"):
        await start_mock_interview_flow(update, context, telegram_id)
    elif text == "📊 My Progress":
        await show_progress_overview(update, context, telegram_id)
    elif text in ("⚙️ Settings & Notifications", "⚙️ Settings / Notifications"):
        await settings_menu_handler(update, context)
    else:
        # Check active Project Defence session
        active_pd = await db.get_active_project_defence_session(telegram_id)
        if active_pd:
            raw_key = await get_effective_groq_key(db, settings, telegram_id)
            if not raw_key:
                await send_key_setup_prompt(update, context, telegram_id)
                return
            status_msg = await update.message.reply_text("🤔 *Evaluating your defence answer...*", parse_mode="Markdown")
            pd_svc: ProjectDefenceService = context.bot_data.get("project_defence")
            result = await pd_svc.process_answer_and_next(raw_key, telegram_id, text)
            if result.get("status") == "in_progress":
                markup = InlineKeyboardMarkup([
                    [InlineKeyboardButton("🛑 Exit Defence", callback_data=f"pdcancel:{telegram_id}:{active_pd['id']}")]
                ])
                await safe_edit_message(
                    status_msg,
                    f"{result['question_text']}\n\n💬 _Reply with text or voice._",
                    reply_markup=markup,
                    parse_mode="Markdown"
                )
            else:
                chunks = chunk_telegram_text(result.get("report_text", "Defence round completed!"))
                await safe_edit_message(status_msg, chunks[0], parse_mode="Markdown")
                for c in chunks[1:]:
                    await safe_reply_message(update, c, parse_mode="Markdown")
            return

        # Check active Teach Topic lesson
        coaching_sess = await db.get_coaching_session(telegram_id)
        if coaching_sess and coaching_sess.get("mode") == "teach_topic":
            raw_key = await get_effective_groq_key(db, settings, telegram_id)
            if not raw_key:
                await send_key_setup_prompt(update, context, telegram_id)
                return
            status_msg = await update.message.reply_text("🧠 *Reviewing your answer...*", parse_mode="Markdown")
            coaching_svc: CoachingService = context.bot_data.get("coaching")
            feedback = await coaching_svc.advance_topic_lesson(raw_key, text, telegram_id)
            await safe_edit_message(status_msg, feedback, parse_mode="Markdown")
            return

        # Check active interview question
        qb: QuestionBank = context.bot_data["qb"]
        active_q = await resolve_active_question(telegram_id, context, db, qb)
        if active_q:
            await process_user_answer(
                update=update,
                context=context,
                telegram_id=telegram_id,
                answer_text=text,
                input_type="text",
                active_q=active_q
            )
            return

        # Check if text looks like a company interview mention
        # e.g., "I have an IBM interview next week", "interview at Microsoft", "Google interview"
        comp_name = None
        if "interview" in text.lower():
            # Check for "at/with/for/in <Company>"
            m1 = re.search(r'\b(?:at|with|for|in)\s+([A-Za-z0-9_-]+)', text, re.IGNORECASE)
            if m1 and m1.group(1).lower() not in ("the", "a", "an", "my", "this", "our", "that"):
                comp_name = m1.group(1).strip()
            else:
                # Check for "<Company> interview"
                m2 = re.search(r'\b([A-Za-z0-9_-]+)\s+(?:interview|placement|hiring|drive)\b', text, re.IGNORECASE)
                if m2 and m2.group(1).lower() not in ("the", "a", "an", "my", "this", "our", "mock", "technical", "hr", "campus", "upcoming"):
                    comp_name = m2.group(1).strip()

        if comp_name:
            fmt_comp = comp_name.upper() if len(comp_name) <= 4 and comp_name.isupper() else comp_name.title()
            user_role = user.get("target_role")
            if user_role:
                await generate_and_display_company_pack(update, context, telegram_id, fmt_comp, user_role)
            else:
                context.user_data["company_name"] = fmt_comp
                await db.save_company_prep_profile(
                    telegram_id=telegram_id,
                    company_name=fmt_comp,
                    target_role="",
                    experience_level="fresher"
                )
                await db.update_onboarding_state(telegram_id, "AWAITING_COMPANY_ROLE")
                await update.message.reply_text(
                    f"🏢 Preparing for *{fmt_comp}*!\n\n"
                    "What is your target role? (e.g. Software Engineer, SDE Intern, Backend Developer):",
                    parse_mode="Markdown"
                )
            return

        # Default fallback: Free-form Ask the Coach!
        raw_key = await get_effective_groq_key(db, settings, telegram_id)
        if not raw_key:
            await send_key_setup_prompt(update, context, telegram_id)
            return

        status_msg = await update.message.reply_text("💬 *Thinking with AI Coach...*", parse_mode="Markdown")
        coaching_svc: CoachingService = context.bot_data.get("coaching")
        if coaching_svc:
            ans = await coaching_svc.ask_the_coach(
                groq_api_key=raw_key,
                user_query=text,
                telegram_id=telegram_id,
                target_role=user.get("target_role")
            )
            chunks = chunk_telegram_text(ans)
            await safe_edit_message(status_msg, chunks[0], parse_mode="Markdown")
            for c in chunks[1:]:
                await safe_reply_message(update, c, parse_mode="Markdown")
        else:
            await safe_edit_message(status_msg, "Coach service temporarily unavailable.", parse_mode=None)



async def settings_menu_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Display comprehensive Settings & Notifications menu with Phase 3 schedule configuration."""
    if not update.effective_user:
        return
    telegram_id = update.effective_user.id
    db: Database = context.bot_data["db"]
    user = await db.get_or_create_user(telegram_id)
    creds = await db.get_credentials(telegram_id)
    masked_key = creds.get("key_masked", "Not connected") if creds else "Not connected"
    selected_topics = await db.get_user_topics(telegram_id)
    topics_str = ", ".join(TOPIC_SHORT_NAMES.get(t, t) for t in selected_topics) if selected_topics else "None"

    sched = await db.get_schedule_settings(telegram_id)
    if sched and sched.get("is_enabled"):
        sched_status = f"✅ Active ({sched['delivery_time']} {sched['timezone']})"
        rem_status = "Enabled" if sched.get("reminders_enabled") else "Disabled"
    else:
        sched_status = "⏸️ Inactive"
        rem_status = "Disabled"

    settings_text = (
        "⚙️ *Settings & Preferences*\n\n"
        f"🔑 *Groq Key:* `{masked_key}`\n"
        f"🎯 *Target Role:* {user.get('target_role', 'Not set')}\n"
        f"📚 *Active Topics:* {topics_str}\n"
        f"📅 *Daily Question:* {sched_status}\n"
        f"⏰ *Reminders:* {rem_status}\n\n"
        "Configure options using the buttons below:"
    )

    toggle_action = "pause" if (sched and sched.get("is_enabled")) else "enable"
    toggle_label = "⏸️ Pause Daily Delivery" if (sched and sched.get("is_enabled")) else "▶️ Enable Daily Delivery"

    keyboard = [
        [InlineKeyboardButton("⏰ Configure Schedule & Timezone", callback_data=f"schedcfg:{telegram_id}")],
        [InlineKeyboardButton(toggle_label, callback_data=f"schedtog:{telegram_id}:{toggle_action}")],
        [InlineKeyboardButton("🔔 Toggle Reminders", callback_data=f"remtog:{telegram_id}")],
        [InlineKeyboardButton("🔑 Connect/Update Groq Key", callback_data=f"reconnect_key:{telegram_id}")],
        [InlineKeyboardButton("🗑️ Delete Stored Key", callback_data=f"delkey:{telegram_id}")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    if update.message:
        await update.message.reply_text(settings_text, reply_markup=reply_markup, parse_mode="Markdown")
    elif update.callback_query and update.callback_query.message:
        await update.callback_query.message.reply_text(settings_text, reply_markup=reply_markup, parse_mode="Markdown")


async def daily_question_menu_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """View today's daily question or prompt to configure daily delivery."""
    if not update.effective_user:
        return
    telegram_id = update.effective_user.id
    db: Database = context.bot_data["db"]
    qb: QuestionBank = context.bot_data["qb"]

    latest = await db.get_latest_daily_delivery(telegram_id)
    if latest and latest.get("delivery_status") == "sent":
        question = qb.get_by_id(latest["question_id"])
        if question:
            context.user_data["active_question"] = {
                "question_id": question["id"],
                "context_type": "daily",
                "daily_delivery_id": latest["id"]
            }
            status_badge = "✅ Completed" if latest.get("is_completed") else "⏳ In Progress"
            date_str = latest.get("scheduled_local_date", "Today")
            body = (
                f"📅 *Today's Daily Challenge* ({date_str}) | {status_badge}\n\n"
                f"📚 *Topic:* {question['category']} | 🎯 *Difficulty:* {question['difficulty']}\n\n"
                f"❓ *Question:*\n{question['question']}"
            )
            markup = build_daily_message_keyboard(telegram_id, latest["id"], revealed=bool(latest.get("revealed_answer")))
            if update.message:
                await update.message.reply_text(body, reply_markup=markup, parse_mode="Markdown")
            elif update.callback_query and update.callback_query.message:
                await update.callback_query.message.reply_text(body, reply_markup=markup, parse_mode="Markdown")
            return

    # No delivery yet today
    sched = await db.get_schedule_settings(telegram_id)
    if sched and sched.get("is_enabled"):
        msg = f"⏳ Your daily question for today will arrive at *{sched['delivery_time']}* ({sched['timezone']})."
    else:
        msg = (
            "📅 *Daily Question Engine*\n\n"
            "You have not enabled automatic daily interview questions yet.\n"
            "Would you like to schedule your daily question?"
        )
    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("⏰ Configure Schedule", callback_data=f"schedcfg:{telegram_id}")]
    ])
    if update.message:
        await update.message.reply_text(msg, reply_markup=keyboard, parse_mode="Markdown")
    elif update.callback_query and update.callback_query.message:
        await update.callback_query.message.reply_text(msg, reply_markup=keyboard, parse_mode="Markdown")


async def daily_interaction_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle daily challenge interactions: show hint, reveal answer, mark completed."""
    query = update.callback_query
    if not query:
        return
    await query.answer()

    data = query.data or ""
    parts = data.split(":")
    action = parts[0]
    expected_user_id = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else query.from_user.id
    delivery_id = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0

    if query.from_user.id != expected_user_id:
        await query.answer("⚠️ This daily challenge belongs to another user.", show_alert=True)
        return

    db: Database = context.bot_data["db"]
    qb: QuestionBank = context.bot_data["qb"]
    delivery = await db.get_daily_delivery_by_id(delivery_id)
    if not delivery:
        await query.edit_message_text("⚠️ Daily challenge record not found.")
        return

    question = qb.get_by_id(delivery["question_id"])
    if not question:
        await query.edit_message_text("⚠️ Question not found in question bank.")
        return

    local_date = delivery["scheduled_local_date"]

    if action == "dqhint":
        hint_text = question.get("hint", "Think about core architectural trade-offs.")
        body = (
            f"📅 *Daily Interview Challenge* ({local_date})\n\n"
            f"📚 *Topic:* {question['category']} | 🎯 *Difficulty:* {question['difficulty']}\n\n"
            f"❓ *Question:*\n{question['question']}\n\n"
            f"💡 *Hint:*\n_{hint_text}_"
        )
        markup = build_daily_message_keyboard(query.from_user.id, delivery_id, revealed=bool(delivery.get("revealed_answer")))
        await query.edit_message_text(body, reply_markup=markup, parse_mode="Markdown")

    elif action == "dqans":
        await db.mark_daily_answer_revealed(delivery_id)
        body = (
            f"📅 *Daily Interview Challenge* ({local_date})\n\n"
            f"📚 *Topic:* {question['category']} | 🎯 *Difficulty:* {question['difficulty']}\n\n"
            f"❓ *Question:*\n{question['question']}\n\n"
            f"📖 *Model Answer:*\n{question['model_answer']}\n\n"
            f"🔑 *Expected Concepts:* {', '.join(question.get('expected_concepts', []))}"
        )
        markup = build_daily_message_keyboard(query.from_user.id, delivery_id, revealed=True)
        await query.edit_message_text(body, reply_markup=markup, parse_mode="Markdown")

    elif action == "dqdone":
        await db.mark_daily_completed(delivery_id)
        await query.edit_message_text(
            f"🎉 *Daily Challenge Completed!* ({local_date})\n\n"
            f"Great job practicing today's question on *{question['category']}*.\n"
            "Pending reminders have been cancelled. See you tomorrow!",
            parse_mode="Markdown"
        )

    elif action == "dqanswer":
        context.user_data["active_question"] = {
            "question_id": question["id"],
            "context_type": "daily",
            "daily_delivery_id": delivery_id
        }
        await query.message.reply_text(
            f"✍️ *Ready for your answer to today's challenge:*\n"
            f"*{question['category']}* — _{question['question']}_\n\n"
            "💬 Send your answer by typing a message or recording a voice note below.",
            parse_mode="Markdown"
        )


async def schedule_config_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle schedule configuration callbacks."""
    query = update.callback_query
    if not query:
        return
    await query.answer()

    data = query.data or ""
    parts = data.split(":")
    action = parts[0]
    expected_user_id = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else query.from_user.id

    if query.from_user.id != expected_user_id:
        await query.answer("⚠️ Session mismatch.", show_alert=True)
        return

    telegram_id = query.from_user.id
    db: Database = context.bot_data["db"]

    if action == "schedcfg":
        sched = await db.get_schedule_settings(telegram_id)
        cur_time = sched.get("delivery_time", "09:00") if sched else "09:00"
        cur_tz = sched.get("timezone", "Asia/Kolkata") if sched else "Asia/Kolkata"

        keyboard = [
            [
                InlineKeyboardButton("🌅 08:00", callback_data=f"settime:{telegram_id}:08:00"),
                InlineKeyboardButton("☀️ 09:00", callback_data=f"settime:{telegram_id}:09:00"),
                InlineKeyboardButton("🕛 12:00", callback_data=f"settime:{telegram_id}:12:00")
            ],
            [
                InlineKeyboardButton("🌆 18:00", callback_data=f"settime:{telegram_id}:18:00"),
                InlineKeyboardButton("🌙 20:00", callback_data=f"settime:{telegram_id}:20:00"),
                InlineKeyboardButton("🌙 21:00", callback_data=f"settime:{telegram_id}:21:00")
            ],
            [
                InlineKeyboardButton("🇮🇳 Asia/Kolkata", callback_data=f"settz:{telegram_id}:Asia/Kolkata"),
                InlineKeyboardButton("🌐 UTC", callback_data=f"settz:{telegram_id}:UTC")
            ],
            [
                InlineKeyboardButton("🇺🇸 New York (ET)", callback_data=f"settz:{telegram_id}:America/New_York"),
                InlineKeyboardButton("🇺🇸 San Francisco (PT)", callback_data=f"settz:{telegram_id}:America/Los_Angeles")
            ],
            [
                InlineKeyboardButton("🇬🇧 London (GMT)", callback_data=f"settz:{telegram_id}:Europe/London"),
                InlineKeyboardButton("🇸🇬 Singapore (SGT)", callback_data=f"settz:{telegram_id}:Asia/Singapore")
            ],
            [
                InlineKeyboardButton("✅ Confirm & Activate Schedule", callback_data=f"schedconfirm:{telegram_id}")
            ]
        ]
        text = (
            "⏰ *Configure Daily Question Schedule*\n\n"
            f"Current Delivery Time: *{cur_time}*\n"
            f"Current Timezone: *{cur_tz}*\n\n"
            "Select your preferred delivery time and timezone, then click *Confirm & Activate*:"
        )
        await query.edit_message_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown")

    elif action == "settime":
        chosen_time = parts[2]
        sched = await db.get_schedule_settings(telegram_id)
        tz = sched.get("timezone", "Asia/Kolkata") if sched else "Asia/Kolkata"
        rem = sched.get("reminders_enabled", 1) if sched else 1
        await db.save_schedule_settings(telegram_id, is_enabled=False, delivery_time=chosen_time, timezone_str=tz, reminders_enabled=bool(rem))
        # Re-render
        await query.answer(f"Delivery time set to {chosen_time}")
        query.data = f"schedcfg:{telegram_id}"
        await schedule_config_callback(update, context)

    elif action == "settz":
        chosen_tz = parts[2]
        sched = await db.get_schedule_settings(telegram_id)
        t = sched.get("delivery_time", "09:00") if sched else "09:00"
        rem = sched.get("reminders_enabled", 1) if sched else 1
        await db.save_schedule_settings(telegram_id, is_enabled=False, delivery_time=t, timezone_str=chosen_tz, reminders_enabled=bool(rem))
        await query.answer(f"Timezone set to {chosen_tz}")
        query.data = f"schedcfg:{telegram_id}"
        await schedule_config_callback(update, context)

    elif action == "schedconfirm":
        sched = await db.get_schedule_settings(telegram_id)
        t = sched.get("delivery_time", "09:00") if sched else "09:00"
        tz = sched.get("timezone", "Asia/Kolkata") if sched else "Asia/Kolkata"
        rem = sched.get("reminders_enabled", 1) if sched else 1
        await db.save_schedule_settings(telegram_id, is_enabled=True, delivery_time=t, timezone_str=tz, reminders_enabled=bool(rem))
        await query.edit_message_text(
            f"🎉 *Daily Schedule Activated!*\n\n"
            f"Your daily question will arrive at *{t}* ({tz}) each day.\n"
            "You can pause or modify this anytime from Settings.",
            parse_mode="Markdown"
        )

    elif action == "schedtog":
        target = parts[2]
        sched = await db.get_schedule_settings(telegram_id)
        t = sched.get("delivery_time", "09:00") if sched else "09:00"
        tz = sched.get("timezone", "Asia/Kolkata") if sched else "Asia/Kolkata"
        rem = sched.get("reminders_enabled", 1) if sched else 1

        is_en = (target == "enable")
        await db.save_schedule_settings(telegram_id, is_enabled=is_en, delivery_time=t, timezone_str=tz, reminders_enabled=bool(rem))
        status_msg = "▶️ Daily question delivery enabled!" if is_en else "⏸️ Daily question delivery paused."
        await query.edit_message_text(status_msg)

    elif action == "remtog":
        sched = await db.get_schedule_settings(telegram_id)
        if not sched:
            await query.answer("Please configure your schedule first.")
            return
        new_rem = 0 if sched.get("reminders_enabled") else 1
        await db.save_schedule_settings(
            telegram_id,
            is_enabled=bool(sched.get("is_enabled")),
            delivery_time=sched.get("delivery_time", "09:00"),
            timezone_str=sched.get("timezone", "Asia/Kolkata"),
            reminders_enabled=bool(new_rem)
        )
        res_str = "🔔 Reminders enabled (3 hours after delivery)." if new_rem else "🔕 Reminders disabled."
        await query.edit_message_text(res_str)

    elif action == "delkey":
        await db.delete_credentials(telegram_id)
        await query.edit_message_text("🗑️ Your Groq API key has been deleted from the database.")


# ==================== Utility Commands ====================

async def setup_key_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_user:
        return
    await send_key_setup_prompt(update, context, update.effective_user.id)


async def delete_key_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_user or not update.message:
        return
    telegram_id = update.effective_user.id
    db: Database = context.bot_data["db"]
    await db.delete_credentials(telegram_id)
    await update.message.reply_text("🗑️ Your Groq API key has been deleted from the database.")


async def delete_resume_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_user or not update.message:
        return
    telegram_id = update.effective_user.id
    db: Database = context.bot_data["db"]
    await db.delete_resume(telegram_id)
    await update.message.reply_text("🗑️ Your stored resume data and analysis have been deleted.")


async def teach_again_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if not query:
        return
    await query.answer()
    telegram_id = query.from_user.id
    await start_teach_topic_flow(update, context, telegram_id)


# ==================== Phase 4 Evaluation, Voice, Mock Interview & Progress ====================

_user_locks: Dict[int, asyncio.Lock] = {}


def get_user_lock(telegram_id: int) -> asyncio.Lock:
    if telegram_id not in _user_locks:
        _user_locks[telegram_id] = asyncio.Lock()
    return _user_locks[telegram_id]


def format_evaluation_feedback(result: EvaluationResult, question: Dict[str, Any], input_type: str = "text") -> str:
    """Format structured AI evaluation feedback for Telegram."""
    icon = "🎙️" if input_type == "voice" else "✍️"
    diff = question.get("difficulty", "Medium")
    diff_badge = {"Easy": "🟢 Easy", "Medium": "🟡 Medium", "Hard": "🔴 Hard"}.get(diff, diff)

    parts = [
        f"{icon} *Answer Evaluation* | {diff_badge}",
        f"📚 *Topic:* {result.topic}\n",
        "📊 *Scores:*",
        f"• *Overall Score:* {result.overall_score}/10",
        f"• Technical Correctness: {result.technical_score}/10",
        f"• Concept Completeness: {result.completeness_score}/10",
        f"• Communication & Clarity: {result.communication_score}/10\n",
        f"📝 *Summary:* {result.summary}\n",
        f"✅ *What Went Well:*\n{result.what_went_well}\n"
    ]

    if result.missed_concepts and result.missed_concepts.lower() != "none":
        parts.append(f"⚠️ *Missed Concepts & Edge Cases:*\n{result.missed_concepts}\n")
    if result.corrections and result.corrections.lower() != "none":
        parts.append(f"🔍 *Corrections:*\n{result.corrections}\n")
    if result.grammar_feedback and result.grammar_feedback.lower() != "none":
        parts.append(f"🗣️ *Communication & Grammar:*\n{result.grammar_feedback}\n")

    parts.append(f"📖 *Refined Interview-Ready Answer:*\n{result.model_answer_refined}\n")

    if result.follow_up_questions:
        fu_text = "\n".join(f"• {q}" for q in result.follow_up_questions)
        parts.append(f"❓ *Follow-up Questions to Consider:*\n{fu_text}\n")

    parts.append(f"💡 *Improvement Tip:* {result.improvement_tip}")
    return "\n".join(parts)


def format_mock_interview_report(report: Dict[str, Any]) -> str:
    """Format comprehensive mock interview report for Telegram."""
    mode_name = report.get("mode", "General").capitalize()
    parts = [
        "🏆 *Mock Interview Final Report*",
        f"🎯 *Mode:* {mode_name} | 📋 *Completed:* {report.get('answered_count', 0)} of {report.get('total_questions', 0)} questions",
        f"⭐ *Overall Coaching Score:* {report.get('overall_coaching_score', 0.0)} / 10\n",
        "📊 *Score Breakdown:*",
        f"• Technical Score: {report.get('technical_score', 0.0)} / 10",
        f"• Communication Score: {report.get('communication_score', 0.0)} / 10\n"
    ]

    if report.get("strongest_concepts"):
        parts.append("🌟 *Strongest Areas Demonstrated:*")
        for sc in report["strongest_concepts"]:
            parts.append(f"• {sc}")
        parts.append("")

    if report.get("knowledge_gaps"):
        parts.append("⚠️ *Key Knowledge Gaps to Review:*")
        for kg in report["knowledge_gaps"]:
            parts.append(f"• {kg}")
        parts.append("")

    if report.get("communication_tips"):
        parts.append("🗣️ *Communication Coaching:*")
        for ct in report["communication_tips"]:
            parts.append(f"• {ct}")
        parts.append("")

    if report.get("revision_plan"):
        parts.append("📝 *Recommended Revision Plan:*")
        for idx, rp in enumerate(report["revision_plan"], 1):
            parts.append(f"{idx}. {rp}")
        parts.append("")

    if report.get("per_question_feedback"):
        parts.append("📋 *Questions Summary:*")
        for q in report["per_question_feedback"]:
            parts.append(f"• Q{q['order']} ({q['topic']}): *{q['score']}/10* — {q['summary']}")

    return "\n".join(parts)


def format_progress_overview(stats: Dict[str, Any]) -> str:
    """Format user progress stats for Telegram."""
    total = stats.get("total_answered", 0)
    parts = [
        "📊 *Your Interview Preparation Progress*\n",
        f"🎯 *Questions Answered:* {total}",
        f"📅 *Daily Challenges Completed:* {stats.get('daily_answered', 0)}",
        f"🎙️ *Mock Interviews Completed:* {stats.get('mocks_completed', 0)}\n"
    ]
    if total == 0:
        parts.append("You haven't answered any questions yet. Start practicing with Daily Question, Random Practice, or Mock Interview!")
        return "\n".join(parts)

    recent_sample = stats.get("recent_sample_count", 0)
    avg_score = stats.get("recent_avg_score")
    if avg_score is not None:
        parts.append(f"📈 *Recent Average Score:* {avg_score} / 10 (based on last {recent_sample} answers)")

    if stats.get("avg_technical_score") is not None:
        parts.append(f"• Average Technical: {round(stats['avg_technical_score'], 1)} / 10")
    if stats.get("avg_completeness_score") is not None:
        parts.append(f"• Average Completeness: {round(stats['avg_completeness_score'], 1)} / 10")
    if stats.get("avg_communication_score") is not None:
        parts.append(f"• Average Communication: {round(stats['avg_communication_score'], 1)} / 10")

    parts.append("\n💡 *Consistency is key to mastering technical interviews!*")
    return "\n".join(parts)


async def resolve_active_question(
    telegram_id: int,
    context: ContextTypes.DEFAULT_TYPE,
    db: Database,
    qb: QuestionBank
) -> Optional[Dict[str, Any]]:
    """Determine the active question context for answer evaluation."""
    # 1. In-progress mock session
    active_mock = await db.get_active_mock_session(telegram_id)
    if active_mock:
        curr_idx = active_mock.get("current_index", 0)
        q_ids = active_mock.get("questions", [])
        if curr_idx < len(q_ids):
            q_id = q_ids[curr_idx]
            q_obj = qb.get_by_id(q_id)
            if q_obj:
                return {
                    "question_id": q_id,
                    "question_obj": q_obj,
                    "context_type": "mock",
                    "mock_session_id": active_mock["id"],
                    "session": active_mock
                }

    # 2. In-memory user_data active question
    user_active = context.user_data.get("active_question")
    if user_active and isinstance(user_active, dict):
        q_id = user_active.get("question_id")
        q_obj = qb.get_by_id(q_id) if q_id else None
        if q_obj:
            return {
                "question_id": q_id,
                "question_obj": q_obj,
                "context_type": user_active.get("context_type", "practice"),
                "daily_delivery_id": user_active.get("daily_delivery_id"),
                "mock_session_id": user_active.get("mock_session_id")
            }

    # 3. Today's uncompleted daily delivery
    latest = await db.get_latest_daily_delivery(telegram_id)
    if latest and latest.get("delivery_status") == "sent" and not latest.get("is_completed"):
        q_obj = qb.get_by_id(latest["question_id"])
        if q_obj:
            return {
                "question_id": latest["question_id"],
                "question_obj": q_obj,
                "context_type": "daily",
                "daily_delivery_id": latest["id"]
            }

    return None


async def send_no_active_question_prompt(update: Update, telegram_id: int) -> None:
    """Prompt user when no active question context exists."""
    markup = InlineKeyboardMarkup([
        [InlineKeyboardButton("📅 Today's Daily Question", callback_data=f"gotodaily:{telegram_id}")],
        [InlineKeyboardButton("🎲 Random Practice", callback_data=f"pqnext:{telegram_id}")],
        [InlineKeyboardButton("🎙️ Mock Interview", callback_data=f"mockmode:{telegram_id}:start")]
    ])
    msg = (
        "❓ *No Active Question Selected*\n\n"
        "To evaluate your answer, please select a question first:\n"
        "• Tap *Daily Question* for today's challenge\n"
        "• Tap *Random Practice* to practice by topic\n"
        "• Tap *Mock Interview* to start a full interview"
    )
    if update.message:
        await update.message.reply_text(msg, reply_markup=markup, parse_mode="Markdown")
    elif update.callback_query and update.callback_query.message:
        await update.callback_query.message.reply_text(msg, reply_markup=markup, parse_mode="Markdown")


async def process_user_answer(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    telegram_id: int,
    answer_text: str,
    input_type: str,
    active_q: Dict[str, Any],
    status_msg: Optional[Any] = None
) -> None:
    """
    Central answer evaluation pipeline for text and voice answers.
    Persists answer attempt before Groq call, handles errors without losing answer,
    advances mock sessions, and renders rich feedback.
    """
    settings: Settings = context.bot_data["settings"]
    db: Database = context.bot_data["db"]
    qb: QuestionBank = context.bot_data["qb"]

    lock = get_user_lock(telegram_id)
    if lock.locked():
        if update.message:
            await update.message.reply_text("⏳ Your previous answer is still being processed. Please wait.")
        return

    async with lock:
        api_key = await get_effective_groq_key(db, settings, telegram_id)
        if not api_key:
            if update.message:
                await update.message.reply_text("🔑 Please connect your Groq API key first.")
            return

        q_id = active_q["question_id"]
        q_obj = active_q["question_obj"]
        ctx_type = active_q["context_type"]
        daily_id = active_q.get("daily_delivery_id")
        mock_id = active_q.get("mock_session_id")

        # 1. Save answer attempt in SQLite before calling Groq
        eval_id = await db.save_answer_evaluation(
            telegram_id=telegram_id,
            question_id=q_id,
            context_type=ctx_type,
            input_type=input_type,
            answer_text=answer_text,
            daily_delivery_id=daily_id,
            mock_session_id=mock_id,
            transcription_status="success" if input_type == "voice" else None
        )

        if not status_msg and update.message:
            status_msg = await update.message.reply_text("🧠 *Evaluating your answer with AI coach...*", parse_mode="Markdown")

        # Context from resume if available
        resume_data = await db.get_resume(telegram_id)
        resume_ctx = None
        if resume_data:
            role = resume_data.get("target_role", "")
            skills = resume_data.get("target_skills", "")
            resume_ctx = f"Target Role: {role}, Skills: {skills}"

        try:
            eval_res: EvaluationResult = evaluate_answer(
                api_key=api_key,
                question=q_obj,
                answer_text=answer_text,
                is_voice=(input_type == "voice"),
                resume_context=resume_ctx,
                model=settings.GROQ_MODEL
            )
        except GroqServiceError as e:
            await db.update_answer_evaluation_result(eval_id=eval_id, status="failed")
            fail_keyboard = InlineKeyboardMarkup([
                [InlineKeyboardButton("🔄 Retry Evaluation", callback_data=f"retryeval:{telegram_id}:{eval_id}")]
            ])
            fail_text = (
                f"⚠️ *Evaluation Temporarily Unavailable*\n\n"
                f"Reason: {e}\n\n"
                "Your answer has been saved. Tap below to retry when ready without retyping."
            )
            if status_msg:
                await safe_edit_message(status_msg, fail_text, reply_markup=fail_keyboard, parse_mode="Markdown")
            elif update.message:
                await safe_reply_message(update.message, fail_text, reply_markup=fail_keyboard, parse_mode="Markdown")
            return

        # 2. Persist completed evaluation result
        fu_json = json.dumps(eval_res.follow_up_questions)
        await db.update_answer_evaluation_result(
            eval_id=eval_id,
            status="completed",
            technical_score=eval_res.technical_score,
            completeness_score=eval_res.completeness_score,
            communication_score=eval_res.communication_score,
            overall_score=eval_res.overall_score,
            summary=eval_res.summary,
            what_went_well=eval_res.what_went_well,
            missed_concepts=eval_res.missed_concepts,
            corrections=eval_res.corrections,
            grammar_feedback=eval_res.grammar_feedback,
            model_answer_refined=eval_res.model_answer_refined,
            follow_up_questions=fu_json,
            improvement_tip=eval_res.improvement_tip
        )

        # 3. Handle Mock Session
        if ctx_type == "mock" and mock_id:
            mock_session = await db.get_mock_session(mock_id)
            if mock_session:
                curr_idx = mock_session["current_index"]
                total_q = mock_session["total_questions"]
                next_idx = curr_idx + 1

                ack_text = f"✅ *Answer recorded for Question {curr_idx + 1} of {total_q}!*"
                if status_msg:
                    await safe_edit_message(status_msg, ack_text, parse_mode="Markdown")
                elif update.message:
                    await safe_reply_message(update.message, ack_text, parse_mode="Markdown")

                if next_idx < total_q:
                    await db.advance_mock_session(mock_id, next_idx)
                    mock_session["current_index"] = next_idx
                    await present_mock_question(update, context, telegram_id, mock_session)
                else:
                    await finish_mock_interview(update, context, telegram_id, mock_session)
                return

        # 4. Handle Single Question (Daily or Practice)
        formatted_feedback = format_evaluation_feedback(eval_res, q_obj, input_type=input_type)
        chunks = chunk_telegram_text(formatted_feedback)

        next_markup = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("➡️ Next Practice Question", callback_data=f"pqnext:{telegram_id}"),
                InlineKeyboardButton("📊 My Progress", callback_data=f"prog:{telegram_id}")
            ]
        ])

        for i, chunk in enumerate(chunks):
            reply_markup = next_markup if i == len(chunks) - 1 else None
            if i == 0 and status_msg:
                await safe_edit_message(status_msg, chunk, reply_markup=reply_markup, parse_mode="Markdown")
            elif update.message:
                await safe_reply_message(update.message, chunk, reply_markup=reply_markup, parse_mode="Markdown")


async def start_mock_interview_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_user:
        return
    await start_mock_interview_flow(update, context, update.effective_user.id)


async def start_mock_interview_flow(update: Update, context: ContextTypes.DEFAULT_TYPE, telegram_id: int) -> None:
    """Entry point for mock interview: check existing session or offer mode selection."""
    db: Database = context.bot_data["db"]
    active_mock = await db.get_active_mock_session(telegram_id)
    if active_mock:
        curr_idx = active_mock.get("current_index", 0)
        total = active_mock.get("total_questions", len(active_mock.get("questions", [])))
        resume_markup = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("▶️ Resume Interview", callback_data=f"mockresume:{telegram_id}:{active_mock['id']}"),
                InlineKeyboardButton("❌ Cancel Session", callback_data=f"mockcancel:{telegram_id}:{active_mock['id']}")
            ]
        ])
        msg = (
            f"⚠️ *You have an ongoing Mock Interview!*\n\n"
            f"Mode: *{active_mock['mode'].capitalize()}*\n"
            f"Progress: Question {curr_idx + 1} of {total}\n\n"
            "Would you like to resume where you left off or cancel it?"
        )
        if update.message:
            await update.message.reply_text(msg, reply_markup=resume_markup, parse_mode="Markdown")
        elif update.callback_query and update.callback_query.message:
            await update.callback_query.message.reply_text(msg, reply_markup=resume_markup, parse_mode="Markdown")
        return

    mode_markup = InlineKeyboardMarkup([
        [InlineKeyboardButton("🎯 Selected Topics", callback_data=f"mockmode:{telegram_id}:topics")],
        [InlineKeyboardButton("🏢 Company Focused", callback_data=f"mockmode:{telegram_id}:company")],
        [InlineKeyboardButton("📄 Resume & Stack Focused", callback_data=f"mockmode:{telegram_id}:resume")],
        [InlineKeyboardButton("🔀 Mixed Interview (Technical + HR)", callback_data=f"mockmode:{telegram_id}:mixed")]
    ])
    intro = (
        "🎙️ *Mock Interview Simulation*\n\n"
        "Experience a realistic multi-question interview simulation:\n"
        "• Questions are asked one at a time\n"
        "• Answer using typed text or Telegram voice notes\n"
        "• Receive a comprehensive coaching report and revision plan at the end\n\n"
        "Choose an interview mode to get started:"
    )
    if update.message:
        await update.message.reply_text(intro, reply_markup=mode_markup, parse_mode="Markdown")
    elif update.callback_query and update.callback_query.message:
        await update.callback_query.message.reply_text(intro, reply_markup=mode_markup, parse_mode="Markdown")


async def mock_interview_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle all mock interview callback interactions."""
    query = update.callback_query
    if not query:
        return
    await query.answer()

    data = query.data or ""
    parts = data.split(":")
    action = parts[0]
    expected_user_id = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else query.from_user.id

    if query.from_user.id != expected_user_id:
        await query.answer("⚠️ Session mismatch.", show_alert=True)
        return

    telegram_id = query.from_user.id
    db: Database = context.bot_data["db"]
    qb: QuestionBank = context.bot_data["qb"]

    if action == "mockmode":
        mode = parts[2]
        if mode == "start":
            await start_mock_interview_flow(update, context, telegram_id)
            return

        count_markup = InlineKeyboardMarkup([
            [InlineKeyboardButton("3 Questions (Express)", callback_data=f"mockcount:{telegram_id}:{mode}:3")],
            [InlineKeyboardButton("5 Questions (Standard)", callback_data=f"mockcount:{telegram_id}:{mode}:5")],
            [InlineKeyboardButton("7 Questions (Comprehensive)", callback_data=f"mockcount:{telegram_id}:{mode}:7")]
        ])
        await query.edit_message_text(
            f"🎯 Mode: *{mode.capitalize()}*\n\nSelect the number of questions for this session:",
            reply_markup=count_markup,
            parse_mode="Markdown"
        )

    elif action == "mockcount":
        mode = parts[2]
        count = int(parts[3]) if len(parts) > 3 and parts[3].isdigit() else 5

        user_topics = await db.get_user_topics(telegram_id)
        resume_data = await db.get_resume(telegram_id)
        resume_topics = None
        if resume_data and resume_data.get("target_topics"):
            raw_t = resume_data["target_topics"]
            resume_topics = [t.strip().lower() for t in raw_t.split(",") if t.strip()]

        question_ids = prepare_mock_interview_questions(
            qb=qb,
            mode=mode,
            count=count,
            user_topics=user_topics,
            resume_topics=resume_topics
        )

        session_id = await db.create_mock_session(telegram_id, mode, question_ids)
        session = await db.get_mock_session(session_id)
        if session:
            await query.edit_message_text(
                f"🚀 *Mock Interview Started!*\nMode: *{mode.capitalize()}* | Total: *{count} Questions*\n\n"
                "Get ready for your first question...",
                parse_mode="Markdown"
            )
            await present_mock_question(update, context, telegram_id, session)

    elif action == "mockend":
        session_id = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0
        confirm_markup = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("✅ Yes, End Interview", callback_data=f"mockendconfirm:{telegram_id}:{session_id}"),
                InlineKeyboardButton("❌ Continue Interview", callback_data=f"mockcontinue:{telegram_id}:{session_id}")
            ]
        ])
        await query.edit_message_text(
            "🛑 *End Interview Early?*\n\n"
            "Are you sure you want to conclude this interview? "
            "A final coaching report will be generated for your completed answers.",
            reply_markup=confirm_markup,
            parse_mode="Markdown"
        )

    elif action == "mockendconfirm":
        session_id = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0
        session = await db.get_mock_session(session_id)
        if session and session.get("status") == "in_progress":
            await finish_mock_interview(update, context, telegram_id, session)

    elif action == "mockcontinue":
        session_id = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0
        session = await db.get_mock_session(session_id)
        if session and session.get("status") == "in_progress":
            await present_mock_question(update, context, telegram_id, session)

    elif action == "mockresume":
        session_id = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0
        session = await db.get_mock_session(session_id)
        if session and session.get("status") == "in_progress":
            await present_mock_question(update, context, telegram_id, session)

    elif action == "mockcancel":
        session_id = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0
        await db.cancel_mock_session(session_id)
        context.user_data.pop("active_question", None)
        await query.edit_message_text("❌ Mock interview session cancelled.")


async def present_mock_question(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    telegram_id: int,
    session: Dict[str, Any]
) -> None:
    """Render the current mock interview question."""
    qb: QuestionBank = context.bot_data["qb"]
    curr_idx = session.get("current_index", 0)
    q_ids = session.get("questions", [])
    total = session.get("total_questions", len(q_ids))

    if curr_idx >= len(q_ids):
        await finish_mock_interview(update, context, telegram_id, session)
        return

    q_id = q_ids[curr_idx]
    q_obj = qb.get_by_id(q_id)
    if not q_obj:
        return

    context.user_data["active_question"] = {
        "question_id": q_id,
        "context_type": "mock",
        "mock_session_id": session["id"]
    }

    diff_badge = {"Easy": "🟢 Easy", "Medium": "🟡 Medium", "Hard": "🔴 Hard"}.get(q_obj.get("difficulty"), "")
    body = (
        f"🎙️ *Mock Interview* — Question {curr_idx + 1} of {total} | {diff_badge}\n"
        f"📚 *Topic:* {q_obj['category']}\n\n"
        f"❓ *Question:*\n{q_obj['question']}\n\n"
        "💬 _Reply by typing your answer or sending a voice note below._"
    )

    markup = InlineKeyboardMarkup([
        [InlineKeyboardButton("🛑 End Interview Early", callback_data=f"mockend:{telegram_id}:{session['id']}")]
    ])

    if update.message:
        await update.message.reply_text(body, reply_markup=markup, parse_mode="Markdown")
    elif update.callback_query and getattr(update.callback_query, "message", None):
        await update.callback_query.message.reply_text(body, reply_markup=markup, parse_mode="Markdown")


async def finish_mock_interview(
    update: Update,
    context: ContextTypes.DEFAULT_TYPE,
    telegram_id: int,
    session: Dict[str, Any]
) -> None:
    """Generate final comprehensive report and mark session completed."""
    db: Database = context.bot_data["db"]
    qb: QuestionBank = context.bot_data["qb"]

    evaluations = await db.get_evaluations_for_mock_session(session["id"])
    report = generate_mock_interview_report(session, evaluations, qb)
    overall_score = report.get("overall_coaching_score", 0.0)

    await db.complete_mock_session(session["id"], overall_score, json.dumps(report))
    context.user_data.pop("active_question", None)

    report_text = format_mock_interview_report(report)
    chunks = chunk_telegram_text(report_text)

    markup = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("📊 My Progress", callback_data=f"prog:{telegram_id}"),
            InlineKeyboardButton("🎲 Practice More", callback_data=f"pqnext:{telegram_id}")
        ]
    ])

    for i, chunk in enumerate(chunks):
        reply_markup = markup if i == len(chunks) - 1 else None
        if update.message:
            await update.message.reply_text(chunk, reply_markup=reply_markup, parse_mode="Markdown")
        elif update.callback_query and getattr(update.callback_query, "message", None):
            await update.callback_query.message.reply_text(chunk, reply_markup=reply_markup, parse_mode="Markdown")


async def progress_menu_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_user:
        return
    await show_progress_overview(update, context, update.effective_user.id)


async def show_progress_overview(update: Update, context: ContextTypes.DEFAULT_TYPE, telegram_id: int) -> None:
    db: Database = context.bot_data["db"]
    stats = await db.get_user_progress_stats(telegram_id)
    text = format_progress_overview(stats)
    markup = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("🎲 Random Practice", callback_data=f"pqnext:{telegram_id}"),
            InlineKeyboardButton("🎙️ Mock Interview", callback_data=f"mockmode:{telegram_id}:start")
        ],
        [
            InlineKeyboardButton("📈 Weekly Progress Report", callback_data=f"prog:weekly:{telegram_id}")
        ]
    ])
    if update.message:
        await update.message.reply_text(text, reply_markup=markup, parse_mode="Markdown")
    elif update.callback_query and update.callback_query.message:
        await update.callback_query.message.reply_text(text, reply_markup=markup, parse_mode="Markdown")


async def progress_menu_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if not query:
        return
    await query.answer()

    data = query.data or ""
    parts = data.split(":")
    action = parts[1] if len(parts) > 1 else ""
    telegram_id = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else query.from_user.id

    if action == "weekly":
        adaptive: AdaptiveLearningService = context.bot_data.get("adaptive")
        if adaptive:
            report_text = await adaptive.generate_weekly_report(telegram_id)
            chunks = chunk_telegram_text(report_text)
            await query.edit_message_text(chunks[0], parse_mode="Markdown")
            for c in chunks[1:]:
                await query.message.reply_text(c, parse_mode="Markdown")
            return

    await show_progress_overview(update, context, telegram_id)


async def goto_daily_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    if query:
        await query.answer()
    await daily_question_menu_command(update, context)


async def retry_evaluation_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle retry of failed answer evaluations without retyping."""
    query = update.callback_query
    if not query:
        return
    await query.answer()

    data = query.data or ""
    parts = data.split(":")
    expected_user_id = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else query.from_user.id
    eval_id = int(parts[2]) if len(parts) > 2 and parts[2].isdigit() else 0

    if query.from_user.id != expected_user_id:
        await query.answer("⚠️ This evaluation belongs to another user.", show_alert=True)
        return

    telegram_id = query.from_user.id
    db: Database = context.bot_data["db"]
    qb: QuestionBank = context.bot_data["qb"]
    settings: Settings = context.bot_data["settings"]

    eval_data = await db.get_answer_evaluation(eval_id)
    if not eval_data or eval_data["telegram_id"] != telegram_id:
        await query.edit_message_text("⚠️ Evaluation record not found or access denied.")
        return

    q_obj = qb.get_by_id(eval_data["question_id"])
    if not q_obj:
        await query.edit_message_text("⚠️ Question not found in question bank.")
        return

    if eval_data.get("evaluation_status") == "completed":
        eval_res = EvaluationResult(
            question_id=eval_data["question_id"],
            topic=q_obj.get("category", "General"),
            technical_score=eval_data["technical_score"],
            completeness_score=eval_data["completeness_score"],
            communication_score=eval_data["communication_score"],
            overall_score=eval_data["overall_score"],
            summary=eval_data["summary"] or "",
            what_went_well=eval_data["what_went_well"] or "",
            missed_concepts=eval_data["missed_concepts"] or "",
            corrections=eval_data["corrections"] or "",
            grammar_feedback=eval_data["grammar_feedback"] or "",
            model_answer_refined=eval_data["model_answer_refined"] or "",
            follow_up_questions=json.loads(eval_data.get("follow_up_questions") or "[]"),
            improvement_tip=eval_data["improvement_tip"] or ""
        )
        msg_text = format_evaluation_feedback(eval_res, q_obj, input_type=eval_data.get("input_type", "text"))
        await query.edit_message_text(msg_text, parse_mode="Markdown")
        return

    api_key = await get_effective_groq_key(db, settings, telegram_id)
    if not api_key:
        await query.edit_message_text("🔑 Groq API key missing. Please reconnect your key.")
        return

    await query.edit_message_text("🧠 *Retrying evaluation with AI coach...*", parse_mode="Markdown")

    try:
        eval_res = evaluate_answer(
            api_key=api_key,
            question=q_obj,
            answer_text=eval_data["answer_text"],
            is_voice=(eval_data.get("input_type") == "voice"),
            model=settings.GROQ_MODEL
        )
    except GroqServiceError as e:
        fail_keyboard = InlineKeyboardMarkup([
            [InlineKeyboardButton("🔄 Retry Again", callback_data=f"retryeval:{telegram_id}:{eval_id}")]
        ])
        await query.edit_message_text(
            f"⚠️ *Evaluation retry failed:* {e}\nPlease retry later.",
            reply_markup=fail_keyboard
        )
        return

    fu_json = json.dumps(eval_res.follow_up_questions)
    await db.update_answer_evaluation_result(
        eval_id=eval_id,
        status="completed",
        technical_score=eval_res.technical_score,
        completeness_score=eval_res.completeness_score,
        communication_score=eval_res.communication_score,
        overall_score=eval_res.overall_score,
        summary=eval_res.summary,
        what_went_well=eval_res.what_went_well,
        missed_concepts=eval_res.missed_concepts,
        corrections=eval_res.corrections,
        grammar_feedback=eval_res.grammar_feedback,
        model_answer_refined=eval_res.model_answer_refined,
        follow_up_questions=fu_json,
        improvement_tip=eval_res.improvement_tip
    )

    msg_text = format_evaluation_feedback(eval_res, q_obj, input_type=eval_data.get("input_type", "text"))
    await query.edit_message_text(msg_text, parse_mode="Markdown")


async def voice_message_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle native Telegram voice messages.
    Validates audio limits, downloads audio to a guaranteed temporary file,
    transcribes with Groq Whisper, and routes to answer evaluation.
    Never persists raw audio.
    """
    if not update.effective_user or not update.message or not update.message.voice:
        return

    telegram_id = update.effective_user.id
    voice = update.message.voice
    settings: Settings = context.bot_data["settings"]
    db: Database = context.bot_data["db"]
    qb: QuestionBank = context.bot_data["qb"]

    # 1. Validate file size
    if voice.file_size and voice.file_size > settings.MAX_VOICE_SIZE_BYTES:
        mb_size = round(voice.file_size / (1024 * 1024), 1)
        max_mb = settings.MAX_VOICE_SIZE_BYTES // (1024 * 1024)
        await update.message.reply_text(
            f"⚠️ *Voice note too large* ({mb_size} MB). Maximum allowed size is {max_mb} MB.\n"
            "Please record a shorter message or type your response.",
            parse_mode="Markdown"
        )
        return

    # 2. Validate duration
    if voice.duration < settings.MIN_VOICE_DURATION_SECONDS:
        await update.message.reply_text(
            f"⚠️ *Voice note too short* (under {settings.MIN_VOICE_DURATION_SECONDS} seconds).\n"
            "Please provide a complete answer or type your response.",
            parse_mode="Markdown"
        )
        return

    if voice.duration > settings.MAX_VOICE_DURATION_SECONDS:
        max_mins = settings.MAX_VOICE_DURATION_SECONDS // 60
        await update.message.reply_text(
            f"⚠️ *Voice note exceeds duration limit* (max {max_mins} minutes).\n"
            "Please provide a concise answer.",
            parse_mode="Markdown"
        )
        return

    # 3. Check user API key
    api_key = await get_effective_groq_key(db, settings, telegram_id)
    if not api_key:
        await update.message.reply_text("🔑 You must connect your Groq API key first before submitting answers.")
        await send_key_setup_prompt(update, context, telegram_id)
        return

    # 4. Resolve active question or active project defence
    active_q = await resolve_active_question(telegram_id, context, db, qb)
    active_pd = None
    if not active_q:
        active_pd = await db.get_active_project_defence_session(telegram_id)
        if not active_pd:
            await send_no_active_question_prompt(update, telegram_id)
            return

    # 5. Download voice securely to temporary file with guaranteed cleanup
    status_msg = await update.message.reply_text("🎙️ *Transcribing voice answer with Groq Whisper...*", parse_mode="Markdown")

    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as temp_file:
            temp_path = temp_file.name

        tg_file = await context.bot.get_file(voice.file_id)
        await tg_file.download_to_drive(temp_path)

        with open(temp_path, "rb") as f:
            audio_bytes = f.read()

    except Exception as e:
        logger.error(f"Error downloading voice note: {e}")
        await status_msg.edit_text("⚠️ Failed to download voice note from Telegram. Please try again or submit text.")
        return
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except Exception as e:
                logger.warning(f"Failed to delete temp audio file {temp_path}: {e}")

    # 6. Transcribe using Whisper
    try:
        transcript = transcribe_voice(
            api_key=api_key,
            audio_bytes=audio_bytes,
            filename="voice.ogg",
            model=settings.GROQ_WHISPER_MODEL
        )
    except GroqServiceError as e:
        await status_msg.edit_text(f"⚠️ *Voice transcription failed:* {e}\nPlease retry or reply with text.")
        return

    if not transcript or not transcript.strip():
        await status_msg.edit_text(
            "⚠️ *No speech detected* in your voice note. Please speak clearly and try again, or reply with a typed answer."
        )
        return

    snippet = transcript[:200] + ("..." if len(transcript) > 200 else "")
    await status_msg.edit_text(
        f"🎙️ *Transcribed:* \"_{snippet}_\"\n\nEvaluating your answer with AI coach...",
        parse_mode="Markdown"
    )

    # 7. Route to Project Defence or Answer Evaluation
    if active_pd:
        pd_svc: ProjectDefenceService = context.bot_data.get("project_defence")
        if pd_svc:
            res = await pd_svc.process_answer_and_next(api_key, telegram_id, transcript)
            if res.get("status") == "in_progress":
                markup = InlineKeyboardMarkup([
                    [InlineKeyboardButton("🛑 Exit Defence", callback_data=f"pdcancel:{telegram_id}:{active_pd['id']}")]
                ])
                await safe_edit_message(
                    status_msg,
                    f"{res['question_text']}\n\n💬 _Reply with text or voice._",
                    reply_markup=markup,
                    parse_mode="Markdown"
                )
            else:
                chunks = chunk_telegram_text(res.get("report_text", "Defence round completed!"))
                await safe_edit_message(status_msg, chunks[0], parse_mode="Markdown")
                for c in chunks[1:]:
                    await safe_reply_message(update.message, c, parse_mode="Markdown")
        return

    await process_user_answer(
        update=update,
        context=context,
        telegram_id=telegram_id,
        answer_text=transcript,
        input_type="voice",
        active_q=active_q,
        status_msg=status_msg
    )


async def link_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handle /link <code> command to connect Telegram bot with candidate's web profile.
    Single-use, expiring code generated securely on the web application.
    """
    if not update.effective_user or not update.message:
        return

    telegram_id = update.effective_user.id
    db: Database = context.bot_data["db"]

    args = context.args or []
    if not args or len(args[0].strip()) != 6:
        await update.message.reply_text(
            "🔗 *Link Web Account*\n\n"
            "To connect your web profile, obtain a 6-digit linking code from your Web Studio Settings, then reply:\n"
            "`/link 123456`",
            parse_mode="Markdown"
        )
        return

    code = args[0].strip()
    now_ts = time.time()
    clerk_id = await db.consume_telegram_link_code(code, telegram_id, now_ts)
    if not clerk_id:
        await update.message.reply_text(
            "❌ *Invalid or Expired Code*\n\n"
            "This link code has either expired (10-minute validity) or has already been used.\n"
            "Please generate a fresh code in your Web Settings.",
            parse_mode="Markdown"
        )
        return

    await update.message.reply_text(
        "✅ *Account Linked Successfully!*\n\n"
        "Your Telegram bot companion is now connected to your web interview studio.\n"
        "You will receive daily questions, spaced revisions, and concise progress alerts here.",
        parse_mode="Markdown"
    )


def register_handlers(app: Application, settings: Settings, db: Database, qb: QuestionBank) -> None:
    """Register all telegram bot handlers."""
    practice = PracticeService(qb, db)
    tavily_service = TavilyService(settings, db)
    coaching_service = CoachingService(db, settings, tavily_service)
    company_prep_service = CompanyPrepService(db, settings, tavily_service)
    project_defence_service = ProjectDefenceService(db, settings)
    adaptive_service = AdaptiveLearningService(db, qb)

    app.bot_data["settings"] = settings
    app.bot_data["db"] = db
    app.bot_data["qb"] = qb
    app.bot_data["practice"] = practice
    app.bot_data["tavily"] = tavily_service
    app.bot_data["coaching"] = coaching_service
    app.bot_data["company_prep"] = company_prep_service
    app.bot_data["project_defence"] = project_defence_service
    app.bot_data["adaptive"] = adaptive_service

    # Commands
    app.add_handler(CommandHandler("start", start_handler))
    app.add_handler(CommandHandler("link", link_command))
    app.add_handler(CommandHandler("daily", daily_question_menu_command))

    app.add_handler(CommandHandler("schedule", settings_menu_handler))
    app.add_handler(CommandHandler("setup_key", setup_key_command))
    app.add_handler(CommandHandler("delete_key", delete_key_command))
    app.add_handler(CommandHandler("delete_resume", delete_resume_command))
    app.add_handler(CommandHandler("mock", start_mock_interview_command))
    app.add_handler(CommandHandler("progress", progress_menu_command))
    app.add_handler(CommandHandler("coach", ask_coach_command))
    app.add_handler(CommandHandler("company", company_prep_command))
    app.add_handler(CommandHandler("defence", project_defence_command))

    # Onboarding & Key Callbacks
    app.add_handler(CallbackQueryHandler(check_key_callback, pattern=r"^check_key:"))
    app.add_handler(CallbackQueryHandler(confirm_role_callback, pattern=r"^confirm_role:"))
    app.add_handler(CallbackQueryHandler(change_role_callback, pattern=r"^change_role:"))
    app.add_handler(CallbackQueryHandler(setup_key_command, pattern=r"^reconnect_key:"))

    # Feature A: Resume Callbacks
    app.add_handler(CallbackQueryHandler(resume_action_callback, pattern=r"^res(analyze|update):"))

    # Feature C: Choose Topics Callbacks
    app.add_handler(CallbackQueryHandler(topic_selection_callback, pattern=r"^topic(tog|save|cancel):"))

    # Feature D: Practice Question Callbacks
    app.add_handler(CallbackQueryHandler(practice_question_callback, pattern=r"^(pqnext|pqhint|pqans|pqanswer|gototopics):"))

    # Feature E: Teach Me A Topic Callbacks
    app.add_handler(CallbackQueryHandler(teach_again_callback, pattern=r"^teachagain:"))

    # Feature F & G: Phase 3 Daily Question & Schedule Configuration Callbacks
    app.add_handler(CallbackQueryHandler(daily_interaction_callback, pattern=r"^dq(hint|ans|done|answer):"))
    app.add_handler(CallbackQueryHandler(schedule_config_callback, pattern=r"^(schedcfg|settime|settz|schedconfirm|schedtog|remtog|delkey):"))

    # Phase 4 Mock Interview & Progress Callbacks
    app.add_handler(CallbackQueryHandler(mock_interview_callback, pattern=r"^mock(mode|count|end|endconfirm|continue|resume|cancel):"))
    app.add_handler(CallbackQueryHandler(progress_menu_callback, pattern=r"^prog:"))
    app.add_handler(CallbackQueryHandler(goto_daily_callback, pattern=r"^gotodaily:"))
    app.add_handler(CallbackQueryHandler(retry_evaluation_callback, pattern=r"^retryeval:"))

    # Phase 5 Project Defence & Company Prep Callbacks
    app.add_handler(CallbackQueryHandler(project_defence_callback, pattern=r"^pd(sel|custom|resume|cancel):"))
    app.add_handler(CallbackQueryHandler(company_prep_callback, pattern=r"^comp(pack|new):"))

    # Messages
    app.add_handler(MessageHandler(filters.Document.ALL, resume_document_handler))
    app.add_handler(MessageHandler(filters.VOICE, voice_message_handler))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, text_message_handler))

    # Error handling
    app.add_error_handler(global_error_handler)


async def global_error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Global error handler to catch and log unhandled exceptions gracefully."""
    logger.error("Exception while handling Telegram update:", exc_info=context.error)


