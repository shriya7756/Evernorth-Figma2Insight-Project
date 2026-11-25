"""A small in-process, per-client rate limiter for the expensive write endpoints."""

import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import HTTPException, Request


class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: float = 60.0):
        self.max_requests = max_requests
        self.window = window_seconds
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    @staticmethod
    def client_key(request: Request) -> str:
        # Render and Netlify put the real client address first in X-Forwarded-For.
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()[:64]
        return request.client.host if request.client else "unknown"

    def check(self, request: Request) -> None:
        if self.max_requests <= 0:
            return
        key = self.client_key(request)
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            while hits and now - hits[0] > self.window:
                hits.popleft()
            if len(hits) >= self.max_requests:
                raise HTTPException(
                    status_code=429,
                    detail="Too many requests. Please wait a minute and try again.",
                    headers={"Retry-After": str(int(self.window))},
                )
            hits.append(now)
            if len(self._hits) > 10_000:  # bound memory under abuse
                for stale in [k for k, v in self._hits.items() if not v or now - v[-1] > self.window]:
                    self._hits.pop(stale, None)
