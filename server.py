"""
Figma2Insight API server.
Connects the frontend to the XGBoost ML pipeline and Vista page.json generation,
and persists saved analyses (run history) in MongoDB when it is configured.
"""

import json
import logging
import os
import sys
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi import Path as PathParam
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend import db  # noqa: E402
from backend.config import get_settings  # noqa: E402
from backend.ratelimit import RateLimiter  # noqa: E402
from backend.schemas import (  # noqa: E402
    RUN_ID_PATTERN,
    GenerateRequest,
    OutputKind,
    RunRecord,
)
from backend.storage import (  # noqa: E402
    FileHistoryStore,
    HistoryStore,
    MongoHistoryStore,
    OutputNotFoundError,
    OutputTooLargeError,
    RunNotFoundError,
    StorageUnavailableError,
)
from backend.workspaces import DESIGN_ID_PATTERN, StagePaths, WorkspaceManager, WorkspaceNotFoundError  # noqa: E402
from src.pipeline import (  # noqa: E402
    execute_full_pipeline,
    extract_nodes_from_figma_payload,
    load_model,
    model_classes,
    run_candidate_generation,
    run_classification,
    run_grid_layout,
    run_prediction_cleaning,
    run_vista_page_generation,
)

settings = get_settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("figma2insight.api")

# Storage paths
STORAGE_DIR = ROOT / "outputs" / "designs"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

HISTORY_DIR = ROOT / "outputs" / "history"
ACTIVE_FIGMA = ROOT / "dataset" / "new_dashboard" / "figma_data.json"
CANDIDATES_FILE = ROOT / "dataset" / "new_candidates" / "new_dashboard_candidates.json"
RAW_PREDICTIONS_FILE = ROOT / "dataset" / "new_candidates" / "new_dashboard_predictions.json"
CLEAN_PREDICTIONS_FILE = ROOT / "dataset" / "new_candidates" / "new_dashboard_clean_predictions.json"
GRID_LAYOUT_FILE = ROOT / "outputs" / "dashboard_configs" / "new_dashboard" / "grid_layout.json"
PAGE_FILE = ROOT / "outputs" / "vista_pages" / "new_dashboard" / "page.json"

workspaces = WorkspaceManager(ROOT / "outputs" / "workspaces", ttl_hours=settings.workspace_ttl_hours)
write_limiter = RateLimiter(settings.rate_limit_per_minute)

_history_store: Optional[HistoryStore] = None
_model_error: Optional[str] = None


def get_history_store() -> HistoryStore:
    """Return the configured history store (MongoDB when MONGODB_URI is reachable, else local files)."""
    global _history_store
    if _history_store is None:
        if settings.mongodb_enabled:
            try:
                _history_store = MongoHistoryStore(db.get_database(settings))
            except Exception as exc:
                logger.warning(
                    "MongoDB is configured but could not be initialized (%s). Falling back to local file storage.",
                    exc,
                )
                _history_store = FileHistoryStore(HISTORY_DIR)
        else:
            _history_store = FileHistoryStore(HISTORY_DIR)
    return _history_store


def _model_ready() -> bool:
    """Load the classifier (once) and report whether inference is available."""
    global _model_error
    try:
        load_model()
        _model_error = None
        return True
    except Exception as exc:  # missing/corrupt artifacts or incompatible library versions
        _model_error = f"{type(exc).__name__}: {exc}"
        logger.error("XGBoost model could not be loaded: %s", _model_error)
        return False


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Load the model at startup so the first request is fast and a broken deploy fails health checks.
    if _model_ready():
        logger.info("Model ready. Classes: %s", ", ".join(model_classes()))
    workspaces.cleanup()
    if settings.mongodb_enabled:
        logger.info("Saved analyses will be stored in MongoDB database '%s'.", settings.mongodb_db_name)
        try:
            if not db.ping(settings):
                logger.warning("MongoDB is not reachable; history requests will use fallback or return 503.")
        except Exception as exc:
            logger.warning("MongoDB initial ping check failed (%s); continuing with local fallback.", exc)
    else:
        logger.info("MONGODB_URI is not set; saved analyses will be stored under outputs/history/.")
    yield
    try:
        db.close_client()
    except Exception:
        pass


