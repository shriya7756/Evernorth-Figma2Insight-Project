"""
Runtime configuration for Figma2Insight.

Values come from environment variables. For local development an optional
`.env` file in the project root is read first (existing environment variables
always win). Secrets are never hardcoded here; see `.env.example`.
"""

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

ROOT = Path(__file__).resolve().parents[1]

DEFAULT_CORS_ORIGINS = "http://localhost:5174,http://127.0.0.1:5174,https://figma2insight.netlify.app"


def _load_dotenv(path: Path) -> None:
    """Populate os.environ from a simple KEY=VALUE file without overriding existing values."""
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key.startswith("export "):
            key = key[len("export "):].strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        if key:
            os.environ.setdefault(key, value)


def _int_env(name: str, default: int, minimum: int = 1) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return max(minimum, int(raw))
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    mongodb_uri: Optional[str]
    mongodb_db_name: str
    mongodb_timeout_ms: int
    cors_origins: List[str]
    max_upload_mb: int
    port: int

    @property
    def mongodb_enabled(self) -> bool:
        return bool(self.mongodb_uri)

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Read settings once per process."""
    _load_dotenv(ROOT / ".env")

    origins = os.environ.get("CORS_ORIGINS", DEFAULT_CORS_ORIGINS)
    return Settings(
        mongodb_uri=(os.environ.get("MONGODB_URI") or "").strip() or None,
        mongodb_db_name=(os.environ.get("MONGODB_DB_NAME") or "figma2insight").strip(),
        mongodb_timeout_ms=_int_env("MONGODB_TIMEOUT_MS", 5000, minimum=500),
        cors_origins=[o.strip() for o in origins.split(",") if o.strip()],
        max_upload_mb=_int_env("MAX_UPLOAD_MB", 50),
        port=_int_env("PORT", 8001),
    )
