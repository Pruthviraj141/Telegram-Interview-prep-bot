"""
Standalone runner for the AI Interview Coach FastAPI Web API server.
Runs the backend API on http://127.0.0.1:8000 for the web frontend.
"""
from dotenv import load_dotenv
load_dotenv(override=True)

import os
import sys
import argparse
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
    parser = argparse.ArgumentParser(description="Run AI Interview Coach FastAPI Web API")
    parser.add_argument("--host", default=None, help="Host to bind (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=None, help="Port to bind (default: 8000)")
    args, _ = parser.parse_known_args()

    settings = get_settings()
    host = args.host or os.environ.get("WEB_HOST") or settings.WEB_HOST or "0.0.0.0"
    port = args.port or int(os.environ.get("WEB_PORT") or settings.WEB_PORT or 8000)

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
        host=host,
        port=port,
        log_level="info"
    )
    server = uvicorn.Server(config)
    logger.info(f"FastAPI Web Server running on http://{host}:{port}")
    await server.serve()

if __name__ == "__main__":
    asyncio.run(start_server())
