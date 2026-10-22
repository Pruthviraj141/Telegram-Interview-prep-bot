"""
Database access layer using safe parameterised aiosqlite and WAL mode.
No ORM, safe idempotent migrations.
"""
import json
import time
import aiosqlite
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    onboarding_state TEXT NOT NULL DEFAULT 'NEW',
    target_role TEXT,
    target_skills TEXT,
    target_topics TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_credentials (
    telegram_id INTEGER PRIMARY KEY,
    encrypted_groq_key TEXT NOT NULL,
    key_masked TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_resumes (
    telegram_id INTEGER PRIMARY KEY,
    extracted_text TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    recommended_role TEXT,
    recommended_skills TEXT,
    recommended_topics TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS key_setup_tokens (
    token_hash TEXT PRIMARY KEY,
    telegram_id INTEGER NOT NULL,
    expires_at REAL NOT NULL,
    is_used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY(telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_topic_preferences (
    telegram_id INTEGER NOT NULL,
    topic_slug TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(telegram_id, topic_slug),
    FOREIGN KEY(telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_resume_analysis (
    telegram_id INTEGER PRIMARY KEY,
    resume_hash TEXT NOT NULL,
    structured_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_question_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    question_id TEXT NOT NULL,
    topic_slug TEXT NOT NULL,
    presented_at TEXT NOT NULL,
    revealed_answer INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_schedule_settings (
    telegram_id INTEGER PRIMARY KEY,
    is_enabled INTEGER NOT NULL DEFAULT 0,
    delivery_time TEXT NOT NULL DEFAULT '09:00',
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    reminders_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    scheduled_local_date TEXT NOT NULL,
    timezone_snapshot TEXT NOT NULL,
    scheduled_utc_timestamp TEXT NOT NULL,
    question_id TEXT NOT NULL,
    delivery_status TEXT NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    last_attempt_at TEXT,
    sent_at TEXT,
    telegram_message_id INTEGER,
    next_retry_at TEXT,
    error_category TEXT,
    reminder_due_at TEXT,
    reminder_status TEXT NOT NULL DEFAULT 'pending',
    reminder_attempt_count INTEGER NOT NULL DEFAULT 0,
    reminder_sent_at TEXT,
    is_completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    revealed_answer INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(telegram_id, scheduled_local_date),
    FOREIGN KEY(telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mock_interview_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    mode TEXT NOT NULL, -- 'topics', 'resume', 'mixed'
    total_questions INTEGER NOT NULL DEFAULT 5,
    current_index INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'cancelled'
    overall_score REAL,
    report_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mock_interview_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    question_order INTEGER NOT NULL,
    question_id TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES mock_interview_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS answer_evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    question_id TEXT NOT NULL,
    context_type TEXT NOT NULL, -- 'daily', 'practice', 'mock'
    daily_delivery_id INTEGER,
    mock_session_id INTEGER,
    input_type TEXT NOT NULL, -- 'text', 'voice'
    answer_text TEXT NOT NULL,
    transcription_status TEXT, -- 'success', 'empty', 'failed', NULL
    technical_score REAL,
    completeness_score REAL,
    communication_score REAL,
    overall_score REAL,
    summary TEXT,
    what_went_well TEXT,
    missed_concepts TEXT,
    corrections TEXT,
    grammar_feedback TEXT,
    model_answer_refined TEXT,
    follow_up_questions TEXT,
    improvement_tip TEXT,
    evaluation_status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'failed'
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tavily_search_cache (
    query_hash TEXT PRIMARY KEY,
    query TEXT NOT NULL,
    search_depth TEXT NOT NULL,
    results_json TEXT NOT NULL,
    expires_at REAL NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tavily_search_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER,
    query TEXT NOT NULL,
    search_depth TEXT NOT NULL,
    credits_used INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS concept_revisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    concept_or_topic TEXT NOT NULL,
    question_id TEXT,
    last_score REAL NOT NULL,
    revision_interval_days INTEGER NOT NULL,
    due_date TEXT NOT NULL, -- YYYY-MM-DD
    is_reviewed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_defence_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    project_name TEXT NOT NULL,
    project_summary TEXT NOT NULL,
    total_questions INTEGER NOT NULL DEFAULT 5,
    current_index INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'cancelled'
    conversation_history_json TEXT NOT NULL DEFAULT '[]',
    final_report_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS company_prep_profiles (
    telegram_id INTEGER PRIMARY KEY,
    company_name TEXT NOT NULL,
    target_role TEXT NOT NULL,
    experience_level TEXT NOT NULL DEFAULT 'fresher',
    interview_date TEXT,
    prep_pack_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS coaching_sessions (
    telegram_id INTEGER PRIMARY KEY,
    mode TEXT NOT NULL, -- 'ask_coach', 'teach_topic'
    topic_or_query TEXT NOT NULL,
    step INTEGER NOT NULL DEFAULT 0,
    history_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS weekly_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER NOT NULL,
    week_start_date TEXT NOT NULL,
    week_end_date TEXT NOT NULL,
    report_text TEXT NOT NULL,
    sent_at TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(telegram_id, week_start_date),
    FOREIGN KEY(telegram_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

-- Web Platform Schema
CREATE TABLE IF NOT EXISTS web_users (
    id TEXT PRIMARY KEY, -- Clerk user ID e.g. user_xxx
    email TEXT,
    display_name TEXT,
    telegram_id INTEGER,
    onboarding_state TEXT NOT NULL DEFAULT 'AWAITING_GROQ_KEY',
    target_role TEXT,
    target_company TEXT,
    seniority TEXT,
    target_date TEXT,
    interview_type TEXT,
    target_skills TEXT,
    target_topics TEXT,
    confirmed_profile_json TEXT,
    roadmap_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS web_credentials (
    clerk_id TEXT PRIMARY KEY,
    encrypted_groq_key TEXT NOT NULL,
    key_masked TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(clerk_id) REFERENCES web_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS web_resumes (
    clerk_id TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    extracted_text TEXT NOT NULL,
    parsed_profile_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(clerk_id) REFERENCES web_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS web_interview_sessions (
    id TEXT PRIMARY KEY,
    clerk_id TEXT NOT NULL,
    mode TEXT NOT NULL, -- 'realistic' or 'practice'
    interviewer_style TEXT NOT NULL, -- 'hr', 'technical', 'project_defence', 'mixed'
    duration_mode TEXT NOT NULL, -- 'quick', 'standard', 'full'
    target_role TEXT NOT NULL,
    seniority TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'partial_completed', 'cancelled'
    current_turn_index INTEGER NOT NULL DEFAULT 0,
    blueprint_json TEXT NOT NULL,
    overall_score REAL,
    debrief_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(clerk_id) REFERENCES web_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS web_interview_turns (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    turn_index INTEGER NOT NULL,
    question_id TEXT,
    question_text TEXT NOT NULL,
    category TEXT NOT NULL,
    rubric_json TEXT NOT NULL,
    is_follow_up INTEGER NOT NULL DEFAULT 0,
    original_transcript TEXT,
    corrected_transcript TEXT,
    typed_answer TEXT,
    is_voice INTEGER NOT NULL DEFAULT 1,
    scratchpad_text TEXT,
    assistance_used_json TEXT,
    evaluation_json TEXT,
    evaluation_status TEXT NOT NULL DEFAULT 'pending',
    retry_count INTEGER NOT NULL DEFAULT 0,
    retry_history_json TEXT,
    dispute_history_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES web_interview_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS web_placement_tracker (
    id TEXT PRIMARY KEY,
    clerk_id TEXT NOT NULL,
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Wishlist',
    deadline TEXT,
    interview_date TEXT,
    job_description TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(clerk_id) REFERENCES web_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS telegram_link_codes (
    code TEXT PRIMARY KEY,
    clerk_id TEXT NOT NULL,
    telegram_id INTEGER,
    expires_at REAL NOT NULL,
    is_used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_consent_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    consent_type TEXT NOT NULL,
    ip_address TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tokens_telegram_id ON key_setup_tokens(telegram_id);
CREATE INDEX IF NOT EXISTS idx_qhistory_user_topic ON user_question_history(telegram_id, topic_slug);
CREATE INDEX IF NOT EXISTS idx_daily_status ON daily_deliveries(delivery_status, reminder_status);
CREATE INDEX IF NOT EXISTS idx_daily_user_date ON daily_deliveries(telegram_id, scheduled_local_date);
CREATE INDEX IF NOT EXISTS idx_eval_user_q ON answer_evaluations(telegram_id, question_id);
CREATE INDEX IF NOT EXISTS idx_eval_user_status ON answer_evaluations(telegram_id, evaluation_status);
CREATE INDEX IF NOT EXISTS idx_mock_user_status ON mock_interview_sessions(telegram_id, status);
CREATE INDEX IF NOT EXISTS idx_revisions_due ON concept_revisions(telegram_id, is_reviewed, due_date);
CREATE INDEX IF NOT EXISTS idx_tavily_usage_time ON tavily_search_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_tavily_usage_user ON tavily_search_usage(telegram_id, created_at);
CREATE INDEX IF NOT EXISTS idx_project_defence_user ON project_defence_sessions(telegram_id, status);
CREATE INDEX IF NOT EXISTS idx_web_sessions_clerk ON web_interview_sessions(clerk_id, status);
CREATE INDEX IF NOT EXISTS idx_web_turns_session ON web_interview_turns(session_id, turn_index);
CREATE INDEX IF NOT EXISTS idx_web_tracker_clerk ON web_placement_tracker(clerk_id, status);
CREATE INDEX IF NOT EXISTS idx_link_codes_clerk ON telegram_link_codes(clerk_id, is_used);
"""



class Database:
    def __init__(self, db_path: str):
        self.db_path = db_path

    async def init_db(self) -> None:
        """Safely and idempotently initialize SQLite tables with WAL mode."""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("PRAGMA journal_mode = WAL;")
            await db.execute("PRAGMA foreign_keys = ON;")
            await db.executescript(CREATE_TABLES_SQL)
            await db.commit()

    async def get_or_create_user(self, telegram_id: int) -> Dict[str, Any]:
        """Fetch user or create with default 'NEW' onboarding state."""
        now = utc_now_iso()
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
            row = await cursor.fetchone()
            if row:
                return dict(row)
            
            await db.execute(
                "INSERT INTO users (telegram_id, onboarding_state, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (telegram_id, "NEW", now, now)
            )
            await db.commit()
            
            cursor = await db.execute("SELECT * FROM users WHERE telegram_id = ?", (telegram_id,))
            row = await cursor.fetchone()
            return dict(row)

    async def update_onboarding_state(self, telegram_id: int, new_state: str, **kwargs) -> None:
        """Update user onboarding state and optional fields."""
        now = utc_now_iso()
        fields = ["onboarding_state = ?", "updated_at = ?"]
        params: List[Any] = [new_state, now]

        for k, v in kwargs.items():
            fields.append(f"{k} = ?")
            params.append(v)
        
        params.append(telegram_id)
        sql = f"UPDATE users SET {', '.join(fields)} WHERE telegram_id = ?"
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(sql, tuple(params))
            await db.commit()

    async def save_credentials(self, telegram_id: int, encrypted_key: str, key_masked: str) -> None:
        """Save or replace encrypted Groq credentials for user."""
        now = utc_now_iso()
        sql = """
        INSERT INTO user_credentials (telegram_id, encrypted_groq_key, key_masked, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(telegram_id) DO UPDATE SET
            encrypted_groq_key = excluded.encrypted_groq_key,
            key_masked = excluded.key_masked,
            updated_at = excluded.updated_at
        """
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(sql, (telegram_id, encrypted_key, key_masked, now, now))
            await db.commit()

    async def get_credentials(self, telegram_id: int) -> Optional[Dict[str, Any]]:
        """Fetch credentials for user."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM user_credentials WHERE telegram_id = ?", (telegram_id,))
            row = await cursor.fetchone()
            return dict(row) if row else None

    async def delete_credentials(self, telegram_id: int) -> None:
        """Safely delete stored Groq credentials for user."""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM user_credentials WHERE telegram_id = ?", (telegram_id,))
            await db.commit()

    async def save_resume(
        self,
        telegram_id: int,
        extracted_text: str,
        file_type: str,
        file_size_bytes: int,
        recommended_role: Optional[str] = None,
        recommended_skills: Optional[str] = None,
        recommended_topics: Optional[str] = None,
    ) -> None:
        """Save or replace resume for user."""
        now = utc_now_iso()
        sql = """
        INSERT INTO user_resumes (
            telegram_id, extracted_text, file_type, file_size_bytes,
            recommended_role, recommended_skills, recommended_topics, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(telegram_id) DO UPDATE SET
            extracted_text = excluded.extracted_text,
            file_type = excluded.file_type,
            file_size_bytes = excluded.file_size_bytes,
            recommended_role = excluded.recommended_role,
            recommended_skills = excluded.recommended_skills,
            recommended_topics = excluded.recommended_topics,
            updated_at = excluded.updated_at
        """
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(sql, (
                telegram_id, extracted_text, file_type, file_size_bytes,
                recommended_role, recommended_skills, recommended_topics, now, now
            ))
            await db.commit()
        await self.invalidate_resume_analysis(telegram_id)

    async def get_resume(self, telegram_id: int) -> Optional[Dict[str, Any]]:
        """Fetch stored resume data for user."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM user_resumes WHERE telegram_id = ?", (telegram_id,))
            row = await cursor.fetchone()
            return dict(row) if row else None

    async def delete_resume(self, telegram_id: int) -> None:
        """Delete resume record for user and invalidate cached analysis."""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM user_resumes WHERE telegram_id = ?", (telegram_id,))
            await db.commit()
        await self.invalidate_resume_analysis(telegram_id)

    async def create_key_setup_token(self, token_hash: str, telegram_id: int, expires_at: float) -> None:
        """Store a single-use setup token hash bound to telegram_id."""
        now = utc_now_iso()
        async with aiosqlite.connect(self.db_path) as db:
            # Invalidate any old unused tokens for this user
            await db.execute(
                "UPDATE key_setup_tokens SET is_used = 1 WHERE telegram_id = ? AND is_used = 0",
                (telegram_id,)
            )
            await db.execute(
                "INSERT INTO key_setup_tokens (token_hash, telegram_id, expires_at, is_used, created_at) VALUES (?, ?, ?, 0, ?)",
                (token_hash, telegram_id, expires_at, now)
            )
            await db.commit()

    async def consume_token(self, token_hash: str, current_time: float) -> Optional[int]:
        """
        Atomically validate and consume a single-use token hash.
        Returns telegram_id if valid and unexpired; None otherwise.
        """
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT telegram_id, expires_at, is_used FROM key_setup_tokens WHERE token_hash = ?",
                (token_hash,)
            )
            row = await cursor.fetchone()
            if not row:
                return None
            
            if row["is_used"] == 1:
                return None
            
            if row["expires_at"] < current_time:
                return None

            # Mark as used atomically
            await db.execute(
                "UPDATE key_setup_tokens SET is_used = 1 WHERE token_hash = ? AND is_used = 0",
                (token_hash,)
            )
            await db.commit()
            return int(row["telegram_id"])

    # ------------------ Phase 2 Methods ------------------

    async def get_user_topics(self, telegram_id: int) -> List[str]:
        """Fetch list of selected topic slugs for a user."""
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                "SELECT topic_slug FROM user_topic_preferences WHERE telegram_id = ? ORDER BY topic_slug ASC",
                (telegram_id,)
            )
            rows = await cursor.fetchall()
            return [r[0] for r in rows]

    async def set_user_topics(self, telegram_id: int, topic_slugs: List[str]) -> None:
        """Replace user's selected topic slugs in a single atomic transaction."""
        now = utc_now_iso()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM user_topic_preferences WHERE telegram_id = ?", (telegram_id,))
            for slug in topic_slugs:
                await db.execute(
                    "INSERT INTO user_topic_preferences (telegram_id, topic_slug, created_at) VALUES (?, ?, ?)",
                    (telegram_id, slug, now)
                )
            await db.commit()

    async def get_cached_resume_analysis(self, telegram_id: int, current_resume_hash: str) -> Optional[Dict[str, Any]]:
        """Fetch cached structured resume analysis if resume hash matches."""
        import json
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT structured_json FROM user_resume_analysis WHERE telegram_id = ? AND resume_hash = ?",
                (telegram_id, current_resume_hash)
            )
            row = await cursor.fetchone()
            if row:
                try:
                    return json.loads(row["structured_json"])
                except Exception:
                    return None
            return None

    async def save_cached_resume_analysis(self, telegram_id: int, resume_hash: str, analysis: Dict[str, Any]) -> None:
        """Save or update structured resume analysis cache."""
        import json
        now = utc_now_iso()
        dumped = json.dumps(analysis)
        sql = """
        INSERT INTO user_resume_analysis (telegram_id, resume_hash, structured_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(telegram_id) DO UPDATE SET
            resume_hash = excluded.resume_hash,
            structured_json = excluded.structured_json,
            updated_at = excluded.updated_at
        """
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(sql, (telegram_id, resume_hash, dumped, now, now))
            await db.commit()

    async def invalidate_resume_analysis(self, telegram_id: int) -> None:
        """Invalidate cached analysis on resume change or deletion."""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM user_resume_analysis WHERE telegram_id = ?", (telegram_id,))
            await db.commit()

    async def record_question_presented(self, telegram_id: int, question_id: str, topic_slug: str) -> None:
        """Record that a question was presented to a user for practice."""
        now = utc_now_iso()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "INSERT INTO user_question_history (telegram_id, question_id, topic_slug, presented_at, revealed_answer) VALUES (?, ?, ?, ?, 0)",
                (telegram_id, question_id, topic_slug, now)
            )
            await db.commit()

    async def record_answer_revealed(self, telegram_id: int, question_id: str) -> None:
        """Mark question as having revealed answer."""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "UPDATE user_question_history SET revealed_answer = 1 WHERE telegram_id = ? AND question_id = ?",
                (telegram_id, question_id)
            )
            await db.commit()

    async def get_recent_question_ids(self, telegram_id: int, topic_slug: Optional[str] = None, limit: int = 50) -> List[str]:
        """Fetch list of recently presented question IDs to avoid repeats."""
        async with aiosqlite.connect(self.db_path) as db:
            if topic_slug:
                cursor = await db.execute(
                    "SELECT question_id FROM user_question_history WHERE telegram_id = ? AND topic_slug = ? ORDER BY id DESC LIMIT ?",
                    (telegram_id, topic_slug, limit)
                )
            else:
                cursor = await db.execute(
                    "SELECT question_id FROM user_question_history WHERE telegram_id = ? ORDER BY id DESC LIMIT ?",
                    (telegram_id, limit)
                )
            rows = await cursor.fetchall()
            return [r[0] for r in rows]

    # ------------------ Phase 3 Methods ------------------

    async def get_schedule_settings(self, telegram_id: int) -> Optional[Dict[str, Any]]:
        """Fetch user's schedule settings."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM user_schedule_settings WHERE telegram_id = ?", (telegram_id,))
            row = await cursor.fetchone()
            return dict(row) if row else None

    async def save_schedule_settings(
        self,
        telegram_id: int,
        is_enabled: bool,
        delivery_time: str,
        timezone_str: str,
        reminders_enabled: bool = True
    ) -> None:
        """Upsert user's daily delivery schedule settings."""
        now = utc_now_iso()
        sql = """
        INSERT INTO user_schedule_settings (
            telegram_id, is_enabled, delivery_time, timezone, reminders_enabled, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(telegram_id) DO UPDATE SET
            is_enabled = excluded.is_enabled,
            delivery_time = excluded.delivery_time,
            timezone = excluded.timezone,
            reminders_enabled = excluded.reminders_enabled,
            updated_at = excluded.updated_at
        """
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(sql, (
                telegram_id,
                1 if is_enabled else 0,
                delivery_time,
                timezone_str,
                1 if reminders_enabled else 0,
                now,
                now
            ))
            await db.commit()

    async def get_all_active_schedules(self) -> List[Dict[str, Any]]:
        """Fetch all enabled schedule settings for onboarded users."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("""
                SELECT s.* FROM user_schedule_settings s
                JOIN users u ON s.telegram_id = u.telegram_id
                WHERE s.is_enabled = 1 AND u.onboarding_state = 'COMPLETED'
            """)
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]

    async def get_daily_delivery(self, telegram_id: int, local_date: str) -> Optional[Dict[str, Any]]:
        """Get daily delivery record for a user on a given local date (YYYY-MM-DD)."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT * FROM daily_deliveries WHERE telegram_id = ? AND scheduled_local_date = ?",
                (telegram_id, local_date)
            )
            row = await cursor.fetchone()
            return dict(row) if row else None

    async def get_daily_delivery_by_id(self, delivery_id: int) -> Optional[Dict[str, Any]]:
        """Get daily delivery record by primary key."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM daily_deliveries WHERE id = ?", (delivery_id,))
            row = await cursor.fetchone()
            return dict(row) if row else None

    async def get_latest_daily_delivery(self, telegram_id: int) -> Optional[Dict[str, Any]]:
        """Get the most recent daily delivery record for a user."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT * FROM daily_deliveries WHERE telegram_id = ? ORDER BY id DESC LIMIT 1",
                (telegram_id,)
            )
            row = await cursor.fetchone()
            return dict(row) if row else None

    async def create_daily_delivery(
        self,
        telegram_id: int,
        local_date: str,
        timezone_str: str,
        scheduled_utc: str,
        question_id: str
    ) -> Optional[int]:
        """
        Idempotently create daily delivery record.
        Returns record ID, or None if already created for this local date.
        """
        now = utc_now_iso()
        sql = """
        INSERT OR IGNORE INTO daily_deliveries (
            telegram_id, scheduled_local_date, timezone_snapshot, scheduled_utc_timestamp,
            question_id, delivery_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
        """
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(sql, (
                telegram_id, local_date, timezone_str, scheduled_utc, question_id, now, now
            ))
            await db.commit()
            if cursor.rowcount > 0 and cursor.lastrowid:
                return cursor.lastrowid
            return None

    async def update_daily_delivery_status(
        self,
        delivery_id: int,
        status: str,
        telegram_message_id: Optional[int] = None,
        error_category: Optional[str] = None,
        next_retry_at: Optional[str] = None,
        reminder_due_at: Optional[str] = None
    ) -> None:
        """Update delivery attempt result."""
        now = utc_now_iso()
        fields = ["delivery_status = ?", "last_attempt_at = ?", "updated_at = ?", "attempt_count = attempt_count + 1"]
        params: List[Any] = [status, now, now]

        if status == "sent":
            fields.append("sent_at = ?")
            params.append(now)

        if telegram_message_id is not None:
            fields.append("telegram_message_id = ?")
            params.append(telegram_message_id)

        if error_category is not None:
            fields.append("error_category = ?")
            params.append(error_category)

        if next_retry_at is not None:
            fields.append("next_retry_at = ?")
            params.append(next_retry_at)

        if reminder_due_at is not None:
            fields.append("reminder_due_at = ?")
            params.append(reminder_due_at)

        params.append(delivery_id)
        sql = f"UPDATE daily_deliveries SET {', '.join(fields)} WHERE id = ?"
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(sql, tuple(params))
            await db.commit()

    async def update_reminder_status(
        self,
        delivery_id: int,
        status: str,
        reminder_sent: bool = False
    ) -> None:
        """Update reminder delivery status."""
        now = utc_now_iso()
        fields = ["reminder_status = ?", "reminder_attempt_count = reminder_attempt_count + 1", "updated_at = ?"]
        params: List[Any] = [status, now]

        if reminder_sent:
            fields.append("reminder_sent_at = ?")
            params.append(now)

        params.append(delivery_id)
        sql = f"UPDATE daily_deliveries SET {', '.join(fields)} WHERE id = ?"
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(sql, tuple(params))
            await db.commit()

    async def mark_daily_completed(self, delivery_id: int) -> None:
        """Mark daily question as completed and suppress pending reminder."""
        now = utc_now_iso()
        sql = """
        UPDATE daily_deliveries SET
            is_completed = 1,
            completed_at = ?,
            reminder_status = 'skipped_completed',
            updated_at = ?
        WHERE id = ?
        """
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(sql, (now, now, delivery_id))
            await db.commit()

    async def mark_daily_answer_revealed(self, delivery_id: int) -> None:
        """Mark daily question answer revealed."""
        now = utc_now_iso()
        sql = "UPDATE daily_deliveries SET revealed_answer = 1, updated_at = ? WHERE id = ?"
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(sql, (now, delivery_id))
            await db.commit()

    async def get_due_daily_deliveries(self, current_utc_iso: str) -> List[Dict[str, Any]]:
        """Fetch pending or due-for-retry daily deliveries."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("""
                SELECT * FROM daily_deliveries
                WHERE (delivery_status = 'pending' AND scheduled_utc_timestamp <= ?)
                   OR (delivery_status = 'retrying' AND next_retry_at <= ?)
                LIMIT 50
            """, (current_utc_iso, current_utc_iso))
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]

    async def get_due_reminders(self, current_utc_iso: str) -> List[Dict[str, Any]]:
        """Fetch due reminders where challenge is not completed."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("""
                SELECT d.*, s.reminders_enabled FROM daily_deliveries d
                JOIN user_schedule_settings s ON d.telegram_id = s.telegram_id
                WHERE d.delivery_status = 'sent'
                  AND d.reminder_status = 'pending'
                  AND d.is_completed = 0
                  AND s.reminders_enabled = 1
                  AND d.reminder_due_at <= ?
                LIMIT 50
            """, (current_utc_iso,))
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]

    async def get_delivered_question_ids(self, telegram_id: int, limit: int = 100) -> List[str]:
        """Fetch previously delivered daily question IDs to avoid repeats."""
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                "SELECT question_id FROM daily_deliveries WHERE telegram_id = ? ORDER BY id DESC LIMIT ?",
                (telegram_id, limit)
            )
            rows = await cursor.fetchall()
            return [r[0] for r in rows]

    # ==================== Phase 4 Evaluation, Mock Sessions & Progress ====================

    async def save_answer_evaluation(
        self,
        telegram_id: int,
        question_id: str,
        context_type: str,
        input_type: str,
        answer_text: str,
        daily_delivery_id: Optional[int] = None,
        mock_session_id: Optional[int] = None,
        transcription_status: Optional[str] = None
    ) -> int:
        """
        Persist an answer attempt before evaluation.
        If daily_delivery_id is provided, marks the daily challenge as completed.
        Returns the new answer_evaluation record ID.
        """
        now = utc_now_iso()
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute("""
                INSERT INTO answer_evaluations (
                    telegram_id, question_id, context_type, daily_delivery_id,
                    mock_session_id, input_type, answer_text, transcription_status,
                    evaluation_status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
            """, (
                telegram_id, question_id, context_type, daily_delivery_id,
                mock_session_id, input_type, answer_text, transcription_status,
                now, now
            ))
            eval_id = cursor.lastrowid

            if daily_delivery_id:
                await db.execute("""
                    UPDATE daily_deliveries
                    SET is_completed = 1, completed_at = ?, updated_at = ?
                    WHERE id = ?
                """, (now, now, daily_delivery_id))

            await db.commit()
            return eval_id

    async def update_answer_evaluation_result(
        self,
        eval_id: int,
        status: str,
        technical_score: Optional[float] = None,
        completeness_score: Optional[float] = None,
        communication_score: Optional[float] = None,
        overall_score: Optional[float] = None,
        summary: Optional[str] = None,
        what_went_well: Optional[str] = None,
        missed_concepts: Optional[str] = None,
        corrections: Optional[str] = None,
        grammar_feedback: Optional[str] = None,
        model_answer_refined: Optional[str] = None,
        follow_up_questions: Optional[str] = None,
        improvement_tip: Optional[str] = None
    ) -> None:
        """Update evaluation record with structured scores and qualitative feedback."""
        now = utc_now_iso()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                UPDATE answer_evaluations
                SET evaluation_status = ?,
                    technical_score = ?,
                    completeness_score = ?,
                    communication_score = ?,
                    overall_score = ?,
                    summary = ?,
                    what_went_well = ?,
                    missed_concepts = ?,
                    corrections = ?,
                    grammar_feedback = ?,
                    model_answer_refined = ?,
                    follow_up_questions = ?,
                    improvement_tip = ?,
                    updated_at = ?
                WHERE id = ?
            """, (
                status, technical_score, completeness_score, communication_score,
                overall_score, summary, what_went_well, missed_concepts,
                corrections, grammar_feedback, model_answer_refined,
                follow_up_questions, improvement_tip, now, eval_id
            ))
            await db.commit()

    async def get_answer_evaluation(self, eval_id: int) -> Optional[Dict[str, Any]]:
        """Fetch single answer evaluation by ID."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM answer_evaluations WHERE id = ?", (eval_id,))
            row = await cursor.fetchone()
            return dict(row) if row else None

    async def get_user_recent_evaluations(self, telegram_id: int, limit: int = 10) -> List[Dict[str, Any]]:
        """Fetch recent completed evaluations for a user."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("""
                SELECT * FROM answer_evaluations
                WHERE telegram_id = ? AND evaluation_status = 'completed'
                ORDER BY id DESC LIMIT ?
            """, (telegram_id, limit))
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]

    async def get_evaluations_for_mock_session(self, session_id: int) -> List[Dict[str, Any]]:
        """Fetch all evaluations associated with a mock session ordered by creation."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("""
                SELECT * FROM answer_evaluations
                WHERE mock_session_id = ?
                ORDER BY id ASC
            """, (session_id,))
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]

    async def create_mock_session(self, telegram_id: int, mode: str, question_ids: List[str]) -> int:
        """
        Create a new mock interview session and associate its questions.
        Cancels any prior in-progress session for the user.
        """
        now = utc_now_iso()
        async with aiosqlite.connect(self.db_path) as db:
            # Cancel any existing active sessions
            await db.execute("""
                UPDATE mock_interview_sessions
                SET status = 'cancelled', updated_at = ?
                WHERE telegram_id = ? AND status = 'in_progress'
            """, (now, telegram_id))

            cursor = await db.execute("""
                INSERT INTO mock_interview_sessions (
                    telegram_id, mode, total_questions, current_index, status, created_at, updated_at
                ) VALUES (?, ?, ?, 0, 'in_progress', ?, ?)
            """, (telegram_id, mode, len(question_ids), now, now))
            session_id = cursor.lastrowid

            for idx, q_id in enumerate(question_ids):
                await db.execute("""
                    INSERT INTO mock_interview_questions (session_id, question_order, question_id)
                    VALUES (?, ?, ?)
                """, (session_id, idx, q_id))

            await db.commit()
            return session_id

    async def get_active_mock_session(self, telegram_id: int) -> Optional[Dict[str, Any]]:
        """Fetch currently in-progress mock session for user with question IDs."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("""
                SELECT * FROM mock_interview_sessions
                WHERE telegram_id = ? AND status = 'in_progress'
                ORDER BY id DESC LIMIT 1
            """, (telegram_id,))
            row = await cursor.fetchone()
            if not row:
                return None
            session = dict(row)

            q_cursor = await db.execute("""
                SELECT question_id FROM mock_interview_questions
                WHERE session_id = ?
                ORDER BY question_order ASC
            """, (session["id"],))
            q_rows = await q_cursor.fetchall()
            session["questions"] = [r[0] for r in q_rows]
            return session

    async def get_mock_session(self, session_id: int) -> Optional[Dict[str, Any]]:
        """Fetch mock session by ID with question IDs and evaluations."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM mock_interview_sessions WHERE id = ?", (session_id,))
            row = await cursor.fetchone()
            if not row:
                return None
            session = dict(row)

            q_cursor = await db.execute("""
                SELECT question_id FROM mock_interview_questions
                WHERE session_id = ?
                ORDER BY question_order ASC
            """, (session["id"],))
            q_rows = await q_cursor.fetchall()
            session["questions"] = [r[0] for r in q_rows]
            return session

    async def advance_mock_session(self, session_id: int, next_index: int) -> None:
        """Advance mock session current_index."""
        now = utc_now_iso()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                UPDATE mock_interview_sessions
                SET current_index = ?, updated_at = ?
                WHERE id = ?
            """, (next_index, now, session_id))
            await db.commit()

    async def complete_mock_session(self, session_id: int, overall_score: float, report_json: str) -> None:
        """Mark mock session completed with final report JSON."""
        now = utc_now_iso()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                UPDATE mock_interview_sessions
                SET status = 'completed', overall_score = ?, report_json = ?, updated_at = ?
                WHERE id = ?
            """, (overall_score, report_json, now, session_id))
            await db.commit()

    async def cancel_mock_session(self, session_id: int) -> None:
        """Mark mock session cancelled."""
        now = utc_now_iso()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                UPDATE mock_interview_sessions
                SET status = 'cancelled', updated_at = ?
                WHERE id = ?
            """, (now, session_id))
            await db.commit()

    async def get_user_progress_stats(self, telegram_id: int) -> Dict[str, Any]:
        """
        Aggregate progress statistics strictly from completed evaluations and sessions.
        Excludes failed/pending evaluations and uncompleted questions.
        """
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row

            # Total answered & completed
            cursor = await db.execute("""
                SELECT COUNT(*) as total_answered,
                       AVG(overall_score) as avg_score,
                       AVG(technical_score) as avg_tech,
                       AVG(completeness_score) as avg_comp,
                       AVG(communication_score) as avg_comm
                FROM answer_evaluations
                WHERE telegram_id = ? AND evaluation_status = 'completed'
            """, (telegram_id,))
            totals = dict(await cursor.fetchone() or {})

            # Daily challenges answered
            cursor_daily = await db.execute("""
                SELECT COUNT(DISTINCT COALESCE(daily_delivery_id, id)) as daily_answered
                FROM answer_evaluations
                WHERE telegram_id = ? AND context_type = 'daily' AND evaluation_status = 'completed'
            """, (telegram_id,))
            daily_res = dict(await cursor_daily.fetchone() or {})

            # Mock sessions completed
            cursor_mock = await db.execute("""
                SELECT COUNT(*) as mocks_completed
                FROM mock_interview_sessions
                WHERE telegram_id = ? AND status = 'completed'
            """, (telegram_id,))
            mock_res = dict(await cursor_mock.fetchone() or {})

            # Recent 10 completed evaluation scores
            cursor_recent = await db.execute("""
                SELECT id, question_id, overall_score, created_at
                FROM answer_evaluations
                WHERE telegram_id = ? AND evaluation_status = 'completed'
                ORDER BY id DESC LIMIT 10
            """, (telegram_id,))
            recent_rows = [dict(r) for r in await cursor_recent.fetchall()]

            # Recent average score over the last 10
            recent_scores = [r["overall_score"] for r in recent_rows if r["overall_score"] is not None]
            recent_avg = sum(recent_scores) / len(recent_scores) if recent_scores else None

            return {
                "total_answered": totals.get("total_answered", 0) or 0,
                "avg_overall_score": totals.get("avg_score"),
                "avg_technical_score": totals.get("avg_tech"),
                "avg_completeness_score": totals.get("avg_comp"),
                "avg_communication_score": totals.get("avg_comm"),
                "daily_answered": daily_res.get("daily_answered", 0) or 0,
                "mocks_completed": mock_res.get("mocks_completed", 0) or 0,
                "recent_evaluations": recent_rows,
                "recent_avg_score": round(recent_avg, 1) if recent_avg is not None else None,
                "recent_sample_count": len(recent_scores)
            }

    # ==================== Phase 5 Tavily Search Cache & Usage ====================

    async def get_tavily_cache(self, query_hash: str) -> Optional[Dict[str, Any]]:
        now_ts = time.time()
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT * FROM tavily_search_cache WHERE query_hash = ? AND expires_at > ?",
                (query_hash, now_ts)
            )
            row = await cursor.fetchone()
            if row:
                d = dict(row)
                d["results"] = json.loads(d["results_json"])
                return d
            return None

    async def save_tavily_cache(self, query_hash: str, query: str, search_depth: str, results_json: str, expires_at: float) -> None:
        now = utc_now_iso()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT INTO tavily_search_cache (query_hash, query, search_depth, results_json, expires_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(query_hash) DO UPDATE SET
                    query = excluded.query,
                    search_depth = excluded.search_depth,
                    results_json = excluded.results_json,
                    expires_at = excluded.expires_at
            """, (query_hash, query, search_depth, results_json, expires_at, now))
            await db.commit()

    async def record_tavily_usage(self, telegram_id: Optional[int], query: str, search_depth: str, credits: int = 1) -> None:
        now = utc_now_iso()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT INTO tavily_search_usage (telegram_id, query, search_depth, credits_used, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (telegram_id, query, search_depth, credits, now))
            await db.commit()

    async def get_user_tavily_searches_today(self, telegram_id: int) -> int:
        today_prefix = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute("""
                SELECT COUNT(*) FROM tavily_search_usage
                WHERE telegram_id = ? AND created_at LIKE ?
            """, (telegram_id, f"{today_prefix}%"))
            row = await cursor.fetchone()
            return row[0] if row else 0

    async def get_total_tavily_credits_this_month(self) -> int:
        month_prefix = datetime.now(timezone.utc).strftime("%Y-%m")
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute("""
                SELECT COALESCE(SUM(credits_used), 0) FROM tavily_search_usage
                WHERE created_at LIKE ?
            """, (f"{month_prefix}%",))
            row = await cursor.fetchone()
            return int(row[0]) if row else 0

    # ==================== Phase 5 Concept Revisions (Adaptive Learning) ====================

    async def upsert_concept_revision(
        self,
        telegram_id: int,
        concept_or_topic: str,
        question_id: Optional[str],
        score: float,
        interval_days: int,
        due_date: str
    ) -> None:
        now = utc_now_iso()
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute(
                "SELECT id FROM concept_revisions WHERE telegram_id = ? AND concept_or_topic = ?",
                (telegram_id, concept_or_topic)
            )
            row = await cursor.fetchone()
            if row:
                await db.execute("""
                    UPDATE concept_revisions
                    SET question_id = COALESCE(?, question_id),
                        last_score = ?,
                        revision_interval_days = ?,
                        due_date = ?,
                        is_reviewed = 0,
                        updated_at = ?
                    WHERE id = ?
                """, (question_id, score, interval_days, due_date, now, row[0]))
            else:
                await db.execute("""
                    INSERT INTO concept_revisions (
                        telegram_id, concept_or_topic, question_id, last_score,
                        revision_interval_days, due_date, is_reviewed, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
                """, (telegram_id, concept_or_topic, question_id, score, interval_days, due_date, now, now))
            await db.commit()

    async def get_due_revisions(self, telegram_id: int, today_str: Optional[str] = None, limit: int = 5) -> List[Dict[str, Any]]:
        if not today_str:
            today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("""
                SELECT * FROM concept_revisions
                WHERE telegram_id = ? AND is_reviewed = 0 AND due_date <= ?
                ORDER BY due_date ASC, last_score ASC LIMIT ?
            """, (telegram_id, today_str, limit))
            return [dict(r) for r in await cursor.fetchall()]

    async def mark_revision_reviewed(self, revision_id: int) -> None:
        now = utc_now_iso()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                "UPDATE concept_revisions SET is_reviewed = 1, updated_at = ? WHERE id = ?",
                (now, revision_id)
            )
            await db.commit()

    async def get_all_user_revisions(self, telegram_id: int) -> List[Dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("""
                SELECT * FROM concept_revisions
                WHERE telegram_id = ?
                ORDER BY is_reviewed ASC, due_date ASC
            """, (telegram_id,))
            return [dict(r) for r in await cursor.fetchall()]

    # ==================== Phase 5 Project Defence ====================

    async def create_project_defence_session(
        self,
        telegram_id: int,
        project_name: str,
        project_summary: str,
        total_questions: int = 5
    ) -> int:
        now = utc_now_iso()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                UPDATE project_defence_sessions
                SET status = 'cancelled', updated_at = ?
                WHERE telegram_id = ? AND status = 'in_progress'
            """, (now, telegram_id))

            cursor = await db.execute("""
                INSERT INTO project_defence_sessions (
                    telegram_id, project_name, project_summary, total_questions,
                    current_index, status, conversation_history_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 0, 'in_progress', '[]', ?, ?)
            """, (telegram_id, project_name, project_summary, total_questions, now, now))
            await db.commit()
            return cursor.lastrowid

    async def get_active_project_defence_session(self, telegram_id: int) -> Optional[Dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("""
                SELECT * FROM project_defence_sessions
                WHERE telegram_id = ? AND status = 'in_progress'
                ORDER BY id DESC LIMIT 1
            """, (telegram_id,))
            row = await cursor.fetchone()
            if row:
                d = dict(row)
                d["history"] = json.loads(d["conversation_history_json"] or "[]")
                if d.get("final_report_json"):
                    d["final_report"] = json.loads(d["final_report_json"])
                return d
            return None

    async def update_project_defence_session(
        self,
        session_id: int,
        current_index: int,
        status: str,
        conversation_history: List[Dict[str, Any]],
        final_report: Optional[Dict[str, Any]] = None
    ) -> None:
        now = utc_now_iso()
        history_str = json.dumps(conversation_history)
        report_str = json.dumps(final_report) if final_report else None
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                UPDATE project_defence_sessions
                SET current_index = ?,
                    status = ?,
                    conversation_history_json = ?,
                    final_report_json = COALESCE(?, final_report_json),
                    updated_at = ?
                WHERE id = ?
            """, (current_index, status, history_str, report_str, now, session_id))
            await db.commit()

    # ==================== Phase 5 Company Prep ====================

    async def save_company_prep_profile(
        self,
        telegram_id: int,
        company_name: str,
        target_role: str,
        experience_level: str = "fresher",
        interview_date: Optional[str] = None,
        prep_pack: Optional[Dict[str, Any]] = None
    ) -> None:
        now = utc_now_iso()
        pack_json = json.dumps(prep_pack) if prep_pack else None
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT INTO company_prep_profiles (
                    telegram_id, company_name, target_role, experience_level,
                    interview_date, prep_pack_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(telegram_id) DO UPDATE SET
                    company_name = excluded.company_name,
                    target_role = excluded.target_role,
                    experience_level = excluded.experience_level,
                    interview_date = excluded.interview_date,
                    prep_pack_json = COALESCE(excluded.prep_pack_json, company_prep_profiles.prep_pack_json),
                    updated_at = excluded.updated_at
            """, (telegram_id, company_name, target_role, experience_level, interview_date, pack_json, now, now))
            await db.commit()

    async def get_company_prep_profile(self, telegram_id: int) -> Optional[Dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM company_prep_profiles WHERE telegram_id = ?", (telegram_id,))
            row = await cursor.fetchone()
            if row:
                d = dict(row)
                if d.get("prep_pack_json"):
                    d["prep_pack"] = json.loads(d["prep_pack_json"])
                return d
            return None

    # ==================== Phase 5 Coaching Session ====================

    async def save_coaching_session(
        self,
        telegram_id: int,
        mode: str,
        topic_or_query: str,
        step: int,
        history: List[Dict[str, Any]]
    ) -> None:
        now = utc_now_iso()
        history_json = json.dumps(history)
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT INTO coaching_sessions (
                    telegram_id, mode, topic_or_query, step, history_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(telegram_id) DO UPDATE SET
                    mode = excluded.mode,
                    topic_or_query = excluded.topic_or_query,
                    step = excluded.step,
                    history_json = excluded.history_json,
                    updated_at = excluded.updated_at
            """, (telegram_id, mode, topic_or_query, step, history_json, now, now))
            await db.commit()

    async def get_coaching_session(self, telegram_id: int) -> Optional[Dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM coaching_sessions WHERE telegram_id = ?", (telegram_id,))
            row = await cursor.fetchone()
            if row:
                d = dict(row)
                d["history"] = json.loads(d["history_json"] or "[]")
                return d
            return None

    async def clear_coaching_session(self, telegram_id: int) -> None:
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM coaching_sessions WHERE telegram_id = ?", (telegram_id,))
            await db.commit()

    # ==================== Phase 5 Weekly Reports ====================

    async def save_weekly_report(
        self,
        telegram_id: int,
        week_start: str,
        week_end: str,
        report_text: str,
        sent: bool = False
    ) -> None:
        now = utc_now_iso()
        sent_at = now if sent else None
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT INTO weekly_reports (
                    telegram_id, week_start_date, week_end_date, report_text, sent_at, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(telegram_id, week_start_date) DO UPDATE SET
                    week_end_date = excluded.week_end_date,
                    report_text = excluded.report_text,
                    sent_at = COALESCE(excluded.sent_at, weekly_reports.sent_at)
            """, (telegram_id, week_start, week_end, report_text, sent_at, now))
            await db.commit()

    async def get_latest_weekly_report(self, telegram_id: int) -> Optional[Dict[str, Any]]:
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("""
                SELECT * FROM weekly_reports WHERE telegram_id = ?
                ORDER BY week_start_date DESC LIMIT 1
            """, (telegram_id,))
            row = await cursor.fetchone()
            return dict(row) if row else None

    # ==================== Web Platform Support ====================

    async def get_or_create_web_user(
        self,
        clerk_id: str,
        email: Optional[str] = None,
        display_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """Fetch or register a web user authenticated via Clerk."""
        now = utc_now_iso()
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM web_users WHERE id = ?", (clerk_id,))
            row = await cursor.fetchone()
            if row:
                return dict(row)

            await db.execute("""
                INSERT INTO web_users (id, email, display_name, onboarding_state, created_at, updated_at)
                VALUES (?, ?, ?, 'AWAITING_GROQ_KEY', ?, ?)
            """, (clerk_id, email, display_name, now, now))
            await db.commit()

            cursor = await db.execute("SELECT * FROM web_users WHERE id = ?", (clerk_id,))
            row = await cursor.fetchone()
            return dict(row)

    async def get_web_user(self, clerk_id: str) -> Optional[Dict[str, Any]]:
        """Fetch web user profile."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM web_users WHERE id = ?", (clerk_id,))
            row = await cursor.fetchone()
            return dict(row) if row else None

    async def update_web_user(self, clerk_id: str, **kwargs) -> None:
        """Update web user profile fields."""
        now = utc_now_iso()
        fields = ["updated_at = ?"]
        params: List[Any] = [now]
        for k, v in kwargs.items():
            fields.append(f"{k} = ?")
            params.append(v)
        params.append(clerk_id)
        sql = f"UPDATE web_users SET {', '.join(fields)} WHERE id = ?"
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(sql, tuple(params))
            await db.commit()

    async def save_web_credentials(self, clerk_id: str, encrypted_key: str, key_masked: str) -> None:
        """Save encrypted Groq key for a web user."""
        now = utc_now_iso()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT INTO web_credentials (clerk_id, encrypted_groq_key, key_masked, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(clerk_id) DO UPDATE SET
                    encrypted_groq_key = excluded.encrypted_groq_key,
                    key_masked = excluded.key_masked,
                    updated_at = excluded.updated_at
            """, (clerk_id, encrypted_key, key_masked, now, now))
            await db.commit()

    async def get_web_credentials(self, clerk_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve encrypted Groq key record for a web user."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM web_credentials WHERE clerk_id = ?", (clerk_id,))
            row = await cursor.fetchone()
            return dict(row) if row else None

    async def delete_web_credentials(self, clerk_id: str) -> None:
        """Delete stored Groq key for a web user."""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM web_credentials WHERE clerk_id = ?", (clerk_id,))
            await db.commit()

    async def save_web_resume(
        self,
        clerk_id: str,
        filename: str,
        file_type: str,
        file_size_bytes: int,
        extracted_text: str,
        parsed_profile: Dict[str, Any]
    ) -> None:
        """Save parsed resume text and structured extraction for web user."""
        now = utc_now_iso()
        parsed_json = json.dumps(parsed_profile)
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT INTO web_resumes (
                    clerk_id, filename, file_type, file_size_bytes, extracted_text,
                    parsed_profile_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(clerk_id) DO UPDATE SET
                    filename = excluded.filename,
                    file_type = excluded.file_type,
                    file_size_bytes = excluded.file_size_bytes,
                    extracted_text = excluded.extracted_text,
                    parsed_profile_json = excluded.parsed_profile_json,
                    updated_at = excluded.updated_at
            """, (clerk_id, filename, file_type, file_size_bytes, extracted_text, parsed_json, now, now))
            await db.commit()

    async def get_web_resume(self, clerk_id: str) -> Optional[Dict[str, Any]]:
        """Fetch resume record for web user."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM web_resumes WHERE clerk_id = ?", (clerk_id,))
            row = await cursor.fetchone()
            if row:
                d = dict(row)
                d["parsed_profile"] = json.loads(d["parsed_profile_json"] or "{}")
                return d
            return None

    # ==================== Web Interview Studio Sessions ====================

    async def create_web_interview_session(
        self,
        session_id: str,
        clerk_id: str,
        mode: str,
        interviewer_style: str,
        duration_mode: str,
        target_role: str,
        seniority: str,
        difficulty: str,
        blueprint: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create a new web interview studio session."""
        now = utc_now_iso()
        blueprint_json = json.dumps(blueprint)
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT INTO web_interview_sessions (
                    id, clerk_id, mode, interviewer_style, duration_mode,
                    target_role, seniority, difficulty, status, current_turn_index,
                    blueprint_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'in_progress', 0, ?, ?, ?)
            """, (
                session_id, clerk_id, mode, interviewer_style, duration_mode,
                target_role, seniority, difficulty, blueprint_json, now, now
            ))
            await db.commit()
            return await self.get_web_interview_session(session_id, clerk_id)

    async def get_web_interview_session(self, session_id: str, clerk_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a session ensuring clerk_id ownership."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute(
                "SELECT * FROM web_interview_sessions WHERE id = ? AND clerk_id = ?",
                (session_id, clerk_id)
            )
            row = await cursor.fetchone()
            if row:
                d = dict(row)
                d["blueprint"] = json.loads(d["blueprint_json"] or "{}")
                if d.get("debrief_json"):
                    d["debrief"] = json.loads(d["debrief_json"])
                return d
            return None

    async def list_web_interview_sessions(self, clerk_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        """List past sessions for a candidate."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("""
                SELECT * FROM web_interview_sessions
                WHERE clerk_id = ?
                ORDER BY created_at DESC LIMIT ?
            """, (clerk_id, limit))
            rows = await cursor.fetchall()
            results = []
            for r in rows:
                d = dict(r)
                d["blueprint"] = json.loads(d["blueprint_json"] or "{}")
                if d.get("debrief_json"):
                    d["debrief"] = json.loads(d["debrief_json"])
                results.append(d)
            return results

    async def update_web_interview_session(self, session_id: str, clerk_id: str, **kwargs) -> None:
        """Update interview session state or debrief."""
        now = utc_now_iso()
        fields = ["updated_at = ?"]
        params: List[Any] = [now]
        for k, v in kwargs.items():
            if k in {"blueprint", "debrief"}:
                fields.append(f"{k}_json = ?")
                params.append(json.dumps(v))
            else:
                fields.append(f"{k} = ?")
                params.append(v)
        params.extend([session_id, clerk_id])
        sql = f"UPDATE web_interview_sessions SET {', '.join(fields)} WHERE id = ? AND clerk_id = ?"
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(sql, tuple(params))
            await db.commit()

    async def create_web_interview_turn(
        self,
        turn_id: str,
        session_id: str,
        turn_index: int,
        question_id: Optional[str],
        question_text: str,
        category: str,
        rubric: Dict[str, Any],
        is_follow_up: bool = False
    ) -> None:
        """Persist a turn question before it is spoken."""
        now = utc_now_iso()
        rubric_json = json.dumps(rubric)
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT INTO web_interview_turns (
                    id, session_id, turn_index, question_id, question_text,
                    category, rubric_json, is_follow_up, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                turn_id, session_id, turn_index, question_id, question_text,
                category, rubric_json, 1 if is_follow_up else 0, now, now
            ))
            await db.commit()

    async def get_web_interview_turns(self, session_id: str) -> List[Dict[str, Any]]:
        """Fetch all turns for a session in order."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("""
                SELECT * FROM web_interview_turns WHERE session_id = ? ORDER BY turn_index ASC
            """, (session_id,))
            rows = await cursor.fetchall()
            turns = []
            for r in rows:
                d = dict(r)
                d["rubric"] = json.loads(d["rubric_json"] or "{}")
                if d.get("evaluation_json"):
                    d["evaluation"] = json.loads(d["evaluation_json"])
                if d.get("assistance_used_json"):
                    d["assistance_used"] = json.loads(d["assistance_used_json"])
                if d.get("retry_history_json"):
                    d["retry_history"] = json.loads(d["retry_history_json"])
                if d.get("dispute_history_json"):
                    d["dispute_history"] = json.loads(d["dispute_history_json"])
                turns.append(d)
            return turns

    async def get_candidate_past_asked_question_ids(self, clerk_id: str) -> List[str]:
        """Fetch all unique question IDs previously asked to this candidate across all sessions."""
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute("""
                SELECT DISTINCT t.question_id 
                FROM web_interview_turns t
                JOIN web_interview_sessions s ON t.session_id = s.id
                WHERE s.clerk_id = ? AND t.question_id IS NOT NULL AND t.question_id != ''
            """, (clerk_id,))
            rows = await cursor.fetchall()
            return [r[0] for r in rows if r[0]]

    async def get_web_interview_turn(self, turn_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a single turn."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("SELECT * FROM web_interview_turns WHERE id = ?", (turn_id,))
            row = await cursor.fetchone()
            if row:
                d = dict(row)
                d["rubric"] = json.loads(d["rubric_json"] or "{}")
                if d.get("evaluation_json"):
                    d["evaluation"] = json.loads(d["evaluation_json"])
                if d.get("assistance_used_json"):
                    d["assistance_used"] = json.loads(d["assistance_used_json"])
                if d.get("retry_history_json"):
                    d["retry_history"] = json.loads(d["retry_history_json"])
                if d.get("dispute_history_json"):
                    d["dispute_history"] = json.loads(d["dispute_history_json"])
                return d
            return None

    async def update_web_interview_turn(self, turn_id: str, **kwargs) -> None:
        """Update a turn with answer, transcript, or evaluation."""
        now = utc_now_iso()
        fields = ["updated_at = ?"]
        params: List[Any] = [now]
        for k, v in kwargs.items():
            if k in {"evaluation", "assistance_used", "retry_history", "dispute_history"}:
                fields.append(f"{k}_json = ?")
                params.append(json.dumps(v))
            else:
                fields.append(f"{k} = ?")
                params.append(v)
        params.append(turn_id)
        sql = f"UPDATE web_interview_turns SET {', '.join(fields)} WHERE id = ?"
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(sql, tuple(params))
            await db.commit()

    # ==================== Placement Tracker ====================

    async def create_placement_tracker_item(
        self,
        item_id: str,
        clerk_id: str,
        company: str,
        role: str,
        status: str = "Wishlist",
        deadline: Optional[str] = None,
        interview_date: Optional[str] = None,
        job_description: Optional[str] = None,
        notes: Optional[str] = None
    ) -> None:
        """Add opportunity to placement tracker."""
        now = utc_now_iso()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT INTO web_placement_tracker (
                    id, clerk_id, company, role, status, deadline,
                    interview_date, job_description, notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                item_id, clerk_id, company, role, status, deadline,
                interview_date, job_description, notes, now, now
            ))
            await db.commit()

    async def list_placement_tracker_items(self, clerk_id: str) -> List[Dict[str, Any]]:
        """List all placement tracker items for a user."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("""
                SELECT * FROM web_placement_tracker WHERE clerk_id = ? ORDER BY created_at DESC
            """, (clerk_id,))
            rows = await cursor.fetchall()
            return [dict(r) for r in rows]

    async def update_placement_tracker_item(self, item_id: str, clerk_id: str, **kwargs) -> None:
        """Update tracker opportunity."""
        now = utc_now_iso()
        fields = ["updated_at = ?"]
        params: List[Any] = [now]
        for k, v in kwargs.items():
            fields.append(f"{k} = ?")
            params.append(v)
        params.extend([item_id, clerk_id])
        sql = f"UPDATE web_placement_tracker SET {', '.join(fields)} WHERE id = ? AND clerk_id = ?"
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(sql, tuple(params))
            await db.commit()

    async def delete_placement_tracker_item(self, item_id: str, clerk_id: str) -> None:
        """Delete opportunity from tracker."""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM web_placement_tracker WHERE id = ? AND clerk_id = ?", (item_id, clerk_id))
            await db.commit()

    # ==================== Account Linking (Telegram <-> Web) ====================

    async def create_telegram_link_code(self, code: str, clerk_id: str, expires_at: float) -> None:
        """Generate short-lived single-use linking code."""
        now = utc_now_iso()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT INTO telegram_link_codes (code, clerk_id, expires_at, is_used, created_at)
                VALUES (?, ?, ?, 0, ?)
            """, (code, clerk_id, expires_at, now))
            await db.commit()

    async def consume_telegram_link_code(self, code: str, telegram_id: int, now_ts: float) -> Optional[str]:
        """Consume linking code from Telegram side to bind telegram_id with clerk_id."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            cursor = await db.execute("""
                SELECT clerk_id FROM telegram_link_codes
                WHERE code = ? AND is_used = 0 AND expires_at > ?
            """, (code, now_ts))
            row = await cursor.fetchone()
            if not row:
                return None
            clerk_id = row["clerk_id"]

            await db.execute("UPDATE telegram_link_codes SET is_used = 1, telegram_id = ? WHERE code = ?", (telegram_id, code))
            await db.execute("UPDATE web_users SET telegram_id = ?, updated_at = ? WHERE id = ?", (telegram_id, utc_now_iso(), clerk_id))
            await db.commit()
            return clerk_id

    # ==================== Consent & History Deletion ====================

    async def log_user_consent(self, user_id: str, consent_type: str, ip_address: Optional[str] = None) -> None:
        """Log explicit privacy & transient audio consent event."""
        now = utc_now_iso()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                INSERT INTO user_consent_logs (user_id, consent_type, ip_address, created_at)
                VALUES (?, ?, ?, ?)
            """, (user_id, consent_type, ip_address, now))
            await db.commit()

    async def has_user_consented(self, user_id: str, consent_type: str) -> bool:
        """Check if user has granted specific consent."""
        async with aiosqlite.connect(self.db_path) as db:
            cursor = await db.execute("""
                SELECT id FROM user_consent_logs WHERE user_id = ? AND consent_type = ? LIMIT 1
            """, (user_id, consent_type))
            row = await cursor.fetchone()
            return row is not None

    async def delete_web_interview_session(self, session_id: str, clerk_id: str) -> None:
        """Delete an individual interview session and its turns."""
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM web_interview_sessions WHERE id = ? AND clerk_id = ?", (session_id, clerk_id))
            await db.commit()

    async def delete_web_user_interview_history(self, clerk_id: str) -> None:
        """
        Delete ALL interview sessions, turns, evaluations and debriefs for candidate.
        Ensures deleted records no longer influence recommendations or personalisation.
        """
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM web_interview_sessions WHERE clerk_id = ?", (clerk_id,))
            await db.commit()





