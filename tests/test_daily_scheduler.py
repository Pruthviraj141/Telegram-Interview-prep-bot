import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock
from app.database import Database
from app.question_bank import QuestionBank
from app.services.schedule_utils import (
    validate_timezone,
    validate_delivery_time,
    compute_scheduled_utc,
    compute_reminder_due_utc,
    get_current_local_date_and_time
)
from app.services.daily_selector import DailyQuestionSelector
from app.services.daily_scheduler import DailySchedulerEngine


def test_timezone_validation():
    assert validate_timezone("Asia/Kolkata") is True
    assert validate_timezone("UTC") is True
    assert validate_timezone("America/New_York") is True
    assert validate_timezone("Invalid/Nowhere") is False
    assert validate_timezone("") is False


def test_delivery_time_validation():
    assert validate_delivery_time("09:00") is True
    assert validate_delivery_time("23:59") is True
    assert validate_delivery_time("00:00") is True
    assert validate_delivery_time("24:00") is False
    assert validate_delivery_time("9:00") is False
    assert validate_delivery_time("invalid") is False


def test_compute_scheduled_utc():
    # 09:00 Asia/Kolkata is UTC 03:30
    utc_dt = compute_scheduled_utc("2026-10-22", "09:00", "Asia/Kolkata")
    assert utc_dt.hour == 3
    assert utc_dt.minute == 30
    assert utc_dt.year == 2026
    assert utc_dt.month == 10
    assert utc_dt.day == 22


def test_compute_reminder_due_utc_same_day():
    # At 09:00 Asia/Kolkata (UTC 03:30), +3h is 12:00 Asia/Kolkata (same date 2026-10-22)
    sent_utc = datetime(2026, 10, 22, 3, 30, tzinfo=timezone.utc)
    reminder_utc = compute_reminder_due_utc(sent_utc, delay_hours=3, timezone_str="Asia/Kolkata")
    assert reminder_utc is not None
    assert reminder_utc.hour == 6
    assert reminder_utc.minute == 30

    # If sent at 22:00 local time, +3h goes into next calendar day, so reminder is suppressed (returns None)
    late_utc = datetime(2026, 10, 22, 16, 30, tzinfo=timezone.utc) # 22:00 IST
    late_reminder = compute_reminder_due_utc(late_utc, delay_hours=3, timezone_str="Asia/Kolkata")
    assert late_reminder is None


@pytest.mark.asyncio
async def test_single_daily_delivery_constraint_per_user_per_date(tmp_path):
    db_path = str(tmp_path / "test_daily.db")
    db = Database(db_path)
    await db.init_db()

    user_id = 999888
    await db.get_or_create_user(user_id)
    await db.save_schedule_settings(user_id, is_enabled=True, delivery_time="09:00", timezone_str="Asia/Kolkata")

    # First creation succeeds
    res1 = await db.create_daily_delivery(
        telegram_id=user_id,
        local_date="2026-10-22",
        timezone_str="Asia/Kolkata",
        scheduled_utc="2026-10-22T03:30:00+00:00",
        question_id="sys_design_rate_limiter"
    )
    assert res1 is not None

    # Duplicate creation for same user and same local date returns None
    res2 = await db.create_daily_delivery(
        telegram_id=user_id,
        local_date="2026-10-22",
        timezone_str="Asia/Kolkata",
        scheduled_utc="2026-10-22T03:30:00+00:00",
        question_id="sys_design_cache"
    )
    assert res2 is None


@pytest.mark.asyncio
async def test_daily_selector_cycling_and_weights(tmp_path):
    db_path = str(tmp_path / "test_selector.db")
    db = Database(db_path)
    await db.init_db()

    qb = QuestionBank("data/question_bank.json")
    qb.load_and_validate()

    user_id = 555111
    await db.get_or_create_user(user_id)
    await db.set_user_topics(user_id, ["System Design", "Databases"])

    selector = DailyQuestionSelector(qb, db)

    # Pick first daily question
    q1 = await selector.select_daily_question(user_id)
    assert q1 is not None
    assert "id" in q1

    # Record delivery
    await db.create_daily_delivery(
        telegram_id=user_id,
        local_date="2026-10-21",
        timezone_str="UTC",
        scheduled_utc="2026-10-21T09:00:00+00:00",
        question_id=q1["id"]
    )

    # Next daily question should not be q1
    q2 = await selector.select_daily_question(user_id)
    assert q2 is not None
    assert q2["id"] != q1["id"]


