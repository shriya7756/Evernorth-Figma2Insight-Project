"""
Saved-analysis (run history) storage.

Two interchangeable backends implement the same interface:

* MongoHistoryStore - used when MONGODB_URI is set. Run summaries live in the
  `analysis_runs` collection; each JSON output is gzip-compressed into its own
  document in `run_outputs`, so list queries stay small and fast.
* FileHistoryStore  - the original on-disk format under outputs/history/,
  used when MongoDB is not configured so the app still runs locally.
"""

import gzip
import json
import logging
import re
import shutil
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Protocol, Tuple

from bson import Binary
from pymongo import ASCENDING, DESCENDING
from pymongo.database import Database
from pymongo.errors import CollectionInvalid, DuplicateKeyError, OperationFailure, PyMongoError

from backend.schemas import (
    OUTPUT_COLLECTION_VALIDATOR,
    OUTPUT_KINDS,
    RUN_COLLECTION_VALIDATOR,
    RunRecord,
)

logger = logging.getLogger("figma2insight.storage")

OUTPUT_FILENAMES = {
    "figma_data": "figma_data.json",
    "raw_predictions": "raw_predictions.json",
    "clean_predictions": "clean_predictions.json",
    "grid_layout": "grid_layout.json",
    "page_json": "page.json",
}

# Stay safely under MongoDB's 16 MB document limit.
MAX_COMPRESSED_OUTPUT_BYTES = 15 * 1024 * 1024
SCHEMA_VERSION = 1


class StorageUnavailableError(Exception):
    """The storage backend could not be reached."""


class RunNotFoundError(Exception):
    pass


class OutputNotFoundError(Exception):
    pass


class OutputTooLargeError(Exception):
    pass


class HistoryStore(Protocol):
    backend: str

    def health(self) -> bool: ...
    def list_runs(self, limit: int, skip: int, query: Optional[str]) -> Tuple[List[Dict[str, Any]], int]: ...
    def get_run(self, run_id: str) -> Dict[str, Any]: ...
    def get_output(self, run_id: str, kind: str) -> bytes: ...
    def save_run(self, record: RunRecord, outputs: Dict[str, Any]) -> Dict[str, Any]: ...
    def delete_run(self, run_id: str) -> None: ...


def _encode_json(data: Any) -> bytes:
    return json.dumps(data, ensure_ascii=False).encode("utf-8")


def _search_pattern(query: Optional[str]) -> Optional[str]:
    """Escape free-text search so it is always treated literally."""
    if not query:
        return None
    query = query.strip()[:100]
    return re.escape(query) if query else None


# ---------------------------------------------------------------------------
# MongoDB backend
# ---------------------------------------------------------------------------

