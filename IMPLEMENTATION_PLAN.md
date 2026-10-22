# AI Interview Coach — Implementation Plan & Baseline

## 1. Baseline Audit Findings
- **Language & Runtime**: Python 3.12.15, Node.js v22.23.1, npm 10.9.8.
- **Backend Architecture**: FastAPI web server (`app/web.py`), aiosqlite database (`app/database.py`), python-telegram-bot long-polling (`app/bot.py`), QuestionBank (`app/question_bank.py`, `data/question_bank.json`), background daily scheduler (`app/services/daily_scheduler.py`).
- **AI & Integrations**:
  - Groq SDK (`groq-python`) for LLM (`openai/gpt-oss-20b`) and STT (`whisper-large-v3-turbo`).
  - Cryptography: Fernet authenticated symmetric encryption in `app/security.py` for user Groq API keys at rest.
  - Resume Parsing: PyMuPDF (`fitz`) and `python-docx` in `app/resume_parser.py` (in-memory parsing with magic bytes validation).
  - Tavily Web Search: Cached web research in `app/services/tavily_service.py`.
- **Test Baseline**: 86 pytest tests running and passing via `PYTHONPATH=. .venv/bin/pytest`.
- **Frontend Status**: No web frontend currently exists in repository. We will create a Next.js App Router application in `frontend/`.

## 2. Identified Data Migration & Schema Needs
To support web users alongside optional Telegram linking without breaking existing Telegram users:
- Create unified `web_users` or extend `users` with `clerk_user_id TEXT UNIQUE`, `email TEXT`, `display_name TEXT`, `onboarding_step TEXT`.
- Support credentials and resumes scoped to `clerk_user_id` or unified `user_id`.
- Add tables/columns for:
  - `web_interview_sessions` (session state, mode, role, seniority, blueprint_json, status, current_turn, duration_mode).
  - `web_interview_turns` (turn_index, question_id, question_text, rubric_json, original_transcript, corrected_transcript, typed_answer, is_voice, scratchpad, evaluation_json, retry_count, retry_evaluation_json, assistance_used).
  - `web_placement_tracker` (company, role, status, deadlines, interview_date, notes, job_description).
  - `telegram_link_codes` (short-lived 6-digit or secure token linking code between Web and Telegram).
  - `user_consent_logs` (first-session voice & privacy consent timestamp).

## 3. Key Risks & Mitigations
- **Privacy Non-Negotiable**: Absolutely no raw audio/video retention. Audio bytes sent to FastAPI transcribe endpoint are piped directly to Groq Whisper in memory; MediaStream tracks stopped immediately on client. Automated privacy tests to guarantee zero temp files or audio tables.
- **Secret Redaction**: Groq API keys must never appear in logs, responses (only masked e.g. `gsk_...1234`), Clerk metadata, or Telegram messages.
- **Onboarding Enforcement**: Middleware / API guard verifying: Clerk Auth -> Groq Key -> Resume -> Conversational Setup -> Dashboard.
- **Turn-by-turn UX**: Clean state machine for Orb (`idle`, `preflight`, `listening`, `transcribing`, `thinking`, `speaking`, `feedback`, `paused`, `recoverable_error`, `completed`).

## 4. Ordered Milestones
- [x] **Phase 0**: Repository audit & baseline plan (`IMPLEMENTATION_PLAN.md`).
- [x] **Phase 1**: Backend API extensions for Web (Clerk verification, Groq key BYOK endpoints, Onboarding status, linking).
- [x] **Phase 2**: Frontend initialization (Next.js 16 App Router, TypeScript, Tailwind CSS, Lucide, design tokens `#F4F1EA`, `#20232C`, `#5967F2`, `#0B1020`, `#65D9F2`, `#168A72`, animated Orb component).
- [x] **Phase 3**: Onboarding Flow (Clerk Auth, Groq Key setup & validation, PDF/DOCX Resume upload & extraction review, Conversational prep setup).
- [x] **Phase 4**: Web Interview Studio Core (State machine, Turn-by-turn voice capture, browser SpeechSynthesis TTS, Stop Speaking, question blueprint, question quality gate, text fallback, scratchpad).
- [x] **Phase 5**: Audio Privacy Enforcement & Testing (Zero audio persistence, guaranteed stream teardown, consent disclosures).
- [x] **Phase 6**: Evaluation & Debrief (Evidence-based 1-5 rubrics, delivery vs content separation, improved answers, retries, partial debrief, disputed feedback reassessment).
- [x] **Phase 7**: Dashboard, Company Prep, Placement Tracker & Telegram Link (Command centre, Tavily research, Kanban/list tracker, 1-time Telegram linking code).
- [x] **Phase 8**: Data deletion, rate limits, security verification.
- [x] **Phase 9**: Full verification (95 backend pytest tests pass, frontend production build passes).