app = FastAPI(
    title="Figma2Insight API",
    description="Transforms Figma dashboard designs into structured Dashboard page.json using an XGBoost classifier.",
    version="1.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"^https://.*\.netlify\.app$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    return response


_PLUGIN_CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
}
_PLUGIN_PATHS = {"/ingest", "/api/health"}


@app.middleware("http")
async def plugin_ingest_cors(request: Request, call_next):
    """Figma plugins call the API from a sandboxed iframe whose Origin is "null".

    Only the plugin receiver and the health probe are opened to any origin; the rest of the
    API keeps the CORS_ORIGINS allow-list above.
    """
    if request.url.path not in _PLUGIN_PATHS:
        return await call_next(request)
    if request.method == "OPTIONS":
        return Response(status_code=204, headers=_PLUGIN_CORS_HEADERS)
    response = await call_next(request)
    response.headers.update(_PLUGIN_CORS_HEADERS)
    return response


# ============================================================================
# ERROR HANDLING
# ============================================================================

@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError):
    """Return field-level messages without echoing submitted values back."""
    errors = []
    for err in exc.errors():
        loc = [str(part) for part in err.get("loc", ()) if part not in ("body", "query", "path")]
        errors.append({"field": ".".join(loc) or "request", "message": err.get("msg", "Invalid value")})
    return JSONResponse(
        status_code=422,
        content={"detail": "Some of the submitted values are invalid.", "errors": errors},
    )


@app.exception_handler(StorageUnavailableError)
async def storage_unavailable_handler(_: Request, exc: StorageUnavailableError):
    logger.error("History storage unavailable: %r", exc.__cause__)
    return JSONResponse(
        status_code=503,
        content={"detail": "Saved analyses are temporarily unavailable. Please try again shortly."},
    )


@app.exception_handler(RunNotFoundError)
async def run_not_found_handler(_: Request, __: RunNotFoundError):
    return JSONResponse(status_code=404, content={"detail": "That saved analysis could not be found."})


@app.exception_handler(OutputNotFoundError)
async def output_not_found_handler(_: Request, __: OutputNotFoundError):
    return JSONResponse(status_code=404, content={"detail": "That output is not available for this run."})


@app.exception_handler(WorkspaceNotFoundError)
async def workspace_not_found_handler(_: Request, __: WorkspaceNotFoundError):
    return JSONResponse(
        status_code=409,
        content={"detail": "This design session has expired. Load the design again to continue."},
    )


def _internal_error(action: str, exc: Exception) -> HTTPException:
    logger.exception("%s failed", action, exc_info=exc)
    return HTTPException(status_code=500, detail=f"{action} failed. Check the server logs for details.")


def _read_json(path: Path) -> Any:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _load_active_figma(missing_message: str, status_code: int = 404) -> Dict[str, Any]:
    if not ACTIVE_FIGMA.exists():
        raise HTTPException(status_code=status_code, detail=missing_message)
    try:
        return _read_json(ACTIVE_FIGMA)
    except (OSError, ValueError) as exc:
        raise _internal_error("Reading the active design", exc) from exc


def _extract_nodes(figma_data: Dict[str, Any]):
    try:
        return extract_nodes_from_figma_payload(figma_data)
    except Exception as exc:
        logger.info("Rejected Figma payload: %s", exc)
        raise HTTPException(
            status_code=422,
            detail="This file doesn't look like a Figma export. Expected a 'document' or 'nodes' structure.",
        ) from None


def _package_meta(request: GenerateRequest) -> Optional[Dict[str, Any]]:
    return request.packageDetails.model_dump(exclude_none=True) if request.packageDetails else None