class MongoHistoryStore:
    backend = "mongodb"

    def __init__(self, db: Database):
        self._db = db
        self._runs = db["analysis_runs"]
        self._outputs = db["run_outputs"]
        self._schema_ready = False
        self._schema_lock = threading.Lock()
        self._last_health: Optional[bool] = None
        self._last_health_time: float = 0.0

    def _ensure_schema(self) -> None:
        """Create collections with validators and indexes once (idempotent)."""
        if self._schema_ready:
            return
        with self._schema_lock:
            if self._schema_ready:
                return
            try:
                existing = set(self._db.list_collection_names())
                for name, validator in (
                    ("analysis_runs", RUN_COLLECTION_VALIDATOR),
                    ("run_outputs", OUTPUT_COLLECTION_VALIDATOR),
                ):
                    if name in existing:
                        continue
                    try:
                        self._db.create_collection(name, validator=validator, validationLevel="strict")
                    except (CollectionInvalid, NotImplementedError, TypeError):
                        # Already created by another worker, or the server/driver
                        # does not support validators; indexes still apply.
                        pass
                    except OperationFailure as exc:
                        logger.warning("Could not apply validator to %s (code %s)", name, exc.code)

                self._runs.create_index([("runId", ASCENDING)], unique=True, name="runId_unique")
                self._runs.create_index([("createdAt", DESCENDING)], name="createdAt_desc")
                self._outputs.create_index(
                    [("runId", ASCENDING), ("kind", ASCENDING)], unique=True, name="run_kind_unique"
                )
            except PyMongoError as exc:
                raise StorageUnavailableError() from exc
            self._schema_ready = True

    def health(self) -> bool:
        now = time.time()
        if self._last_health is not None and (now - self._last_health_time < 10.0):
            return self._last_health
        try:
            self._db.command("ping", maxTimeMS=1500)
            self._last_health = True
        except Exception:
            self._last_health = False
        self._last_health_time = now
        return self._last_health

    def list_runs(self, limit: int, skip: int, query: Optional[str]) -> Tuple[List[Dict[str, Any]], int]:
        self._ensure_schema()
        filters: Dict[str, Any] = {}
        pattern = _search_pattern(query)
        if pattern:
            filters["designName"] = {"$regex": pattern, "$options": "i"}
        try:
            total = self._runs.count_documents(filters)
            cursor = (
                self._runs.find(filters, {"_id": 0, "outputs": 0})
                .sort("createdAt", DESCENDING)
                .skip(skip)
                .limit(limit)
            )
            return [RunRecord.model_validate(doc).to_api() for doc in cursor], total
        except PyMongoError as exc:
            raise StorageUnavailableError() from exc

    def get_run(self, run_id: str) -> Dict[str, Any]:
        self._ensure_schema()
        try:
            doc = self._runs.find_one({"runId": run_id}, {"_id": 0})
        except PyMongoError as exc:
            raise StorageUnavailableError() from exc
        if not doc:
            raise RunNotFoundError(run_id)
        result = RunRecord.model_validate(doc).to_api()
        stored = doc.get("outputs") or {}
        result["availableOutputs"] = {kind: bool(stored.get(kind)) for kind in OUTPUT_KINDS}
        return result

    def get_output(self, run_id: str, kind: str) -> bytes:
        self._ensure_schema()
        try:
            doc = self._outputs.find_one({"runId": run_id, "kind": kind}, {"data": 1, "encoding": 1})
        except PyMongoError as exc:
            raise StorageUnavailableError() from exc
        if not doc:
            if not self._run_exists(run_id):
                raise RunNotFoundError(run_id)
            raise OutputNotFoundError(kind)
        return gzip.decompress(bytes(doc["data"]))

    def _run_exists(self, run_id: str) -> bool:
        try:
            return self._runs.count_documents({"runId": run_id}, limit=1) > 0
        except PyMongoError as exc:
            raise StorageUnavailableError() from exc

    def save_run(self, record: RunRecord, outputs: Dict[str, Any]) -> Dict[str, Any]:
        self._ensure_schema()
        now = datetime.now(timezone.utc)
        output_docs = []
        for kind, data in outputs.items():
            if kind not in OUTPUT_KINDS or data is None:
                continue
            raw = _encode_json(data)
            compressed = gzip.compress(raw, compresslevel=6)
            if len(compressed) > MAX_COMPRESSED_OUTPUT_BYTES:
                raise OutputTooLargeError(kind)
            output_docs.append({
                "runId": record.runId,
                "kind": kind,
                "encoding": "gzip",
                "contentType": "application/json",
                "size": len(raw),
                "compressedSize": len(compressed),
                "data": Binary(compressed),
                "createdAt": now,
            })

        run_doc = record.model_dump(mode="python", exclude_none=True)
        if record.packageDetails is not None:
            run_doc["packageDetails"] = record.packageDetails.model_dump(exclude_none=True)
        run_doc["outputs"] = {doc["kind"]: True for doc in output_docs}
        run_doc["schemaVersion"] = SCHEMA_VERSION

        try:
            # Re-using a runId replaces the earlier run.
            self._outputs.delete_many({"runId": record.runId})
            if output_docs:
                self._outputs.insert_many(output_docs, ordered=True)
            self._runs.replace_one({"runId": record.runId}, run_doc, upsert=True)
        except DuplicateKeyError as exc:
            raise StorageUnavailableError() from exc
        except PyMongoError as exc:
            # Do not leave orphaned output blobs behind.
            try:
                self._outputs.delete_many({"runId": record.runId})
            except PyMongoError:
                pass
            raise StorageUnavailableError() from exc
        return record.to_api()

    def delete_run(self, run_id: str) -> None:
        self._ensure_schema()
        try:
            result = self._runs.delete_one({"runId": run_id})
            self._outputs.delete_many({"runId": run_id})
        except PyMongoError as exc:
            raise StorageUnavailableError() from exc
        if result.deleted_count == 0:
            raise RunNotFoundError(run_id)


