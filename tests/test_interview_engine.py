import pytest
from app.services.interview_prompts import (
    SYSTEM_PROMPT_PROFESSIONAL_INTERVIEWER,
    build_question_generation_prompt,
    validate_interview_question_quality
)
from app.services.web_interview_service import (
    RoleAwareTaxonomyManager,
    build_interview_blueprint,
    get_next_question_for_turn,
    sanitize_turn_for_client
)
from app.question_bank import QuestionBank

def test_role_aware_taxonomy_manager_loading():
    mgr = RoleAwareTaxonomyManager()
    
    # Verify categories exist and questions are loaded
    assert len(mgr.get_all_questions()) >= 20
    
    sde_q = mgr.get_questions_by_role("Software Development Engineer")
    assert len(sde_q) >= 5
    
    aiml_q = mgr.get_questions_by_role("AI/ML Engineer")
    assert len(aiml_q) >= 4
    
    ds_q = mgr.get_questions_by_role("Data Scientist")
    assert len(ds_q) >= 3
    
    devops_q = mgr.get_questions_by_role("DevOps / Cloud Engineer")
    assert len(devops_q) >= 3
    
    frontend_q = mgr.get_questions_by_role("Frontend Engineer")
    assert len(frontend_q) >= 2


def test_blueprint_phases_and_calibration():
    # Phase 1: Foundations
    bp_p1 = build_interview_blueprint(
        role="Software Engineer",
        seniority="Fresher",
        duration_mode="quick",
        interviewer_style="balanced",
        phase="phase_1"
    )
    assert bp_p1["target_questions"] == 3
    assert bp_p1["phase"] == "foundations"
    assert bp_p1["base_difficulty"] == "Easy-Medium"

    # Phase 2: Applied Problem-Solving
    bp_p2 = build_interview_blueprint(
        role="Backend Engineer",
        seniority="Mid-Level",
        duration_mode="standard",
        interviewer_style="technical",
        phase="phase_2"
    )
    assert bp_p2["target_questions"] == 4
    assert bp_p2["phase"] == "applied_problem_solving"
    assert bp_p2["base_difficulty"] == "Medium"

    # Phase 3: Project Depth
    bp_p3 = build_interview_blueprint(
        role="Senior SDE",
        seniority="Senior",
        duration_mode="standard",
        interviewer_style="project_defence",
        phase="phase_3"
    )
    assert bp_p3["target_questions"] == 4
    assert bp_p3["phase"] == "project_depth"
    assert bp_p3["base_difficulty"] == "Hard"

    # Start Drill
    bp_drill = build_interview_blueprint(
        role="AI/ML Engineer",
        seniority="Fresher",
        duration_mode="drill",
        interviewer_style="technical",
        phase="start_drill",
        drill_skill="RAG Quality"
    )
    assert bp_drill["target_questions"] == 2
    assert bp_drill["phase"] == "start_drill"
    assert bp_drill["drill_skill"] == "RAG Quality"


def test_question_quality_gate_validation():
    valid_q = {
        "question_text": "How do you handle schema migrations with zero-downtime on a high-throughput PostgreSQL table?",
        "question_format": "practical_design",
        "category": "Databases & Architecture",
        "difficulty": "Hard",
        "rubric": {
            "score_1": "Does not know migrations lock tables.",
            "score_3": "Mentions adding columns as nullable, but omits backfilling lock trade-offs.",
            "score_5": "Details expand-contract pattern, safe constraints (NOT VALID then VALIDATE), and batch updates.",
            "expected_concepts": ["Expand-contract", "Lock timeout", "NOT VALID"],
            "reference_answer": "Use expand-contract with asynchronous batch backfill."
        }
    }
    is_valid, msg = validate_interview_question_quality(valid_q)
    assert is_valid is True
    assert msg == "Valid"

    # Test invalid: question too short
    invalid_short = dict(valid_q)
    invalid_short["question_text"] = "Explain indexes."
    is_valid, msg = validate_interview_question_quality(invalid_short)
    assert is_valid is False
    assert "too brief" in msg

    # Test invalid: missing rubric scores
    invalid_rubric = dict(valid_q)
    invalid_rubric["rubric"] = {"score_1": "Poor", "score_5": "Great"}
    is_valid, msg = validate_interview_question_quality(invalid_rubric)
    assert is_valid is False
    assert "score_3" in msg