def _stage_paths(design_id: Optional[str]) -> StagePaths:
    """Files used by the staged pipeline: a per-design workspace, or the legacy shared files."""
    if design_id:
        return workspaces.paths(design_id)
    # Legacy single-design mode (CLI scripts, local plugin receiver, older clients).
    return StagePaths(
        figma=ACTIVE_FIGMA,
        candidates=CANDIDATES_FILE,
        raw_predictions=RAW_PREDICTIONS_FILE,
        clean_predictions=CLEAN_PREDICTIONS_FILE,
        grid_layout=GRID_LAYOUT_FILE,
        page=PAGE_FILE,
    )


def _request_figma(request: GenerateRequest, paths: StagePaths, missing_message: str) -> Dict[str, Any]:
    if request.figmaJson:
        return request.figmaJson
    if not paths.figma.exists():
        raise HTTPException(status_code=404, detail=missing_message)
    try:
        return _read_json(paths.figma)
    except (OSError, ValueError) as exc:
        raise _internal_error("Reading the design", exc) from exc


def _parse_design_bytes(content: bytes) -> Dict[str, Any]:
    """Validate raw bytes as a Figma design payload (REST export or plugin payload)."""
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail=f"File is larger than the {settings.max_upload_mb} MB limit.")
    if not content.strip():
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    try:
        figma_data = json.loads(content.decode("utf-8-sig"))
    except (UnicodeDecodeError, ValueError):
        raise HTTPException(status_code=400, detail="The file is not valid JSON.") from None
    if not isinstance(figma_data, dict):
        raise HTTPException(status_code=422, detail="Expected a JSON object exported from Figma.")

    # Detect if this is a Dashboard page.json output file (not a Figma export)
    if "slideId" in figma_data and ("tiles" in figma_data or "widgets" in figma_data):
        raise HTTPException(
            status_code=422,
            detail=(
                "This looks like a Dashboard page.json output file, not a Figma design export. "
                "To view this file, go to the 'Saved analyses' tab and open it from there, "
                "or use the 'Preview' tab to load and inspect it."
            ),
        )
    return figma_data


def _open_workspace(figma_data: Dict[str, Any]) -> Dict[str, Any]:
    """Validate a design, store it in a fresh workspace and describe it for the client."""
    nodes, doc_name, dims = _extract_nodes(figma_data)
    if not nodes:
        raise HTTPException(status_code=422, detail="No design layers were found in this file.")
    raw = json.dumps(figma_data, ensure_ascii=False).encode("utf-8")
    design_id = workspaces.create(raw)
    # For large designs (> 2 MB), avoid echoing the entire JSON back over HTTP;
    # later stages read it from the workspace via designId.
    is_large = len(raw) > 2 * 1024 * 1024
    return {
        "success": True,
        "designId": design_id,
        "documentName": doc_name,
        "nodeCount": len(nodes),
        "dimensions": dims,
        "figmaJson": None if is_large else figma_data,
    }


# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.get("/")
def root_health():
    return {
        "status": "online",
        "service": "Figma2Insight API",
        "version": "1.1.0",
        "docs": "/docs",
        "frontend": "https://figma2insight.netlify.app",
    }

@app.get("/api/health")
def health():
    """Liveness/readiness probe for the hosting platform: 200 only when the model can serve."""
    ready = _model_ready()
    body = {"status": "ok" if ready else "degraded", "modelLoaded": ready, "timestamp": time.time()}
    if not ready:
        return JSONResponse(status_code=503, content=body)
    return body


