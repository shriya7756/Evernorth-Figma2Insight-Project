# Figma2Insight Figma plugin

Sends a dashboard design from Figma to Figma2Insight, which classifies its components with the XGBoost
model and saves a Dashboard page.json as an analysis.

## Install (Figma desktop app)

1. In Figma desktop: **Plugins → Development → Import plugin from manifest…**
2. Choose `figma_plugin/manifest.json` from this repository.

The plugin then appears under **Plugins → Development → Figma2Insight**. To share it with a team, publish
it privately to your organisation from the same menu (Figma assigns it a new id on publish).

## Use

1. Open the Figma design.
2. Run **Plugins → Development → Figma2Insight**. The *Server* card should show **Connected · model
   ready**. The hosted server can take up to a minute to wake up the first time.
3. Select the dashboard frame on the canvas and keep **Selected frame**, or choose **Whole page**.
4. Click **Send to Figma2Insight**. The plugin extracts the layers (names, types, geometry, text, fills),
   sends them over HTTPS and waits while the model runs.
5. When it finishes the plugin shows the widget/tile counts and an **import code**.
6. In Figma2Insight, open **Workspace → Figma plugin**, enter the code and click **Load** — or click
   **open the saved analysis** in the plugin to go straight to the result.
7. From there the normal pipeline applies: run the stages, preview the dashboard, download page.json.

## How it works

| File | Role |
|------|------|
| `manifest.json` | Plugin definition. `networkAccess.allowedDomains` permits only the hosted API; `devAllowedDomains` permits `localhost:8001` (and the legacy `:8765` relay) while developing. |
| `code.js` | Main thread: serializes the selection or page into the Figma REST shape (`{document: {children: [page]}}`), checks `GET /api/health`, posts to `POST /ingest`, reports progress and errors. |
| `ui.html` | Panel: server choice and status, what to send, progress, result with import code. |
| `tests/harness.mjs` | Runs `code.js` in Node with a mocked `figma` global against a running API. |

The receiver is the API's `/ingest` endpoint (`server.py`). It accepts the JSON payload (or a multipart
`file` from older plugin versions), checks the size limit and that it contains a `document` with
`children`, runs the full model pipeline, saves the analysis (MongoDB in production) and returns:

```json
{"success": true, "saved": true, "designName": "Overview", "importCode": "8ec50fee", "runId": "8ec50fee",
 "openUrl": "https://figma2insight.netlify.app/#/history?run=8ec50fee", "widgets": 11, "tiles": 11, "needAttention": 2}
```

`/ingest` and `/api/health` answer CORS requests from any origin because Figma runs plugins in an iframe
whose origin is `null`; the rest of the API keeps its origin allow-list.

## Local development

* Run the API: `python server.py` (port 8001), then pick **Local development** in the plugin panel.
* Older copies of the plugin post to `http://localhost:8765/ingest`. `python plugin_receiver.py` keeps that
  port working by relaying to the API's `/ingest` (and saving the design to
  `dataset/new_dashboard/figma_data.json` if the API is down).
* Harness: `node figma_plugin/tests/harness.mjs dataset/dashboards/dashboard17.json local`
  (`production` as the last argument targets the hosted API).
