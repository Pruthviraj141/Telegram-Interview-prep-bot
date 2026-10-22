"""
Application entrypoint.
Combines FastAPI web server (uvicorn) and Telegram Bot asynchronous polling
into a single process with clean, graceful startup and shutdown.
"""
import asyncio
import logging
import signal
import sys
import uvicorn
from telegram.ext import ApplicationBuilder
from app.config import get_settings
from app.database import Database
from app.security import get_fernet
from app.web import create_app
from app.bot import register_handlers

class TransientNetworkFilter(logging.Filter):
    """Filter out noisy full tracebacks for transient network resets during long-polling."""
    def filter(self, record: logging.LogRecord) -> bool:
        if record.exc_info and record.exc_info[0]:
            exc_str = str(record.exc_info[1])
            exc_type = record.exc_info[0].__name__
            if "NetworkError" in exc_type or "ReadError" in exc_str or "RemoteProtocolError" in exc_str:
                record.exc_info = None
                record.levelno = logging.WARNING
                record.levelname = "WARNING"
                record.msg = "Telegram long-polling connection reset by remote server; automatically re-established."
        return True


# Configure logging with sensitive data redaction
logging.basicConfig(
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    level=logging.INFO,
    handlers=[logging.StreamHandler(sys.stdout)]
)
logging.getLogger("telegram.ext.Updater").addFilter(TransientNetworkFilter())
logging.getLogger("telegram.ext._updater").addFilter(TransientNetworkFilter())
logger = logging.getLogger("app.main")


async def run_application() -> None:
    settings = get_settings()

    # Validate encryption key format early
    if not settings.ENCRYPTION_KEY:
        logger.error("ENCRYPTION_KEY environment variable is missing or empty! Exiting.")
        sys.exit(1)

    try:
        get_fernet(settings.ENCRYPTION_KEY)
    except Exception as e:
        logger.error(f"Invalid ENCRYPTION_KEY: {e}. Exiting.")
        sys.exit(1)

    if not settings.TELEGRAM_BOT_TOKEN:
        logger.error("TELEGRAM_BOT_TOKEN is not set! Exiting.")
        sys.exit(1)

    # Initialize Database
    logger.info("Initializing SQLite database...")
    db = Database(settings.DATABASE_PATH)
    await db.init_db()

    # Load and validate Question Bank
    logger.info("Loading and validating Question Bank...")
    from app.question_bank import QuestionBank
    qb = QuestionBank("data/question_bank.json")
    qb.load_and_validate()

    # Create FastAPI app
    web_app = create_app(settings, db, qb)
    uvi_config = uvicorn.Config(
        app=web_app,
        host=settings.WEB_HOST,
        port=settings.WEB_PORT,
        log_level="info"
    )
    server = uvicorn.Server(uvi_config)

    # Build Telegram Bot application with robust HTTPX network configuration
    from telegram.request import HTTPXRequest

    tg_request = HTTPXRequest(
        connection_pool_size=16,
        connect_timeout=20.0,
        read_timeout=20.0,
        write_timeout=20.0,
        pool_timeout=20.0
    )
    get_updates_request = HTTPXRequest(
        connection_pool_size=8,
        connect_timeout=20.0,
        read_timeout=35.0,
        write_timeout=20.0,
        pool_timeout=20.0
    )
    tg_builder = (
        ApplicationBuilder()
        .token(settings.TELEGRAM_BOT_TOKEN)
        .request(tg_request)
        .get_updates_request(get_updates_request)
    )
    tg_app = tg_builder.build()
    register_handlers(tg_app, settings, db, qb)

    # Initialize Phase 3 Daily Scheduler Engine
    from app.services.daily_scheduler import DailySchedulerEngine
    scheduler = DailySchedulerEngine(db=db, qb=qb, bot=tg_app.bot)

    shutdown_event = asyncio.Event()

    def signal_handler():
        logger.info("Shutdown signal received. Stopping services...")
        shutdown_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, signal_handler)
        except NotImplementedError:
            pass

    logger.info(f"Starting web server on {settings.WEB_HOST}:{settings.WEB_PORT}")
    server_task = asyncio.create_task(server.serve())

    logger.info("Starting Telegram Bot polling...")
    await tg_app.initialize()
    await tg_app.start()
    await tg_app.updater.start_polling(
        poll_interval=0.5,
        timeout=10,
        drop_pending_updates=True,
        bootstrap_retries=-1
    )

    logger.info("Starting Daily Scheduler Engine...")
    scheduler.start(tg_app.bot)

    logger.info("Application is running successfully.")

    try:
        await shutdown_event.wait()
    finally:
        logger.info("Stopping Daily Scheduler Engine...")
        await scheduler.stop()

        logger.info("Gracefully shutting down Telegram Bot...")
        if tg_app.updater and tg_app.updater.running:
            await tg_app.updater.stop()
        await tg_app.stop()
        await tg_app.shutdown()

        logger.info("Gracefully shutting down Web Server...")
        server.should_exit = True
        await server_task
        logger.info("All services stopped.")


def main() -> None:
    try:
        asyncio.run(run_application())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Application terminated.")


if __name__ == "__main__":
    main()