@app.get("/api/status")
def get_status(store: HistoryStore = Depends(get_history_store)):
    """Return backend health, ML model status and storage status."""
    model_loaded = _model_ready()

    plugin_data_received = ACTIVE_FIGMA.exists()

    design_name = None
    if plugin_data_received:
        try:
            data = _read_json(ACTIVE_FIGMA)
            doc = data.get("document", {})
            first_child = doc.get("children", [{}])[0] if doc.get("children") else {}
            design_name = first_child.get("name") or doc.get("name") or "Unknown Design"
            design_name = design_name.replace("�", " - ").strip()
        except Exception:
            design_name = "Unknown Design"

    return {
        "status": "connected",
        "modelLoaded": model_loaded,
        "modelFile": "xgboost_model.json",
        "classes": model_classes() if model_loaded else [],
        "pipelineStages": [
            "Candidate Generation (gc)",
            "Semantic Feature Extraction (20 features)",
            "XGBoost Classifier",
            "Heuristic Prediction Cleaning",
            "12x12 CSS Grid Layout Mapping",
            "Dashboard Slide page.json Assembly"
        ],
        "pluginDataReceived": plugin_data_received,
        "designName": design_name,
        "storage": {"backend": store.backend, "healthy": store.health()},
        "maxUploadMb": settings.max_upload_mb,
        "timestamp": time.time()
    }


def list_sample_designs() -> List[Dict[str, Any]]:
    """Index preloaded sample designs and any saved user designs."""
    results = []

    # 1. Active design in new_dashboard
    if ACTIVE_FIGMA.exists():
        try:
            d = _read_json(ACTIVE_FIGMA)
            doc_name = "Design 03 — Appointment Operations"
            first_child = d.get("document", {}).get("children", [{}])[0]
            if first_child.get("type") == "PAGE" and first_child.get("children"):
                frame_child = first_child["children"][0]
                if frame_child.get("name"):
                    doc_name = frame_child.get("name")
            elif first_child.get("name"):
                doc_name = first_child.get("name")

            doc_name = doc_name.replace("�", " - ").strip()

            tile_count = 12
            if PAGE_FILE.exists():
                try:
                    tile_count = len(_read_json(PAGE_FILE).get("tiles", []))
                except Exception:
                    pass

            results.append({
                "id": "design-03-appointment-operations",
                "name": doc_name,
                "subtitle": "1607:2230 #03",
                "status": "Generated",
                "statusColor": "green",
                "tiles": tile_count,
                "lastRun": "just now",
                "isSample": True,
                "filePath": str(ACTIVE_FIGMA.relative_to(ROOT))
            })
        except Exception:
            pass

    # 2. Add reference dashboard designs
    reference_presets = [
        {"id": "design-02-pharmacy", "name": "Design 02 - Pharmacy Prescriptions", "subtitle": "6:157 #12",
         "status": "Generated", "tiles": 9, "lastRun": "just now"},
        {"id": "design-01-healthcare", "name": "Design 01 - Healthcare Analytics", "subtitle": "2:58 #11",
         "status": "Generated", "tiles": 10, "lastRun": "just now"},
        {"id": "design-ecommerce-rev", "name": "E-commerce Revenue Summary", "subtitle": "EC001 #01",
         "status": "Generated", "tiles": 11, "lastRun": "just now"},
        {"id": "health-08-care", "name": "Health 08 - Care Management", "subtitle": "2:18502 #09",
         "status": "Generated", "tiles": 9, "lastRun": "just now"},
        {"id": "health-07-ops", "name": "Health 07 - Clinical Operations", "subtitle": "3:4082 #07",
         "status": "3 need attention", "statusColor": "orange", "tiles": 12, "lastRun": "just now"}
    ]

    for p in reference_presets:
        if not any(r["id"] == p["id"] for r in results):
            results.append(p)

    return results


@app.get("/api/designs")
def get_designs():
    """List available designs for the gallery view."""
    return {"designs": list_sample_designs()}


@app.get("/api/designs/{design_id}")
def get_design_details(design_id: str = PathParam(..., max_length=120)):
    """Retrieve full pipeline results for the active design."""
    figma_data = _load_active_figma("No active design found.")
    try:
        return execute_full_pipeline(figma_data, sync_to_disk=False)
    except Exception as exc:
        raise _internal_error("Loading the design", exc) from exc


