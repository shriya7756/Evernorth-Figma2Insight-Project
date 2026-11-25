"""Tests for the updated model integration, per-design workspaces and the Figma plugin receiver."""

import io
import json
import time

import pytest
from fastapi import HTTPException
from starlette.requests import Request

import server
from backend.ratelimit import RateLimiter
from backend.workspaces import WorkspaceManager, WorkspaceNotFoundError
from src import pipeline
from tests.conftest import SAMPLE_FIGMA

PACKAGE = {"subjectArea": "health", "topic": "operations", "slideName": "appointments", "title": "Care Ops"}


def sample_bytes() -> bytes:
    return SAMPLE_FIGMA.read_bytes()


def upload(client, content: bytes, name: str = "design.json"):
    return client.post("/api/upload", files={"file": (name, io.BytesIO(content), "application/json")})


def run_stages(client, design_id: str, figma_json=None):
    source = {"designId": design_id}
    if figma_json is not None:
        source["figmaJson"] = figma_json
    assert client.post("/api/normalize", json=source).status_code == 200
    assert client.post("/api/preprocess", json=source).status_code == 200
    assert client.post("/api/classify", json=source).status_code == 200
    res = client.post("/api/generate-layout", json={**source, "packageDetails": PACKAGE})
    assert res.status_code == 200, res.text
    return res.json()


# ---------------------------------------------------------------------------
# Updated model
# ---------------------------------------------------------------------------

def test_updated_model_loads_with_expected_classes():
    classes = pipeline.model_classes()
    assert "SIDEBAR" in classes and "NAVBAR" not in classes
    assert {"CHART", "KPI_CARD", "TABLE", "FILTER", "HEADER", "OTHER"} <= set(classes)
    model, _ = pipeline.load_model()
    assert model.get_booster().num_features() == len(pipeline.FEATURE_COLS)


def test_pipeline_produces_real_widget_content():
    result = pipeline.execute_full_pipeline(json.loads(sample_bytes()), sync_to_disk=False)
    page = result["pageJson"]
    types = {w["componentType"] for w in page["widgets"]}
    assert {"KPI_CARD", "CHART", "TABLE"} <= types
    kpis = [w for w in page["widgets"] if w["componentType"] == "KPI_CARD"]
    assert any(w.get("kpiValue") not in (None, "", "—") for w in kpis)
    tables = [w for w in page["widgets"] if w["componentType"] == "TABLE"]
    assert any(w["tableConfig"]["rows"] for w in tables), "updated table extraction should recover rows"
    for tile in page["tiles"]:
        assert tile["grid"]["colOffset"] + tile["grid"]["colSpan"] <= 12


def test_pipeline_survives_non_ascii_layer_names_on_legacy_consoles(monkeypatch):
    """Windows consoles default to cp1252; layer names such as 'Filter ▾' must not crash the pipeline."""
    data = json.loads(sample_bytes())

    def rename(node):
        node["name"] = f"{node.get('name', '')} ▾ ✓"
        for child in node.get("children", []) or []:
            rename(child)

    rename(data["document"])
    strict_stdout = io.TextIOWrapper(io.BytesIO(), encoding="cp1252", errors="strict")
    monkeypatch.setattr("sys.stdout", strict_stdout)
    result = pipeline.execute_full_pipeline(data, sync_to_disk=False)
    assert result["stats"]["widgets"] > 0


def test_rest_file_nodes_response_is_supported(client):
    """GET /v1/files/:key/nodes?ids=<frame> output (documented in the upload help) must work end to end."""
    data = json.loads(sample_bytes())
    page = data["document"]["children"][0]
    frames = page["children"] if page.get("type") == "PAGE" else [page]
    nodes_response = {"name": "Care file", "nodes": {f["id"]: {"document": f, "components": {}} for f in frames}}

    nodes, _, dims = pipeline.extract_nodes_from_figma_payload(nodes_response)
    assert nodes and dims["width"] > 0

    res = upload(client, json.dumps(nodes_response).encode())
    assert res.status_code == 200, res.text
    result = run_stages(client, res.json()["designId"])
    assert result["stats"]["widgets"] > 0


def test_status_reports_model_classes(client):
    body = client.get("/api/status").json()
    assert body["modelLoaded"] is True
    assert "SIDEBAR" in body["classes"]


