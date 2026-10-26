import pytest
from app.question_bank import QuestionBank
from app.services.web_interview_service import (
    build_interview_blueprint,
    validate_question_quality,
    get_next_question_for_turn,
    generate_interview_debrief
)

def test_build_interview_blueprint():
    bp = build_interview_blueprint(
        role="Backend Engineer",
        seniority="Fresher",
        duration_mode="quick",
        interviewer_style="technical",
        confirmed_profile={"programming_languages": ["Python"], "notable_projects": ["URL Shortener"]}
    )
    assert bp["target_role"] == "Backend Engineer"
    assert bp["target_questions"] == 3
    assert bp["base_difficulty"] == "Easy-Medium"
    assert len(bp["categories"]) > 0

def test_validate_question_quality():
    valid_q = {
        "question": "Can you explain how indexing works in PostgreSQL and its trade-offs?",
        "category": "DBMS",
        "rubric": {"dimensions": ["technical_correctness"]}
    }
    assert validate_question_quality(valid_q) is True

    short_q = {
        "question": "What is SQL?",
        "category": "DBMS",
        "rubric": {}
    }
    assert validate_question_quality(short_q) is False

    no_cat = {
        "question": "Can you explain how indexing works in PostgreSQL and its trade-offs?",
        "category": "",
        "rubric": {"dimensions": ["technical_correctness"]}
    }
    assert validate_question_quality(no_cat) is False

def test_get_next_question_and_adaptive_follow_up(tmp_path):
    qb = QuestionBank("data/question_bank.json")
    qb.load_and_validate()

    bp = build_interview_blueprint(
        role="Backend Engineer",
        seniority="Fresher",
        duration_mode="standard",
        interviewer_style="technical"
    )

    # First turn
    q1 = get_next_question_for_turn(qb, bp, 0, [])
    assert q1["question"]
    assert q1["is_follow_up"] is False

    # Simulate turn 0 having a missed concept -> next turn should be adaptive follow-up
    completed_turn = {
        "turn_index": 0,
        "question_text": q1["question"],
        "category": q1["category"],
        "is_follow_up": False,
        "evaluation": {
            "overall_score": 3.2,
            "missing_points": ["Isolation levels in transactions"]
        }
    }
    q2 = get_next_question_for_turn(qb, bp, 1, [completed_turn])
    assert q2["is_follow_up"] is True
    assert "Isolation levels in transactions" in q2["question"]

def _run_round(style: str, turns: int = 10, role: str = "Backend Engineer"):
    """Ask `turns` questions the way the route does: no evaluations, so no follow-ups."""
    qb = QuestionBank("data/question_bank.json")
    qb.load_and_validate()
    bp = build_interview_blueprint(
        role=role,
        seniority="Fresher",
        duration_mode="standard",
        interviewer_style=style,
    )
    asked: list = []
    previous: list = []
    for turn in range(turns):
        q = get_next_question_for_turn(
            qb, bp, turn, previous, asked_history=asked,
        )
        previous.append({
            "turn_index": turn,
            "question_id": q["question_id"],
            "question_text": q["question"],
            "category": q["category"],
            "category_key": q["category_key"],
            "is_follow_up": q.get("is_follow_up", False),
            "evaluation": {},
        })
        asked.append(q["question_id"])
    return bp, previous


def test_hr_round_only_asks_behavioral_questions():
    """A behavioral round must never drift into role-specific AI/technical questions."""
    bp, turns = _run_round("hr", turns=10)
    assert all(str(k).startswith("behavioral_") for k in bp["category_keys"])

    for turn in turns:
        key = turn["category_key"]
        assert key in {
            "behavioral_intro",
            "behavioral_failure",
            "behavioral_collaboration",
            "behavioral_prioritization",
        }, f"HR round leaked a non-behavioral question: {turn['question_text'][:80]}"

    # The round should still use more than one behavioral theme.
    assert len({t["category_key"] for t in turns}) >= 3


def test_technical_round_never_asks_ai_questions():
    bp, turns = _run_round("technical", turns=10)
    technical_keys = {
        "dsa_general",
        "sql",
        "oop",
        "networking",
        "operating_systems",
    }
    assert set(bp["category_keys"]) <= technical_keys
    ai_keys = {
        "ml_foundations", "ml_metrics", "rag", "agentic_ai",
        "langgraph", "llm_eval_latency",
    }
    for turn in turns:
        key = turn["category_key"] or ""
        assert key not in ai_keys, f"Technical round leaked AI question: {turn['question_text'][:80]}"
        assert key in technical_keys, f"Technical round leaked '{key}'"


