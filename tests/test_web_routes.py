import pytest
import pytest_asyncio
from unittest.mock import patch, MagicMock
from httpx import AsyncClient, ASGITransport
from app.config import Settings
from app.database import Database
from app.question_bank import QuestionBank
from app.security import generate_fernet_key
from app.web import create_app

@pytest_asyncio.fixture
async def app_fixture(tmp_path):

    db_file = str(tmp_path / "test_routes.db")
    db = Database(db_file)
    await db.init_db()

    qb = QuestionBank("data/question_bank.json")
    qb.load_and_validate()

    settings = Settings(
        APP_ENV="testing",
        ENCRYPTION_KEY=generate_fernet_key(),
        TELEGRAM_BOT_TOKEN="mock_token"
    )
    app = create_app(settings, db, qb)
    return app, db, settings

@pytest.mark.asyncio
async def test_onboarding_and_interview_flow(app_fixture):
    app, db, settings = app_fixture
    clerk_id = "user_clerk_test_999"
    headers = {"X-Clerk-User-Id": clerk_id}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://localhost") as client:
        # 1. Check me -> state should be AWAITING_GROQ_KEY
        me_resp = await client.get("/api/auth/me", headers=headers)
        assert me_resp.status_code == 200
        me_data = me_resp.json()
        assert me_data["onboarding_state"] == "AWAITING_GROQ_KEY"
        assert me_data["groq_key_configured"] is False

        # Try to access dashboard before onboarding -> should be forbidden 403
        dash_fail = await client.get("/api/dashboard", headers=headers)
        assert dash_fail.status_code == 403

        # 2. Add Groq key
        with patch("app.web_routes.validate_groq_key", return_value=True):
            key_resp = await client.post(
                "/api/auth/groq-key",
                headers=headers,
                json={"groq_key": "gsk_test_groq_secret_key_123456"}
            )
            assert key_resp.status_code == 200
            assert key_resp.json()["status"] == "success"
            assert key_resp.json()["next_step"] == "AWAITING_RESUME"

        # Check me again
        me_resp2 = await client.get("/api/auth/me", headers=headers)
        assert me_resp2.json()["groq_key_configured"] is True

        # 3. Upload Resume
        fake_pdf = b"%PDF-1.4 Fake PDF text for backend engineer with Python and SQL"
        mock_profile = {
            "primary_role": "Backend Engineer",
            "target_roles": ["Backend Engineer"],
            "programming_languages": ["Python", "SQL"],
            "frameworks_and_tools": ["FastAPI"],
            "database_technologies": ["PostgreSQL"],
            "notable_projects": ["API Service"],
            "years_of_experience": "Fresher",
            "recommended_topics": ["DSA", "DBMS"]
        }
        with patch("app.web_routes.extract_resume_text", return_value=("Extracted resume text", "pdf")), \
             patch("app.web_routes.analyze_resume_comprehensive", return_value=mock_profile):
            files = {"file": ("my_resume.pdf", fake_pdf, "application/pdf")}
            res_resp = await client.post("/api/resume/upload", headers=headers, files=files)
            assert res_resp.status_code == 200
            assert res_resp.json()["next_step"] == "AWAITING_PROFILE_CONFIRM"

        # 4. Confirm profile
        confirm_resp = await client.put(
            "/api/resume/confirm",
            headers=headers,
            json=mock_profile
        )
        assert confirm_resp.status_code == 200
        assert confirm_resp.json()["next_step"] == "AWAITING_PREP_SETUP"

        # 5. Prep setup -> unlocks dashboard
        prep_resp = await client.post(
            "/api/onboarding/prep-setup",
            headers=headers,
            json={
                "target_role": "Backend Engineer",
                "target_company": "Acme Corp",
                "seniority": "Fresher",
                "target_date": "2026-11-01",
                "interview_type": "technical"
            }
        )
        assert prep_resp.status_code == 200
        assert prep_resp.json()["onboarding_state"] == "COMPLETED"

        # 6. Dashboard is now accessible!
        dash_resp = await client.get("/api/dashboard", headers=headers)
        assert dash_resp.status_code == 200
        dash_data = dash_resp.json()
        assert dash_data["target_role"] == "Backend Engineer"

        # 7. Start interview session
        sess_resp = await client.post(
            "/api/interview/session",
            headers=headers,
            json={
                "mode": "practice",
                "interviewer_style": "technical",
                "duration_mode": "quick"
            }
        )
        assert sess_resp.status_code == 200
        sess_data = sess_resp.json()
        session_id = sess_data["session"]["id"]
        current_turn = sess_data["current_turn"]
        assert current_turn is not None
        turn_id = current_turn["id"]

        # 8. Submit Turn Answer
        mock_eval = {
            "technical_correctness": 4.5,
            "reasoning_and_tradeoffs": 4.0,
            "structure_and_clarity": 4.5,
            "relevance_and_depth": 4.0,
            "communication_delivery": None,
            "overall_score": 4.3,
            "evidence_quote": "A transaction either completes entirely or leaves state unchanged.",
            "demonstrated_points": ["Atomicity", "Consistency"],
            "missing_points": ["Isolation concurrency anomalies"],
            "concrete_corrections": None,
            "stronger_answer": "Elaborate with examples of phantom reads.",
            "why_its_stronger": "Highlights concurrency control awareness.",
            "spoken_coaching_summary": "Great explanation of atomicity. Don't forget concurrency isolation."
        }
        with patch("app.web_routes.evaluate_turn_response", return_value=mock_eval):
            turn_submit = await client.post(
                f"/api/interview/turn/{turn_id}/submit",
                headers=headers,
                json={
                    "typed_answer": "Atomicity means all-or-nothing execution.",
                    "is_voice": False
                }
            )
            assert turn_submit.status_code == 200
            submit_data = turn_submit.json()
            assert submit_data["status"] == "success"
            assert submit_data["evaluated_turn"]["evaluation"]["overall_score"] == 4.3

        # 9. Practice Mode Retry
        with patch("app.web_routes.evaluate_turn_response", return_value=mock_eval):
            retry_submit = await client.post(
                f"/api/interview/turn/{turn_id}/retry",
                headers=headers,
                json={
                    "typed_answer": "Retry attempt explaining dirty reads and phantom reads.",
                    "is_voice": False
                }
            )
            assert retry_submit.status_code == 200
            assert retry_submit.json()["status"] == "success"

        # 10. End session early -> returns partial debrief
        end_resp = await client.post(f"/api/interview/session/{session_id}/end", headers=headers)
        assert end_resp.status_code == 200
        end_data = end_resp.json()
        assert end_data["session"]["status"] in {"completed", "partial_completed"}
        assert "debrief" in end_data

        # 11. Placement Tracker CRUD
        track_resp = await client.post(
            "/api/tracker",
            headers=headers,
            json={
                "company": "Google",
                "role": "SWE Intern",
                "status": "Applied"
            }
        )
        assert track_resp.status_code == 200
        tracker_id = track_resp.json()["id"]

        list_track = await client.get("/api/tracker", headers=headers)
        assert len(list_track.json()) == 1

        del_track = await client.delete(f"/api/tracker/{tracker_id}", headers=headers)
        assert del_track.status_code == 200

        # 12. Telegram Link code
        link_resp = await client.post("/api/telegram/link-code", headers=headers)
        assert link_resp.status_code == 200
        assert "code" in link_resp.json()
        assert len(link_resp.json()["code"]) == 6

        # 13. Neural TTS Voices & Synthesis
        voices_resp = await client.get("/api/interview/tts/voices")
        assert voices_resp.status_code == 200
        voices_data = voices_resp.json()
        assert len(voices_data) >= 5
        assert any(v["id"] == "en-US-ChristopherNeural" for v in voices_data)

        with patch("edge_tts.Communicate.stream") as mock_stream:
            async def fake_stream():
                yield {"type": "audio", "data": b"FAKE_NEURAL_AUDIO_BYTES"}
            mock_stream.return_value = fake_stream()

            tts_resp = await client.post(
                "/api/tts",
                json={"text": "Hello, welcome to your mock interview.", "voice": "en-US-EmmaNeural"}
            )
            assert tts_resp.status_code == 200
            assert tts_resp.headers["content-type"] == "audio/mpeg"
            assert len(tts_resp.content) > 0

        # 14. History Deletion
        del_hist = await client.delete("/api/interview/history", headers=headers)
        assert del_hist.status_code == 200
        sess_after = await client.get("/api/interview/sessions", headers=headers)
        assert len(sess_after.json()) == 0