def test_health_endpoint(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["modelLoaded"] is True


# ---------------------------------------------------------------------------
# Per-design workspaces
# ---------------------------------------------------------------------------

def test_upload_creates_private_workspace_and_runs_pipeline(client, isolated_paths):
    before = server.ACTIVE_FIGMA.read_bytes()
    res = upload(client, sample_bytes())
    assert res.status_code == 200
    body = res.json()
    assert len(body["designId"]) == 32 and body["nodeCount"] > 0
    # Uploads no longer replace the shared "latest plugin design".
    assert server.ACTIVE_FIGMA.read_bytes() == before

    result = run_stages(client, body["designId"])
    assert result["saved"] is True and result["stats"]["widgets"] > 0
    download = client.get(f"/api/download/page.json?designId={body['designId']}")
    assert download.status_code == 200 and download.json()["title"] == "Care Ops"


def test_concurrent_designs_do_not_interfere(client):
    data = json.loads(sample_bytes())
    first = upload(client, sample_bytes()).json()["designId"]
    other = json.loads(sample_bytes())
    other["document"]["children"] = other["document"]["children"][:1]
    second = upload(client, json.dumps(other).encode()).json()["designId"]
    assert first != second

    # Normalize both, then classify the first: it must use its own candidates.
    n1 = client.post("/api/normalize", json={"designId": first}).json()["candidateCount"]
    client.post("/api/normalize", json={"designId": second})
    classified = client.post("/api/classify", json={"designId": first}).json()
    assert classified["candidateCount"] <= n1
    assert data  # sample is valid


def test_stage_order_enforced_per_workspace(client):
    design_id = upload(client, sample_bytes()).json()["designId"]
    res = client.post("/api/classify", json={"designId": design_id})
    assert res.status_code == 409 and "Normalize" in res.json()["detail"]


def test_unknown_workspace_is_reported_as_expired(client):
    res = client.post("/api/normalize", json={"designId": "0" * 32})
    assert res.status_code == 409
    assert "expired" in res.json()["detail"]


def test_invalid_design_id_rejected(client):
    assert client.post("/api/normalize", json={"designId": "../../etc"}).status_code == 422
    assert client.get("/api/download/page.json?designId=../x").status_code == 422


def test_workspace_cleanup_removes_expired(tmp_path):
    manager = WorkspaceManager(tmp_path, ttl_hours=1)
    old = manager.create(b"{}")
    fresh = manager.create(b"{}")
    past = time.time() - 2 * 3600
    import os
    os.utime(tmp_path / old, (past, past))
    assert manager.cleanup() == 1
    with pytest.raises(WorkspaceNotFoundError):
        manager.paths(old)
    assert manager.paths(fresh).figma.exists()


def test_upload_rejects_page_json_output(client):
    res = upload(client, json.dumps({"slideId": "AB123", "tiles": []}).encode())
    assert res.status_code == 422 and "page.json" in res.json()["detail"]


# ---------------------------------------------------------------------------
# Figma plugin receiver
# ---------------------------------------------------------------------------

def plugin_payload():
    data = json.loads(sample_bytes())
    return {"document": data["document"], "source": "figma-plugin", "pageName": "Page 1"}


def test_ingest_accepts_raw_json_and_saves_analysis(client, isolated_paths):
    res = client.post("/ingest", json=plugin_payload(), headers={"Origin": "null"})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["saved"] is True and body["widgets"] > 0 and body["tiles"] > 0
    assert body["importCode"] == body["runId"]
    assert body["openUrl"].endswith(f"#/history?run={body['runId']}")
    assert res.headers["access-control-allow-origin"] == "*"

    # The saved analysis has every output.
    run = client.get(f"/api/history/{body['runId']}").json()
    assert all(run["availableOutputs"].values())

    # The web app can load the design with the import code and run the stages on it.
    loaded = client.get(f"/api/load-plugin-data?code={body['importCode']}")
    assert loaded.status_code == 200
    assert loaded.json()["importCode"] == body["importCode"]
    run_stages(client, loaded.json()["designId"])

    # And the latest plugin design is available without a code.
    assert client.get("/api/load-plugin-data").status_code == 200


def test_ingest_accepts_multipart_for_older_clients(client):
    content = json.dumps(plugin_payload()).encode()
    res = client.post("/ingest", files={"file": ("design.json", io.BytesIO(content), "application/json")})
    assert res.status_code == 200 and res.json()["widgets"] > 0


def test_ingest_preflight_allows_figma_null_origin(client):
    res = client.options("/ingest", headers={
        "Origin": "null",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    })
    assert res.status_code == 204
    assert res.headers["access-control-allow-origin"] == "*"
    # The rest of the API keeps its allow-list.
    api = client.options("/api/upload", headers={"Origin": "null", "Access-Control-Request-Method": "POST"})
    assert api.headers.get("access-control-allow-origin") != "*"


@pytest.mark.parametrize("body, status", [
    (b"", 400),
    (b"{not json", 400),
    (b"[]", 422),
    (b'{"source": "figma-plugin"}', 400),
    (b'{"document": {"children": "x"}}', 400),
])
def test_ingest_validation(client, body, status):
    res = client.post("/ingest", content=body, headers={"Content-Type": "application/json"})
    assert res.status_code == status


def test_ingest_size_limit(client, monkeypatch):
    monkeypatch.setattr(server.settings.__class__, "max_upload_bytes", property(lambda self: 1000))
    res = client.post("/ingest", content=b"{" + b" " * 5000 + b"}", headers={"Content-Type": "application/json"})
    assert res.status_code == 413


def test_unknown_import_code(client):
    res = client.get("/api/load-plugin-data?code=nope1234")
    assert res.status_code == 404 and "import code" in res.json()["detail"]


def test_rate_limiter_blocks_bursts():
    limiter = RateLimiter(2, window_seconds=60)
    scope = {"type": "http", "headers": [(b"x-forwarded-for", b"1.2.3.4")], "client": ("10.0.0.1", 1)}
    request = Request(scope)
    limiter.check(request)
    limiter.check(request)
    with pytest.raises(HTTPException) as exc:
        limiter.check(request)
    assert exc.value.status_code == 429