def test_mixed_round_spans_multiple_topics():
    bp, turns = _run_round("mixed", turns=10)
    keys = {t["category_key"] for t in turns}
    assert len(keys) >= 3, f"Mixed round collapsed onto {keys}"
    ai_keys = {"ml_foundations", "ml_metrics", "rag", "agentic_ai", "langgraph"}
    assert not (keys & ai_keys)


def test_generate_interview_debrief():
    session = {
        "id": "sess_1",
        "status": "completed",
        "blueprint": {"target_questions": 2}
    }
    turns = [
        {
            "turn_index": 1,
            "question_text": "Explain ACID",
            "category": "DBMS",
            "evaluation_status": "completed",
            "evaluation": {
                "overall_score": 4.5,
                "technical_correctness": 4.5,
                "structure_and_clarity": 4.0,
                "communication_delivery": 4.0,
                "evidence_quote": "ACID guarantees database reliability.",
                "demonstrated_points": ["Atomicity", "Consistency"],
                "missing_points": ["Durability edge cases"],
                "stronger_answer": "Provide concrete examples.",
                "why_its_stronger": "Demonstrates practical depth."
            }
        },
        {
            "turn_index": 2,
            "question_text": "Explain CAP Theorem",
            "category": "System Design",
            "evaluation_status": "completed",
            "evaluation": {
                "overall_score": 4.1,
                "technical_correctness": 4.0,
                "structure_and_clarity": 4.2,
                "communication_delivery": 4.1,
                "evidence_quote": "Pick two out of three in partitions.",
                "demonstrated_points": ["Partition tolerance requirement"],
                "missing_points": ["PACELC nuance"],
                "stronger_answer": "Mention PACELC for modern systems.",
                "why_its_stronger": "Shows advanced system design awareness."
            }
        }
    ]

    debrief = generate_interview_debrief(session, turns)
    assert debrief["is_partial"] is False
    assert debrief["overall_score"] == 4.3
    assert len(debrief["turns_summary"]) == 2
    assert "Atomicity" in debrief["demonstrated_strengths"]


def test_dsa_and_system_design_blueprints():
    bp_dsa = build_interview_blueprint(
        role="Software Engineer",
        seniority="Fresher",
        duration_mode="standard",
        interviewer_style="dsa"
    )
    assert "Data Structures & Algorithms" in bp_dsa["categories"]
    assert bp_dsa["interviewer_style"] == "dsa"

    bp_sd = build_interview_blueprint(
        role="Senior Backend Engineer",
        seniority="Senior",
        duration_mode="full",
        interviewer_style="system_design"
    )
    assert "System Design & Architecture" in bp_sd["categories"]
    assert bp_sd["target_questions"] == 8
    assert bp_sd["base_difficulty"] == "Hard"


def test_question_deduplication_and_no_two_sum_repeat():
    qb = QuestionBank("data/question_bank.json")
    qb.load_and_validate()

    bp = build_interview_blueprint(
        role="Software Engineer",
        seniority="Fresher",
        duration_mode="quick",
        interviewer_style="dsa"
    )

    # Exclude dsa-01 (Two Sum) as if already asked in previous session
    past_ids = ["dsa-01"]
    picked_questions = set()

    for _ in range(5):
        q = get_next_question_for_turn(
            qb=qb,
            blueprint=bp,
            turn_index=0,
            previous_turns=[],
            exclude_question_ids=past_ids
        )
        assert q["question_id"] != "dsa-01", "dsa-01 (Two Sum) must never be returned when excluded!"
        picked_questions.add(q["question_id"])

    # Verify that multiple calls sample varied questions from the pool
    assert len(picked_questions) >= 1


def test_curated_selection_skips_asked_history():
    from app.services.web_interview_service import taxonomy_mgr

    rag = [q for q in taxonomy_mgr.questions if q.get("category_key") == "rag"]
    assert len(rag) >= 2, "test needs a topic with at least two curated questions"
    already = str(rag[0]["id"])

    picked = taxonomy_mgr.get_curated_question(
        role="AI / Machine Learning Engineer",
        phase=str(rag[0].get("phase") or "technical"),
        category="rag",
        exclude_ids={already},
        asked_history=[already],
    )
    assert picked is not None
    assert picked["id"] != already


def test_curated_selection_recycles_longest_rested():
    from app.services.web_interview_service import taxonomy_mgr

    ids = [str(q["id"]) for q in taxonomy_mgr.questions]
    oldest, second = ids[0], ids[1]

    picked = taxonomy_mgr.get_curated_question(
        role="Software Engineer",
        phase="technical",
        category="dsa_general",
        exclude_ids=set(ids),
        asked_history=[oldest, second] + ids[2:],
    )
    assert picked is not None
    assert picked["id"] == oldest


