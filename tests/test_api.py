import io
import json
from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from backend.schemas import PackageDetails, RunRecord
from backend.storage import RunNotFoundError


def make_record(run_id="run01", name="Care Dashboard", minutes_ago=0):
    return RunRecord(
        runId=run_id,
        designName=name,
        createdAt=datetime.now(timezone.utc) - timedelta(minutes=minutes_ago),
        componentCount=8,
        widgetCount=6,
        tileCount=6,
        needAttention=1,
        packageDetails=PackageDetails(slideId="cr001", title="  Care   overview "),
    )


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

def test_package_details_normalises_values():
    details = PackageDetails(subjectArea=" Sales ", slideId="ab12c", title="Q3\x00 review")
    assert details.subjectArea == "sales"
    assert details.slideId == "AB12C"
    assert details.title == "Q3 review"


@pytest.mark.parametrize("field,value", [
    ("slideId", "TOO-LONG"),
    ("slideId", "AB1"),
    ("subjectArea", "has spaces"),
    ("slideName", "under_score"),
    ("title", "x" * 121),
])
def test_package_details_rejects_invalid_values(field, value):
    with pytest.raises(ValidationError):
        PackageDetails(**{field: value})


def test_package_details_rejects_unknown_fields():
    with pytest.raises(ValidationError):
        PackageDetails(unexpected="value")


# ---------------------------------------------------------------------------
# Storage backends (run against both file and MongoDB implementations)
# ---------------------------------------------------------------------------

def test_store_round_trip(store):
    store.save_run(make_record(), {"page_json": {"title": "Care"}, "figma_data": {"document": {}}})

    runs, total = store.list_runs(limit=10, skip=0, query=None)
    assert total == 1
    assert runs[0]["runId"] == "run01"
    assert runs[0]["packageDetails"] == {
        "subjectArea": "sales", "topic": "analytics", "slideName": "dashboard-summary",
        "slideId": "CR001", "title": "Care overview",
    }

    details = store.get_run("run01")
    assert details["availableOutputs"]["page_json"] is True
    assert details["availableOutputs"]["grid_layout"] is False
    assert json.loads(store.get_output("run01", "page_json")) == {"title": "Care"}


def test_store_lists_newest_first_and_filters(store):
    store.save_run(make_record("old", "Pharmacy Prescriptions", minutes_ago=10), {})
    store.save_run(make_record("new", "Care Management", minutes_ago=1), {})

    runs, total = store.list_runs(limit=10, skip=0, query=None)
    assert [r["runId"] for r in runs] == ["new", "old"]
    assert total == 2

    runs, total = store.list_runs(limit=10, skip=0, query="pharm")
    assert [r["runId"] for r in runs] == ["old"]

    # Regex metacharacters are matched literally.
    runs, total = store.list_runs(limit=10, skip=0, query=".*")
    assert total == 0


def test_store_resave_replaces_run(store):
    store.save_run(make_record(), {"page_json": {"v": 1}})
    store.save_run(make_record(name="Renamed"), {"page_json": {"v": 2}})
    runs, total = store.list_runs(limit=10, skip=0, query=None)
    assert total == 1
    assert runs[0]["designName"] == "Renamed"
    assert json.loads(store.get_output("run01", "page_json")) == {"v": 2}


def test_store_delete(store):
    store.save_run(make_record(), {"page_json": {}})
    store.delete_run("run01")
    with pytest.raises(RunNotFoundError):
        store.get_run("run01")
    with pytest.raises(RunNotFoundError):
        store.delete_run("run01")


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

def test_status_reports_storage(client, store):
    res = client.get("/api/status")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "connected"
    assert body["storage"] == {"backend": store.backend, "healthy": True}


def test_history_endpoints(client, store):
    store.save_run(make_record(), {"page_json": {"title": "Care"}})

    listing = client.get("/api/history").json()
    assert listing["total"] == 1 and listing["storage"] == store.backend

    assert client.get("/api/history/run01").json()["availableOutputs"]["page_json"] is True
    assert client.get("/api/history/run01/json/page_json").json() == {"title": "Care"}

    download = client.get("/api/history/run01/download/page_json")
    assert download.status_code == 200
    assert "attachment" in download.headers["content-disposition"]

    assert client.get("/api/history/run01/json/grid_layout").status_code == 404
    assert client.get("/api/history/missing").status_code == 404

    assert client.delete("/api/history/run01").json() == {"success": True, "runId": "run01"}
    assert client.get("/api/history").json()["total"] == 0


@pytest.mark.parametrize("path", [
    "/api/history/bad..id",
    "/api/history/run01/json/not_a_type",
    "/api/history?limit=0",
    "/api/history?limit=500",
])
def test_history_rejects_invalid_parameters(client, path):
    res = client.get(path)
    assert res.status_code == 422
    assert res.json()["detail"] == "Some of the submitted values are invalid."


def test_validation_errors_do_not_echo_input(client):
    res = client.post("/api/generate-layout", json={"packageDetails": {"slideId": "<script>"}})
    assert res.status_code == 422
    body = res.json()
    assert body["errors"][0]["field"] == "packageDetails.slideId"
    assert "<script>" not in json.dumps(body)


def test_upload_validation(client):
    def upload(name, content):
        return client.post("/api/upload", files={"file": (name, io.BytesIO(content), "application/json")})

    assert upload("design.txt", b"{}").status_code == 400
    assert upload("design.json", b"").status_code == 400
    assert upload("design.json", b"{not json").status_code == 400
    assert upload("design.json", b"[1, 2]").status_code == 422


def test_stage_order_is_enforced(client):
    res = client.post("/api/classify", json={})
    assert res.status_code == 409
    assert "Normalize" in res.json()["detail"]


def test_full_pipeline_saves_run(client):
    assert client.get("/api/load-plugin-data").status_code == 200
    assert client.post("/api/normalize", json={}).json()["candidateCount"] > 0
    assert client.post("/api/preprocess", json={}).status_code == 200
    assert client.post("/api/classify", json={}).status_code == 200

    res = client.post("/api/generate-layout", json={
        "packageDetails": {"subjectArea": "health", "topic": "operations", "slideName": "appointments",
                           "slideId": "ap001", "title": "Appointment Operations"},
    })
    assert res.status_code == 200
    body = res.json()
    assert body["saved"] is True
    assert body["pageJson"]["slideId"] == "AP001"
    assert body["pageJson"]["title"] == "Appointment Operations"

    run = client.get(f"/api/history/{body['runId']}").json()
    assert run["designName"] == "Appointment Operations"
    assert all(run["availableOutputs"].values())
    assert run["packageDetails"]["slideId"] == "AP001"
