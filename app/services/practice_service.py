"""
Practice service managing question selection, repeat-avoidance, and history.
"""
import random
import logging
from typing import Optional, Dict, Any, List
from app.question_bank import QuestionBank
from app.database import Database

logger = logging.getLogger(__name__)


class PracticeService:
    def __init__(self, qb: QuestionBank, db: Database):
        self.qb = qb
        self.db = db

    async def get_next_practice_question(
        self,
        telegram_id: int,
        preferred_topics: Optional[List[str]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Select a random question from the user's selected topics.
        Avoids recently presented questions when possible.
        If all eligible questions were seen, cycles fairly rather than getting stuck.
        """
        # Fetch user's topics if not passed
        if preferred_topics is None:
            preferred_topics = await self.db.get_user_topics(telegram_id)

        if not preferred_topics:
            return None

        # Pick a random topic from user selection
        chosen_topic = random.choice(preferred_topics)
        candidate_questions = self.qb.get_questions_for_topic(chosen_topic)

        if not candidate_questions:
            # Fallback across all selected topics
            candidate_questions = self.qb.get_questions_for_topics(preferred_topics)

        if not candidate_questions:
            return None

        # Fetch recent question history for this user
        recent_ids = await self.db.get_recent_question_ids(telegram_id, limit=30)
        recent_set = set(recent_ids)

        # Filter out recently seen
        unseen = [q for q in candidate_questions if q["id"] not in recent_set]

        if unseen:
            selected = random.choice(unseen)
        else:
            # All seen: cycle fairly by choosing random from candidate set
            selected = random.choice(candidate_questions)

        # Record presentation in history
        await self.db.record_question_presented(telegram_id, selected["id"], selected["topic_slug"])
        return selected

    async def record_revealed_answer(self, telegram_id: int, question_id: str) -> None:
        await self.db.record_answer_revealed(telegram_id, question_id)
