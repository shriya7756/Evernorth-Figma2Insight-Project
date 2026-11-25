# Deploying Figma2Insight

Production runs as three pieces:

| Piece | Where | Built from |
|-------|-------|------------|
| Web app (React) | Netlify — `https://figma2insight.netlify.app` | `frontend/` (see `netlify.toml`) |
| API + model + plugin receiver (FastAPI) | Render web service — `https://evernorth-figma2insight-project.onrender.com` | repo root (see `render.yaml`) |
| Saved analyses | MongoDB (Atlas) | `MONGODB_URI` on Render |

The Figma plugin is not hosted: users import it into Figma (see `figma_plugin/README.md`). It talks to the
Render API directly over HTTPS. There is no separate receiver process in production — the API's `/ingest`
endpoint *is* the receiver, so it is deployed, restarted and health-checked with the API.

```text
Figma plugin ──HTTPS POST /ingest──▶ Render API ──▶ updated XGBoost pipeline ──▶ MongoDB (saved analysis)
                                       ▲                                              │
Browser ── Netlify (static UI) ──HTTPS /api/*──┘◀─────────── import code / #/history?run= ┘
```

## 1. Before you deploy

```bash
pip install -r requirements-dev.txt
pytest                       # 78 tests: API, storage (file + MongoDB mock), model, plugin receiver
ruff check .
cd frontend && npm ci && npm run lint && npm test && npm run build
```

With the API running locally (`python server.py`, port 8001) you can also run the real plugin code
against it:

```bash
node figma_plugin/tests/harness.mjs dataset/dashboards/dashboard17.json local
```

## 2. Backend on Render

`render.yaml` is a Render Blueprint. Merging to the branch Render watches (`main`) redeploys the
service (`autoDeploy: true`).

1. **Environment variables** (Render → service → Environment). `render.yaml` sets the non-secret ones;
   set the secret yourself:

   | Variable | Value |
   |----------|-------|
   | `MONGODB_URI` | Atlas connection string (secret — never commit it) |
   | `MONGODB_DB_NAME` | `figma2insight` |
   | `CORS_ORIGINS` | `https://figma2insight.netlify.app` (+ localhost origins for development) |
   | `FRONTEND_URL` | `https://figma2insight.netlify.app` (used in the plugin's "open analysis" link) |
   | `MAX_UPLOAD_MB` | `25` on 512 MB instances, `50` on 2 GB+ (see Memory) |
   | `RATE_LIMIT_PER_MINUTE` | `30` uploads/plugin sends per client IP per minute |
   | `WORKSPACE_TTL_HOURS` | `24` |
   | `LOG_LEVEL` | `INFO` (`DEBUG` for chart/table extraction traces) |
   | `PYTHON_VERSION` | `3.12.10` (the version the integration was tested on) |

   If the service was created by hand rather than from the Blueprint, copy these values in and set
   **Health Check Path** to `/api/health`.

2. **MongoDB Atlas**: allow Render's outbound IPs (or `0.0.0.0/0` with a strong user password) under
   Network Access. The API falls back to local files if MongoDB is unreachable — on Render those files
   are lost on every restart, so check `GET /api/status` reports `"storage": {"backend": "mongodb", "healthy": true}`.

3. **Model artifacts** are in the repo (`models/xgboost_model.json`, `models/label_encoder.pkl`) and
   ship with every deploy — nothing is mounted or downloaded at runtime. The API loads and validates the
   model at startup; `/api/health` returns 503 until it has, so a broken deploy fails its health check
   instead of serving errors. `requirements.txt` pins XGBoost 3.2–3.x and scikit-learn 1.7.x because
   those wrote the artifacts.

4. **Verify** after the deploy finishes:

   ```bash
   curl https://evernorth-figma2insight-project.onrender.com/api/health
   # {"status":"ok","modelLoaded":true,...}
   curl https://evernorth-figma2insight-project.onrender.com/api/status
   # classes must include "SIDEBAR" (updated model); storage.backend "mongodb", healthy true
   curl -i -X OPTIONS https://evernorth-figma2insight-project.onrender.com/ingest \
        -H "Origin: null" -H "Access-Control-Request-Method: POST"
   # 204 with access-control-allow-origin: *
   ```

### Memory

Measured locally on the bundled designs: about 265 MB resident after start-up (FastAPI, pandas,
XGBoost and the loaded model) and about 295 MB peak while processing the largest dataset design
(19 MB). Parsing JSON needs roughly 2–5× the file size on top of that, so a 50 MB upload can exceed a
512 MB instance. Keep `MAX_UPLOAD_MB=25` on 512 MB plans; use a 2 GB instance for 50 MB designs. The
web app and the plugin read the limit from the API, so their messages stay accurate.

### Cold starts

Render's free plan sleeps after 15 minutes idle; the first request then takes about a minute (measured
43 s). The web app waits up to 60 s for status, the plugin up to 90 s for its connection check and
180 s for a send, and both say the server may be waking up. A paid plan removes this.

### Scaling note

Uploaded designs live in a per-design workspace on the instance's disk (`outputs/workspaces/`, deleted
after `WORKSPACE_TTL_HOURS`) while the four stages run. With a **single instance** this is safe for any
number of concurrent users. If you scale to several instances, enable session affinity or move
workspaces to shared storage; completed analyses are already in MongoDB and are unaffected. If a
workspace disappears (restart mid-run), the UI says the session expired and the user reloads the design.

## 3. Frontend on Netlify

Netlify builds `frontend/` with `npm run build` and publishes `frontend/dist` (`netlify.toml`).

* On `*.netlify.app` the app calls the Render API directly (`frontend/src/services/api.ts`) — Netlify's
  proxy has a 6 MB body limit and a ~26 s timeout, both too small for large designs and cold starts.
  The `/api/*` redirect in `netlify.toml` stays as a fallback for custom domains.
* For a **custom domain**, set `VITE_API_BASE_URL=https://evernorth-figma2insight-project.onrender.com/api`
  in Netlify → Site configuration → Environment variables, add the domain to `CORS_ORIGINS` on Render,
  and redeploy both.
* No secrets are used by the frontend.

Verify: open the site, check the hero shows **XGBoost model ready**, upload
`dataset/dashboards/dashboard17.json`, run the full pipeline, open the preview.

## 4. Figma plugin

See `figma_plugin/README.md`. The manifest allows only the Render domain (plus localhost in
development). If the API moves to another domain, update `PRODUCTION_API` in `figma_plugin/code.js`,
`allowedDomains` in `figma_plugin/manifest.json` and re-import/re-publish the plugin.

## 5. Rollback

Render → service → Events → pick the previous deploy → **Rollback**. Netlify → Deploys → previous
deploy → **Publish deploy**. The API and UI are backwards compatible in both directions for uploads; an
older API does not understand plugin import codes (`/api/load-plugin-data?code=`).

## 6. Operations

* Logs: Render → Logs. Every request is logged by Uvicorn; pipeline errors are logged with a traceback
  under `figma2insight.api`; each plugin send logs its run id and widget counts.
* Health: `/api/health` (model) and `/api/status` (model classes, storage, upload limit).
* Abuse protection: uploads and plugin sends are rate limited per client IP; bodies over `MAX_UPLOAD_MB`
  are rejected with 413 before parsing; `/ingest` is the only route open to any origin.
* Not included: user accounts. Saved analyses are visible to anyone who can open the site, exactly as
  before this integration.
