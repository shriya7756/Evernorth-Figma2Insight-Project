// Figma2Insight plugin — main thread.
// Serializes the selected frames (or the whole current page) into the same nested
// document structure as the Figma REST API and sends it to the Figma2Insight API.

const PRODUCTION_API = "https://evernorth-figma2insight-project.onrender.com";
const LOCAL_API = "http://localhost:8001";
const MAX_PAYLOAD_BYTES = 50 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 180000; // the hosted API can take ~1 minute to wake up

figma.showUI(__html__, { width: 340, height: 420, themeColors: true });

function serializeNode(node) {
  const result = { id: node.id, name: node.name, type: node.type };

  if ("visible" in node) result.visible = node.visible;
  if ("absoluteBoundingBox" in node) result.absoluteBoundingBox = node.absoluteBoundingBox;
  if ("relativeTransform" in node) result.relativeTransform = node.relativeTransform;
  // Mixed values (figma.mixed is a Symbol) are dropped by JSON.stringify.
  if ("fills" in node) result.fills = node.fills;
  if ("strokes" in node) result.strokes = node.strokes;
  if ("characters" in node) result.characters = node.characters;
  if ("fontSize" in node) result.fontSize = node.fontSize;
  if ("layoutMode" in node) result.layoutMode = node.layoutMode;

  try {
    if ("componentProperties" in node) result.componentProperties = node.componentProperties;
  } catch (error) {
    // Instances whose main component is missing throw here; the rest of the node is still useful.
  }

  if ("children" in node) result.children = node.children.map(serializeNode);
  return result;
}

function selectionSummary() {
  const selection = figma.currentPage.selection;
  return {
    pageName: figma.currentPage.name,
    count: selection.length,
    names: selection.slice(0, 3).map((n) => n.name),
  };
}

function buildPayload(scope) {
  const page = figma.currentPage;
  const selection = page.selection;
  const useSelection = scope === "selection" && selection.length > 0;
  const pageNode = {
    id: page.id,
    name: page.name,
    type: "PAGE",
    children: (useSelection ? selection : page.children).map(serializeNode),
  };
  return {
    document: { id: "local-document", name: figma.root.name, type: "DOCUMENT", children: [pageNode] },
    source: "figma-plugin",
    pageName: page.name,
    scope: useSelection ? "selection" : "page",
  };
}

async function fetchWithTimeout(url, options, timeoutMs) {
  // AbortController is not available in every plugin runtime, so race against a timer.
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("The request timed out. The server may be starting up — try again.")), timeoutMs)
    ),
  ]);
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    return { detail: text.slice(0, 200) || response.status + " " + response.statusText };
  }
}

function describeError(result, status) {
  if (status === 413) {
    const limit = result && typeof result.detail === "string" ? result.detail : "The design is larger than the server's upload limit.";
    return limit + " Select only the dashboard frame and try again.";
  }
  if (status === 429) return "Too many requests. Wait a minute and try again.";
  const detail = result && (result.detail || result.error);
  if (typeof detail === "string") return detail;
  return "The server returned an error (" + status + ").";
}

async function getSettings() {
  const saved = (await figma.clientStorage.getAsync("f2i-settings")) || {};
  return { target: saved.target === "local" ? "local" : "production" };
}

function apiBase(target) {
  return target === "local" ? LOCAL_API : PRODUCTION_API;
}

async function checkConnection(target) {
  const base = apiBase(target);
  figma.ui.postMessage({ type: "connection", state: "checking", base });
  try {
    const response = await fetchWithTimeout(base + "/api/health", { method: "GET" }, 90000);
    const result = await readJson(response);
    figma.ui.postMessage({
      type: "connection",
      state: response.ok && result.modelLoaded ? "online" : "degraded",
      base,
      detail: response.ok ? "" : describeError(result, response.status),
    });
  } catch (error) {
    figma.ui.postMessage({ type: "connection", state: "offline", base, detail: String(error.message || error) });
  }
}

async function sendDesign(scope, target) {
  const base = apiBase(target);
  try {
    figma.ui.postMessage({ type: "progress", step: "extract", text: "Extracting design…" });
    const payload = buildPayload(scope);
    const body = JSON.stringify(payload);
    if (body.length > MAX_PAYLOAD_BYTES) {
      throw new Error("This page is larger than the 50 MB limit. Select only the dashboard frame and try again.");
    }

    const sizeMb = (body.length / (1024 * 1024)).toFixed(1);
    figma.ui.postMessage({
      type: "progress",
      step: "send",
      text: "Sending " + (payload.scope === "selection" ? "selection" : "page") + " (" + sizeMb + " MB) and running the model…",
    });

    const response = await fetchWithTimeout(
      base + "/ingest",
      { method: "POST", headers: { "Content-Type": "application/json" }, body },
      REQUEST_TIMEOUT_MS
    );
    const result = await readJson(response);
    if (!response.ok) throw new Error(describeError(result, response.status));

    figma.ui.postMessage({ type: "done", result });
  } catch (error) {
    let message = String((error && error.message) || error);
    if (/Failed to fetch|NetworkError|network/i.test(message)) {
      message = "Could not reach " + base + ". Check your connection" +
        (target === "local" ? " and that `python server.py` is running." : ", then try again.");
    }
    figma.ui.postMessage({ type: "error", text: message });
  }
}

figma.on("selectionchange", () => figma.ui.postMessage({ type: "selection", selection: selectionSummary() }));
figma.on("currentpagechange", () => figma.ui.postMessage({ type: "selection", selection: selectionSummary() }));

figma.ui.onmessage = async (message) => {
  if (!message || typeof message !== "object") return;

  if (message.type === "init") {
    const settings = await getSettings();
    figma.ui.postMessage({ type: "init", settings, selection: selectionSummary() });
    await checkConnection(settings.target);
  } else if (message.type === "set-target") {
    const target = message.target === "local" ? "local" : "production";
    await figma.clientStorage.setAsync("f2i-settings", { target });
    await checkConnection(target);
  } else if (message.type === "check-connection") {
    await checkConnection((await getSettings()).target);
  } else if (message.type === "send-design") {
    await sendDesign(message.scope, (await getSettings()).target);
  } else if (message.type === "open-url" && typeof message.url === "string" && /^https?:\/\//.test(message.url)) {
    figma.openExternal(message.url);
  } else if (message.type === "notify" && typeof message.text === "string") {
    figma.notify(message.text.slice(0, 120));
  } else if (message.type === "close") {
    figma.closePlugin();
  }
};