@app.post("/api/upload")
async def upload_figma_file(request: Request, file: UploadFile = File(...)):
    """Upload and validate a Figma JSON export into a private design workspace."""
    write_limiter.check(request)
    if not file.filename or not file.filename.lower().endswith(".json"):
        raise HTTPException(status_code=400, detail="Only .json files exported from Figma are supported.")

    content = await file.read(settings.max_upload_bytes + 1)
    figma_data = _parse_design_bytes(content)
    loaded = await run_in_threadpool(_open_workspace, figma_data)
    return {**loaded, "filename": Path(file.filename).name[:200]}


@app.get("/api/load-plugin-data")
def load_plugin_data(
    code: Optional[str] = Query(None, pattern=RUN_ID_PATTERN, description="Import code shown by the Figma plugin"),
    store: HistoryStore = Depends(get_history_store),
):
    """Load a design sent by the Figma plugin.

    With `code`, the design the plugin sent with that import code is loaded from saved analyses
    (works across server restarts and for many concurrent users). Without it, the most recent
    design received by this server is used.
    """
    if code:
        try:
            figma_data = json.loads(store.get_output(code, "figma_data"))
        except (RunNotFoundError, OutputNotFoundError):
            raise HTTPException(
                status_code=404,
                detail="No design was found for that import code. Check the code shown in the Figma plugin.",
            ) from None
        loaded = _open_workspace(figma_data)
        return {**loaded, "importCode": code}

    if not ACTIVE_FIGMA.exists():
        raise HTTPException(status_code=404, detail="No plugin data found yet. Send a design from the Figma plugin first.")
    try:
        figma_data = _read_json(ACTIVE_FIGMA)
    except (OSError, ValueError) as exc:
        raise _internal_error("Reading the active design", exc) from exc
    return _open_workspace(figma_data)


