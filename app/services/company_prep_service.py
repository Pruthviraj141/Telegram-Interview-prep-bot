"""
CompanyPrepService: Live web research-backed company interview preparation packs.
Coordinates Tavily searches, synthesizes verified requirements and reported interview rounds,
and builds day-by-day tailored study plans and practice questions.
"""
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from groq import Groq

from app.config import Settings
from app.database import Database
from app.prompts import COMPANY_PREP_PLANNER_PROMPT
from app.services.tavily_service import TavilyService, SearchResult

logger = logging.getLogger(__name__)


class CompanyPrepService:
    def __init__(self, db: Database, settings: Settings, tavily: TavilyService):
        self.db = db
        self.settings = settings
        self.tavily = tavily

    async def generate_prep_pack(
        self,
        groq_api_key: str,
        telegram_id: int,
        company_name: str,
        target_role: str,
        experience_level: str = "fresher",
        interview_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Research company via Tavily and synthesize a complete Preparation Pack using Groq.
        """
        query = f"{company_name} {target_role} campus placement interview process questions requirements {experience_level}"

        search_res: SearchResult = await self.tavily.search(
            query=query,
            telegram_id=telegram_id,
            is_company_prep=True
        )

        sources_context = ""
        citations: List[Dict[str, str]] = []
        if search_res.sources:
            sources_context = "Verified Online Search Sources:\n"
            for s in search_res.sources:
                sources_context += f"- [{s.source_id}] {s.title} ({s.url}): {s.snippet}\n"
                citations.append({"title": s.title, "url": s.url})

        today_str = datetime.now(timezone.utc).strftime("%d %b %Y")
        days_remaining_note = f"The candidate's interview is on {interview_date}." if interview_date else "Interview date is in 7 days."

        prompt_content = (
            f"Candidate Target: {company_name}\n"
            f"Role: {target_role} ({experience_level})\n"
            f"{days_remaining_note}\n"
            f"Today's Date: {today_str}\n\n"
            f"{sources_context}\n\n"
            "Generate a structured Company Preparation Pack for this student:\n"
            "1. 🏢 Verified Information & Hiring Process (Rounds, online assessments, technical rounds, HR)\n"
            "2. 🎯 Core Preparation Priorities (Must-know tech stack, DSA topics, core CS)\n"
            "3. 📅 Tailored Day-by-Day Preparation Plan (Realistic for the time remaining)\n"
            "4. ❓ 5 Role-Specific Practice Questions (Label as realistic practice questions, not guaranteed leaks)\n"
            "5. 💡 Crucial Tips for {company_name} Interviews (Company values, common pitfalls)"
        )

        client = Groq(api_key=groq_api_key)
        try:
            resp = client.chat.completions.create(
                model=self.settings.GROQ_MODEL,
                messages=[
                    {"role": "system", "content": COMPANY_PREP_PLANNER_PROMPT},
                    {"role": "user", "content": prompt_content}
                ],
                temperature=0.3,
                max_tokens=1000
            )
            prep_pack_markdown = resp.choices[0].message.content or "Preparation pack generated."

            # Append source citations if available
            if citations:
                prep_pack_markdown += f"\n\n🌐 *Verified Sources & References (Retrieved {today_str})*:\n"
                for c in citations[:4]:
                    prep_pack_markdown += f"• [{c['title']}]({c['url']})\n"

            prep_pack_data = {
                "company_name": company_name,
                "target_role": target_role,
                "experience_level": experience_level,
                "interview_date": interview_date,
                "retrieval_date": today_str,
                "pack_text": prep_pack_markdown,
                "citations": citations
            }

            # Save in SQLite for user
            await self.db.save_company_prep_profile(
                telegram_id=telegram_id,
                company_name=company_name,
                target_role=target_role,
                experience_level=experience_level,
                interview_date=interview_date,
                prep_pack=prep_pack_data
            )

            return prep_pack_data

        except Exception as e:
            logger.error(f"Error generating company prep pack: {e}", exc_info=True)
            fallback_text = (
                f"🏢 *{company_name} — {target_role} Preparation Guide*\n\n"
                f"📅 *Target:* {experience_level.title()} Interview\n\n"
                "🎯 *General Technical Priorities*:\n"
                "• Data Structures: Arrays, HashMaps, Trees, Graphs\n"
                "• Core Subjects: DBMS (SQL & Indexing), OOPs, Operating Systems (Threads & Deadlocks)\n"
                "• Project Deep Dive: Be prepared to explain architecture and challenges\n\n"
                "⚠️ *Note*: Live research synthesis encountered a temporary error. "
                "You can still start a company mock interview using the button below."
            )
            return {
                "company_name": company_name,
                "target_role": target_role,
                "experience_level": experience_level,
                "pack_text": fallback_text,
                "citations": []
            }
