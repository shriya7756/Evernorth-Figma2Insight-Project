# Figma2Insight — updated model integration report

Branch: `integrate-updated-model` (3 commits on top of `8645597`, the commit the live site was built from).
Date: 24 Nov 2026.

## Summary

The improved model from `vrinda07-ui/evernorth` now runs inside the original Figma2Insight application. The
original architecture, API, MongoDB storage, saved analyses and the UI of https://figma2insight.netlify.app are
unchanged apart from small additions. The Figma plugin has been rebuilt to work against the hosted API. There is
one model pipeline, used by JSON upload, the plugin and the CLI scripts.

**Status: code-complete and tested locally. Not yet deployed.** Nothing in this report was run against the
production site: this machine has no access to the GitHub repository's Render/Netlify deployment or credentials.
Section 9 lists what has to happen before public release.

## 1. What the three sources turned out to be

| Source | Finding |
|--------|---------|
| Original repo `shriya7756/Evernorth-Figma2Insight-Project` | FastAPI API + MongoDB/file history store, staged pipeline (`src/pipeline.py`), React 19/Tailwind UI, Figma plugin + receiver, Render/Netlify config, 35 backend + 10 frontend tests (all passing before any change). |
| Updated repo `vrinda07-ui/evernorth` | A fork of an older snapshot of the same project. The model changes are a **retrained XGBoost classifier** and a **larger `src/pipeline.py`** (1,205 → 2,225 lines). Its `server.py` and frontend are *older* than the original's (CORS `*`, no MongoDB, no validation, different UI), so they were not used. |
| Live site | Built from the original repo's `frontend/` (Workspace, Preview, Saved analyses, Guide). Backend on Render, MongoDB connected, cold start measured at 43 s. |

### What changed in the model

| | Original | Updated |
|---|---|---|
| Classifier | XGBoost, 20 features, 1,050 trees | XGBoost retrained on updated `training_dataset.csv`, same 20 features, 1,050 trees |
| Classes | CHART, FILTER, HEADER, KPI_CARD, **NAVBAR**, OTHER, TABLE | CHART, FILTER, HEADER, KPI_CARD, OTHER, **SIDEBAR**, TABLE |
| Input schema | Figma document tree → candidates → 20 features | **Unchanged** |
| Chart data | Only explicit "label value" rows (rarely matched) | Funnel, channel mix, line chart (axis-calibrated), vertical/horizontal bar extraction from source geometry |
| Tables | Header row only, no rows | Rows and records reconstructed from row frames or text geometry, with a confidence level |
| Structure | Header/sidebar added as OTHER | Kept as HEADER / SIDEBAR; component-library frames excluded; dashboard container widened to include the sidebar |
| Candidates | — | Text-only KPI cards detected; "navigation" panels recognised |
| Output schema | page.json widgets/tiles | **Superset**: adds `chartText`, `chartDataWarning`, `tableConfig.rows/records`, `tableDataWarning` |

Measured on the same real designs (`tools/compare_pipeline_outputs.py`, run on both versions):

| Design | Widgets old → new | Charts with extracted data | Table rows | Needs review |
|--------|------|------|------|------|
| updated sample | 11 → 16 | 0/2 → 1/2 | 0 → 19 | 3 → 2 |
| original sample | 11 → 11 | 0/3 → 0/2 | 0 → 5 | 4 → 3 |
| dashboard1 | 10 → 16 | 0/3 → 3/4 | 0 → 0 | 4 → 2 |
| dashboard10 | 23 → 22 | 0/7 → 3/7 | 0 → 0 | 7 → 4 |
| dashboard14 | 13 → 13 | 0/10 → 3/8 | 0 → 0 | 12 → 7 |
| dashboard15 | 34 → 17 | 0/5 → 3/4 | 0 → 20 | 7 → 3 |
| dashboard17 | 11 → 11 | 0/3 → 1/1 | 0 → 10 | 5 → 2 |
| dashboard5 | 0 → 0 | — | — | — (no dashboard container found by either version) |

## 2. Retained from the original repository

Everything outside the model: `server.py` and all its routes, `backend/` (config, MongoDB client, Pydantic
schemas, file/MongoDB history stores), saved-analysis data model, the whole React frontend and design system,
`netlify.toml`, CLI/training/labelling scripts, tests, GitHub workflow. No original feature was removed.

## 3. Replaced with the updated model

| File | Change |
|------|--------|
| `models/xgboost_model.json`, `models/label_encoder.pkl` | Replaced by the updated artifacts; `models/feature_importance.csv` added |
| `src/pipeline.py` | Replaced by the updated pipeline, then: debug `print`s (including a block hard-wired to two candidate ids that dumped every descendant) turned into `logging`; model loaded **once per process** (thread-safe) instead of on every request, with a feature-count check; adapter for the Figma REST `/files/:key/nodes` response |
| `src/preprocessing/generate_candidates.py` | Updated candidate rules; trace output of library functions moved from `print` to debug logging (see §8, bug 1) |
| `src/model/train_xgboost.py`, training/label/candidate datasets | Updated versions, so the model can be retrained reproducibly |

