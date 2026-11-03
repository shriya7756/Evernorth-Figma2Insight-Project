"""
MongoDB connection management.

PyMongo's MongoClient owns a thread-safe connection pool, so the app keeps a
single client per process and hands out database handles from it. The client
is created lazily on first use and closed on application shutdown.
"""

import logging
import threading
from typing import Optional

try:
    import dns.resolver
    _res = dns.resolver.get_default_resolver()
    _res.timeout = 2.0
    _res.lifetime = 3.0
except Exception:
    pass

from pymongo import MongoClient
from pymongo.database import Database
from pymongo.errors import PyMongoError

from backend.config import Settings, get_settings

logger = logging.getLogger("figma2insight.db")

_client: Optional[MongoClient] = None
_lock = threading.Lock()


def get_client(settings: Optional[Settings] = None) -> MongoClient:
    """Return the shared MongoClient, creating it on first call."""
    global _client
    if _client is None:
        with _lock:
            if _client is None:
                settings = settings or get_settings()
                if not settings.mongodb_uri:
                    raise RuntimeError("MONGODB_URI is not configured.")
                _client = MongoClient(
                    settings.mongodb_uri,
                    appname="figma2insight",
                    serverSelectionTimeoutMS=settings.mongodb_timeout_ms,
                    connectTimeoutMS=settings.mongodb_timeout_ms,
                    retryWrites=True,
                    tz_aware=True,
                )
    return _client


def get_database(settings: Optional[Settings] = None) -> Database:
    settings = settings or get_settings()
    return get_client(settings)[settings.mongodb_db_name]


def ping(settings: Optional[Settings] = None) -> bool:
    """Return True when the configured MongoDB deployment answers a ping."""
    try:
        get_client(settings).admin.command("ping", maxTimeMS=1500)
        return True
    except Exception as exc:
        logger.warning("MongoDB ping failed: %s", type(exc).__name__)
        return False


def close_client() -> None:
    global _client
    with _lock:
        if _client is not None:
            _client.close()
            _client = None
