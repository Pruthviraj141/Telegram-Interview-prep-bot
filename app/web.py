"""
FastAPI web application providing:
- Health check endpoint (no secrets leaked)
- Secure Groq API key setup page (HTML, mobile-friendly, HTTPS guard)
- Key submission API (consumes single-use token, validates key against Groq, encrypts at rest)
- Key deletion API
"""
import time
import logging
from typing import Optional
from fastapi import FastAPI, Request, Form, HTTPException, status
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from app.config import Settings
from app.database import Database
from app.question_bank import QuestionBank
from app.security import hash_token, encrypt_api_key, mask_api_key
from app.services.groq_service import validate_groq_key, GroqServiceError
from app.web_routes import get_web_router

logger = logging.getLogger(__name__)


def is_secure_request(request: Request, settings: Settings) -> bool:
    """
    Check if the incoming request is over HTTPS or allowed localhost in dev.
    In production, fails closed if not TLS.
    Rejects arbitrary untrusted X-Forwarded-Proto unless running behind trusted proxy.
    """
    client_host = request.client.host if request.client else ""
    is_localhost = client_host in {"127.0.0.1", "::1", "localhost"}
    
    if settings.APP_ENV in {"development", "testing"} and is_localhost:
        return True

    # If scheme is directly https
    if request.url.scheme == "https":
        return True

    # Check forward headers only if proxy is trusted (loopback or private CIDR)
    # Fail closed for production otherwise
    x_forwarded_proto = request.headers.get("x-forwarded-proto", "").lower()
    if is_localhost and x_forwarded_proto == "https":
        return True

    return False