Deliberately **not** taken from the updated repo: its `server.py` and `frontend/` (older than the original's and
a different UI); `src/extraction/{chart_extractor,node_utils,validators}.py` — not imported anywhere in the
updated repo, and a second chart extractor alongside the one in `pipeline.py` would be a duplicate pipeline.
Old model code removed: only the two replaced artifacts. Backups (`models/xgboost_model_backup.json`,
`models/xgboost_labeled/`) are identical in both repos and were left as they were.

## 4. How the updated model connects to the backend

No adapter was needed at the model boundary: the updated pipeline keeps the original function signatures
(`extract_nodes_from_figma_payload`, `run_candidate_generation`, `run_classification`, `run_prediction_cleaning`,
`run_grid_layout`, `run_vista_page_generation`, `execute_full_pipeline`), the same 20-feature input and a
superset of the page.json output. Three things were adapted:

* **Classes**: `/api/status` now reports the classes of the loaded model (it was a hard-coded list), and the UI
  labels HEADER/SIDEBAR/FILTER while laying them out like the original's OTHER, so dashboards look the same.
* **Lifecycle**: the API loads and validates the model at start-up; `/api/health` returns 503 until it is ready.
* **Dependencies**: the artifacts were written by XGBoost 3.2 and scikit-learn 1.7.2; `requirements.txt` now pins
  `xgboost>=3.2,<4` and `scikit-learn>=1.7.2,<1.8` (the old `xgboost>=2.0` could install a version that cannot
  read the model, and scikit-learn 1.9 warned when unpickling the encoder).

## 5. Backend changes for production

* **Per-design workspaces.** The original stored every user's in-progress stages in one set of shared files, so
  two people using the public site at once would overwrite each other's candidates/predictions. Each upload or
  plugin import now gets a private workspace (`designId`), stages are scoped to it, and expired workspaces are
  cleaned up. Requests without `designId` keep the old single-design behaviour for the CLI and older clients.
* **Plugin receiver** `POST /ingest`: accepts the plugin's JSON body (and multipart for older clients), enforces the
  size limit while streaming, validates the document, runs the pipeline off the event loop, saves the analysis and
  returns an import code + link. It and `/api/health` accept Figma's `null` origin; other routes keep the CORS
  allow-list.
* `GET /api/load-plugin-data?code=` loads a plugin design from saved analyses (survives restarts, safe for many users).
* Per-IP rate limiting on upload and ingest; `FRONTEND_URL`, `WORKSPACE_TTL_HOURS`, `RATE_LIMIT_PER_MINUTE`,
  `LOG_LEVEL` settings; `/api/status` reports the upload limit so the UI and plugin show the real one.
* `render.yaml`: health check path, Python 3.12.10 (tested version), proxy headers, `MAX_UPLOAD_MB=25` sized for a
  512 MB instance (measurements in `DEPLOYMENT.md`).

## 6. Frontend changes (design preserved)

All in the existing components and design tokens; no layout, colour or navigation changes.

* **Figma plugin tab**: import-code field + **Load**; "Use latest plugin design" kept; text now names the
  *Figma2Insight* plugin. `#/workspace?code=…` pre-fills the code.
* **Upload JSON tab**: collapsible **"How to extract JSON from Figma?"** — open the file and copy its key, select the
  frame and copy its link (node id), export with the Figma REST API and a personal access token
  (`/v1/files/:key/nodes?ids=` for one frame, or the whole file), save, upload. Written against the parser: both
  response shapes are accepted (the single-frame one via the new adapter, covered by a test). It does not suggest a
  native "export JSON" — Figma has none — and points to the plugin as the no-token route.
