"""
Phase 3 Daily Delivery Scheduler Engine.

Runs as a single supervised background asyncio loop inside the main application.
- Checks SQLite periodically for due daily deliveries and reminders.
- Idempotently creates day's delivery records with database constraints.
- Delivers via Telegram Bot.
- Tracks bounded retries with exponential backoff for temporary errors.
- Respects Telegram RetryAfter and stops permanently on blocked bot.
- Recovers stale jobs gracefully on application startup.
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from telegram import Bot, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.error import Forbidden, RetryAfter, TelegramError
from app.database import Database
from app.question_bank import QuestionBank
from app.services.daily_selector import DailyQuestionSelector
from app.services.schedule_utils import (
    validate_timezone,
    validate_delivery_time,
    get_current_local_date_and_time,
    compute_scheduled_utc,
    compute_reminder_due_utc
)

logger = logging.getLogger(__name__)

REMINDER_DELAY_HOURS = 3
MAX_DELIVERY_ATTEMPTS = 5
POLL_INTERVAL_SECONDS = 30


def build_daily_message_keyboard(telegram_id: int, delivery_id: int, revealed: bool = False) -> InlineKeyboardMarkup:
    """Build buttons for daily challenge: Submit Answer, Hint, Answer, Complete."""
    rows = []
    if not revealed:
        rows.append([
            InlineKeyboardButton("✍️ Submit Answer", callback_data=f"dqanswer:{telegram_id}:{delivery_id}"),
            InlineKeyboardButton("💡 Show Hint", callback_data=f"dqhint:{telegram_id}:{delivery_id}")
        ])
        rows.append([
            InlineKeyboardButton("📖 Reveal Model Answer", callback_data=f"dqans:{telegram_id}:{delivery_id}"),
            InlineKeyboardButton("✅ Mark Completed", callback_data=f"dqdone:{telegram_id}:{delivery_id}")
        ])
    else:
        rows.append([
            InlineKeyboardButton("✅ Mark Completed", callback_data=f"dqdone:{telegram_id}:{delivery_id}")
        ])
    return InlineKeyboardMarkup(rows)


class DailySchedulerEngine:
    def __init__(self, db: Database, qb: QuestionBank, bot: Optional[Bot] = None):
        self.db = db
        self.qb = qb
        self.bot = bot
        self.selector = DailyQuestionSelector(qb, db)
        self._running = False
        self._task: Optional[asyncio.Task] = None

    def start(self, bot: Bot) -> None:
        """Start the single scheduler background task."""
        if self._running:
            logger.warning("DailySchedulerEngine is already running.")
            return
        self.bot = bot
        self._running = True
        self._task = asyncio.create_task(self._scheduler_loop(), name="daily_scheduler_loop")
        logger.info("DailySchedulerEngine started successfully.")

    async def stop(self) -> None:
        """Gracefully stop the background task."""
        if not self._running:
            return
        logger.info("Stopping DailySchedulerEngine...")
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("DailySchedulerEngine stopped.")

    async def _scheduler_loop(self) -> None:
        """Background loop executing check ticks."""
        while self._running:
            try:
                await self.tick()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in scheduler tick: {e}", exc_info=True)

            try:
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
            except asyncio.CancelledError:
                break

    async def tick(self, ref_now_utc: Optional[datetime] = None) -> None:
        """Perform a single scheduler evaluation pass."""
        now_utc = ref_now_utc or datetime.now(timezone.utc)
        now_iso = now_utc.isoformat()

        # 1. Evaluate all active user schedules and enqueue due daily questions
        await self._enqueue_due_dailies(now_utc)

        # 2. Process pending & due-for-retry daily deliveries
        await self._process_pending_deliveries(now_utc)

        # 3. Process due reminders
        await self._process_due_reminders(now_utc)

    async def _enqueue_due_dailies(self, now_utc: datetime) -> None:
        """Check active schedules and create day's record if local delivery time has arrived."""
        schedules = await self.db.get_all_active_schedules()

        for sched in schedules:
            user_id = sched["telegram_id"]
            tz_str = sched["timezone"]
            deliv_time = sched["delivery_time"]

            if not validate_timezone(tz_str) or not validate_delivery_time(deliv_time):
                continue

            local_date, local_time = get_current_local_date_and_time(tz_str, now_utc)

            # Check if delivery time has been reached for today
            if local_time < deliv_time:
                continue

            # Check if delivery record already exists for today's local date
            existing = await self.db.get_daily_delivery(user_id, local_date)
            if existing:
                continue

            # Select question and create delivery record idempotently
            question = await self.selector.select_daily_question(user_id)
            if not question:
                logger.warning(f"No eligible question found for user {user_id}")
                continue

            scheduled_utc_dt = compute_scheduled_utc(local_date, deliv_time, tz_str)
            scheduled_utc_iso = scheduled_utc_dt.isoformat()

            await self.db.create_daily_delivery(
                telegram_id=user_id,
                local_date=local_date,
                timezone_str=tz_str,
                scheduled_utc=scheduled_utc_iso,
                question_id=question["id"]
            )

    async def _process_pending_deliveries(self, now_utc: datetime) -> None:
        """Send due pending or retrying deliveries via Telegram."""
        if not self.bot:
            return

        due_deliveries = await self.db.get_due_daily_deliveries(now_utc.isoformat())

        for record in due_deliveries:
            delivery_id = record["id"]
            user_id = record["telegram_id"]
            q_id = record["question_id"]
            local_date = record["scheduled_local_date"]
            tz_str = record["timezone_snapshot"]

            question = self.qb.get_by_id(q_id)
            if not question:
                logger.error(f"Question ID {q_id} not found in question bank for delivery {delivery_id}")
                await self.db.update_daily_delivery_status(delivery_id, "failed_permanent", error_category="question_not_found")
                continue

            msg_text = (
                f"📅 *Your Daily Interview Challenge* ({local_date})\n\n"
                f"📚 *Topic:* {question['category']} | 🎯 *Difficulty:* {question['difficulty']}\n\n"
                f"❓ *Question:*\n{question['question']}"
            )
            markup = build_daily_message_keyboard(user_id, delivery_id)

            try:
                sent_msg = await self.bot.send_message(
                    chat_id=user_id,
                    text=msg_text,
                    reply_markup=markup,
                    parse_mode="Markdown"
                )

                # Compute reminder due time (+3 hours on same calendar day)
                reminder_due_dt = compute_reminder_due_utc(now_utc, REMINDER_DELAY_HOURS, tz_str)
                reminder_due_iso = reminder_due_dt.isoformat() if reminder_due_dt else None

                await self.db.update_daily_delivery_status(
                    delivery_id=delivery_id,
                    status="sent",
                    telegram_message_id=sent_msg.message_id,
                    reminder_due_at=reminder_due_iso
                )
                logger.info(f"Delivered daily question {q_id} to user {user_id}")

            except Forbidden:
                # User blocked the bot or chat deleted; stop retrying
                logger.warning(f"User {user_id} has blocked bot. Marking delivery as failed_permanent.")
                await self.db.update_daily_delivery_status(delivery_id, "failed_permanent", error_category="bot_blocked")
                # Pause user schedule
                await self.db.save_schedule_settings(user_id, is_enabled=False, delivery_time=record.get("delivery_time", "09:00"), timezone_str=tz_str)

            except RetryAfter as e:
                retry_delay = getattr(e, "retry_after", 30)
                next_retry = now_utc + timedelta(seconds=retry_delay)
                logger.warning(f"Flood control for user {user_id}. Backing off {retry_delay}s.")
                await self.db.update_daily_delivery_status(delivery_id, "retrying", next_retry_at=next_retry.isoformat(), error_category="flood_control")

            except TelegramError as e:
                attempt = record.get("attempt_count", 0) + 1
                if attempt >= MAX_DELIVERY_ATTEMPTS:
                    logger.error(f"Max attempts reached for daily delivery {delivery_id}: {e}")
                    await self.db.update_daily_delivery_status(delivery_id, "failed_terminal", error_category="max_attempts")
                else:
                    backoff_secs = 60 * (2 ** (attempt - 1))
                    next_retry = now_utc + timedelta(seconds=backoff_secs)
                    await self.db.update_daily_delivery_status(delivery_id, "retrying", next_retry_at=next_retry.isoformat(), error_category="network_error")

            except Exception as e:
                logger.error(f"Unexpected error delivering daily question {delivery_id}: {e}")
                await self.db.update_daily_delivery_status(delivery_id, "retrying", next_retry_at=(now_utc + timedelta(minutes=5)).isoformat(), error_category="unexpected_error")

    async def _process_due_reminders(self, now_utc: datetime) -> None:
        """Send due reminders for uncompleted daily questions."""
        if not self.bot:
            return

        due_reminders = await self.db.get_due_reminders(now_utc.isoformat())

        for record in due_reminders:
            delivery_id = record["id"]
            user_id = record["telegram_id"]
            q_id = record["question_id"]
            local_date = record["scheduled_local_date"]

            question = self.qb.get_by_id(q_id)
            if not question:
                await self.db.update_reminder_status(delivery_id, "skipped_missing_q")
                continue

            reminder_text = (
                f"⏰ *Daily Challenge Reminder* ({local_date})\n\n"
                f"Don't forget today's question on *{question['category']}*!\n\n"
                f"❓ *Question:* {question['question'][:120]}...\n\n"
                "Take a moment to solve it before your day ends!"
            )
            markup = build_daily_message_keyboard(user_id, delivery_id)

            try:
                await self.bot.send_message(
                    chat_id=user_id,
                    text=reminder_text,
                    reply_markup=markup,
                    parse_mode="Markdown"
                )
                await self.db.update_reminder_status(delivery_id, "sent", reminder_sent=True)
                logger.info(f"Sent reminder for daily delivery {delivery_id} to user {user_id}")

            except Forbidden:
                await self.db.update_reminder_status(delivery_id, "failed_permanent")
            except TelegramError as e:
                logger.error(f"Telegram error sending reminder for delivery {delivery_id}: {e}")
                await self.db.update_reminder_status(delivery_id, "failed_temporary")
            except Exception as e:
                logger.error(f"Unexpected error sending reminder {delivery_id}: {e}")
                await self.db.update_reminder_status(delivery_id, "failed_temporary")
