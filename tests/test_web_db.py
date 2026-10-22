import time
import pytest
from app.database import Database

@pytest.mark.asyncio
async def test_web_db_user_and_credentials(tmp_path):
    db_file = str(tmp_path / "test_web.db")
    db = Database(db_file)
    await db.init_db()

    clerk_id = "user_clerk_12345"
    user = await db.get_or_create_web_user(clerk_id, email="student@example.com", display_name="Student Dev")
    assert user["id"] == clerk_id
    assert user["email"] == "student@example.com"
    assert user["onboarding_state"] == "AWAITING_GROQ_KEY"

    # Save credentials
    await db.save_web_credentials(clerk_id, "encrypted_blob_data", "gsk_...1234")
    creds = await db.get_web_credentials(clerk_id)
    assert creds is not None
    assert creds["encrypted_groq_key"] == "encrypted_blob_data"
    assert creds["key_masked"] == "gsk_...1234"

    # Update onboarding state
    await db.update_web_user(clerk_id, onboarding_state="AWAITING_RESUME")
    updated_user = await db.get_web_user(clerk_id)
    assert updated_user["onboarding_state"] == "AWAITING_RESUME"

    # Resume
    parsed_profile = {
        "primary_role": "Backend Developer",
        "key_skills": ["Python", "FastAPI"],
        "suggested_topics": ["DSA", "DBMS"]
    }
    await db.save_web_resume(
        clerk_id=clerk_id,
        filename="resume.pdf",
        file_type="pdf",
        file_size_bytes=1024,
        extracted_text="Resume text with Python and FastAPI experience.",
        parsed_profile=parsed_profile
    )
    resume = await db.get_web_resume(clerk_id)
    assert resume is not None
    assert resume["filename"] == "resume.pdf"
    assert resume["parsed_profile"]["primary_role"] == "Backend Developer"

    # Interview session
    blueprint = {
        "categories": ["DSA", "DBMS", "HR"],
        "target_questions": 3
    }
    session = await db.create_web_interview_session(
        session_id="session_abc",
        clerk_id=clerk_id,
        mode="practice",
        interviewer_style="technical",
        duration_mode="quick",
        target_role="Backend Developer",
        seniority="Fresher",
        difficulty="Medium",
        blueprint=blueprint
    )
    assert session["id"] == "session_abc"
    assert session["status"] == "in_progress"

    # Create turn
    rubric = {
        "dimensions": ["technical_correctness", "structure"],
        "expected_concepts": ["ACID properties"]
    }
    await db.create_web_interview_turn(
        turn_id="turn_1",
        session_id="session_abc",
        turn_index=0,
        question_id="dbms_01",
        question_text="Explain ACID properties in relational databases.",
        category="DBMS",
        rubric=rubric
    )

    turns = await db.get_web_interview_turns("session_abc")
    assert len(turns) == 1
    assert turns[0]["question_id"] == "dbms_01"

    # Update turn with answer
    eval_result = {
        "technical_score": 4.5,
        "completeness_score": 4.0,
        "overall_score": 4.2,
        "summary": "Solid understanding of ACID.",
        "demonstrated_points": ["Atomicity and Durability explained well"],
        "missing_points": ["Isolation levels"]
    }
    await db.update_web_interview_turn(
        turn_id="turn_1",
        original_transcript="Atomicity means all or nothing.",
        typed_answer=None,
        evaluation=eval_result,
        evaluation_status="completed"
    )

    turn = await db.get_web_interview_turn("turn_1")
    assert turn["evaluation"]["overall_score"] == 4.2
    assert turn["original_transcript"] == "Atomicity means all or nothing."

    # Placement tracker
    await db.create_placement_tracker_item(
        item_id="track_1",
        clerk_id=clerk_id,
        company="TechCorp",
        role="SDE 1",
        status="Applied"
    )
    items = await db.list_placement_tracker_items(clerk_id)
    assert len(items) == 1
    assert items[0]["company"] == "TechCorp"

    # Consent
    await db.log_user_consent(clerk_id, "audio_transient_processing", "127.0.0.1")
    consented = await db.has_user_consented(clerk_id, "audio_transient_processing")
    assert consented is True

    # Link code
    await db.create_telegram_link_code("123456", clerk_id, time.time() + 600)
    linked_clerk = await db.consume_telegram_link_code("123456", 999999, time.time())
    assert linked_clerk == clerk_id
    updated_user = await db.get_web_user(clerk_id)
    assert updated_user["telegram_id"] == 999999

    # Delete history
    await db.delete_web_user_interview_history(clerk_id)
    sessions = await db.list_web_interview_sessions(clerk_id)
    assert len(sessions) == 0