@pytest.mark.asyncio
async def test_scheduler_tick_lifecycle_and_retries(tmp_path):
    db_path = str(tmp_path / "test_sched_tick.db")
    db = Database(db_path)
    await db.init_db()

    qb = QuestionBank("data/question_bank.json")
    qb.load_and_validate()

    mock_bot = MagicMock()
    mock_bot.send_message = AsyncMock(return_value=MagicMock(message_id=4321))

    engine = DailySchedulerEngine(db=db, qb=qb, bot=mock_bot)

    user_id = 777222
    await db.get_or_create_user(user_id)
    await db.update_onboarding_state(user_id, "COMPLETED")
    # Delivery time 09:00 UTC
    await db.save_schedule_settings(user_id, is_enabled=True, delivery_time="09:00", timezone_str="UTC")

    # Tick at 08:30 UTC -> Not yet due
    t1 = datetime(2026, 10, 22, 8, 30, tzinfo=timezone.utc)
    await engine.tick(ref_now_utc=t1)
    assert mock_bot.send_message.call_count == 0

    # Tick at 09:05 UTC -> Due! Should create delivery and send via Telegram
    t2 = datetime(2026, 10, 22, 9, 5, tzinfo=timezone.utc)
    await engine.tick(ref_now_utc=t2)
    assert mock_bot.send_message.call_count == 1

    delivery = await db.get_daily_delivery(user_id, "2026-10-22")
    assert delivery is not None
    assert delivery["delivery_status"] == "sent"
    assert delivery["telegram_message_id"] == 4321
    assert delivery["reminder_due_at"] is not None

    # Marking complete cancels reminder
    await db.mark_daily_completed(delivery["id"])
    completed_rec = await db.get_daily_delivery_by_id(delivery["id"])
    assert completed_rec["is_completed"] == 1
    assert completed_rec["reminder_status"] == "skipped_completed"


@pytest.mark.asyncio
async def test_scheduler_handles_bot_blocked_and_pauses_schedule(tmp_path):
    from telegram.error import Forbidden
    db_path = str(tmp_path / "test_blocked.db")
    db = Database(db_path)
    await db.init_db()

    qb = QuestionBank("data/question_bank.json")
    qb.load_and_validate()

    mock_bot = MagicMock()
    mock_bot.send_message = AsyncMock(side_effect=Forbidden("Bot was blocked by the user"))

    engine = DailySchedulerEngine(db=db, qb=qb, bot=mock_bot)

    user_id = 888333
    await db.get_or_create_user(user_id)
    await db.update_onboarding_state(user_id, "COMPLETED")
    await db.save_schedule_settings(user_id, is_enabled=True, delivery_time="09:00", timezone_str="UTC")

    t_due = datetime(2026, 10, 22, 9, 5, tzinfo=timezone.utc)
    await engine.tick(ref_now_utc=t_due)

    # Should have attempted delivery once
    assert mock_bot.send_message.call_count == 1

    # Record should be marked failed_permanent
    delivery = await db.get_daily_delivery(user_id, "2026-10-22")
    assert delivery is not None
    assert delivery["delivery_status"] == "failed_permanent"
    assert delivery["error_category"] == "bot_blocked"

    # Schedule should be automatically disabled/paused
    sched = await db.get_schedule_settings(user_id)
    assert sched["is_enabled"] == 0


@pytest.mark.asyncio
async def test_reminder_delivery_when_due_and_not_completed(tmp_path):
    db_path = str(tmp_path / "test_reminder.db")
    db = Database(db_path)
    await db.init_db()

    qb = QuestionBank("data/question_bank.json")
    qb.load_and_validate()

    mock_bot = MagicMock()
    mock_bot.send_message = AsyncMock(return_value=MagicMock(message_id=9999))

    engine = DailySchedulerEngine(db=db, qb=qb, bot=mock_bot)

    user_id = 444555
    await db.get_or_create_user(user_id)
    await db.update_onboarding_state(user_id, "COMPLETED")
    await db.save_schedule_settings(user_id, is_enabled=True, delivery_time="09:00", timezone_str="UTC", reminders_enabled=True)

    # Simulate already delivered daily at 09:00 UTC with reminder due at 12:00 UTC
    deliv_id = await db.create_daily_delivery(
        telegram_id=user_id,
        local_date="2026-10-22",
        timezone_str="UTC",
        scheduled_utc="2026-10-22T09:00:00+00:00",
        question_id="dsa-01"
    )
    await db.update_daily_delivery_status(
        delivery_id=deliv_id,
        status="sent",
        telegram_message_id=8888,
        reminder_due_at="2026-10-22T12:00:00+00:00"
    )

    # Tick at 11:30 UTC -> Reminder not yet due
    await engine.tick(ref_now_utc=datetime(2026, 10, 22, 11, 30, tzinfo=timezone.utc))
    assert mock_bot.send_message.call_count == 0

    # Tick at 12:05 UTC -> Due! Should send reminder
    await engine.tick(ref_now_utc=datetime(2026, 10, 22, 12, 5, tzinfo=timezone.utc))
    assert mock_bot.send_message.call_count == 1

    deliv_record = await db.get_daily_delivery_by_id(deliv_id)
    assert deliv_record["reminder_status"] == "sent"
    assert deliv_record["reminder_sent_at"] is not None


@pytest.mark.asyncio
async def test_scheduler_lifecycle_start_and_stop(tmp_path):
    db_path = str(tmp_path / "test_lifecycle.db")
    db = Database(db_path)
    await db.init_db()

    qb = QuestionBank("data/question_bank.json")
    qb.load_and_validate()

    mock_bot = MagicMock()
    engine = DailySchedulerEngine(db=db, qb=qb, bot=mock_bot)

    assert engine._running is False
    engine.start(mock_bot)
    assert engine._running is True
    assert engine._task is not None

    # Redundant start does not spawn second task
    initial_task = engine._task
    engine.start(mock_bot)
    assert engine._task is initial_task

    await engine.stop()
    assert engine._running is False
    assert engine._task is None