def test_realistic_mode_client_sanitization():
    raw_turn = {
        "turn_index": 0,
        "question_text": "Implement sliding window maximum in O(n) time.",
        "category": "Data Structures & Algorithms",
        "difficulty": "Medium",
        "format": "problem_solving",
        "rubric": {
            "score_1": "O(N*k) brute force",
            "score_3": "Max heap approach O(N log k)",
            "score_5": "Monotonic deque O(N)",
            "expected_concepts": ["Monotonic deque"],
            "reference_answer": "Use monotonic decreasing deque storing indices."
        }
    }

    # In realistic simulation mode (phase 4), candidate MUST NOT receive internal rubrics/answers
    bp_realistic = {"phase": "realistic_simulation"}
    sanitized = sanitize_turn_for_client(raw_turn, bp_realistic)
    assert "rubric" not in sanitized
    assert sanitized["question_text"] == raw_turn["question_text"]
    assert sanitized["category"] == raw_turn["category"]

    # In non-realistic modes (e.g., drill/foundations), candidate may view rubrics for learning
    bp_drill = {"phase": "start_drill"}
    unsanitized = sanitize_turn_for_client(raw_turn, bp_drill)
    assert "rubric" in unsanitized


def test_question_selection_fallback_without_groq_key():
    qb = QuestionBank("data/question_bank.json")
    qb.load_and_validate()
    
    bp = build_interview_blueprint(
        role="AI/ML Engineer",
        seniority="Fresher",
        duration_mode="standard",
        interviewer_style="balanced",
        phase="phase_2"
    )

    # Without Groq key, it must safely pick from the rich taxonomy
    turn_q = get_next_question_for_turn(
        qb=qb,
        blueprint=bp,
        turn_index=0,
        previous_turns=[],
        api_key=None
    )
    assert turn_q["question"]
    assert turn_q["category"]
    assert "rubric" in turn_q


def test_aiml_track_blueprint_and_taxonomy_depth():
    mgr = RoleAwareTaxonomyManager()
    aiml_questions = mgr.get_questions_by_role("ai_ml_engineer")
    assert len(aiml_questions) >= 10

    # Ensure key 2026/2027 topics exist in questions
    all_texts = " ".join(q["question"] + " " + q.get("short_title", "") for q in aiml_questions)
    assert "leakage" in all_texts.lower()
    assert "rag" in all_texts.lower()
    assert "agent" in all_texts.lower()
    assert "langgraph" in all_texts.lower()
    assert "ttft" in all_texts.lower() or "latency" in all_texts.lower()

    # Verify blueprint generation with style="aiml"
    bp_aiml = build_interview_blueprint(
        role="AI/ML Engineer",
        seniority="Fresher",
        duration_mode="standard",
        interviewer_style="aiml"
    )
    assert "ML Foundations & Data Leakage" in bp_aiml["categories"]
    assert "Agentic AI & Workflow Orchestration" in bp_aiml["categories"]
    assert "LangGraph, State Checkpointing & Tools" in bp_aiml["categories"]


