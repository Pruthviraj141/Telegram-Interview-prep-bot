import pytest
from app.question_bank import QuestionBank, QuestionBankError, VALID_SLUGS, VALID_CATEGORIES


def test_question_bank_loads_all_categories_and_count():
    qb = QuestionBank("data/question_bank.json")
    qb.load_and_validate()

    # Must contain at least 90 questions
    assert len(qb.questions) >= 90
    assert len(qb.questions) == 90

    # Must cover all 9 categories
    slugs_covered = set(qb._by_topic.keys())
    assert slugs_covered == VALID_SLUGS

    # Each category must have at least 10 questions
    for slug in VALID_SLUGS:
        questions = qb.get_questions_for_topic(slug)
        assert len(questions) >= 10, f"Topic '{slug}' has only {len(questions)} questions"


def test_question_records_have_complete_fields():
    qb = QuestionBank("data/question_bank.json")
    qb.load_and_validate()

    for q in qb.questions:
        assert q["id"], "Question ID is empty"
        assert q["topic_slug"] in VALID_SLUGS
        assert q["difficulty"] in {"Easy", "Medium", "Hard"}
        assert len(q["question"]) > 10
        assert len(q["model_answer"]) > 10
        assert isinstance(q["tags"], list)
        assert isinstance(q["expected_concepts"], list)


def test_question_bank_validation_errors(tmp_path):
    bad_json = tmp_path / "bad.json"
    # Duplicate IDs
    bad_json.write_text('[{"id": "q1", "topic_slug": "dsa", "difficulty": "Easy", "question": "test?", "model_answer": "ans"}, {"id": "q1", "topic_slug": "dsa", "difficulty": "Easy", "question": "test2?", "model_answer": "ans"}]')
    qb = QuestionBank(str(bad_json))
    with pytest.raises(QuestionBankError, match="Duplicate question ID"):
        qb.load_and_validate()

    # Invalid topic slug
    bad_json.write_text('[{"id": "q2", "topic_slug": "unknown_slug", "difficulty": "Easy", "question": "test?", "model_answer": "ans"}]')
    qb = QuestionBank(str(bad_json))
    with pytest.raises(QuestionBankError, match="Invalid topic_slug"):
        qb.load_and_validate()

    # Invalid difficulty
    bad_json.write_text('[{"id": "q3", "topic_slug": "dsa", "difficulty": "SuperHard", "question": "test?", "model_answer": "ans"}]')
    qb = QuestionBank(str(bad_json))
    with pytest.raises(QuestionBankError, match="Invalid difficulty"):
        qb.load_and_validate()
