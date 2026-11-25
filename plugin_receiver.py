"""
Local Figma plugin receiver (development only).

The Figma2Insight API itself is the plugin receiver: in production the plugin posts to
https://evernorth-figma2insight-project.onrender.com/ingest, and in local development it
can post straight to http://localhost:8001/ingest (choose "Local development" in the plugin).

This script keeps the legacy port 8765 working for older copies of the plugin. It relays
each payload to the API's /ingest endpoint, so the same model pipeline runs either way. If
the API is not running, the payload is saved to dataset/new_dashboard/figma_data.json and
can be loaded later with "Check for plugin design" in the workspace.

Usage:
    python plugin_receiver.py                      # relays to http://127.0.0.1:8001
    F2I_API_URL=http://127.0.0.1:8001 python plugin_receiver.py
"""

import json
import os
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HOST = os.environ.get("RECEIVER_HOST", "127.0.0.1")
PORT = int(os.environ.get("RECEIVER_PORT", "8765"))
API_URL = os.environ.get("F2I_API_URL", "http://127.0.0.1:8001").rstrip("/")
MAX_BYTES = int(os.environ.get("MAX_UPLOAD_MB", "50")) * 1024 * 1024

INPUT_FILE = ROOT / "dataset" / "new_dashboard" / "figma_data.json"


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def send_json(self, status, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.path != "/ingest":
            self.send_json(404, {"error": "Unknown endpoint"})
            return

        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            self.send_json(400, {"error": "Empty request"})
            return
        if length > MAX_BYTES:
            self.send_json(413, {"error": "Payload is larger than the upload limit"})
            return

        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw)
        except ValueError:
            self.send_json(400, {"error": "Payload is not valid JSON"})
            return
        if not isinstance(payload, dict) or "document" not in payload:
            self.send_json(400, {"error": "Missing document in design data"})
            return

        request = urllib.request.Request(
            f"{API_URL}/ingest", data=raw, headers={"Content-Type": "application/json"}, method="POST"
        )
        try:
            with urllib.request.urlopen(request, timeout=600) as response:
                result = json.loads(response.read() or b"{}")
                self.send_json(response.status, result)
                print(f"Relayed design to {API_URL}/ingest: {result.get('widgets')} widgets, import code {result.get('importCode')}")
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:3000]
            self.send_json(exc.code, {"error": f"API rejected the design ({exc.code})", "details": detail})
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            # API not running: keep the design so it can be loaded from the workspace later.
            INPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
            INPUT_FILE.write_bytes(raw)
            self.send_json(200, {
                "message": (
                    f"Saved the design locally (API at {API_URL} is not reachable: {exc}). "
                    "Start `python server.py`, then use 'Check for plugin design' in the workspace."
                ),
            })

    def log_message(self, format, *args):
        print("%s - %s" % (self.address_string(), format % args))


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Waiting for Figma plugin at http://{HOST}:{PORT} (relaying to {API_URL}/ingest)")
    print("Keep this terminal open while using the plugin.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping receiver.")
    finally:
        server.server_close()
