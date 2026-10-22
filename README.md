# 🎯 Telegram AI Interview Coach & Web Studio

An intelligent, multi-platform interview preparation companion powered by **FastAPI**, **Groq LLM/Whisper**, and **Next.js**. Prepare for technical interviews via interactive **Telegram bot** sessions or an immersive **Web Audio Studio** with real-time feedback, project defence interrogation, and adaptive spaced repetition.

---

## ⚡ Highlights

- 🔒 **BYOK Security (Bring-Your-Own-Key)**: User Groq API keys are never typed in chat; submitted through a secure, single-use HTTPS page and encrypted at rest using AES-Fernet.
- 📄 **Smart Resume Profiling**: Extracts skills, frameworks, and projects from PDF/DOCX to recommend tailored roles and custom question tracks.
- 🎙️ **Voice & Audio Practice**: Native Telegram voice notes and Web Studio audio with Whisper speech-to-text, scoring technical accuracy, completeness, and clarity.
- 🛡️ **5-Round Project Defence**: Deep-dive interrogation challenging technical decisions, architectural trade-offs, scalability, and edge cases.
- 🌐 **Live Company Prep**: Integrated with Tavily for fresh company hiring patterns, recent interview rounds, and verified citations.
- 📈 **Adaptive Spaced Repetition**: Dynamic review intervals based on performance history with evidence-based weakness detection and weekly report cards.

---

## 🏗️ Architecture & Tech Stack

- **Backend**: Python 3.12, FastAPI, SQLite (WAL mode), Pydantic v2
- **Telegram Bot**: `python-telegram-bot` (async/await)
- **AI & Speech**: Groq (`openai/gpt-oss-20b`, `whisper-large-v3-turbo`), Tavily Search API
- **Web Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS, Lucide Icons, Clerk Auth
- **Security**: Fernet symmetric encryption, SHA-256 token hashing, strict CORS

---

## 🚀 Quick Start

### 1. Prerequisites
- Python 3.12+
- Node.js 18+ and npm
- Groq API Key & Telegram Bot Token (from [@BotFather](https://t.me/BotFather))

### 2. Backend & Telegram Bot

```bash
# Clone the repository
git clone https://github.com/Pruthviraj141/Telegram-Interview-prep-bot.git
cd Telegram-Interview-prep-bot

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Generate a Fernet encryption key and set ENCRYPTION_KEY and TELEGRAM_BOT_TOKEN:
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# Run tests
pytest -v

# Start FastAPI server & Telegram Bot
python -m app.main
```

### 3. Next.js Web Studio

```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to access the interactive web interview studio.

---

## ⚙️ Configuration Reference

| Variable | Description | Default |
|---|---|---|
| `APP_ENV` | Application environment (`development` / `production`) | `development` |
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather | Required |
| `ENCRYPTION_KEY` | 32 url-safe base64-encoded Fernet key | Required |
| `WEB_BASE_URL` | Base URL for FastAPI web hooks & key setup | `http://127.0.0.1:8000` |
| `DATABASE_PATH` | Path to SQLite database file | `app.db` |
| `TAVILY_API_KEY` | Optional API key for live web research | Optional |
| `CLERK_SECRET_KEY` | Clerk backend secret key for web auth | Optional |
| `FRONTEND_ORIGIN` | Allowed CORS origin for frontend | `http://localhost:3000` |

---

## 📂 Project Structure

```
.
├── app/
│   ├── bot.py                # Telegram bot conversation handlers
│   ├── config.py             # Pydantic settings & validation
│   ├── database.py           # SQLite schema and query operations
│   ├── resume_parser.py      # PDF/DOCX extraction & verification
│   ├── security.py           # Fernet encryption & token hashing
│   ├── services/             # Core business logic & AI orchestration
│   │   ├── adaptive_learning_service.py
│   │   ├── coaching_service.py
│   │   ├── company_prep_service.py
│   │   ├── groq_service.py
│   │   ├── mock_interview_service.py
│   │   ├── project_defence_service.py
│   │   └── tavily_service.py
│   └── web_routes.py         # FastAPI endpoints & key registration
├── data/
│   └── question_bank.json    # Curated technical questions (9 domains)
├── frontend/                 # Next.js 15 Web Interview Studio
├── tests/                    # Automated unit & integration tests
└── run_web.py                # Standalone web runner
```

---

## 📜 License
MIT License. Built for students and developers aiming to master technical interviews.
