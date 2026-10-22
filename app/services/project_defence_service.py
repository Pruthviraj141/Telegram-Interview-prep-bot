"""
ProjectDefenceService: Guided interactive project defence interview.
Validates genuine understanding of student resume projects, probes architecture,
trade-offs, testing, and edge cases, and produces a comprehensive defence report.
"""
import json
import logging
from typing import Dict, Any, List, Optional
from groq import Groq

from app.config import Settings
from app.database import Database
from app.prompts import PROJECT_DEFENCE_PROMPT

logger = logging.getLogger(__name__)

PROJECT_DEFENCE_CATEGORIES = [
    "Problem Statement & Objective",
    "Architecture, Data Flow & Tech Decisions",
    "Design Trade-offs & Alternatives",
    "Testing, Edge Cases & Debugging",
    "Scalability, Failure Handling & Personal Contribution"
]


class ProjectDefenceService:
    def __init__(self, db: Database, settings: Settings):
        self.db = db
        self.settings = settings

    async def get_resume_projects(self, telegram_id: int) -> List[str]:
        """Retrieve detected projects from saved resume analysis profile."""
        resume_data = await self.db.get_resume(telegram_id)
        if not resume_data:
            return []

        # Check cached analysis first
        file_hash = resume_data.get("file_hash", "")
        if file_hash:
            cached = await self.db.get_cached_resume_analysis(telegram_id, file_hash)
            if cached and isinstance(cached.get("notable_projects"), list):
                projects = [str(p) for p in cached["notable_projects"] if p]
                if projects:
                    return projects

        # Fallback: load directly from user_resume_analysis
        import aiosqlite
        async with aiosqlite.connect(self.db.db_path) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.execute(
                "SELECT structured_json FROM user_resume_analysis WHERE telegram_id = ?",
                (telegram_id,)
            )
            row = await cursor.fetchone()
            if row and row["structured_json"]:
                try:
                    data = json.loads(row["structured_json"])
                    projects = data.get("notable_projects", [])
                    if isinstance(projects, list):
                        return [str(p) for p in projects if p]
                except Exception as e:
                    logger.warning(f"Could not parse resume analysis json: {e}")
        return []

    async def start_session(
        self,
        telegram_id: int,
        project_name: str,
        project_summary: str
    ) -> Dict[str, Any]:
        """
        Create a new 5-question project defence session and generate Question 1.
        """
        session_id = await self.db.create_project_defence_session(
            telegram_id=telegram_id,
            project_name=project_name,
            project_summary=project_summary,
            total_questions=5
        )

        q1 = (
            f"🎯 *Question 1 of 5 ({PROJECT_DEFENCE_CATEGORIES[0]})*:\n\n"
            f"Tell me about **{project_name}**. What real-world problem does it solve, "
            "who are the primary users, and what was your specific objective when building it?"
        )

        initial_history = [{"q": q1, "a": None, "eval": None}]
        await self.db.update_project_defence_session(
            session_id=session_id,
            current_index=0,
            status="in_progress",
            conversation_history=initial_history
        )

        return {
            "session_id": session_id,
            "project_name": project_name,
            "question_text": q1,
            "index": 1,
            "total": 5
        }

    async def process_answer_and_next(
        self,
        groq_api_key: str,
        telegram_id: int,
        student_answer: str
    ) -> Dict[str, Any]:
        """
        Process the student's answer (text or transcribed voice), update session,
        and generate either the next question or the final report.
        """
        session = await self.db.get_active_project_defence_session(telegram_id)
        if not session:
            return {"status": "no_session", "message": "No active project defence session found."}

        session_id = session["id"]
        project_name = session["project_name"]
        project_summary = session["project_summary"]
        history: List[Dict[str, Any]] = session.get("history", [])
        curr_idx = session.get("current_index", 0)

        # Update last question's answer
        if history and curr_idx < len(history):
            history[curr_idx]["a"] = student_answer

        next_idx = curr_idx + 1

        client = Groq(api_key=groq_api_key)

        # Check if more questions remain
        if next_idx < 5:
            category = PROJECT_DEFENCE_CATEGORIES[next_idx]
            prev_turns = "\n".join([f"Q: {h['q']}\nA: {h.get('a', '')}" for h in history])

            prompt_content = (
                f"Project Name: {project_name}\n"
                f"Project Summary: {project_summary}\n\n"
                f"Interview Conversation so far:\n{prev_turns}\n\n"
                f"Category for Next Question: {category}\n"
                "Formulate Question {next_idx + 1} of 5. Probe their specific architectural decisions, "
                "trade-offs, or testing approaches. If their previous answer was vague or lacked depth, "
                "ask a constructive follow-up about that design choice. Return ONLY the question text."
            )

            try:
                resp = client.chat.completions.create(
                    model=self.settings.GROQ_MODEL,
                    messages=[
                        {"role": "system", "content": PROJECT_DEFENCE_PROMPT},
                        {"role": "user", "content": prompt_content}
                    ],
                    temperature=0.3,
                    max_tokens=250
                )
                next_q_body = resp.choices[0].message.content or "Can you explain your technical implementation in detail?"
            except Exception as e:
                logger.error(f"Error generating next project defence question: {e}")
                next_q_body = f"How did you handle {category.lower()} in {project_name}?"

            next_q_formatted = (
                f"🎯 *Question {next_idx + 1} of 5 ({category})*:\n\n"
                f"{next_q_body.strip()}"
            )

            history.append({"q": next_q_formatted, "a": None, "eval": None})
            await self.db.update_project_defence_session(
                session_id=session_id,
                current_index=next_idx,
                status="in_progress",
                conversation_history=history
            )

            return {
                "status": "in_progress",
                "question_text": next_q_formatted,
                "index": next_idx + 1,
                "total": 5
            }

        else:
            # All 5 questions answered! Generate Final Project Defence Report
            turns_text = "\n".join([f"Q: {h['q']}\nA: {h.get('a', '')}" for h in history])

            report_prompt = (
                f"Project: {project_name}\n"
                f"Summary: {project_summary}\n\n"
                f"Full 5-Question Interview Session:\n{turns_text}\n\n"
                "Generate the Final Project Defence Evaluation Report:\n"
                "1. 🌟 Overall Project Understanding (Demonstrated grasp of architecture and objectives)\n"
                "2. 💪 Technical Strengths (Concepts and details explained clearly)\n"
                "3. 🔍 Explanation Gaps & Unclear Trade-offs (Areas where answers lacked depth or reasoning)\n"
                "4. 🛠️ Testing, Security & Edge-Case Recommendations (Gaps worth brushing up)\n"
                "5. 🗣️ Corrected Interview-Ready Project Pitch (How the student should pitch this project in 60 seconds)\n"
                "6. ❓ 2 Follow-Up Questions to Practice Privately"
            )

            try:
                resp = client.chat.completions.create(
                    model=self.settings.GROQ_MODEL,
                    messages=[
                        {"role": "system", "content": PROJECT_DEFENCE_PROMPT},
                        {"role": "user", "content": report_prompt}
                    ],
                    temperature=0.3,
                    max_tokens=950
                )
                report_markdown = resp.choices[0].message.content or "Project defence completed."
            except Exception as e:
                logger.error(f"Error generating final project defence report: {e}")
                report_markdown = (
                    f"🏆 *Project Defence Completed: {project_name}*\n\n"
                    "You completed all 5 technical defence rounds. Review your architectural choices, "
                    "database schema, and edge cases before your actual interview."
                )

            final_report = {
                "project_name": project_name,
                "report_text": report_markdown
            }

            await self.db.update_project_defence_session(
                session_id=session_id,
                current_index=5,
                status="completed",
                conversation_history=history,
                final_report=final_report
            )

            return {
                "status": "completed",
                "report_text": report_markdown
            }
