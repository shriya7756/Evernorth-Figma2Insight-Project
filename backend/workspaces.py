"""
Per-design workspaces for the staged pipeline.

Each loaded design (an upload, or a design imported from the Figma plugin) gets
its own directory holding the source JSON and the intermediate stage outputs, so
people using the hosted app at the same time never overwrite each other's runs.

Workspaces are scratch space: they are removed after `ttl_hours`. Completed runs
are persisted separately by the history store (MongoDB or outputs/history/).
"""

import logging
import re
import shutil
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

logger = logging.getLogger("figma2insight.workspaces")

DESIGN_ID_PATTERN = r"^[a-f0-9]{32}$"
_DESIGN_ID_RE = re.compile(DESIGN_ID_PATTERN)


class WorkspaceNotFoundError(Exception):
    """The requested design workspace does not exist (expired, or the server restarted)."""


@dataclass(frozen=True)
class StagePaths:
    figma: Path
    candidates: Path
    raw_predictions: Path
    clean_predictions: Path
    grid_layout: Path
    page: Path


class WorkspaceManager:
    def __init__(self, root: Path, ttl_hours: int = 24):
        self.root = root
        self.ttl_seconds = max(1, ttl_hours) * 3600

    @staticmethod
    def is_valid_id(design_id: Optional[str]) -> bool:
        return bool(design_id) and bool(_DESIGN_ID_RE.match(design_id))

    def _dir(self, design_id: str) -> Path:
        if not self.is_valid_id(design_id):
            raise WorkspaceNotFoundError(design_id)
        return self.root / design_id

    def paths(self, design_id: str) -> StagePaths:
        base = self._dir(design_id)
        if not (base / "figma_data.json").is_file():
            raise WorkspaceNotFoundError(design_id)
        return self._stage_paths(base)

    @staticmethod
    def _stage_paths(base: Path) -> StagePaths:
        return StagePaths(
            figma=base / "figma_data.json",
            candidates=base / "candidates.json",
            raw_predictions=base / "raw_predictions.json",
            clean_predictions=base / "clean_predictions.json",
            grid_layout=base / "grid_layout.json",
            page=base / "page.json",
        )

    def create(self, raw_json: bytes) -> str:
        """Store a validated design payload in a new workspace and return its id."""
        self.cleanup()
        design_id = uuid.uuid4().hex
        base = self.root / design_id
        base.mkdir(parents=True, exist_ok=False)
        (base / "figma_data.json").write_bytes(raw_json)
        return design_id

    def cleanup(self) -> int:
        """Remove workspaces older than the TTL. Returns how many were removed."""
        if not self.root.is_dir():
            return 0
        cutoff = time.time() - self.ttl_seconds
        removed = 0
        for child in self.root.iterdir():
            try:
                if child.is_dir() and self.is_valid_id(child.name) and child.stat().st_mtime < cutoff:
                    shutil.rmtree(child, ignore_errors=True)
                    removed += 1
            except OSError:
                continue
        if removed:
            logger.info("Removed %d expired design workspaces.", removed)
        return removed
