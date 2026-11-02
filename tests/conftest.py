import os
import shutil
import sys
from pathlib import Path

import mongomock
import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# Tests never talk to a real database.
os.environ.pop("MONGODB_URI", None)

import server  # noqa: E402
from backend.storage import FileHistoryStore, MongoHistoryStore  # noqa: E402

SAMPLE_FIGMA = ROOT / "dataset" / "new_dashboard" / "figma_data.json"


@pytest.fixture
def isolated_paths(tmp_path, monkeypatch):
    """Point every file the API writes at a temporary directory."""
    active = tmp_path / "dataset" / "new_dashboard" / "figma_data.json"
    active.parent.mkdir(parents=True)
    shutil.copy(SAMPLE_FIGMA, active)
    monkeypatch.setattr(server, "ACTIVE_FIGMA", active)
    monkeypatch.setattr(server, "CANDIDATES_FILE", tmp_path / "candidates.json")
    monkeypatch.setattr(server, "RAW_PREDICTIONS_FILE", tmp_path / "raw_predictions.json")
    monkeypatch.setattr(server, "CLEAN_PREDICTIONS_FILE", tmp_path / "clean_predictions.json")
    monkeypatch.setattr(server, "GRID_LAYOUT_FILE", tmp_path / "grid_layout.json")
    monkeypatch.setattr(server, "PAGE_FILE", tmp_path / "page.json")
    return tmp_path


@pytest.fixture(params=["file", "mongodb"])
def store(request, tmp_path):
    if request.param == "file":
        return FileHistoryStore(tmp_path / "history")
    return MongoHistoryStore(mongomock.MongoClient()["figma2insight_test"])


@pytest.fixture
def client(store, isolated_paths):
    server.app.dependency_overrides[server.get_history_store] = lambda: store
    with TestClient(server.app) as test_client:
        yield test_client
    server.app.dependency_overrides.clear()
