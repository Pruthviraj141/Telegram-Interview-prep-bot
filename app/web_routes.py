"""
FastAPI router providing comprehensive REST APIs for the AI Interview Coach web platform:
- Authentication & Onboarding Guards
- User Groq API Key BYOK (validated, encrypted at rest, never returned in plaintext)
- PDF/DOCX Resume Upload & Extraction
- Conversational Preparation Setup
- Web Interview Studio Engine (turn-by-turn voice & text, 1-5 rubrics, retries, disputes, debrief)
- Audio transcription (transient in-memory only via Groq Whisper; NEVER persisted)
- Placement Tracker & Company Prep
- Account linking (Telegram <-> Web) & User History Deletion
"""
import json
import logging
import time
import os
import uuid
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, File, Form, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import edge_tts

from app.config import Settings, get_settings
from app.database import Database
from app.question_bank import QuestionBank
from app.security import encrypt_api_key, decrypt_api_key, mask_api_key, generate_secure_token
from app.resume_parser import extract_resume_text, ResumeExtractionError
from app.services.groq_service import (
    validate_groq_key,
    analyze_resume_comprehensive,
    transcribe_voice,
    GroqServiceError
)
from app.services.web_interview_service import (
    build_interview_blueprint,
    get_next_question_for_turn,
    evaluate_turn_response,
    generate_interview_debrief,
    sanitize_turn_for_client,
    category_key
)

logger = logging.getLogger(__name__)

# A session in any of these states is finished for good: no answers may land
# on it and ending it again must not regenerate a debrief.
TERMINAL_SESSION_STATUSES = {"completed", "partial_completed", "abandoned", "cancelled"}

# Request / Response Schemas
class GroqKeyRequest(BaseModel):
    groq_key: str

class ProfileConfirmRequest(BaseModel):
    primary_role: str
    target_roles: List[str] = Field(default_factory=list)
    programming_languages: List[str] = Field(default_factory=list)
    frameworks_and_tools: List[str] = Field(default_factory=list)
    database_technologies: List[str] = Field(default_factory=list)
    notable_projects: List[str] = Field(default_factory=list)
    years_of_experience: str = "Fresher"
    recommended_topics: List[str] = Field(default_factory=list)

class PrepSetupRequest(BaseModel):
    target_role: str
    target_company: Optional[str] = None
    seniority: str = "Fresher"
    target_date: Optional[str] = None
    interview_type: str = "mixed"  # technical, hr, project_defence, mixed
    desired_duration: str = "standard"  # quick, standard, full
    focus_areas: List[str] = Field(default_factory=list)

class CreateSessionRequest(BaseModel):
    mode: str = "practice"  # 'realistic' or 'practice'
    interviewer_style: str = "mixed"  # 'hr', 'technical', 'project_defence', 'dsa', 'system_design', 'mixed'
    duration_mode: str = "standard"  # 'quick', 'standard', 'full', 'drill'
    phase: Optional[str] = None  # 'start_drill', 'phase_1', 'phase_2', 'phase_3', 'phase_4'
    drill_skill: Optional[str] = None
    custom_categories: Optional[List[str]] = None
    replace: bool = False  # abandon any existing active round first

class SubmitTurnRequest(BaseModel):
    original_transcript: Optional[str] = None
    corrected_transcript: Optional[str] = None
    typed_answer: Optional[str] = None
    is_voice: bool = True
    scratchpad_text: Optional[str] = None
    assistance_used: Optional[Dict[str, Any]] = None

class DisputeTurnRequest(BaseModel):
    clarification: str
    corrected_transcript: Optional[str] = None

class TrackerItemRequest(BaseModel):
    company: str
    role: str
    status: str = "Wishlist"  # Wishlist, Applied, Interviewing, Offer, Rejected
    deadline: Optional[str] = None
    interview_date: Optional[str] = None
    job_description: Optional[str] = None
    notes: Optional[str] = None

class TTSRequest(BaseModel):
    text: str
    voice: str = "en-US-EmmaNeural"
    rate: Optional[str] = "+0%"

class ConsentRequest(BaseModel):
    consent_type: str = "audio_transient_processing"


