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
