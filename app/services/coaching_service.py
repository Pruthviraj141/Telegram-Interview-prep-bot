"""
CoachingService: Ask the Coach and Teach Me a Topic.
Provides educational concept teaching, practical examples, check-for-understanding questions,
and conditionally integrates Tavily live web research when freshness or current resources matter.
"""
import logging
import re
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from groq import Groq

from app.config import Settings
from app.database import Database
from app.prompts import TUTOR_SYSTEM_PROMPT
from app.services.tavily_service import TavilyService, SearchResult

logger = logging.getLogger(__name__)


def should_trigger_web_search(query: str) -> bool:
    """
    Determines whether a user's query requires live web research:
    - Mentions current/latest/recent/upcoming/2026/hiring/openings
    - Mentions specific company hiring/interview process
    - Requests external learning resources/links
    Stable CS fundamentals (e.g. 'what is polymorphism') return False.
    """
    q = query.lower()
    triggers = [
        "latest", "recent", "current", "upcoming", "2025", "2026", "2027",
        "hiring", "openings", "internship", "placement", "interview experience",
        "resources", "documentation", "release notes", "roadmap", "salary",
        "cut off", "eligibility", "rounds at", "interview at"
    ]
    return any(t in q for t in triggers)


class CoachingService:
    def __init__(self, db: Database, settings: Settings, tavily: TavilyService):
        self.db = db
        self.settings = settings
        self.tavily = tavily

    async def ask_the_coach(
        self,
        groq_api_key: str,
        user_query: str,
        telegram_id: int,
        target_role: Optional[str] = None
    ) -> str:
        """
        Answer a student's technical or placement question.
        Includes live web research with clickable citations when freshness matters.
        """
        needs_search = should_trigger_web_search(user_query)
        sources_context = ""
        retrieval_footer = ""

        if needs_search:
            search_res: SearchResult = await self.tavily.search(
                query=user_query,
                telegram_id=telegram_id,
                is_company_prep=False
            )
            if search_res.sources:
                sources_context = "\n\nRetrieved Web Research Sources (Cite using markdown links):\n"
                for s in search_res.sources:
                    sources_context += f"- [{s.source_id}] {s.title} ({s.url}): {s.snippet}\n"

                today_str = datetime.now(timezone.utc).strftime("%d %b %Y")
                retrieval_footer = f"\n\n🌐 _Sources verified via web research on {today_str}_:\n"
                for s in search_res.sources[:3]:
                    retrieval_footer += f"• [{s.title}]({s.url})\n"

        role_hint = f" The student is preparing for a '{target_role}' role." if target_role else ""

        user_content = (
            f"Student Query: {user_query}{role_hint}\n"
            f"{sources_context}\n"
            "Provide a clear, engaging explanation structured as:\n"
            "1. Concept in simple English\n"
            "2. Why it matters & How it works\n"
            "3. Practical code or SQL snippet (if technical)\n"
            "4. Common misconception or mistake\n"
            "5. How to explain it confidently in an interview\n"
            "6. One targeted check-for-understanding practice question at the end."
        )

        # Multi-turn memory: load recent conversational turns for cross-questions/follow-ups
        coaching_sess = await self.db.get_coaching_session(telegram_id)
        history: List[Dict[str, Any]] = (
            coaching_sess.get("history", []) if coaching_sess and coaching_sess.get("mode") == "ask_coach" else []
        )

        messages = [{"role": "system", "content": TUTOR_SYSTEM_PROMPT}]
        for turn in history[-4:]:
            messages.append({"role": "user", "content": turn.get("q", "")})
            messages.append({"role": "assistant", "content": turn.get("a", "")})
        messages.append({"role": "user", "content": user_content})

        client = Groq(api_key=groq_api_key)
        try:
            resp = client.chat.completions.create(
                model=self.settings.GROQ_MODEL,
                messages=messages,
                temperature=0.4,
                max_tokens=900
            )
            raw_answer = resp.choices[0].message.content or "I couldn't generate an explanation right now."
            final_response = raw_answer + retrieval_footer

            # Update conversation memory
            history.append({"q": user_query, "a": raw_answer})
            await self.db.save_coaching_session(
                telegram_id=telegram_id,
                mode="ask_coach",
                topic_or_query=user_query[:80],
                step=len(history),
                history=history[-6:]
            )

            return final_response
        except Exception as e:
            logger.error(f"Error calling Groq for Ask the Coach: {e}", exc_info=True)
            return (
                "⚠️ I encountered an issue generating your explanation with Groq. "
                "Please verify your Groq API key or try again in a moment."
            )

    async def start_topic_lesson(
        self,
        groq_api_key: str,
        topic: str,
        telegram_id: int
    ) -> str:
        """
        Begin an interactive teaching lesson on a specific topic.
        Stores session state so user can answer the check-for-understanding question.
        """
        user_content = (
            f"Teach the engineering topic '{topic}' to a college placement candidate.\n"
            "1. Explain it from first principles with a simple analogy.\n"
            "2. Give a practical code/SQL example.\n"
            "3. State how to present it in an interview.\n"
            "4. End with 'Check of Understanding (Question 1):' followed by one specific question."
        )

        client = Groq(api_key=groq_api_key)
        try:
            resp = client.chat.completions.create(
                model=self.settings.GROQ_MODEL,
                messages=[
                    {"role": "system", "content": TUTOR_SYSTEM_PROMPT},
                    {"role": "user", "content": user_content}
                ],
                temperature=0.3,
                max_tokens=850
            )
            lesson_text = resp.choices[0].message.content or f"Lesson on {topic}"

            # Save coaching session
            await self.db.save_coaching_session(
                telegram_id=telegram_id,
                mode="teach_topic",
                topic_or_query=topic,
                step=1,
                history=[{"role": "assistant", "content": lesson_text}]
            )
            return lesson_text
        except Exception as e:
            logger.error(f"Error in start_topic_lesson: {e}", exc_info=True)
            return f"⚠️ Unable to start lesson on '{topic}'. Please check your Groq API key."

    async def advance_topic_lesson(
        self,
        groq_api_key: str,
        student_answer: str,
        telegram_id: int
    ) -> str:
        """
        Evaluate student's answer to the check-for-understanding question and wrap up or give next tip.
        """
        session = await self.db.get_coaching_session(telegram_id)
        if not session or session.get("mode") != "teach_topic":
            return "No active teaching lesson found. Tap '💡 Teach Me a Topic' from the menu to start one!"

        topic = session.get("topic_or_query", "Engineering Topic")
        step = session.get("step", 1)
        history = session.get("history", [])

        user_content = (
            f"Topic: {topic}\n"
            f"Student Answer to Question {step}: {student_answer}\n\n"
            "Provide brief feedback on their answer:\n"
            "- What they got right\n"
            "- Any missing nuances\n"
            "- The ideal interview-ready answer\n\n"
            "If this was Question 1, offer a short wrap-up summary and an encouraging next step."
        )

        client = Groq(api_key=groq_api_key)
        try:
            resp = client.chat.completions.create(
                model=self.settings.GROQ_MODEL,
                messages=[
                    {"role": "system", "content": TUTOR_SYSTEM_PROMPT},
                    {"role": "user", "content": user_content}
                ],
                temperature=0.3,
                max_tokens=700
            )
            feedback = resp.choices[0].message.content or "Good effort!"

            # Update history and clear active lesson so user returns to normal state
            await self.db.clear_coaching_session(telegram_id)

            return (
                f"🎯 *Feedback on your answer ({topic})*:\n\n"
                f"{feedback}\n\n"
                "🎉 *Lesson Completed!* Tap another menu option to continue practicing."
            )
        except Exception as e:
            logger.error(f"Error in advance_topic_lesson: {e}", exc_info=True)
            return "⚠️ Error evaluating your answer. Please try again."