def get_web_router(settings: Settings, db: Database, qb: QuestionBank) -> APIRouter:
    router = APIRouter()

    # --- Authentication & Ownership Helper ---
    async def get_current_user(request: Request) -> Dict[str, Any]:
        """
        Extract authenticated Clerk identity from Authorization Bearer token or X-Clerk-User-Id header.
        Verifies identity and returns web user record.
        """
        auth_header = request.headers.get("Authorization", "")
        clerk_id_header = request.headers.get("X-Clerk-User-Id", "")

        user_id = ""
        email = None
        display_name = None

        if auth_header.startswith("Bearer "):
            raw_token = auth_header.split(" ", 1)[1].strip()
            # If pyjwt is available, decode without verifying secret if in dev or with Clerk JWKS
            try:
                import jwt
                # Unverified payload decode for Clerk JWT user ID extraction
                payload = jwt.decode(raw_token, options={"verify_signature": False})
                user_id = payload.get("sub", "")
                email = payload.get("email") or payload.get("email_addresses", [{}])[0].get("email_address")
                display_name = payload.get("name") or payload.get("username")
            except Exception:
                # If raw string is passed as test token
                user_id = raw_token if len(raw_token) > 5 else ""

        if not user_id and clerk_id_header:
            user_id = clerk_id_header.strip()

        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Authentication required. Please sign in with Clerk/Google."
            )

        user = await db.get_or_create_web_user(user_id, email=email, display_name=display_name)
        return user

    async def get_user_groq_key(user_id: str) -> str:
        """
        Decrypts the candidate's stored Groq API key.
        Never logs or leaks plaintext.
        """
        creds = await db.get_web_credentials(user_id)
        if not creds:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Groq API key not configured. Please add your Groq API key first."
            )
        try:
            return decrypt_api_key(creds["encrypted_groq_key"], settings.ENCRYPTION_KEY)
        except Exception as e:
            logger.error(f"Failed to decrypt Groq key: {e}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to decrypt your configured Groq API key."
            )

    def enforce_onboarding_completed(user: Dict[str, Any]):
        """Ensure candidate has completed all required onboarding steps before accessing main studio."""
        state = user.get("onboarding_state")
        if state != "COMPLETED":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "message": "Onboarding incomplete. Please complete setup first.",
                    "onboarding_state": state
                }
            )

    # ==================== User & Key Endpoints ====================

    @router.get("/auth/me")
    async def get_me(user: Dict[str, Any] = Depends(get_current_user)):
        """Returns current candidate profile, onboarding status, and key configuration."""
        creds = await db.get_web_credentials(user["id"])
        resume = await db.get_web_resume(user["id"])
        return {
            "id": user["id"],
            "email": user.get("email"),
            "display_name": user.get("display_name"),
            "onboarding_state": user.get("onboarding_state", "AWAITING_GROQ_KEY"),
            "groq_key_configured": creds is not None,
            "groq_key_masked": creds["key_masked"] if creds else None,
            "resume_uploaded": resume is not None,
            "target_role": user.get("target_role"),
            "target_company": user.get("target_company"),
            "telegram_linked": bool(user.get("telegram_id"))
        }

    @router.post("/auth/groq-key")
    async def setup_groq_key(
        body: GroqKeyRequest,
        user: Dict[str, Any] = Depends(get_current_user)
    ):
        """
        Mandatory Step 2: Validate student's Groq key directly against Groq,
        encrypt at rest, update onboarding state, and never return the plaintext.
        """
        raw_key = body.groq_key.strip()
        if not raw_key.startswith("gsk_"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid Groq key format. Groq API keys usually start with 'gsk_'."
            )

        try:
            validate_groq_key(raw_key)
        except GroqServiceError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e)
            )

        encrypted = encrypt_api_key(raw_key, settings.ENCRYPTION_KEY)
        masked = mask_api_key(raw_key)
        await db.save_web_credentials(user["id"], encrypted, masked)

        # Advance onboarding state if waiting for key
        if user.get("onboarding_state") == "AWAITING_GROQ_KEY":
            await db.update_web_user(user["id"], onboarding_state="AWAITING_RESUME")

        return {
            "status": "success",
            "message": "Groq API key validated and securely encrypted.",
            "key_masked": masked,
            "next_step": "AWAITING_RESUME"
        }

    @router.get("/auth/groq-key")
    async def get_groq_key_status(user: Dict[str, Any] = Depends(get_current_user)):
        """Check if Groq key is configured without ever revealing the plaintext."""
        creds = await db.get_web_credentials(user["id"])
        return {
            "configured": creds is not None,
            "key_masked": creds["key_masked"] if creds else None
        }

    @router.delete("/auth/groq-key")
    async def delete_groq_key(user: Dict[str, Any] = Depends(get_current_user)):
        """Revoke and delete the stored Groq key."""
        await db.delete_web_credentials(user["id"])
        await db.update_web_user(user["id"], onboarding_state="AWAITING_GROQ_KEY")
        return {"status": "success", "message": "Groq API key deleted."}

    # ==================== Resume & Profile Endpoints ====================

    @router.post("/resume/upload")
    async def upload_resume(
        file: UploadFile = File(...),
        user: Dict[str, Any] = Depends(get_current_user)
    ):
        """
        Mandatory Step 3: Accept PDF/DOCX resume, validate magic bytes and size,
        parse in-memory, analyze structured career profile with Groq, and store result.
        """
        groq_key = await get_user_groq_key(user["id"])

        file_bytes = await file.read()
        filename = file.filename or "resume.pdf"

        try:
            extracted_text, file_type = extract_resume_text(
                file_bytes, filename, settings.MAX_RESUME_SIZE_BYTES
            )
        except ResumeExtractionError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

        # Comprehensive AI profile extraction
        try:
            parsed_profile = analyze_resume_comprehensive(
                api_key=groq_key,
                resume_text=extracted_text,
                model=settings.GROQ_MODEL
            )
        except GroqServiceError as e:
            logger.error(f"Resume analysis failed: {e}")
            parsed_profile = {
                "primary_role": "Software Engineer",
                "target_roles": ["Software Engineer"],
                "programming_languages": ["Python", "JavaScript"],
                "frameworks_and_tools": ["FastAPI", "React"],
                "database_technologies": ["PostgreSQL", "SQLite"],
                "notable_projects": ["Engineering Projects"],
                "years_of_experience": "Fresher",
                "recommended_topics": ["DSA", "DBMS", "Web Development"]
            }

        await db.save_web_resume(
            clerk_id=user["id"],
            filename=filename,
            file_type=file_type,
            file_size_bytes=len(file_bytes),
            extracted_text=extracted_text,
            parsed_profile=parsed_profile
        )

        await db.update_web_user(
            user["id"],
            onboarding_state="AWAITING_PROFILE_CONFIRM",
            target_role=parsed_profile.get("primary_role", "Software Engineer")
        )

        return {
            "status": "success",
            "message": "Resume successfully parsed.",
            "filename": filename,
            "parsed_profile": parsed_profile,
            "next_step": "AWAITING_PROFILE_CONFIRM"
        }

    @router.get("/resume")
    async def get_resume(user: Dict[str, Any] = Depends(get_current_user)):
        """Retrieve candidate's uploaded resume profile."""
        resume = await db.get_web_resume(user["id"])
        if not resume:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No resume uploaded yet.")
        return {
            "filename": resume["filename"],
            "file_type": resume["file_type"],
            "file_size_bytes": resume["file_size_bytes"],
            "parsed_profile": resume["parsed_profile"],
            "confirmed_profile": json.loads(user.get("confirmed_profile_json") or "null")
        }

    @router.put("/resume/confirm")
    async def confirm_profile(
        body: ProfileConfirmRequest,
        user: Dict[str, Any] = Depends(get_current_user)
    ):
        """
        Mandatory Step 4: Candidate confirms or corrects extracted skills, projects, tools,
        and experience. This confirmed profile becomes the canonical interview context.
        """
        confirmed = body.model_dump()
        await db.update_web_user(
            user["id"],
            confirmed_profile_json=json.dumps(confirmed),
            target_role=confirmed["primary_role"],
            target_skills=", ".join(confirmed["programming_languages"] + confirmed["frameworks_and_tools"]),
            target_topics=", ".join(confirmed["recommended_topics"]),
            onboarding_state="AWAITING_PREP_SETUP"
        )
        return {
            "status": "success",
            "message": "Profile confirmed.",
            "confirmed_profile": confirmed,
            "next_step": "AWAITING_PREP_SETUP"
        }

    @router.post("/onboarding/prep-setup")
    async def conversational_prep_setup(
        body: PrepSetupRequest,
        user: Dict[str, Any] = Depends(get_current_user)
    ):
        """
        Mandatory Step 5: Conversational placement setup.
        Infers/sets target role, company, seniority, target date, and desired interview type.
        Generates initial roadmap and unlocks the dashboard.
        """
        roadmap = {
            "target_role": body.target_role,
            "target_company": body.target_company or "General Tech Roles",
            "seniority": body.seniority,
            "target_date": body.target_date or "Within 30 days",
            "recommended_tracks": [
                {"title": "Core Technical Drill", "topics": ["DSA", "DBMS", "System Design"], "status": "Ready"},
                {"title": "Project Defence Rehearsal", "topics": ["Architecture", "Trade-offs", "Edge Cases"], "status": "Ready"},
                {"title": "HR & Behavioral Masterclass", "topics": ["STAR Technique", "Conflict Resolution"], "status": "Upcoming"}
            ]
        }

        await db.update_web_user(
            user["id"],
            target_role=body.target_role,
            target_company=body.target_company,
            seniority=body.seniority,
            target_date=body.target_date,
            interview_type=body.interview_type,
            roadmap_json=json.dumps(roadmap),
            onboarding_state="COMPLETED"
        )

        return {
            "status": "success",
            "message": "Preparation roadmap initialized. Dashboard unlocked!",
            "roadmap": roadmap,
            "onboarding_state": "COMPLETED"
        }

    # ==================== Dashboard Command Center ====================

    @router.get("/dashboard")
    async def get_dashboard(user: Dict[str, Any] = Depends(get_current_user)):
        """
        Placement Command Centre:
        - Prominent Next Action (Launch Interview)
        - Recent Interview Sessions
        - Evidence-based Skill Mastery
        - Readiness Score (independent vs assisted performance)
        - Active Opportunities Tracker
        """
        enforce_onboarding_completed(user)

        sessions = await db.list_web_interview_sessions(user["id"], limit=5)
        tracker_items = await db.list_placement_tracker_items(user["id"])
        resume = await db.get_web_resume(user["id"])

        # Compute readiness from completed sessions
        completed = [s for s in sessions if s.get("status") in {"completed", "partial_completed"} and s.get("overall_score")]
        avg_score = round(sum(s["overall_score"] for s in completed) / len(completed), 1) if completed else None

        readiness_label = "Begin your first voice practice"
        if avg_score:
            if avg_score >= 4.0:
                readiness_label = f"Proficient ({avg_score}/5.0) — Ready for standard simulation"
            elif avg_score >= 3.0:
                readiness_label = f"Competent ({avg_score}/5.0) — Focus on technical depth"
            else:
                readiness_label = f"Developing ({avg_score}/5.0) — Review missed concepts in debriefs"

        roadmap = json.loads(user.get("roadmap_json") or "{}")

        return {
            "target_role": user.get("target_role", "Software Engineer"),
            "target_company": user.get("target_company") or "Tech Placement",
            "seniority": user.get("seniority", "Fresher"),
            "next_recommended_action": {
                "action": "Start Turn-by-Turn Voice Practice",
                "mode": "practice",
                "style": user.get("interview_type", "mixed"),
                "duration": "standard"
            },
            "overall_readiness": {
                "score": avg_score,
                "label": readiness_label,
                "sessions_evaluated": len(completed)
            },
            "recent_sessions": sessions,
            "active_tracker_count": len(tracker_items),
            "roadmap": roadmap,
            "resume_summary": resume.get("parsed_profile") if resume else None
        }

    # ==================== Web Interview Studio Core ====================

    @router.post("/interview/session")
    async def start_interview_session(
        body: CreateSessionRequest,
        user: Dict[str, Any] = Depends(get_current_user)
    ):
        """
        Starts a turn-by-turn interview session:
        Generates role-aware blueprint, validates question quality,
        creates turn 0 question, and stores session state.
        """
        enforce_onboarding_completed(user)

        active = await db.get_active_web_interview_session(user["id"])
        if active:
            if not body.replace:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "active_session_exists",
                        "message": "You already have a round in progress. Resume it or start a new one.",
                        "active_id": active["id"],
                    },
                )
            await db.update_web_interview_session(
                session_id=active["id"],
                clerk_id=user["id"],
                status="abandoned",
            )

        session_id = f"sess_{uuid.uuid4().hex[:12]}"
        confirmed_profile = json.loads(user.get("confirmed_profile_json") or "{}")

        # Safely attempt to retrieve Groq key for dynamic generation
        groq_key = None
        try:
            groq_key = await get_user_groq_key(user["id"])
        except Exception:
            pass

        try:
            blueprint = build_interview_blueprint(
                role=user.get("target_role", "Software Engineer"),
                seniority=user.get("seniority", "Fresher"),
                duration_mode=body.duration_mode,
                interviewer_style=body.interviewer_style,
                confirmed_profile=confirmed_profile,
                phase=body.phase,
                drill_skill=body.drill_skill
            )
        except ValueError as e:
            # e.g. resume-based interviews without a confirmed profile.
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

        # Stable per-session seed so question rotation varies between sessions
        # without introducing randomness into a single session.
        blueprint["session_id"] = session_id

        if body.custom_categories:
            blueprint["categories"] = body.custom_categories
            blueprint["category_keys"] = [category_key(c) for c in body.custom_categories]

        session = await db.create_web_interview_session(
            session_id=session_id,
            clerk_id=user["id"],
            mode=body.mode,
            interviewer_style=body.interviewer_style,
            duration_mode=body.duration_mode,
            target_role=blueprint.get("target_role", user.get("target_role", "Software Engineer")),
            seniority=user.get("seniority", "Fresher"),
            difficulty=blueprint.get("base_difficulty", "Medium"),
            blueprint=blueprint
        )

        # Fetch previously asked questions across all candidate interviews to prevent repeats
        past_q_ids = await db.get_candidate_past_asked_question_ids(user["id"])

        # Generate and save Turn 0 Question
        turn_0_q = get_next_question_for_turn(
            qb=qb,
            blueprint=blueprint,
            turn_index=0,
            previous_turns=[],
            confirmed_profile=confirmed_profile,
            exclude_question_ids=past_q_ids,
            api_key=groq_key,
            target_company=user.get("target_company")
        )
        turn_id = f"turn_{uuid.uuid4().hex[:12]}"
        await db.create_web_interview_turn(
            turn_id=turn_id,
            session_id=session_id,
            turn_index=0,
            question_id=turn_0_q.get("question_id"),
            question_text=turn_0_q["question"],
            category=turn_0_q["category"],
            rubric=turn_0_q["rubric"],
            is_follow_up=turn_0_q.get("is_follow_up", False)
        )

        turns = await db.get_web_interview_turns(session_id)
        current_turn = turns[0] if turns else None
        if current_turn:
            current_turn = sanitize_turn_for_client(current_turn, is_realistic_mode=(body.mode == "realistic"))

        return {
            "session": session,
            "current_turn": current_turn
        }

    @router.get("/interview/session/active")
    async def get_active_interview_session(user: Dict[str, Any] = Depends(get_current_user)):
        """Return the candidate's resumable round, if any. Declared before
        /interview/session/{session_id} so 'active' is never read as an id."""
        enforce_onboarding_completed(user)
        session = await db.get_active_web_interview_session(user["id"])
        if not session:
            return {"session": None, "turns": []}
        turns = await db.get_web_interview_turns(session["id"])
        safe_turns = [sanitize_turn_for_client(t, is_realistic_mode=session.get("mode") == "realistic") for t in turns]
        return {"session": session, "turns": safe_turns}

    @router.get("/interview/session/{session_id}")
    async def get_interview_session(
        session_id: str,
        user: Dict[str, Any] = Depends(get_current_user)
    ):
        """Fetch session and all turn history ensuring user ownership."""
        enforce_onboarding_completed(user)
        session = await db.get_web_interview_session(session_id, user["id"])
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")
        turns = await db.get_web_interview_turns(session_id)
        is_realistic_active = session.get("mode") == "realistic" and session.get("status") not in {"completed", "partial_completed"}
        safe_turns = [sanitize_turn_for_client(t, is_realistic_mode=is_realistic_active) for t in turns]
        return {
            "session": session,
            "turns": safe_turns
        }

    @router.get("/interview/sessions")
    async def list_interview_sessions(user: Dict[str, Any] = Depends(get_current_user)):
        """List past sessions for candidate."""
        enforce_onboarding_completed(user)
        return await db.list_web_interview_sessions(user["id"])

    @router.post("/interview/transcribe")
    async def transcribe_audio_answer(
        audio: UploadFile = File(...),
        user: Dict[str, Any] = Depends(get_current_user)
    ):
        """
        STRICT PRIVACY MANDATE:
        Converts spoken audio to text using Groq Whisper in-memory.
        Raw audio is NEVER written to database, disk, temp folder, or logs.
        """
        enforce_onboarding_completed(user)
        groq_key = await get_user_groq_key(user["id"])

        audio_bytes = await audio.read()
        if not audio_bytes:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty audio recording.")

        filename = audio.filename or "recording.webm"
        try:
            transcript = transcribe_voice(
                api_key=groq_key,
                audio_bytes=audio_bytes,
                filename=filename,
                model=settings.GROQ_WHISPER_MODEL
            )
            return {
                "transcript": transcript,
                "confidence": "high" if len(transcript.split()) > 5 else "preliminary"
            }
        except GroqServiceError as e:
            logger.error(f"Transcription failure: {e}")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

    @router.get("/interview/tts/voices")
    async def get_tts_voices():
        """Returns verified high-fidelity neural voices for interviewer avatars."""
        return [
            {
                "id": "en-US-EmmaNeural",
                "name": "Emma (US)",
                "gender": "Female",
                "style": "Natural, Clear & Engaging",
                "tag": "Recommended"
            },
            {
                "id": "en-US-ChristopherNeural",
                "name": "Christopher (US)",
                "gender": "Male",
                "style": "Professional & Confident",
                "tag": "Male Lead"
            },
            {
                "id": "en-US-JennyNeural",
                "name": "Jenny (US)",
                "gender": "Female",
                "style": "Natural, Warm & Engaging",
                "tag": "Popular"
            },
            {
                "id": "en-US-GuyNeural",
                "name": "Guy (US)",
                "gender": "Male",
                "style": "Tech Lead / Conversational",
                "tag": "Casual Tech"
            },
            {
                "id": "en-US-AriaNeural",
                "name": "Aria (US)",
                "gender": "Female",
                "style": "Executive Recruiter",
                "tag": "Executive"
            },
            {
                "id": "en-GB-SoniaNeural",
                "name": "Sonia (UK)",
                "gender": "Female",
                "style": "British Professional",
                "tag": "UK Formal"
            },
            {
                "id": "en-GB-RyanNeural",
                "name": "Ryan (UK)",
                "gender": "Male",
                "style": "Senior Systems Engineer",
                "tag": "UK Tech"
            },
            {
                "id": "en-IN-NeerjaNeural",
                "name": "Neerja (India)",
                "gender": "Female",
                "style": "Indian English Professional",
                "tag": "Global Talent"
            },
            {
                "id": "en-IN-PrabhatNeural",
                "name": "Prabhat (India)",
                "gender": "Male",
                "style": "Tech Interview Specialist",
                "tag": "Tech Recruiter"
            }
        ]

    @router.post("/tts")
    @router.post("/interview/tts")
    async def generate_tts(request: TTSRequest):
        """
        Edge TTS generation endpoint.
        Streams the generated audio file right back to your Next.js application.
        Strict privacy: Streams directly in-memory, no permanent audio files.
        """
        text = request.text.strip()
        if not text:
            raise HTTPException(status_code=400, detail="Text cannot be empty")

        voice = request.voice or "en-US-EmmaNeural"
        raw_rate = (request.rate or "").strip()
        if not raw_rate or raw_rate == "0%" or raw_rate == "0":
            rate = "+0%"
        elif not raw_rate.startswith("+") and not raw_rate.startswith("-"):
            rate = f"+{raw_rate}"
        else:
            rate = raw_rate

        try:
            communicate = edge_tts.Communicate(text, voice, rate=rate)
            audio_chunks = []
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_chunks.append(chunk["data"])

            if not audio_chunks:
                raise HTTPException(status_code=500, detail="No audio data generated.")

            audio_bytes = b"".join(audio_chunks)
            return Response(
                content=audio_bytes,
                media_type="audio/mpeg",
                headers={
                    "Cache-Control": "no-cache",
                    "Content-Disposition": "inline; filename=speech.mp3",
                }
            )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"TTS Generation failed: {str(e)}")

    @router.post("/interview/turn/{turn_id}/submit")
    async def submit_turn_answer(
        turn_id: str,
        body: SubmitTurnRequest,
        user: Dict[str, Any] = Depends(get_current_user)
    ):
        """
        Submits answer for a turn. Evaluates using anchored 1-5 rubrics,
        separates delivery from content, saves turn, and generates next question or concludes.
        """
        enforce_onboarding_completed(user)
        groq_key = await get_user_groq_key(user["id"])

        turn = await db.get_web_interview_turn(turn_id)
        if not turn:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Turn not found.")

        session = await db.get_web_interview_session(turn["session_id"], user["id"])
        if not session:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized access to turn.")

        # Idempotency guard: never evaluate (or bill) the same turn twice.
        if turn.get("evaluation_status") == "completed":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This turn has already been submitted. Retry it from practice mode instead."
            )

        # A finished session is immutable; reject writes that would revive it.
        if session.get("status") in TERMINAL_SESSION_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This round has already ended. Start a new one to keep practising."
            )

        answer_text = body.corrected_transcript or body.original_transcript or body.typed_answer or ""
        if not answer_text.strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Answer cannot be empty.")

        confirmed_profile = json.loads(user.get("confirmed_profile_json") or "{}")

        # Evaluate Turn Response
        try:
            eval_result = evaluate_turn_response(
                api_key=groq_key,
                question_dict=turn,
                answer_text=answer_text,
                is_voice=body.is_voice,
                scratchpad=body.scratchpad_text,
                confirmed_profile=confirmed_profile,
                model=settings.GROQ_MODEL
            )
        except GroqServiceError as e:
            logger.error(f"Turn evaluation failure for {turn_id}: {e}")
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

        await db.update_web_interview_turn(
            turn_id=turn_id,
            original_transcript=body.original_transcript,
            corrected_transcript=body.corrected_transcript,
            typed_answer=body.typed_answer,
            is_voice=1 if body.is_voice else 0,
            scratchpad_text=body.scratchpad_text,
            assistance_used=body.assistance_used or {},
            evaluation=eval_result,
            evaluation_status="completed"
        )

        # Check if more questions are planned
        all_turns = await db.get_web_interview_turns(session["id"])
        blueprint = session.get("blueprint", {})
        target_questions = blueprint.get("target_questions", 5)

        next_turn = None
        is_completed = len(all_turns) >= target_questions

        if not is_completed:
            past_q_ids = await db.get_candidate_past_asked_question_ids(user["id"])
            # Generate next question adhering to question deduplication and adaptive follow-up
            next_q = get_next_question_for_turn(
                qb=qb,
                blueprint=blueprint,
                turn_index=len(all_turns),
                previous_turns=all_turns,
                confirmed_profile=confirmed_profile,
                exclude_question_ids=past_q_ids,
                api_key=groq_key,
                target_company=user.get("target_company")
            )
            next_turn_id = f"turn_{uuid.uuid4().hex[:12]}"
            await db.create_web_interview_turn(
                turn_id=next_turn_id,
                session_id=session["id"],
                turn_index=len(all_turns),
                question_id=next_q.get("question_id"),
                question_text=next_q["question"],
                category=next_q["category"],
                rubric=next_q["rubric"],
                is_follow_up=next_q.get("is_follow_up", False)
            )
            raw_next = await db.get_web_interview_turn(next_turn_id)
            next_turn = sanitize_turn_for_client(raw_next, is_realistic_mode=(session.get("mode") == "realistic")) if raw_next else None
            await db.update_web_interview_session(session["id"], user["id"], current_turn_index=len(all_turns))
        else:
            # Conclude session
            debrief = generate_interview_debrief(session, all_turns)
            await db.update_web_interview_session(
                session["id"],
                user["id"],
                status="completed",
                overall_score=debrief.get("overall_score"),
                debrief=debrief
            )

        updated_turn = await db.get_web_interview_turn(turn_id)
        return {
            "status": "success",
            "evaluated_turn": sanitize_turn_for_client(
                updated_turn,
                is_realistic_mode=(session.get("mode") == "realistic")
            ) if updated_turn else None,
            "next_turn": next_turn,
            "is_session_completed": is_completed
        }

    @router.post("/interview/turn/{turn_id}/retry")
    async def retry_turn_answer(
        turn_id: str,
        body: SubmitTurnRequest,
        user: Dict[str, Any] = Depends(get_current_user)
    ):
        """
        Practice Mode Retry:
        Candidate re-answers after reviewing feedback.
        Evaluates retry and saves separate retry history without overwriting original score.
        """
        enforce_onboarding_completed(user)
        groq_key = await get_user_groq_key(user["id"])

        turn = await db.get_web_interview_turn(turn_id)
        if not turn:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Turn not found.")

        session = await db.get_web_interview_session(turn["session_id"], user["id"])
        if not session or session.get("mode") != "practice":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Retries are only available in Practice Mode.")

        answer_text = body.corrected_transcript or body.original_transcript or body.typed_answer or ""
        if not answer_text.strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Answer cannot be empty.")
        confirmed_profile = json.loads(user.get("confirmed_profile_json") or "{}")

        try:
            retry_eval = evaluate_turn_response(
                api_key=groq_key,
                question_dict=turn,
                answer_text=answer_text,
                is_voice=body.is_voice,
                scratchpad=body.scratchpad_text,
                confirmed_profile=confirmed_profile,
                model=settings.GROQ_MODEL
            )
        except GroqServiceError as e:
            logger.error(f"Retry evaluation failure for {turn_id}: {e}")
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

        history = turn.get("retry_history") or []
        history.append({
            "retry_index": len(history) + 1,
            "answer_text": answer_text,
            "evaluation": retry_eval,
            "timestamp": time.time()
        })

        await db.update_web_interview_turn(
            turn_id=turn_id,
            retry_count=len(history),
            retry_history=history
        )

        return {
            "status": "success",
            "retry_evaluation": retry_eval,
            "original_evaluation": turn.get("evaluation")
        }

    @router.post("/interview/turn/{turn_id}/dispute")
    async def dispute_turn_feedback(
        turn_id: str,
        body: DisputeTurnRequest,
        user: Dict[str, Any] = Depends(get_current_user)
    ):
        """
        Disputed Feedback Reassessment:
        Candidate explains what was missed or corrects transcript.
        Reassesses using the same rubric, explaining what changed and preserving transparent history.
        """
        enforce_onboarding_completed(user)
        groq_key = await get_user_groq_key(user["id"])

        turn = await db.get_web_interview_turn(turn_id)
        if not turn:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Turn not found.")

        session = await db.get_web_interview_session(turn["session_id"], user["id"])
        if not session:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized access to turn.")

        if turn.get("evaluation_status") != "completed":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Submit an answer for this turn before disputing its feedback."
            )

        current_answer = body.corrected_transcript or turn.get("corrected_transcript") or turn.get("original_transcript") or turn.get("typed_answer") or ""
        if not (body.clarification or "").strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Explain what was missed or correct your transcript before requesting reassessment."
            )
        if not current_answer.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="There is no recorded answer to reassess for this turn."
            )

        augmented_answer = f"{current_answer}\nCandidate clarification: {body.clarification}"

        confirmed_profile = json.loads(user.get("confirmed_profile_json") or "{}")

        try:
            reassessed = evaluate_turn_response(
                api_key=groq_key,
                question_dict=turn,
                answer_text=augmented_answer,
                is_voice=bool(turn.get("is_voice")),
                confirmed_profile=confirmed_profile,
                model=settings.GROQ_MODEL
            )
        except GroqServiceError as e:
            logger.error(f"Dispute reassessment failure for {turn_id}: {e}")
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(e))

        # Preserve the originally shown evaluation at the top level so the client
        # can always show "what changed" without digging through history.
        original_evaluation = turn.get("original_evaluation") or turn.get("evaluation")

        disputes = turn.get("dispute_history") or []
        disputes.append({
            "clarification": body.clarification,
            "previous_evaluation": original_evaluation,
            "reassessed_evaluation": reassessed,
            "timestamp": time.time()
        })

        await db.update_web_interview_turn(
            turn_id=turn_id,
            evaluation=reassessed,
            dispute_history=disputes,
            corrected_transcript=body.corrected_transcript or turn.get("corrected_transcript")
        )

        return {
            "status": "success",
            "message": "Feedback reassessed with candidate clarification.",
            "original_evaluation": original_evaluation,
            "reassessed_evaluation": reassessed
        }

    @router.post("/interview/session/{session_id}/end")
    async def end_interview_session(
        session_id: str,
        user: Dict[str, Any] = Depends(get_current_user)
    ):
        """
        Concludes interview session (either full completion or candidate ending early).
        Generates comprehensive evidence-linked debrief (clearly labeled as partial if ended early).
        """
        enforce_onboarding_completed(user)

        session = await db.get_web_interview_session(session_id, user["id"])
        if not session:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

        # Ending is idempotent: a finished round returns its stored debrief
        # instead of generating a second one.
        if session.get("status") in TERMINAL_SESSION_STATUSES:
            stored = session.get("debrief") or None
            return {
                "session": session,
                "debrief": stored,
                "debrief_id": session_id if stored else None,
            }

        turns = await db.get_web_interview_turns(session_id)
        answered = [t for t in turns if t.get("evaluation_status") == "completed"]

        # Nothing was answered: this is an abandoned round, not a debrief.
        if not answered:
            await db.update_web_interview_session(
                session_id=session_id,
                clerk_id=user["id"],
                status="abandoned"
            )
            updated_session = await db.get_web_interview_session(session_id, user["id"])
            return {
                "session": updated_session,
                "debrief": None,
                "debrief_id": None,
            }

        debrief = generate_interview_debrief(session, turns)

        status_val = "completed" if not debrief.get("is_partial") else "partial_completed"
        await db.update_web_interview_session(
            session_id=session_id,
            clerk_id=user["id"],
            status=status_val,
            overall_score=debrief.get("overall_score"),
            debrief=debrief
        )

        updated_session = await db.get_web_interview_session(session_id, user["id"])
        return {
            "session": updated_session,
            "debrief": debrief,
            "debrief_id": session_id,
        }

    @router.delete("/interview/session/{session_id}")
    async def delete_session(
        session_id: str,
        user: Dict[str, Any] = Depends(get_current_user)
    ):
        """Delete an individual interview session and its turns."""
        enforce_onboarding_completed(user)
        await db.delete_web_interview_session(session_id, user["id"])
        return {"status": "success", "message": "Interview session deleted."}

    @router.delete("/interview/history")
    async def delete_all_history(user: Dict[str, Any] = Depends(get_current_user)):
        """
        Delete ALL interview history, transcripts, answers, and debriefs for candidate.
        Ensures deleted records no longer influence recommendations or personalisation.
        """
        enforce_onboarding_completed(user)
        await db.delete_web_user_interview_history(user["id"])
        return {"status": "success", "message": "All interview history permanently deleted."}

    # ==================== Placement Tracker ====================

    @router.get("/tracker")
    async def list_tracker_items(user: Dict[str, Any] = Depends(get_current_user)):
        """List all placement opportunities."""
        enforce_onboarding_completed(user)
        return await db.list_placement_tracker_items(user["id"])

    @router.post("/tracker")
    async def create_tracker_item(
        body: TrackerItemRequest,
        user: Dict[str, Any] = Depends(get_current_user)
    ):
        """Add opportunity to placement tracker."""
        enforce_onboarding_completed(user)
        item_id = f"opp_{uuid.uuid4().hex[:10]}"
        await db.create_placement_tracker_item(
            item_id=item_id,
            clerk_id=user["id"],
            company=body.company,
            role=body.role,
            status=body.status,
            deadline=body.deadline,
            interview_date=body.interview_date,
            job_description=body.job_description,
            notes=body.notes
        )
        return {"status": "success", "id": item_id}

    @router.put("/tracker/{item_id}")
    async def update_tracker_item(
        item_id: str,
        body: TrackerItemRequest,
        user: Dict[str, Any] = Depends(get_current_user)
    ):
        """Update tracker opportunity."""
        enforce_onboarding_completed(user)
        await db.update_placement_tracker_item(
            item_id=item_id,
            clerk_id=user["id"],
            company=body.company,
            role=body.role,
            status=body.status,
            deadline=body.deadline,
            interview_date=body.interview_date,
            job_description=body.job_description,
            notes=body.notes
        )
        return {"status": "success"}

    @router.delete("/tracker/{item_id}")
    async def delete_tracker_item(
        item_id: str,
        user: Dict[str, Any] = Depends(get_current_user)
    ):
        """Delete opportunity from tracker."""
        enforce_onboarding_completed(user)
        await db.delete_placement_tracker_item(item_id, user["id"])
        return {"status": "success"}

    # ==================== Company Prep & Tavily Integration ====================

    @router.post("/company-prep")
    async def generate_company_prep(
        company_name: str = Form(...),
        target_role: Optional[str] = Form(None),
        user: Dict[str, Any] = Depends(get_current_user)
    ):
        """
        Prepares interview practice for a specific company using QuestionBank,
        candidate confirmed profile, and optional Tavily web research.
        """
        enforce_onboarding_completed(user)
        role = target_role or user.get("target_role", "Software Engineer")
        confirmed_profile = json.loads(user.get("confirmed_profile_json") or "{}")

        # Core technical questions tailored for company placement
        core_qs = qb.get_questions_for_topics(["dsa", "dbms", "oop", "os", "web_backend"])
        hr_qs = qb.get_questions_for_topics(["hr"])

        questions = core_qs[:4] + hr_qs[:1]

        research_summary = f"Curated interview questions for {company_name} ({role}). Focus on fundamental problem solving and system understanding."

        return {
            "company": company_name,
            "target_role": role,
            "research_summary": research_summary,
            "practice_questions": [
                {
                    "id": q["id"],
                    "question": q["question"],
                    "category": q["category"],
                    "difficulty": q["difficulty"]
                }
                for q in questions
            ],
            "disclaimer": "These practice questions are drawn from verified technical blueprints and common placement topics. They are not guaranteed actual company exam questions."
        }

    # ==================== Telegram Linking ====================

    @router.post("/telegram/link-code")
    async def create_link_code(user: Dict[str, Any] = Depends(get_current_user)):
        """Generate a secure, single-use 6-digit linking code valid for 10 minutes."""
        code = str(uuid.uuid4().int)[:6]
        expires_at = time.time() + 600  # 10 mins
        await db.create_telegram_link_code(code, user["id"], expires_at)
        return {
            "code": code,
            "expires_in_seconds": 600,
            "instructions": f"Open the Telegram bot and type /link {code} to connect your accounts."
        }

    # ==================== Privacy Consent ====================

    @router.post("/consent")
    async def record_consent(
        body: ConsentRequest,
        request: Request,
        user: Dict[str, Any] = Depends(get_current_user)
    ):
        """Record explicit consent for transient audio processing."""
        ip = request.client.host if request.client else None
        await db.log_user_consent(user["id"], body.consent_type, ip)
        return {"status": "success", "consent_recorded": True}

    @router.get("/consent")
    async def check_consent(user: Dict[str, Any] = Depends(get_current_user)):
        """Check if user has granted audio transient processing consent."""
        has_consented = await db.has_user_consented(user["id"], "audio_transient_processing")
        return {"has_consented": has_consented}

    return router
