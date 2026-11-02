# Figma2Insight

Figma2Insight turns Figma dashboard designs into structured, validated dashboard layouts. It finds component
candidates in an exported design, classifies them with an XGBoost model (KPI cards, charts, tables and more), maps
them onto a 12 × 12 grid and generates a Vista `page.json`. Every generated layout is saved as an analysis you can
revisit, preview, download or delete.

## Features

- **Two ways in** – send the current page from the Figma plugin, or upload a Figma JSON export (validated, 50 MB limit).
- **Four-stage pipeline** – Normalize → Extract features → Classify (XGBoost) → Generate layout. Run stages one by one
  or all at once, with progress, per-stage results, inline errors and retry.
- **Package details** – optional title, slide ID, subject area, topic and slide name, validated in the browser and on
  the server.
- **Dashboard preview** – the generated layout drawn with the original Figma geometry, colour-coded by component type,
  with a component inspector and a touch-friendly list on small screens.
- **Saved analyses (MongoDB)** – searchable, paginated history of runs with stats, package details and all JSON
  outputs; open any run in the preview, view/download outputs, or delete it.
- **Guide** – the grid rules, Figma → Vista widget mapping and validation checks.

## Technology

| Layer     | Stack |
|-----------|-------|
| Frontend  | React 19, TypeScript (strict), Vite, Tailwind CSS v4, lucide-react |
| API       | Python, FastAPI, Pydantic v2, Uvicorn |
| Database  | MongoDB via PyMongo (falls back to local JSON files when not configured) |
| ML        | XGBoost, scikit-learn, pandas, joblib |

## Project structure

```text
Figma2Insight/
├── backend/                  # API support package
│   ├── config.py             # Environment configuration (.env support)
│   ├── db.py                 # Shared MongoClient (one per process) + ping/close
│   ├── schemas.py            # Pydantic models + MongoDB $jsonSchema validators
│   └── storage.py            # Saved-analysis stores: MongoDB and local-file
├── server.py                 # FastAPI app and routes
├── src/                      # ML pipeline (candidates, features, model, layout, page generation)
├── models/                   # Trained model artifacts
├── dataset/                  # Training data, candidates and the active plugin design
├── outputs/                  # Generated layouts/pages (outputs/history/ when not using MongoDB)
├── figma_plugin/             # Figma plugin that sends the current page
├── plugin_receiver.py        # Optional receiver used by the Figma plugin (port 8765)
├── dashboard_preview.html    # Standalone preview of the latest generated page
├── tests/                    # Backend tests (pytest)
└── frontend/
    └── src/
        ├── components/       # Pages, workspace panels and ui/ design-system primitives
        ├── hooks/            # Hash router and pipeline state
        ├── lib/              # Validation, formatting and download helpers (+ unit tests)
        ├── services/api.ts   # Typed API client with timeouts and error handling
        └── index.css         # Design tokens, motion and focus styles
```

## Getting started

### Prerequisites

- Python 3.10+
- Node.js 20+ and npm
- MongoDB 6+ (local, Docker or Atlas) — optional; without it, analyses are stored in `outputs/history/`

### 1. Configure the environment

```bash
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
```

