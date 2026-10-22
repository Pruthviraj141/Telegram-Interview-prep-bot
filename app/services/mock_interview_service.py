"""
Mock Interview Service.
Handles question set assembly for mock interview modes and calculates final comprehensive reports.
"""
import random
import logging
from typing import List, Dict, Any, Optional
from app.question_bank import QuestionBank, VALID_SLUGS

logger = logging.getLogger(__name__)


def prepare_mock_interview_questions(
    qb: QuestionBank,
    mode: str,
    count: int = 5,
    user_topics: Optional[List[str]] = None,
    resume_topics: Optional[List[str]] = None
) -> List[str]:
    """
    Selects `count` unique questions from QuestionBank based on interview mode:
    - 'topics': drawn from user's selected topics
    - 'resume': drawn from resume-recommended topics and resume_projects category
    - 'mixed': balanced mix across technical, behavioral/HR, and system topics
    """
    count = max(1, min(count, 10))
    selected_pool: List[Dict[str, Any]] = []

    if mode == "topics":
        topics = user_topics or ["dsa", "dbms", "web_backend"]
        valid_user_topics = [t for t in topics if t in VALID_SLUGS]
        selected_pool = qb.get_questions_for_topics(valid_user_topics or ["dsa", "dbms", "web_backend"])

    elif mode == "resume":
        # Include resume_projects + any recommended topics
        r_topics = set(resume_topics or [])
        r_topics.add("resume_projects")
        selected_pool = qb.get_questions_for_topics(list(r_topics))

    elif mode == "mixed":
        # Balanced sampling: 60% core technical, 20% system/web, 20% HR/behavioral
        dsa_dbms = qb.get_questions_for_topics(["dsa", "dbms", "oop", "os", "networks"])
        web_ai = qb.get_questions_for_topics(["web_backend", "ai", "resume_projects"])
        hr = qb.get_questions_for_topics(["hr"])

        random.shuffle(dsa_dbms)
        random.shuffle(web_ai)
        random.shuffle(hr)

        combined = []
        if dsa_dbms:
            combined.extend(dsa_dbms[:max(1, int(count * 0.6))])
        if hr:
            combined.extend(hr[:max(1, int(count * 0.2))])
        if web_ai:
            combined.extend(web_ai[:count - len(combined)])

        selected_pool = combined

    elif mode == "company":
        # Company mode: core campus technical topics (DSA, DBMS, OOP, OS, Backend) + HR
        core = qb.get_questions_for_topics(["dsa", "dbms", "oop", "os", "web_backend"])
        hr = qb.get_questions_for_topics(["hr"])
        random.shuffle(core)
        random.shuffle(hr)
        selected_pool = core[:max(1, count - 1)] + hr[:1]

    # Fallback to all questions if pool is smaller than desired count
    if len(selected_pool) < count:
        all_qs = list(qb.questions)
        random.shuffle(all_qs)
        existing_ids = {q["id"] for q in selected_pool}
        for q in all_qs:
            if q["id"] not in existing_ids:
                selected_pool.append(q)
                if len(selected_pool) >= count:
                    break

    # Pick unique questions
    chosen = random.sample(selected_pool, min(count, len(selected_pool)))
    return [q["id"] for q in chosen]


def generate_mock_interview_report(
    session: Dict[str, Any],
    evaluations: List[Dict[str, Any]],
    qb: QuestionBank
) -> Dict[str, Any]:
    """
    Computes final mock interview report strictly from completed evaluation records.
    Never invents unrecorded evaluations or scores.
    """
    total_answered = len(evaluations)
    if total_answered == 0:
        return {
            "session_id": session.get("id"),
            "mode": session.get("mode"),
            "total_questions": session.get("total_questions", 0),
            "answered_count": 0,
            "overall_coaching_score": 0.0,
            "message": "No questions were completed during this session.",
            "per_question_feedback": [],
            "strongest_concepts": [],
            "knowledge_gaps": [],
            "communication_tips": [],
            "revision_plan": ["Complete a mock interview to get a tailored revision plan."],
            "next_practice_topics": ["dsa", "dbms", "web_backend"]
        }

    overall_scores = [e.get("overall_score") or 0.0 for e in evaluations]
    tech_scores = [e.get("technical_score") or 0.0 for e in evaluations]
    comm_scores = [e.get("communication_score") or 0.0 for e in evaluations]

    avg_overall = round(sum(overall_scores) / total_answered, 1)
    avg_tech = round(sum(tech_scores) / total_answered, 1)
    avg_comm = round(sum(comm_scores) / total_answered, 1)

    strong_concepts = []
    knowledge_gaps = []
    comm_tips = []
    per_q = []
    weak_topic_slugs = set()

    for idx, e in enumerate(evaluations, 1):
        q_id = e.get("question_id")
        q_obj = qb.get_by_id(q_id) if q_id else None
        q_text = q_obj.get("question", "Question") if q_obj else "Question"
        q_topic = q_obj.get("category", "General") if q_obj else "General"
        slug = q_obj.get("topic_slug", "dsa") if q_obj else "dsa"

        score = e.get("overall_score") or 0.0
        summary = e.get("summary") or "Answer reviewed."
        well = e.get("what_went_well") or ""
        missed = e.get("missed_concepts") or ""
        grammar = e.get("grammar_feedback") or ""

        if score >= 7.5 and well:
            strong_concepts.append(f"{q_topic}: {well[:120]}")
        elif score < 6.0:
            weak_topic_slugs.add(slug)
            if missed:
                knowledge_gaps.append(f"{q_topic}: {missed[:120]}")

        if grammar and grammar.lower() != "none" and len(comm_tips) < 2:
            comm_tips.append(grammar[:150])

        per_q.append({
            "order": idx,
            "question_id": q_id,
            "topic": q_topic,
            "question_text": q_text,
            "score": score,
            "summary": summary,
            "missed_concepts": missed,
            "what_went_well": well
        })

    # Recommended revision plan
    revision_plan = []
    if knowledge_gaps:
        revision_plan.append("Deepen your understanding of missed edge cases and principles highlighted above.")
    if avg_comm < 7.0:
        revision_plan.append("Practice structured communication (e.g. state solution, complexity, and trade-offs upfront).")
    if not revision_plan:
        revision_plan.append("Maintain consistency with daily questions and explore higher difficulty problems.")

    next_topics = list(weak_topic_slugs) if weak_topic_slugs else ["dsa", "dbms", "web_backend"]

    return {
        "session_id": session.get("id"),
        "mode": session.get("mode"),
        "total_questions": session.get("total_questions", 0),
        "answered_count": total_answered,
        "overall_coaching_score": avg_overall,
        "technical_score": avg_tech,
        "communication_score": avg_comm,
        "strongest_concepts": strong_concepts[:3],
        "knowledge_gaps": knowledge_gaps[:3],
        "communication_tips": comm_tips[:2],
        "revision_plan": revision_plan[:3],
        "next_practice_topics": next_topics[:3],
        "per_question_feedback": per_q
    }
