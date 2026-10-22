"""
AdaptiveLearningService: Spaced repetition tracking, weakness detection,
learning gap analysis, and weekly progress reporting based strictly on real evidence.
"""
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
from app.database import Database
from app.question_bank import QuestionBank

logger = logging.getLogger(__name__)


def compute_revision_interval_days(score: float, has_missed_concepts: bool = False) -> int:
    """
    Configurable spaced repetition policy:
    - Score 0-4: revisit in 1 day
    - Score 5-6: revisit in 3 days
    - Score 7-8: revisit in 7 days
    - Score 9-10: revisit in 14 days
    If critical concepts were missed despite a good score, interval is capped at 3 days.
    """
    if score <= 4.0:
        return 1
    elif score <= 6.0:
        return 3
    elif score <= 8.0:
        return 3 if has_missed_concepts else 7
    else:
        return 5 if has_missed_concepts else 14


class AdaptiveLearningService:
    def __init__(self, db: Database, qb: QuestionBank):
        self.db = db
        self.qb = qb

    async def record_evaluation_outcome(
        self,
        telegram_id: int,
        question_id: str,
        overall_score: float,
        missed_concepts: Optional[str] = None
    ) -> None:
        """
        Record evaluated answer outcome into spaced repetition revision tracker.
        """
        q_record = self.qb.get_by_id(question_id)
        topic_slug = q_record.get("category", "General Engineering") if q_record else "General Engineering"

        has_missed = bool(missed_concepts and missed_concepts.strip() and missed_concepts.lower() != "none")
        interval_days = compute_revision_interval_days(overall_score, has_missed_concepts=has_missed)

        due_dt = datetime.now(timezone.utc) + timedelta(days=interval_days)
        due_date_str = due_dt.strftime("%Y-%m-%d")

        await self.db.upsert_concept_revision(
            telegram_id=telegram_id,
            concept_or_topic=topic_slug,
            question_id=question_id,
            score=overall_score,
            interval_days=interval_days,
            due_date=due_date_str
        )

    async def get_due_revision_questions(self, telegram_id: int, limit: int = 3) -> List[Dict[str, Any]]:
        """
        Fetch questions that are due for spaced revision today.
        """
        today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        due_revisions = await self.db.get_due_revisions(telegram_id, today_str=today_str, limit=limit)
        return due_revisions

    async def analyze_topic_performance(self, telegram_id: int) -> Dict[str, Any]:
        """
        Analyze performance across topics using real evaluated answers in SQLite.
        Distinguishes persistent weaknesses (>=2 attempts with avg < 6.0) from early signals (<2 attempts).
        """
        # Fetch completed evaluations
        import aiosqlite
        async with aiosqlite.connect(self.db.db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.execute("""
                SELECT question_id, overall_score
                FROM answer_evaluations
                WHERE telegram_id = ? AND evaluation_status = 'completed' AND overall_score IS NOT NULL
            """, (telegram_id,))
            rows = await cursor.fetchall()

        topic_scores: Dict[str, List[float]] = {}
        for r in rows:
            qid = r["question_id"]
            score = float(r["overall_score"])
            q_rec = self.qb.get_by_id(qid)
            cat = q_rec.get("category", "General") if q_rec else "General"
            topic_scores.setdefault(cat, []).append(score)

        persistent_weak: List[Dict[str, Any]] = []
        early_signals: List[Dict[str, Any]] = []
        strong_topics: List[Dict[str, Any]] = []

        for cat, scores in topic_scores.items():
            avg = sum(scores) / len(scores)
            count = len(scores)
            if count >= 2:
                if avg < 6.0:
                    persistent_weak.append({"topic": cat, "avg": round(avg, 1), "attempts": count})
                elif avg >= 7.5:
                    strong_topics.append({"topic": cat, "avg": round(avg, 1), "attempts": count})
            else:
                early_signals.append({"topic": cat, "avg": round(avg, 1), "attempts": count})

        return {
            "persistent_weak": persistent_weak,
            "early_signals": early_signals,
            "strong_topics": strong_topics,
            "total_attempts": len(rows)
        }

    async def generate_weekly_report(self, telegram_id: int) -> str:
        """
        Build a compact weekly progress report card based on real persisted data.
        """
        stats = await self.db.get_user_progress_stats(telegram_id)
        topic_analysis = await self.analyze_topic_performance(telegram_id)
        due_revisions = await self.get_due_revision_questions(telegram_id, limit=5)

        today_dt = datetime.now(timezone.utc)
        week_start_dt = today_dt - timedelta(days=7)
        week_str = f"{week_start_dt.strftime('%d %b')} – {today_dt.strftime('%d %b %Y')}"

        total_ans = stats.get("total_answered", 0)
        avg_score = stats.get("avg_overall_score")
        score_text = f"{round(avg_score, 1)} / 10" if avg_score is not None else "No scores yet"

        weak_list = topic_analysis.get("persistent_weak", [])
        weak_str = ", ".join([f"{w['topic']} ({w['avg']}/10)" for w in weak_list]) if weak_list else "None identified (Great job!)"

        strong_list = topic_analysis.get("strong_topics", [])
        strong_str = ", ".join([f"{s['topic']} ({s['avg']}/10)" for s in strong_list]) if strong_list else "Building baseline"

        early_list = topic_analysis.get("early_signals", [])
        early_str = ", ".join([e["topic"] for e in early_list]) if early_list else "None"

        due_str = f"{len(due_revisions)} topics due for spaced revision" if due_revisions else "All revisions up to date"

        report = (
            f"📈 *Weekly Placement Progress Report*\n"
            f"📅 *Period:* {week_str}\n\n"
            f"📊 *Summary Overview*:\n"
            f"• Questions Answered: *{total_ans}*\n"
            f"• Average Score: *{score_text}*\n"
            f"• Daily Challenges: *{stats.get('daily_answered', 0)}*\n"
            f"• Mock Interviews: *{stats.get('mocks_completed', 0)}*\n\n"
            f"💪 *Strong Areas*: {strong_str}\n"
            f"⚠️ *Focus Areas (Persistent Gaps)*: {weak_str}\n"
            f"🌱 *Early Signals (Need more practice)*: {early_str}\n"
            f"🔄 *Revision Status*: {due_str}\n\n"
            "🎯 *Recommended Strategy for Next Week*:\n"
            "1. Revise your due concepts using the Daily Challenge.\n"
            "2. Complete at least one Mock Interview session.\n"
            "3. Try '🛡️ Project Defence' to test real-world project explanations."
        )

        # Save in database
        week_start_iso = week_start_dt.strftime("%Y-%m-%d")
        week_end_iso = today_dt.strftime("%Y-%m-%d")
        await self.db.save_weekly_report(
            telegram_id=telegram_id,
            week_start=week_start_iso,
            week_end=week_end_iso,
            report_text=report,
            sent=True
        )

        return report