def create_app(settings: Settings, db: Database, qb: Optional[QuestionBank] = None) -> FastAPI:
    app = FastAPI(title="AI Interview Coach API", docs_url=None, redoc_url=None)

    # Allow CORS from Next.js frontend
    allowed_origins = [
        settings.FRONTEND_ORIGIN,
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if qb is None:
        qb = QuestionBank("data/question_bank.json")
        qb.load_and_validate()

    # Mount Web REST API
    app.include_router(get_web_router(settings, db, qb), prefix="/api")


    @app.get("/")
    async def root():
        return {
            "app": "Telegram AI Interview Coach",
            "status": "online",
            "health": "/health"
        }

    @app.get("/health")
    async def health():
        """Health endpoint: reveals no personal data or secrets."""
        return {
            "status": "healthy",
            "env": settings.APP_ENV,
            "version": "1.0.0"
        }

    @app.get("/setup-key", response_class=HTMLResponse)
    async def setup_key_page(request: Request, token: Optional[str] = None):
        """
        Serves the clean, mobile-friendly key setup form.
        Enforces HTTPS check and validates single-use token presence.
        """
        if not is_secure_request(request, settings):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insecure connection: Groq API key setup requires HTTPS."
            )

        if not token or len(token.strip()) < 16:
            return HTMLResponse(
                content="""
                <!DOCTYPE html>
                <html><head><meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Invalid Link</title><style>body{font-family:sans-serif;padding:2rem;text-align:center;color:#333;}</style></head>
                <body><h2>Invalid or Missing Setup Token</h2><p>Please request a new link from your Telegram bot.</p></body></html>
                """,
                status_code=400
            )

        # Render minimal HTML without external CDN dependencies
        safe_token = token.strip()
        html = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Secure Groq API Key Setup</title>
            <style>
                body {{
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                    background: #f8fafc;
                    color: #0f172a;
                    margin: 0;
                    padding: 24px;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 90vh;
                }}
                .card {{
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
                    max-width: 440px;
                    width: 100%;
                    padding: 32px;
                    box-sizing: border-box;
                }}
                h1 {{ font-size: 1.25rem; font-weight: 600; margin-top: 0; margin-bottom: 8px; }}
                p {{ font-size: 0.875rem; color: #475569; line-height: 1.5; margin-bottom: 24px; }}
                label {{ font-size: 0.875rem; font-weight: 500; display: block; margin-bottom: 6px; }}
                input[type="password"] {{
                    width: 100%;
                    box-sizing: border-box;
                    padding: 10px 12px;
                    border: 1px solid #cbd5e1;
                    border-radius: 6px;
                    font-size: 0.95rem;
                    margin-bottom: 20px;
                }}
                input[type="password"]:focus {{
                    outline: 2px solid #2563eb;
                    border-color: transparent;
                }}
                button {{
                    width: 100%;
                    background: #2563eb;
                    color: #fff;
                    border: none;
                    padding: 12px;
                    border-radius: 6px;
                    font-size: 1rem;
                    font-weight: 500;
                    cursor: pointer;
                }}
                button:hover {{ background: #1d4ed8; }}
                .notice {{
                    background: #f1f5f9;
                    border-left: 4px solid #3b82f6;
                    padding: 10px;
                    margin-bottom: 20px;
                    font-size: 0.775rem;
                    color: #334155;
                }}
            </style>
        </head>
        <body>
            <div class="card">
                <h1>Connect Groq API Key</h1>
                <p>Your API key is authenticated directly against Groq, encrypted at rest using Fernet, and never shared or logged.</p>
                <div class="notice">
                    Get your key from <strong>console.groq.com/keys</strong>.
                </div>
                <form action="/setup-key" method="POST">
                    <input type="hidden" name="token" value="{safe_token}">
                    <label for="groq_key">Groq API Key</label>
                    <input type="password" id="groq_key" name="groq_key" placeholder="gsk_..." required autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
                    <button type="submit">Validate & Save Securely</button>
                </form>
            </div>
        </body>
        </html>
        """
        return HTMLResponse(content=html)

    @app.post("/setup-key", response_class=HTMLResponse)
    async def process_key_setup(
        request: Request,
        token: str = Form(...),
        groq_key: str = Form(...)
    ):
        """
        Validate single-use token, validate key with Groq, encrypt and save to database.
        """
        if not is_secure_request(request, settings):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insecure connection: Groq API key setup requires HTTPS."
            )

        token_raw = token.strip()
        groq_key_raw = groq_key.strip()

        if not token_raw or not groq_key_raw:
            return HTMLResponse(
                "<h3>Invalid Submission</h3><p>Both token and key are required.</p>",
                status_code=400
            )

        token_h = hash_token(token_raw)
        now_ts = time.time()
        telegram_id = await db.consume_token(token_h, now_ts)

        if not telegram_id:
            return HTMLResponse(
                content="""
                <!DOCTYPE html>
                <html><head><meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Invalid Token</title><style>body{font-family:sans-serif;padding:2rem;text-align:center;color:#b91c1c;}</style></head>
                <body><h2>Setup Link Expired or Invalid</h2>
                <p>This setup link has either expired, already been used, or is invalid. Please request a new link in Telegram.</p></body></html>
                """,
                status_code=400
            )

        # Validate key against Groq
        try:
            validate_groq_key(groq_key_raw)
        except GroqServiceError as e:
            return HTMLResponse(
                content=f"""
                <!DOCTYPE html>
                <html><head><meta name="viewport" content="width=device-width, initial-scale=1">
                <title>Validation Failed</title><style>body{{font-family:sans-serif;padding:2rem;text-align:center;color:#b91c1c;}}</style></head>
                <body><h2>Groq Key Validation Failed</h2>
                <p>{str(e)}</p>
                <p>Return to Telegram and run <code>/setup_key</code> or <code>/start</code> to generate a fresh link.</p></body></html>
                """,
                status_code=400
            )

        # Encrypt key at rest
        try:
            encrypted_val = encrypt_api_key(groq_key_raw, settings.ENCRYPTION_KEY)
            masked = mask_api_key(groq_key_raw)
            await db.save_credentials(telegram_id, encrypted_val, masked)
            
            # Transition onboarding state if user was awaiting key
            user = await db.get_or_create_user(telegram_id)
            if user.get("onboarding_state") == "AWAITING_GROQ_KEY":
                await db.update_onboarding_state(telegram_id, "KEY_SAVED")
        except Exception as e:
            logger.error(f"Failed to persist credentials: {e}")
            return HTMLResponse("<h3>Internal Server Error</h3><p>Failed to securely store key.</p>", status_code=500)

        return HTMLResponse(
            content=f"""
            <!DOCTYPE html>
            <html><head><meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Key Saved</title><style>body{{font-family:sans-serif;padding:2rem;text-align:center;color:#15803d;}}</style></head>
            <body><h2>Success! Groq Key Connected</h2>
            <p>Your API key (<code>{masked}</code>) has been verified and safely stored.</p>
            <p>You can now close this tab and return to your Telegram bot to continue!</p></body></html>
            """,
            status_code=200
        )

    return app