def test_generate_interview_debrief_rich_marking():
    from app.services.web_interview_service import generate_interview_debrief

    session = {
        "id": "sess_aiml_test",
        "status": "completed",
        "blueprint": {"target_questions": 2, "target_role": "AI/ML Engineer"}
    }

    turns = [
        {
            "turn_index": 0,
            "question_text": "What is data leakage and how do you prevent it in Scikit-Learn pipelines?",
            "category": "ML Foundations & Data Leakage",
            "evaluation_status": "completed",
            "audio_url": "https://storage.example.com/audio1.webm",
            "evaluation": {
                "overall_score": 4.2,
                "technical_correctness": 4.5,
                "problem_solving": 4.0,
                "reasoning_and_tradeoffs": 4.0,
                "implementation_quality": 4.5,
                "project_ownership": None,
                "structure_and_clarity": 4.0,
                "communication_delivery": 4.0,
                "evidence_quote": "Fit the scaler solely on the training folds inside a Pipeline.",
                "demonstrated_points": ["Pipeline encapsulation", "Hold-out set separation"],
                "misconceptions": [],
                "missing_points": ["PSI or KS-test distribution drift monitoring in production"],
                "missing_details_and_why": [
                    {
                        "detail": "Production drift metrics (PSI)",
                        "why_it_matters": "Detects real-world customer feature shifts early."
                    }
                ],
                "delivery_and_language": {
                    "filler_words_observed": "Minimal (1 'um')",
                    "sentence_construction_feedback": "Concise and well-structured.",
                    "grammar_and_spelling_corrections": "Clean syntax."
                },
                "side_by_side": {
                    "original_weakness": "Omitted live production monitoring strategy.",
                    "stronger_answer": "Use Scikit-learn Pipeline for transformation, and track KS-test p-values post-deployment.",
                    "what_changed_and_why": "Adds the operational monitoring lifecycle expected in senior technical rounds."
                },
                "stronger_answer": "Use Scikit-learn Pipeline for transformation, and track KS-test p-values post-deployment.",
                "why_its_stronger": "Adds the operational monitoring lifecycle expected in senior technical rounds."
            }
        },
        {
            "turn_index": 1,
            "question_text": "How do you architect an autonomous agent loop and prevent infinite tool loops?",
            "category": "Agentic AI & Workflow Orchestration",
            "evaluation_status": "completed",
            "audio_url": None,
            "evaluation": {
                "overall_score": 3.5,
                "technical_correctness": 3.5,
                "problem_solving": 3.5,
                "reasoning_and_tradeoffs": 3.0,
                "implementation_quality": 3.5,
                "project_ownership": None,
                "structure_and_clarity": 3.5,
                "communication_delivery": None,  # Typed answer
                "evidence_quote": "I set a maximum iterations counter of 10.",
                "demonstrated_points": ["Step counter budget"],
                "misconceptions": ["Assumed the LLM will never repeat an identical invalid argument if asked nicely."],
                "missing_points": ["Action signature hashing and idempotency tokens for tools with side-effects"],
                "missing_details_and_why": [
                    {
                        "detail": "Action signature cycle detection",
                        "why_it_matters": "Guarantees deterministic termination when tool outputs are static."
                    }
                ],
                "delivery_and_language": {
                    "filler_words_observed": "N/A (Typed answer)",
                    "sentence_construction_feedback": "Short and direct.",
                    "grammar_and_spelling_corrections": "Spelling: 'asynchronus' -> 'asynchronous'"
                },
                "side_by_side": {
                    "original_weakness": "Relies solely on prompt instruction rather than deterministic software guardrails.",
                    "stronger_answer": "Pair step counters with tool call fingerprint hashing and idempotency keys on write endpoints.",
                    "what_changed_and_why": "Demonstrates defense-in-depth engineering practices."
                },
                "stronger_answer": "Pair step counters with tool call fingerprint hashing and idempotency keys on write endpoints.",
                "why_its_stronger": "Demonstrates defense-in-depth engineering practices."
            }
        }
    ]

    debrief = generate_interview_debrief(session, turns)

    assert debrief["is_partial"] is False
    assert debrief["overall_score"] == 3.9
    assert len(debrief["turns_summary"]) == 2

    # Check multi-dimensional skills
    skills = debrief["skill_breakdown"]
    assert skills["technical_correctness"] == 4.0
    assert skills["problem_solving"] == 3.8
    assert skills["implementation_quality"] == 4.0
    assert skills["communication_delivery"] == 4.0

    # Check misconceptions and next steps
    assert len(debrief["misconceptions_summary"]) >= 1
    assert "Assumed the LLM will never repeat" in debrief["misconceptions_summary"][0]
    assert len(debrief["next_steps"]) >= 2

    # Verify per-turn enriched payload
    t0 = debrief["turns_summary"][0]
    assert t0["side_by_side"]["what_changed_and_why"]
    assert t0["delivery_and_language"]["filler_words_observed"] == "Minimal (1 'um')"
    assert len(t0["missing_details_and_why"]) == 1