* Stages send `designId`; page.json download is per design; upload limit comes from the API.
* Saved analyses open from `#/history?run=…` (the plugin's link).
* Preview inspector shows reconstructed table rows and extraction warnings; tiles are labelled Header/Sidebar/Filter.

## 7. Figma plugin and receiver

* **Before:** manifest `allowedDomains: ["none"]` and a hard-coded `http://localhost:8765` — it could not reach any
  hosted server. The receiver's pipeline list was empty: it saved the file and never ran the model.
* **Now:** the plugin (renamed *Figma2Insight*) allows only `https://evernorth-figma2insight-project.onrender.com`
  (plus localhost in development), lets the user send the **selected frame** or the whole page, checks the
  connection (`/api/health`), shows progress, a cold-start hint, the server's own error messages, and on success
  the widget/tile counts, an **import code** (copy button) and **open the saved analysis**.
* **Receiver deployment:** the receiver is the API's `/ingest`, so in production it is the Render web service —
  persistent, HTTPS, health-checked and restarted by Render, with no tunnel. `plugin_receiver.py` remains only as a
  local relay for old plugin copies on port 8765 and forwards to `/ingest` (one pipeline).
* Install/usage: `figma_plugin/README.md`.

## 8. Tests

All run on this machine (Windows 11, Python 3.12.10, Node 26, XGBoost 3.4.1, scikit-learn 1.7.2).

| Check | Result |
|-------|--------|
| Backend `pytest` | **78 passed** (35 original + 43 new). Includes: updated model loads with SIDEBAR and 20 features; real KPI values and table rows on the sample; upload → 4 stages → saved run per workspace; concurrent designs isolated; expired/invalid design ids; workspace cleanup; REST `/nodes` export end to end; `/ingest` JSON + multipart, null-origin CORS preflight, validation (5 bad payloads), size limit, import-code reload, unknown code; rate limiter; non-ASCII layer names with a cp1252 stdout. Every storage test runs against both MongoDB (mongomock) and file storage. |
| `ruff check .` | clean |
| Frontend `npm run lint` (ESLint + tsc) | clean |
| Frontend `npm test` | **11 passed** |
| Frontend `npm run build` | succeeds (358 kB JS / 108 kB gzip) |
| Plugin harness (`figma_plugin/tests/harness.mjs`, real `code.js`, mocked `figma`) against the local API | **PASS** — selected frame "Overview" (327 layers) → online check → send → 11 widgets, import code returned |
| Workflow 1 in the browser (local API serving the built UI) | Upload of a 13.4 MB export → Normalize (145 candidates) → Features → Classify (117) → Layout (17 widgets) → saved analysis → preview → page.json download. No console errors. |
| Workflow 2 locally | Plugin-shaped request with `Origin: null` (preflight 204, health 200) → `/ingest` 4,146 layers → 17 widgets in 1.1 s → import code loaded in the UI → 4 stages → preview with KPI values, chart series and table rows. |
| Restart/recovery locally | API stopped and started: model reloads at start-up, import codes and saved analyses load again. |
| Memory | ~265 MB resident after start-up, ~295 MB peak on the largest dataset design (19 MB). |

**Bugs found and fixed during testing**

1. The updated candidate generator printed every layer name to stdout; on a Windows console (cp1252) a name such as
   "Filter ▾" raised `UnicodeEncodeError` and failed the whole plugin import with a 500. Fixed by logging; a
   regression test fails without the fix and passes with it.
2. A Figma REST single-frame export (`{"nodes": {...}}`) was rejected as "not a Figma export". Fixed with the adapter.

**Not tested**

* **Anything on the deployed site** (Phase 7): requires deploying first (§9).
* **The plugin inside the Figma app**: the harness runs the same `code.js`, but Figma's sandbox, manifest network
  rules and `figma.clientStorage` were mocked. Import it once in Figma desktop and send a frame to confirm.
* **CSV / JSON / XLSX dataset processing and generated insight reports**: these do not exist in the original
  repository or on the live site — the app's inputs are Figma designs and its "report" is the page.json plus the
  saved analysis outputs (predictions, grid layout, page.json; view/download). I did not add a dataset-upload or
  report feature, because that would be new product scope rather than integration. Say if you want it built.

## 9. Before public release

1. **Deploy** (needs the repo owner's access): push `integrate-updated-model`, open a PR to `main`, merge. Render
   redeploys from `render.yaml`; Netlify rebuilds `frontend/`. Check that Render's service picked up the health
   check path, Python 3.12.10 and `MAX_UPLOAD_MB`, and that `MONGODB_URI` is still set (`DEPLOYMENT.md` §2).
2. **Run the acceptance checks on production** — `DEPLOYMENT.md` §2.4 and §3, the three workflows from a second
   browser/device, and the plugin from Figma desktop against the hosted API.
3. **Distribute the plugin**: import from manifest for testers, or publish privately to the organisation.
4. **Decide the instance size**: free/512 MB with 25 MB uploads and ~1 min cold starts, or a paid instance.
5. Model-quality items to review with the model owner (not regressions — the old model extracted no chart data):
   one chart in dashboard15 gets three points all labelled "Inpatient" (30000/6/25); dashboard5 produces no widgets
   with either model; several charts still need review.
6. Known, pre-existing, unchanged: no user accounts (saved analyses are visible to anyone with the site URL);
   `/api/designs` returns a hard-coded list of reference designs (unused by the UI); the bundled sample design
   doubles as the "latest plugin design" file, so running the plugin locally modifies
   `dataset/new_dashboard/figma_data.json`.
