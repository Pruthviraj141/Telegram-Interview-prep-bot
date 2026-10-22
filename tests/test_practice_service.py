import pytest
from app.question_bank import QuestionBank
from app.database import Database
from app.services.practice_service import PracticeService


@pytest.mark.asyncio
async def test_practice_service_respects_user_topics(tmp_path):
    db_file = str(tmp_path / "test_practice.db")
    db = Database(db_file)
    await db.init_db()

    qb = QuestionBank("data/question_bank.json")
    qb.load_and_validate()

    practice = PracticeService(qb, db)
    user_id = 1001
    await db.get_or_create_user(user_id)
    await db.set_user_topics(user_id, ["dsa"])

    # Selected question must belong to "dsa"
    q = await practice.get_next_practice_question(user_id)
    assert q is not None
    assert q["topic_slug"] == "dsa"


@pytest.mark.asyncio
async def test_practice_service_repeat_avoidance_and_fair_cycling(tmp_path):
    db_file = str(tmp_path / "test_practice_repeats.db")
    db = Database(db_file)
    await db.init_db()

    qb = QuestionBank("data/question_bank.json")
    qb.load_and_validate()

    practice = PracticeService(qb, db)
    user_id = 1002
    await db.get_or_create_user(user_id)
    await db.set_user_topics(user_id, ["os"])

    total_os = len(qb.get_questions_for_topic("os"))
    presented_ids = set()

    # Draw questions: first N questions should avoid repeats
    for _ in range(total_os):
        q = await practice.get_next_practice_question(user_id, preferred_topics=["os"])
        assert q["id"] not in presented_ids
        presented_ids.add(q["id"])

    # Next draw after all are seen should cycle fairly without failing
    next_q = await practice.get_next_practice_question(user_id, preferred_topics=["os"])
    assert next_q is not None
    assert next_q["topic_slug"] == "os"


@pytest.mark.asyncio
async def test_practice_service_no_topics_returns_none(tmp_path):
    db_file = str(tmp_path / "test_no_topics.db")
    db = Database(db_file)
    await db.init_db()

    qb = QuestionBank("data/question_bank.json")
    qb.load_and_validate()

    practice = PracticeService(qb, db)
    assert await practice.get_next_practice_question(9999, preferred_topics=[]) is None