@app.post("/api/generate")
def generate_dashboard(request: GenerateRequest):
    """
    Main generation endpoint: runs candidate generation, XGBoost inference,
    grid mapping and Vista page.json generation in one call.
    """
    paths = _stage_paths(request.designId)
    figma_data = _request_figma(request, paths, "No Figma JSON provided and no active design found.")
    try:
        return execute_full_pipeline(
            figma_data=figma_data,
            package_metadata=_package_meta(request),
            # Only the legacy single-design mode mirrors outputs to the shared CLI files.
            sync_to_disk=request.designId is None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    except Exception as exc:
        raise _internal_error("Generation", exc) from exc


@app.post("/api/normalize")
def normalize_candidates(request: GenerateRequest):
    """Run candidate generation stage only (Normalize)."""
    paths = _stage_paths(request.designId)
    figma_data = _request_figma(request, paths, "No Figma data found. Send a design from the plugin or upload a file first.")
    nodes, doc_name, _ = _extract_nodes(figma_data)
    try:
        candidates = run_candidate_generation(nodes, dashboard_name=doc_name)
    except Exception as exc:
        raise _internal_error("Normalization", exc) from exc

    normalized = {"dashboard": doc_name, "candidate_count": len(candidates), "candidates": candidates}
    _write_json(paths.candidates, normalized)
    # Later stages must not reuse results computed for a previous normalization.
    for stale in (paths.raw_predictions, paths.clean_predictions):
        stale.unlink(missing_ok=True)

    return {
        "success": True,
        "stage": "normalize",
        "candidateCount": len(candidates),
        "documentName": doc_name,
        "normalizedJson": normalized
    }


def _load_candidates(paths: StagePaths) -> Dict[str, Any]:
    if not paths.candidates.exists():
        raise HTTPException(status_code=409, detail="Run the Normalize stage first.")
    return _read_json(paths.candidates)


@app.post("/api/preprocess")
def preprocess_candidates(request: GenerateRequest):
    """Run preprocessing (feature extraction) on normalized candidates."""
    cand_data = _load_candidates(_stage_paths(request.designId))
    candidates = cand_data.get("candidates", [])
    doc_name = cand_data.get("dashboard", "new_dashboard")

    try:
        import pandas as pd

        from src.features.extract_features import calculate_features

        feature_rows = [calculate_features(c) for c in candidates]
        features_df = pd.DataFrame(feature_rows)
    except Exception as exc:
        raise _internal_error("Feature extraction", exc) from exc

    return {
        "success": True,
        "stage": "preprocess",
        "candidateCount": len(candidates),
        "documentName": doc_name,
        "features": features_df.to_dict(orient="records")[:10],  # First 10 for preview
        "totalFeatures": len(feature_rows)
    }


@app.post("/api/classify")
def classify_components(request: GenerateRequest):
    """Run XGBoost classification and prediction cleaning only."""
    paths = _stage_paths(request.designId)
    cand_data = _load_candidates(paths)
    candidates = cand_data.get("candidates", [])

    try:
        raw_predictions = run_classification(candidates)
        cleaned = run_prediction_cleaning(raw_predictions)
    except Exception as exc:
        raise _internal_error("Classification", exc) from exc

    try:
        source = paths.candidates.relative_to(ROOT).as_posix()
    except ValueError:
        source = paths.candidates.name
    _write_json(paths.raw_predictions, {
        "source": source,
        "candidate_count": len(raw_predictions),
        "predictions": raw_predictions,
    })
    _write_json(paths.clean_predictions, {
        "dashboard": cand_data.get("dashboard", "new_dashboard"),
        "candidate_count": len(cleaned),
        "predictions": cleaned,
    })

    return {
        "success": True,
        "stage": "classify",
        "candidateCount": len(cleaned),
        "classifierJson": {
            "candidate_count": len(cleaned),
            "predictions": cleaned
        }
    }


def _build_layout(figma_data: Dict[str, Any], predictions: List[Dict[str, Any]], package_meta: Optional[Dict[str, Any]]):
    grid_layout = run_grid_layout(figma_data, predictions)
    source_nodes, _, _ = extract_nodes_from_figma_payload(figma_data)
    vista_page = run_vista_page_generation(grid_layout, predictions, package_meta, source_nodes=source_nodes)
    return grid_layout, vista_page


def _save_run(
    store: HistoryStore,
    run_id: str,
    vista_page: Dict[str, Any],
    predictions: List[Dict[str, Any]],
    package_details: Any,
    outputs: Dict[str, Any],
) -> bool:
    record = RunRecord(
        runId=run_id,
        designName=vista_page["title"],
        createdAt=datetime.now(timezone.utc),
        componentCount=len(predictions),
        widgetCount=len(vista_page["widgets"]),
        tileCount=len(vista_page["tiles"]),
        needAttention=vista_page["validation"]["reviewRequired"],
        packageDetails=package_details,
    )
    try:
        store.save_run(record, outputs)
        return True
    except (StorageUnavailableError, OutputTooLargeError) as exc:
        # The generated dashboard is still returned; the client is told it wasn't saved.
        logger.error("Could not save run %s: %r", run_id, exc.__cause__ or exc)
        return False


@app.post("/api/generate-layout")
def generate_layout(request: GenerateRequest, store: HistoryStore = Depends(get_history_store)):
    """Generate the 12x12 grid layout and Vista page.json, then save the run as an analysis."""
    paths = _stage_paths(request.designId)
    if not paths.clean_predictions.exists():
        raise HTTPException(status_code=409, detail="Run the Classify stage first.")

    figma_data = _request_figma(request, paths, "No Figma data found.")
    pred_data = _read_json(paths.clean_predictions)
    predictions = pred_data.get("predictions", [])

    try:
        grid_layout, vista_page = _build_layout(figma_data, predictions, _package_meta(request))
    except Exception as exc:
        raise _internal_error("Layout generation", exc) from exc

    # Keep the standard locations up to date for the CLI scripts and standalone preview.
    _write_json(paths.grid_layout, grid_layout)
    _write_json(paths.page, vista_page)

    run_id = request.runId or uuid.uuid4().hex[:8]
    raw_predictions = _read_json(paths.raw_predictions) if paths.raw_predictions.exists() else None

    saved = _save_run(store, run_id, vista_page, predictions, request.packageDetails, {
        "figma_data": figma_data,
        "raw_predictions": raw_predictions,
        "clean_predictions": pred_data,
        "grid_layout": grid_layout,
        "page_json": vista_page,
    })

    return {
        "success": True,
        "stage": "generate-layout",
        "runId": run_id,
        "saved": saved,
        "gridLayout": grid_layout,
        "pageJson": vista_page,
        "stats": {
            "widgets": len(vista_page["widgets"]),
            "tiles": len(vista_page["tiles"]),
            "needAttention": vista_page["validation"]["reviewRequired"]
        }
    }


DesignIdQuery = Query(None, pattern=DESIGN_ID_PATTERN)


@app.get("/api/download/page.json")
def download_page_json(designId: Optional[str] = DesignIdQuery):
    """Download the generated Dashboard page.json file."""
    page = _stage_paths(designId).page
    if not page.exists():
        raise HTTPException(status_code=404, detail="No generated page.json found. Run generation first.")
    return FileResponse(path=str(page), filename="page.json", media_type="application/json")


@app.get("/api/download/predictions.json")
def download_predictions_json(designId: Optional[str] = DesignIdQuery):
    """Download the cleaned XGBoost predictions."""
    clean = _stage_paths(designId).clean_predictions
    if not clean.exists():
        raise HTTPException(status_code=404, detail="No predictions found.")
    return FileResponse(
        path=str(clean),
        filename="new_dashboard_clean_predictions.json",
        media_type="application/json"
    )


# ============================================================================
# SAVED ANALYSES (HISTORY) API
# ============================================================================

RunIdParam = PathParam(..., pattern=RUN_ID_PATTERN)


@app.get("/api/history")
def get_history(
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0, le=100_000),
    q: Optional[str] = Query(None, max_length=100),
    store: HistoryStore = Depends(get_history_store),
):
    """List saved analysis runs, newest first."""
    runs, total = store.list_runs(limit=limit, skip=skip, query=q)
    return {"runs": runs, "total": total, "storage": store.backend}


