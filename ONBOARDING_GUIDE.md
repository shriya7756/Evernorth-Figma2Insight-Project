# Figma2Insight – Onboarding Guide

Welcome to **Figma2Insight**, built for **Evernorth Health Services** as part of the CBIT VII Semester Internship.

This guide gets you from zero to a running local dev environment in under 15 minutes.

---

## 1. What Does This Project Do?

Figma2Insight converts Figma dashboard designs into structured, validated dashboard layouts automatically:

```
Figma JSON  →  Component Detection  →  XGBoost Classification  →  12×12 Grid Layout  →  page.json
```

It uses a trained XGBoost ML model to classify each component (KPI Card, Chart, Table, Header, Sidebar, Filter, Other) and snaps them to a 12-column dashboard grid.

---

## 2. Technology Stack

| Layer    | Technology                                    |
|----------|-----------------------------------------------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4   |
| Backend  | Python, FastAPI, Pydantic v2, Uvicorn         |
| Database | MongoDB Atlas (falls back to local JSON files)|
| ML Model | XGBoost, scikit-learn, pandas, joblib         |
| Hosting  | Netlify (frontend) · Render (backend/API)      |

---

## 3. Prerequisites

Before you start, make sure you have:

| Tool        | Version  | Why                              |
|-------------|----------|----------------------------------|
| Python      | 3.10+    | Backend API and ML pipeline      |
| Node.js     | 20+      | Frontend build and dev server    |
| npm         | 9+       | Frontend package management      |
| MongoDB     | Optional | Persistent analysis history      |
| Git         | Any      | Clone and contribute             |

---

## 4. Clone the Repository

```bash
git clone https://github.com/shriya7756/Evernorth-Figma2Insight-Project.git
cd Evernorth-Figma2Insight-Project
```

---

## 5. Configure Environment Variables

Copy the template and fill in your values:

```bash
# macOS / Linux
cp .env.example .env

# Windows (PowerShell)
Copy-Item .env.example .env
```

Open `.env` and set at minimum:

```env
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxx.mongodb.net/
MONGODB_DB_NAME=figma2insight
CORS_ORIGINS=http://localhost:5174,http://127.0.0.1:5174
```

> **Without `MONGODB_URI`** the app still runs — analyses are saved to `outputs/history/` as JSON files instead.

**Run MongoDB locally with Docker (optional):**

```bash
docker run -d --name figma2insight-mongo -p 27017:27017 mongo:7
# Then in .env: MONGODB_URI=mongodb://localhost:27017
```

---

## 6. Install Backend Dependencies

```bash
# Create and activate virtual environment
python -m venv .venv

# Windows (PowerShell)
.\.venv\Scripts\Activate.ps1

# macOS / Linux
source .venv/bin/activate

# Install dependencies
pip install -r requirements-dev.txt
```

> Use `requirements.txt` instead if you only need runtime dependencies (no testing or linting tools).

---

## 7. Install Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

---

## 8. Run in Development Mode

Open **two separate terminals**:

**Terminal 1 — Backend API** (runs on `http://127.0.0.1:8001`):

```bash
python server.py
```

**Terminal 2 — Frontend Dev Server** (runs on `http://localhost:5174`):

```bash
cd frontend
npm run dev
```

Then open `http://localhost:5174` in your browser.

> The frontend dev server automatically proxies all `/api` calls to the backend at port 8001. You do not need to change any URLs.

---

## 9. Using the Figma Plugin (Optional)

The Figma2Insight plugin sends a selected Figma frame directly to the API without manually exporting JSON.

1. Open **Figma Desktop**.
2. Go to **Plugins → Development → Import plugin from manifest**.
3. Select `figma_plugin/manifest.json` from this repository.
4. Run the plugin, select a frame, and click **Send to Figma2Insight**.
5. The plugin returns an **import code** — paste it into the web app to load the design.

See [`figma_plugin/README.md`](figma_plugin/README.md) for full plugin setup.

---

## 10. Run Tests

| What              | Command                          |
|-------------------|----------------------------------|
| Backend tests     | `pytest`                         |
| Backend lint      | `ruff check .`                   |
| Frontend tests    | `cd frontend && npm test`        |
| Frontend build    | `cd frontend && npm run build`   |
| Frontend lint     | `cd frontend && npm run lint`    |

---

## 11. Project Structure (Quick Reference)

