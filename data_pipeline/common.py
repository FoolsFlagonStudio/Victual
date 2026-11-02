"""Shared config and HTTP helpers for the Forkast data pipeline."""
import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv

PIPELINE_DIR = Path(__file__).resolve().parent
load_dotenv(PIPELINE_DIR / ".env")

API_URL = os.getenv("FORKAST_API_URL", "http://localhost:8080").rstrip("/")
CACHE_DIR = PIPELINE_DIR / "cache"
LOG_DIR = PIPELINE_DIR / "logs"


def require_env(name: str) -> str:
    """Read a required setting from .env, or stop with a clear message."""
    value = os.getenv(name, "").strip()
    if not value:
        sys.exit(f"Missing {name} in data_pipeline/.env")
    return value


def user_agent() -> str:
    """Identifies the scraper to site owners, with a way to reach you."""
    email = require_env("SCRAPER_CONTACT_EMAIL")
    return f"ForkastRecipeBot/0.1 (personal project; contact {email})"


def post_json(path: str, body) -> dict:
    """POST to the Forkast admin API and return the JSON response."""
    response = requests.post(
        f"{API_URL}{path}",
        json=body,
        headers={"X-Admin-Key": require_env("FORKAST_ADMIN_KEY")},
        timeout=1800,  # imports re-cost every recipe, which can take minutes
    )
    if response.status_code >= 400:
        sys.exit(f"{response.status_code} from {path}: {response.text}")
    return response.json()
