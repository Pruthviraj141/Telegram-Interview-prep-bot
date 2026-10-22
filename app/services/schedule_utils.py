"""
Timezone and schedule utilities.
Supports IANA timezone validation, daylight saving safety, and local <-> UTC conversions.
"""
from datetime import datetime, date, time as dt_time, timezone, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from typing import Tuple, Optional


COMMON_TIMEZONES = [
    "Asia/Kolkata",
    "UTC",
    "America/New_York",
    "America/Los_Angeles",
    "America/Chicago",
    "Europe/London",
    "Europe/Berlin",
    "Asia/Dubai",
    "Asia/Singapore",
    "Australia/Sydney"
]


def validate_timezone(tz_name: str) -> bool:
    """Validate that the string is a recognized IANA timezone."""
    if not tz_name or not isinstance(tz_name, str):
        return False
    try:
        ZoneInfo(tz_name.strip())
        return True
    except (ZoneInfoNotFoundError, ValueError):
        return False


def validate_delivery_time(time_str: str) -> bool:
    """Validate that delivery_time is in HH:MM 24-hour format with 2 digits each."""
    if not time_str or not isinstance(time_str, str):
        return False
    parts = time_str.strip().split(":")
    if len(parts) != 2:
        return False
    h_str, m_str = parts
    if len(h_str) != 2 or len(m_str) != 2:
        return False
    if not (h_str.isdigit() and m_str.isdigit()):
        return False
    hour, minute = int(h_str), int(m_str)
    return 0 <= hour <= 23 and 0 <= minute <= 59


def get_current_local_date_and_time(tz_name: str, ref_utc_dt: Optional[datetime] = None) -> Tuple[str, str]:
    """
    Get current local date (YYYY-MM-DD) and current local time (HH:MM) for a timezone.
    """
    tz = ZoneInfo(tz_name)
    now_utc = ref_utc_dt or datetime.now(timezone.utc)
    local_dt = now_utc.astimezone(tz)
    return local_dt.strftime("%Y-%m-%d"), local_dt.strftime("%H:%M")


def compute_scheduled_utc(
    local_date_str: str,
    delivery_time_str: str,
    tz_name: str
) -> datetime:
    """
    Compute intended UTC datetime for a specific local date and delivery time,
    safely handling daylight saving gaps and fold transitions.
    """
    tz = ZoneInfo(tz_name)
    y, m, d = [int(p) for p in local_date_str.split("-")]
    h, mins = [int(p) for p in delivery_time_str.split(":")]

    # Create naive local datetime and localize with fold=0
    local_dt = datetime(y, m, d, h, mins, tzinfo=tz, fold=0)
    return local_dt.astimezone(timezone.utc)


def compute_reminder_due_utc(
    sent_utc_dt: datetime,
    delay_hours: int = 3,
    user_tz_name: str = "UTC",
    timezone_str: Optional[str] = None
) -> Optional[datetime]:
    """
    Compute reminder due UTC time (default: +3 hours).
    Returns None if the reminder would fall past the user's same local calendar day.
    """
    effective_tz = timezone_str or user_tz_name
    reminder_utc = sent_utc_dt + timedelta(hours=delay_hours)
    
    # Check same-day constraint in user's timezone
    tz = ZoneInfo(effective_tz)
    sent_local_date = sent_utc_dt.astimezone(tz).date()
    reminder_local_date = reminder_utc.astimezone(tz).date()

    if sent_local_date != reminder_local_date:
        # Pushed past same local day; skip reminder
        return None

    return reminder_utc
