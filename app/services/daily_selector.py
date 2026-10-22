"""
Daily question selection service.
Selection strategy:
- 70% selected-topic relevance.
- 20% resume-derived relevance (mapped to question bank tags/topics).
- 10% topic discovery.

Does not call Groq or external APIs; uses local curated question bank,
persistent delivery history, repeat avoidance, and fair cycling.
"""
import random
import logging
from typing import Optional, Dict, Any, List
from app.question_bank import QuestionBank, VALID_SLUGS
from app.database import Database

logger = logging.getLogger(__name__)

# Mapping from common resume skill keywords to topic slugs
RESUME_SKILL_TOPIC_MAP = {
    "python": ["web_backend", "dsa", "ai"],
    "fastapi": ["web_backend"],
    "flask": ["web_backend"],
    "django": ["web_backend"],
    "go": ["web_backend", "os"],
    "golang": ["web_backend", "os"],
    "java": ["oop", "web_backend"],
    "spring": ["web_backend", "oop"],
    "sql": ["dbms"],
    "postgres": ["dbms"],
    "postgresql": ["dbms"],
    "mysql": ["dbms"],
    "sqlite": ["dbms"],
    "redis": ["web_backend", "dbms"],
    "mongodb": ["dbms"],
    "docker": ["web_backend", "os"],
    "kubernetes": ["web_backend", "os", "networks"],
    "linux": ["os"],
    "operating system": ["os"],
    "machine learning": ["ai"],
    "deep learning": ["ai"],
    "nlp": ["ai"],
    "llm": ["ai"],
    "react": ["web_backend"],
    "typescript": ["web_backend"],
    "javascript": ["web_backend"],
    "algorithms": ["dsa"],
    "data structures": ["dsa"],
    "networking": ["networks"],
    "tcp": ["networks"],
    "http": ["networks", "web_backend"],
    "microservices": ["web_backend", "resume_projects"],
    "architecture": ["resume_projects", "web_backend"]
}


class DailyQuestionSelector:
    def __init__(self, qb: QuestionBank, db: Database):
        self.qb = qb
        self.db = db

    async def select_daily_question(self, telegram_id: int) -> Optional[Dict[str, Any]]:
        """
        Select one daily question for an enabled onboarded user.
        Prioritizes due spaced-repetition revisions first, then falls back to 70/20/10 distribution.
        Never calls external LLMs.
        """
        # 0. Priority: Due spaced revisions for weak or due concepts
        due_revisions = await self.db.get_due_revisions(telegram_id, limit=3)
        if due_revisions:
            for rev in due_revisions:
                q_id = rev.get("question_id")
                if q_id:
                    q = self.qb.get_by_id(q_id)
                    if q:
                        return q
                concept = rev.get("concept_or_topic", "")
                if concept:
                    matching = [q for q in self.qb.questions if q.get("category", "").lower() == concept.lower()]
                    if matching:
                        return random.choice(matching)

        # 1. Fetch user selected topics
        selected_topics = await self.db.get_user_topics(telegram_id)
        if not selected_topics:
            selected_topics = ["dsa", "dbms", "web_backend"]

        # 2. Derive resume topics if available
        resume_topics = await self._get_resume_derived_topics(telegram_id)

        # 3. Discovery topics (all topics not currently selected by user)
        discovery_topics = [s for s in VALID_SLUGS if s not in selected_topics]
        if not discovery_topics:
            discovery_topics = list(VALID_SLUGS)

        # 4. Roll 70% / 20% / 10% strategy
        roll = random.random()
        chosen_slugs = []

        if roll < 0.70:
            chosen_slugs = selected_topics
        elif roll < 0.90:
            chosen_slugs = resume_topics if resume_topics else selected_topics
        else:
            chosen_slugs = discovery_topics

        # 5. Get candidate questions for the chosen category group
        candidate_questions = self.qb.get_questions_for_topics(chosen_slugs)
        if not candidate_questions:
            # Fallback across all selected topics, then full bank
            candidate_questions = self.qb.get_questions_for_topics(selected_topics)
            if not candidate_questions:
                candidate_questions = list(self.qb.questions)

        if not candidate_questions:
            return None

        # 6. Check persistent delivery history to avoid repeats
        delivered_ids = await self.db.get_delivered_question_ids(telegram_id, limit=60)
        delivered_set = set(delivered_ids)

        # Questions not delivered recently
        unseen = [q for q in candidate_questions if q["id"] not in delivered_set]

        if unseen:
            return random.choice(unseen)

        # If all candidates delivered, select least recently delivered (or random if tied)
        # delivered_ids is ordered DESC by id (most recent first)
        delivered_order_map = {q_id: idx for idx, q_id in enumerate(reversed(delivered_ids))}
        # Sort candidate questions by how long ago they were delivered (smallest index = oldest)
        candidate_questions.sort(key=lambda q: delivered_order_map.get(q["id"], -1))
        return candidate_questions[0]

    async def _get_resume_derived_topics(self, telegram_id: int) -> List[str]:
        """Derive relevant topic slugs from cached resume analysis or resume text."""
        resume = await self.db.get_resume(telegram_id)
        if not resume:
            return []

        derived = set()
        text = resume.get("extracted_text", "").lower()

        for keyword, slugs in RESUME_SKILL_TOPIC_MAP.items():
            if keyword in text:
                derived.update(slugs)

        return list(derived)