# ---------------------------------------------------------------------------
# Local file backend (original behaviour)
# ---------------------------------------------------------------------------

class FileHistoryStore:
    backend = "file"

    def __init__(self, history_dir: Path):
        self._dir = history_dir
        self._index_file = history_dir / "index.json"
        self._lock = threading.Lock()
        self._dir.mkdir(parents=True, exist_ok=True)

    def health(self) -> bool:
        return self._dir.is_dir()

    def _load_index(self) -> List[Dict[str, Any]]:
        if not self._index_file.exists():
            return []
        try:
            with open(self._index_file, encoding="utf-8") as f:
                data = json.load(f)
            return data if isinstance(data, list) else []
        except (OSError, ValueError):
            logger.warning("History index is unreadable; starting with an empty list.")
            return []

    def _save_index(self, index: List[Dict[str, Any]]) -> None:
        tmp = self._index_file.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(index, f, indent=2, ensure_ascii=False)
        tmp.replace(self._index_file)

    @staticmethod
    def _entry_to_record(entry: Dict[str, Any]) -> Optional[RunRecord]:
        try:
            # Older entries were written with naive UTC timestamps; RunRecord treats those as UTC.
            created = datetime.fromisoformat(str(entry.get("timestamp")))
            return RunRecord.model_validate({**entry, "createdAt": created})
        except (ValueError, TypeError):
            return None

    def _records(self) -> List[RunRecord]:
        return [r for r in (self._entry_to_record(e) for e in self._load_index()) if r]

    def list_runs(self, limit: int, skip: int, query: Optional[str]) -> Tuple[List[Dict[str, Any]], int]:
        records = self._records()
        pattern = _search_pattern(query)
        if pattern:
            rx = re.compile(pattern, re.IGNORECASE)
            records = [r for r in records if rx.search(r.designName)]
        records.sort(key=lambda r: r.createdAt, reverse=True)
        return [r.to_api() for r in records[skip:skip + limit]], len(records)

    def get_run(self, run_id: str) -> Dict[str, Any]:
        record = next((r for r in self._records() if r.runId == run_id), None)
        run_dir = self._dir / run_id
        if not record or not run_dir.is_dir():
            raise RunNotFoundError(run_id)
        result = record.to_api()
        result["availableOutputs"] = {
            kind: (run_dir / filename).is_file() for kind, filename in OUTPUT_FILENAMES.items()
        }
        return result

    def get_output(self, run_id: str, kind: str) -> bytes:
        run_dir = self._dir / run_id
        if not run_dir.is_dir():
            raise RunNotFoundError(run_id)
        path = run_dir / OUTPUT_FILENAMES[kind]
        if not path.is_file():
            raise OutputNotFoundError(kind)
        return path.read_bytes()

    def save_run(self, record: RunRecord, outputs: Dict[str, Any]) -> Dict[str, Any]:
        run_dir = self._dir / record.runId
        run_dir.mkdir(parents=True, exist_ok=True)
        for kind, data in outputs.items():
            if kind in OUTPUT_FILENAMES and data is not None:
                with open(run_dir / OUTPUT_FILENAMES[kind], "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)

        entry = record.to_api()
        with self._lock:
            index = [e for e in self._load_index() if e.get("runId") != record.runId]
            index.insert(0, entry)
            self._save_index(index)
        return entry

    def delete_run(self, run_id: str) -> None:
        with self._lock:
            index = self._load_index()
            remaining = [e for e in index if e.get("runId") != run_id]
            run_dir = self._dir / run_id
            if len(remaining) == len(index) and not run_dir.is_dir():
                raise RunNotFoundError(run_id)
            self._save_index(remaining)
        if run_dir.is_dir():
            shutil.rmtree(run_dir, ignore_errors=True)