```
Figma2Insight/
├── backend/           → Config, MongoDB client, schemas, storage
├── server.py          → FastAPI app and all API routes
├── src/               → ML pipeline: candidates, features, model, layout, page generation
├── models/            → Trained XGBoost model artifacts
├── dataset/           → Training data
├── figma_plugin/      → Figma plugin source code
├── tests/             → pytest backend test suite (78 tests)
├── frontend/          → React 19 frontend (TypeScript + Tailwind)
├── render.yaml        → Render backend deployment config
├── netlify.toml       → Netlify frontend deployment config
└── requirements.txt   → Python runtime dependencies
```

---

## 12. API Endpoints (Quick Reference)

| Endpoint                               | Purpose                                                |
|----------------------------------------|--------------------------------------------------------|
| `GET  /api/health`                     | Readiness probe — 200 when model is loaded             |
| `GET  /api/status`                     | API version, model classes, storage health             |
| `POST /api/upload`                     | Upload a Figma JSON file; returns `designId`           |
| `POST /api/normalize`                  | Stage 1 — normalize raw Figma tree                     |
| `POST /api/preprocess`                 | Stage 2 — extract ML features                          |
| `POST /api/classify`                   | Stage 3 — run XGBoost classifier                       |
| `POST /api/generate-layout`            | Stage 4 — generate 12×12 grid layout and save run      |
| `POST /ingest`                         | Figma plugin receiver — full pipeline in one call      |
| `GET  /api/history`                    | Paginated list of saved analyses                       |
| `GET  /api/history/{runId}`            | Details and available outputs for one run              |
| `DELETE /api/history/{runId}`          | Delete a run                                           |

Interactive API docs: `http://127.0.0.1:8001/docs`

---

## 13. Environment Variables Reference

| Variable               | Required    | Default                               | Purpose                                      |
|------------------------|-------------|---------------------------------------|----------------------------------------------|
| `MONGODB_URI`          | Recommended | _(empty → local file storage)_        | MongoDB connection string                    |
| `MONGODB_DB_NAME`      | No          | `figma2insight`                       | Database name                                |
| `CORS_ORIGINS`         | No          | `http://localhost:5174,...`           | Allowed browser origins (comma-separated)    |
| `MAX_UPLOAD_MB`        | No          | `50` (`25` on 512 MB hosts)           | Upload size limit                            |
| `FRONTEND_URL`         | No          | `https://figma2insight.netlify.app`   | URL the plugin shows for saved analyses      |
| `RATE_LIMIT_PER_MINUTE`| No          | `30`                                  | API requests per IP per minute (0 = off)     |
| `WORKSPACE_TTL_HOURS`  | No          | `24`                                  | Per-design pipeline workspace lifetime       |
| `LOG_LEVEL`            | No          | `INFO`                                | `DEBUG` enables detailed extraction traces   |

---

## 14. Live Deployment

| Service   | URL                                                                 |
|-----------|---------------------------------------------------------------------|
| Frontend  | https://figma2insight.netlify.app                                   |
| Backend   | https://evernorth-figma2insight-project.onrender.com                |
| Health    | https://evernorth-figma2insight-project.onrender.com/api/health     |

For full production deployment instructions see [`DEPLOYMENT.md`](DEPLOYMENT.md).

---

## 15. Common Issues

| Problem                          | Solution                                                                                      |
|----------------------------------|-----------------------------------------------------------------------------------------------|
| `ModuleNotFoundError`            | Make sure your virtual environment is activated (`python -m venv .venv` then activate it).   |
| Backend crashes on startup       | Check `MONGODB_URI` is valid, or leave it unset to use local file storage.                    |
| Frontend shows API errors        | Ensure `python server.py` is running in another terminal.                                     |
| Figma plugin not connecting      | Use **Local development** mode in the plugin panel; ensure the backend is running.             |
| Upload rejected (file too large) | Lower `MAX_UPLOAD_MB` to `25` and re-export a smaller frame from Figma.                      |

---

## 16. Contributing

1. Fork the repository and create a feature branch.
2. Make your changes with tests (`pytest` and `npm test` both passing).
3. Run lint checks (`ruff check .` and `cd frontend && npm run lint`).
4. Open a pull request against `master` with a clear description.

---

*Built by the Figma2Insight team during the Evernorth Health Services Internship — Chaitanya Bharathi Institute of Technology (A), AI & DS Department, 2026–27.*