@app.get("/api/history/{run_id}")
def get_history_run(run_id: str = RunIdParam, store: HistoryStore = Depends(get_history_store)):
    """Get details for a specific saved run."""
    return store.get_run(run_id)


@app.delete("/api/history/{run_id}")
def delete_history_run(run_id: str = RunIdParam, store: HistoryStore = Depends(get_history_store)):
    """Delete a saved run and its outputs."""
    store.delete_run(run_id)
    return {"success": True, "runId": run_id}


@app.get("/api/history/{run_id}/json/{json_type}")
def get_history_json(
    json_type: OutputKind,
    run_id: str = RunIdParam,
    store: HistoryStore = Depends(get_history_store),
):
    """Get a specific JSON output for a run."""
    return Response(content=store.get_output(run_id, json_type), media_type="application/json")


@app.get("/api/history/{run_id}/download/{json_type}")
def download_history_json(
    json_type: OutputKind,
    run_id: str = RunIdParam,
    store: HistoryStore = Depends(get_history_store),
):
    """Download a specific JSON output for a run."""
    return Response(
        content=store.get_output(run_id, json_type),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{run_id}_{json_type}.json"'},
    )


async def _read_ingest_body(request: Request) -> bytes:
    """Read the plugin payload: a raw JSON body (current plugin) or a multipart `file` (older clients)."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > settings.max_upload_bytes + 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Payload is larger than the {settings.max_upload_mb} MB limit.")
    content_type = request.headers.get("content-type", "")
    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        upload = form.get("file")
        if upload is None or isinstance(upload, str):
            raise HTTPException(status_code=400, detail="Missing payload")
        return await upload.read(settings.max_upload_bytes + 1)
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > settings.max_upload_bytes:
            raise HTTPException(status_code=413, detail=f"Payload is larger than the {settings.max_upload_mb} MB limit.")
    return bytes(body)


def _process_plugin_design(payload: Dict[str, Any], store: HistoryStore) -> Dict[str, Any]:
    """Run the full pipeline on a plugin payload and save it as an analysis."""
    nodes, doc_name, _ = _extract_nodes(payload)
    if not nodes:
        raise HTTPException(status_code=422, detail="No design layers were found on this page.")

    # Most recent plugin design, for "Check for plugin design" in the workspace (and local dev).
    _write_json(ACTIVE_FIGMA, payload)

    try:
        candidates = run_candidate_generation(nodes, dashboard_name=doc_name)
        raw_predictions = run_classification(candidates)
        cleaned = run_prediction_cleaning(raw_predictions)
        grid_layout, vista_page = _build_layout(payload, cleaned, None)
    except Exception as exc:
        raise _internal_error("Generation", exc) from exc

    run_id = uuid.uuid4().hex[:8]
    saved = _save_run(store, run_id, vista_page, cleaned, None, {
        "figma_data": payload,
        "raw_predictions": {"source": "figma-plugin", "candidate_count": len(raw_predictions), "predictions": raw_predictions},
        "clean_predictions": {"dashboard": doc_name, "candidate_count": len(cleaned), "predictions": cleaned},
        "grid_layout": grid_layout,
        "page_json": vista_page,
    })
    stats = {
        "widgets": len(vista_page["widgets"]),
        "tiles": len(vista_page["tiles"]),
        "needAttention": vista_page["validation"]["reviewRequired"],
    }
    logger.info("Plugin design %r processed: run %s, %s (saved=%s)", doc_name, run_id, stats, saved)
    return {
        "success": True,
        "saved": saved,
        "message": "Design received and Dashboard page.json generated.",
        "designName": vista_page["title"],
        "runId": run_id if saved else None,
        "importCode": run_id if saved else None,
        "openUrl": f"{settings.frontend_url}/#/history?run={run_id}" if saved else None,
        "nodeCount": len(nodes),
        "componentCount": len(cleaned),
        **stats,
    }


@app.post("/ingest")
async def plugin_ingest(request: Request, store: HistoryStore = Depends(get_history_store)):
    """Receiver for the Figma2Insight Figma plugin.

    Accepts the current page as JSON, validates it, runs the full model pipeline and saves the
    result as an analysis. The response carries an import code the user can enter in the
    workspace (or a link straight to the saved analysis).
    """
    write_limiter.check(request)
    content = await _read_ingest_body(request)
    payload = _parse_design_bytes(content)
    document = payload.get("document")
    if not isinstance(document, dict) or not isinstance(document.get("children"), list):
        raise HTTPException(status_code=400, detail="Missing document in design data")
    return await run_in_threadpool(_process_plugin_design, payload, store)


@app.get("/dashboard_preview.html")
def get_dashboard_preview():
    html_file = ROOT / "dashboard_preview.html"
    if html_file.exists():
        return FileResponse(str(html_file))
    return HTMLResponse("<h1>Preview file not found</h1>", status_code=404)


# Serve the built frontend if it exists
FRONTEND_DIST = ROOT / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        file_path = (FRONTEND_DIST / full_path).resolve()
        if file_path.is_file() and FRONTEND_DIST.resolve() in file_path.parents:
            return FileResponse(str(file_path))
        return FileResponse(str(FRONTEND_DIST / "index.html"))


if __name__ == "__main__":
    import uvicorn
    host = os.environ.get("HOST", "127.0.0.1")
    print(f"Starting Figma2Insight API on http://{host}:{settings.port}")
    uvicorn.run("server:app", host=host, port=settings.port, reload=False)