Edit `.env` and set at least `MONGODB_URI`. See [Environment variables](#environment-variables).

To run MongoDB locally with Docker:

```bash
docker run -d --name figma2insight-mongo -p 27017:27017 mongo:7
# then in .env: MONGODB_URI=mongodb://localhost:27017
```

### 2. Install backend dependencies

```bash
python -m venv .venv
# macOS/Linux: source .venv/bin/activate
# Windows:     .\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt     # or requirements.txt for runtime only
```

### 3. Install frontend dependencies

```bash
cd frontend
npm install
```

### 4. Run in development

Terminal 1 – API (http://127.0.0.1:8001):

```bash
python server.py
```

Terminal 2 – frontend (http://localhost:5174, proxies `/api` to the API):

```bash
cd frontend
npm run dev
```

Optional terminal 3 – Figma plugin receiver (http://127.0.0.1:8765):

```bash
python plugin_receiver.py
```

### 5. Production-style run

```bash
cd frontend && npm run build && cd ..
python server.py            # serves the built frontend from frontend/dist at http://127.0.0.1:8001
```

## Environment variables

| Variable             | Required | Default                                         | Purpose |
|----------------------|----------|-------------------------------------------------|---------|
| `MONGODB_URI`        | Recommended | _(empty → local file storage)_               | MongoDB connection string for saved analyses |
| `MONGODB_DB_NAME`    | No       | `figma2insight`                                 | Database name |
| `MONGODB_TIMEOUT_MS` | No       | `5000`                                          | Server-selection / connect timeout |
| `PORT`               | No       | `8001`                                          | API port |
| `HOST`               | No       | `127.0.0.1`                                     | API bind address |
| `CORS_ORIGINS`       | No       | `http://localhost:5174,http://127.0.0.1:5174`   | Allowed browser origins (comma-separated) |
| `MAX_UPLOAD_MB`      | No       | `50`                                            | Upload size limit |

Credentials are only read from the environment / `.env` (which is git-ignored). Nothing is hardcoded.

## Commands

| Task | Command |
|------|---------|
| Backend tests | `pytest` |
| Backend lint | `ruff check .` |
| Frontend dev server | `cd frontend && npm run dev` |
| Frontend build | `cd frontend && npm run build` |
| Frontend lint (ESLint + type-check) | `cd frontend && npm run lint` |
| Frontend unit tests | `cd frontend && npm test` |

Backend tests run every storage test against both the MongoDB store (using `mongomock`, no server needed) and the
local-file store, and run the full ML pipeline against the bundled sample design.

## MongoDB data model

Saved analyses use two collections, created automatically on first use with `$jsonSchema` validators and indexes:

**`analysis_runs`** – one summary document per generated layout

| Field | Type | Notes |
|-------|------|-------|
| `runId` | string | `^[A-Za-z0-9_-]{1,64}$`, unique index |
| `designName` | string | 1–200 chars, control characters stripped |
| `createdAt` | date | UTC, descending index |
| `componentCount`, `widgetCount`, `tileCount`, `needAttention` | int ≥ 0 | |
| `status` | `"completed"` | |
| `packageDetails` | object \| null | `subjectArea`, `topic`, `slideName` (lowercase slugs), `slideId` (5 chars A–Z/0–9), `title` (≤ 120) |
| `outputs` | object | which outputs are stored, e.g. `{ "page_json": true }` |
| `schemaVersion` | int | currently `1` |

**`run_outputs`** – one document per JSON output (`figma_data`, `raw_predictions`, `clean_predictions`,
`grid_layout`, `page_json`), gzip-compressed into a `data` binary field with `size`/`compressedSize`. Unique index on
`(runId, kind)`. Keeping outputs separate keeps history listings small and fast.

The API validates every input with Pydantic, escapes search text before it reaches a regex query, never echoes
submitted values back in validation errors, and maps database failures to a generic `503` so internals are not
exposed. If storage is unavailable when a layout is generated, the result is still returned with `saved: false`.

## API overview

| Method & path | Purpose |
|---------------|---------|
| `GET /api/status` | API, model and storage health |
| `GET /api/load-plugin-data` | Load the design last sent by the Figma plugin |
| `POST /api/upload` | Validate an uploaded Figma JSON file |
| `POST /api/normalize` · `/api/preprocess` · `/api/classify` · `/api/generate-layout` | Pipeline stages (the last one saves the run) |
| `GET /api/download/page.json` | Latest generated page |
| `GET /api/history?q=&limit=&skip=` | List saved analyses |
| `GET /api/history/{runId}` | Run details and available outputs |
| `GET /api/history/{runId}/json/{type}` · `/download/{type}` | View or download an output |
| `DELETE /api/history/{runId}` | Delete a run and its outputs |

Interactive docs are available at `http://127.0.0.1:8001/docs` while the API is running.

## Pipeline workflow

```text
Figma JSON → Candidate generation → Feature extraction → XGBoost classification
           → Prediction cleaning → 12×12 grid layout → Vista page.json → Preview / saved analysis
```

Training and research scripts (feature extraction, labelling, `src/model/train_*.py`, `src/model/predict.py`) are
unchanged; see `steps.txt` for the original command-line workflow.

## Design system

The interface uses a calm, high-contrast palette: dark teal `#012E33` for navigation, headings and hero sections,
aquamarine `#3EFFC0` for primary actions, active states and focus rings, and white surfaces, with neutral teal tints
derived from them. Muted red and amber appear only where meaning requires it (errors, items needing review). Motion is
short and subtle (fades, staggered entrances, page transitions) and is disabled when the user prefers reduced motion.
