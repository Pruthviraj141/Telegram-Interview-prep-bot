"""
Question bank loader, schema validator, and repository.
Loads from data/question_bank.json and supports idempotent seeding and filtering.
"""
import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

VALID_CATEGORIES = {
    "DSA": "dsa",
    "DBMS / SQL": "dbms",
    "OOP / Java": "oop",
    "Operating Systems": "os",
    "Computer Networks": "networks",
    "AI / ML": "ai",
    "Resume / Projects": "resume_projects",
    "HR / Aptitude": "hr",
    "Web / Backend Development": "web_backend"
}

VALID_SLUGS = set(VALID_CATEGORIES.values())
SLUG_TO_CATEGORY = {v: k for k, v in VALID_CATEGORIES.items()}
VALID_DIFFICULTIES = {"Easy", "Medium", "Hard"}


class QuestionBankError(Exception):
    """Raised when question bank JSON fails schema validation."""
    pass


class QuestionBank:
    def __init__(self, json_path: str = "data/question_bank.json"):
        self.json_path = Path(json_path)
        self.questions: List[Dict[str, Any]] = []
        self._by_id: Dict[str, Dict[str, Any]] = {}
        self._by_topic: Dict[str, List[Dict[str, Any]]] = {}

    def load_and_validate(self) -> None:
        """
        Load and strictly validate the question bank JSON.
        Fails fast if duplicate IDs, invalid topics, missing answers, or invalid difficulty exist.
        """
        if not self.json_path.exists():
            raise QuestionBankError(f"Question bank file not found at: {self.json_path}")

        try:
            with open(self.json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            raise QuestionBankError(f"Failed to parse question bank JSON: {e}") from e

        if not isinstance(data, list) or len(data) == 0:
            raise QuestionBankError("Question bank must be a non-empty list of questions.")

        seen_ids = set()
        loaded = []
        by_id = {}
        by_topic = {slug: [] for slug in VALID_SLUGS}

        for idx, item in enumerate(data):
            if not isinstance(item, dict):
                raise QuestionBankError(f"Question at index {idx} must be a dictionary.")

            q_id = str(item.get("id", "")).strip()
            if not q_id:
                raise QuestionBankError(f"Question at index {idx} is missing an 'id'.")
            if q_id in seen_ids:
                raise QuestionBankError(f"Duplicate question ID '{q_id}' detected at index {idx}.")
            seen_ids.add(q_id)

            topic_slug = str(item.get("topic_slug", "")).strip()
            if topic_slug not in VALID_SLUGS:
                raise QuestionBankError(f"Invalid topic_slug '{topic_slug}' in question '{q_id}'. Allowed: {VALID_SLUGS}")

            difficulty = str(item.get("difficulty", "")).strip()
            if difficulty not in VALID_DIFFICULTIES:
                raise QuestionBankError(f"Invalid difficulty '{difficulty}' in question '{q_id}'. Allowed: {VALID_DIFFICULTIES}")

            question_text = str(item.get("question", "")).strip()
            if not question_text:
                raise QuestionBankError(f"Question text missing in '{q_id}'.")

            model_answer = str(item.get("model_answer", "")).strip()
            if not model_answer:
                raise QuestionBankError(f"Model answer missing in '{q_id}'.")

            # Cleaned question record
            record = {
                "id": q_id,
                "topic_slug": topic_slug,
                "category": item.get("category", SLUG_TO_CATEGORY.get(topic_slug, topic_slug)),
                "subtopic": str(item.get("subtopic", "")).strip(),
                "difficulty": difficulty,
                "question": question_text,
                "tags": item.get("tags", []),
                "hint": str(item.get("hint", "")).strip(),
                "expected_concepts": item.get("expected_concepts", []),
                "model_answer": model_answer
            }

            loaded.append(record)
            by_id[q_id] = record
            by_topic[topic_slug].append(record)

        self.questions = loaded
        self._by_id = by_id
        self._by_topic = by_topic
        logger.info(f"Loaded and validated {len(self.questions)} questions across {len(self._by_topic)} categories.")

    def get_by_id(self, question_id: str) -> Optional[Dict[str, Any]]:
        return self._by_id.get(question_id)

    def get_questions_for_topic(self, topic_slug: str) -> List[Dict[str, Any]]:
        return self._by_topic.get(topic_slug, [])

    def get_questions_for_topics(self, topic_slugs: List[str]) -> List[Dict[str, Any]]:
        result = []
        for slug in topic_slugs:
            result.extend(self._by_topic.get(slug, []))
        return result
