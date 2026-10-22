"""
Standalone runner for the AI Interview Coach FastAPI Web API server.
Runs the backend API on http://127.0.0.1:8000 for the web frontend.
"""
from dotenv import load_dotenv
load_dotenv(override=True)

import asyncio
import logging
import uvicorn
from app.config import get_settings
from app.database import Database
from app.question_bank import QuestionBank
from app.web import create_app
from app.security import generate_fernet_key

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("run_web")

async def start_server():
    settings = get_settings()
    if not settings.ENCRYPTION_KEY:
        settings.ENCRYPTION_KEY = generate_fernet_key()
        logger.info("Generated ephemeral ENCRYPTION_KEY for session.")

    logger.info("Initializing SQLite database...")
    db = Database(settings.DATABASE_PATH)
    await db.init_db()

    logger.info("Loading Question Bank...")
    qb = QuestionBank("data/question_bank.json")
    qb.load_and_validate()

    app = create_app(settings, db, qb)
    config = uvicorn.Config(
        app=app,
        host=settings.WEB_HOST,
        port=settings.WEB_PORT,
        log_level="info"
    )
    server = uvicorn.Server(config)
    logger.info(f"FastAPI Web Server running on http://{settings.WEB_HOST}:{settings.WEB_PORT}")
    await server.serve()

if __name__ == "__main__":
    asyncio.run(start_server())
