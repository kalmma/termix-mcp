/**
 * Minimal client for the Termix REST API.
 *
 * Termix (https://github.com/Termix-SSH/Termix) is a self-hosted SSH /
 * server-management tool. It is NOT a single service: the backend is split
 * into several independent Express processes on different ports (confirmed
 * by reading the Termix backend source, since the hosted API docs return
 * 403 to automated fetches and didn't fully match a live v2.5.0 instance):
 *
 *   - main API      (SSH hosts CRUD, users, credentials, alerts, ...) - default port 30001
 *   - metrics API   (host online/offline status, live metrics)       - default port 30005
 *   - dashboard API (recent activity log)                            - default port 30006
 *   - tunnel API    (SSH tunnel status/connect/disconnect)           - default port 30003
 *
 * All of them accept the same Bearer token (JWT or a user-scoped API key
 * created under User Profile -> API Keys).
 *
 * Configure via environment variables (only TERMIX_BASE_URL + TERMIX_API_KEY
 * are required - the others default to the same host as TERMIX_BASE_URL with
 * the port swapped, which matches a stock Termix deployment):
 *   TERMIX_BASE_URL      - main API, e.g. http://localhost:30001
 *   TERMIX_METRICS_URL   - metrics/status API, default: same host, port 30005
 *   TERMIX_DASHBOARD_URL - dashboard/activity API, default: same host, port 30006
 *   TERMIX_TUNNEL_URL    - tunnel API, default: same host, port 30003
 *   TERMIX_API_KEY       - Bearer token / API key, sent to all of the above
 *
 * Docker container management (list/start/stop/restart) is intentionally
 * NOT exposed here: in the live backend it's done over a stateful
 * SSH-session + Socket.IO channel, not plain request/response REST calls,
 * so it doesn't fit this MCP server's simple request-per-tool model.
 */

// Minimal .env loader (no external dependency). Populates process.env from
// a .env file in the project root, without overriding variables that are
// already set in the real environment (e.g. by an MCP client config).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function loadDotEnv() {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const envPath = path.join(dir, "..", ".env");
  let contents;
  try {
    contents = readFileSync(envPath, "utf8");
  } catch {
    return; // no .env file - that's fine, rely on real env vars
  }
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, "");
}

function urlWithPort(baseUrl, port) {
  const u = new URL(baseUrl);
  u.port = String(port);
  return normalizeBaseUrl(u.toString());
}

const MAIN_BASE_URL = normalizeBaseUrl(process.env.TERMIX_BASE_URL || "http://localhost:30001");
const METRICS_BASE_URL = normalizeBaseUrl(
  process.env.TERMIX_METRICS_URL || urlWithPort(MAIN_BASE_URL, 30005)
);
const DASHBOARD_BASE_URL = normalizeBaseUrl(
  process.env.TERMIX_DASHBOARD_URL || urlWithPort(MAIN_BASE_URL, 30006)
);
const TUNNEL_BASE_URL = normalizeBaseUrl(
  process.env.TERMIX_TUNNEL_URL || urlWithPort(MAIN_BASE_URL, 30003)
);

const API_KEY = process.env.TERMIX_API_KEY || "";

if (!API_KEY) {
  console.error(
    "[termix-mcp-server] Warning: TERMIX_API_KEY is not set. All requests to Termix will fail with 401."
  );
}

/**
 * Perform a request against a Termix API service.
 *
 * @param {string} baseUrl - one of the *_BASE_URL constants above
 * @param {string} method - HTTP method
 * @param {string} path - path starting with "/", e.g. "/host/db/host"
 * @param {object} [options]
 * @param {object} [options.query] - query string params
 * @param {object} [options.body] - JSON body for POST/PUT/PATCH
 */
async function request(baseUrl, method, path, { query, body } = {}) {
  const url = new URL(baseUrl + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers = {
    Authorization: `Bearer ${API_KEY}`,
  };
  let fetchBody;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    fetchBody = JSON.stringify(body);
  }

  const response = await fetch(url, { method, headers, body: fetchBody });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "message" in data
        ? data.message
        : typeof data === "string" && data
        ? data
        : response.statusText;
    const err = new Error(`Termix API ${method} ${path} failed: ${response.status} ${message}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

// Backwards-compatible export used by earlier versions of this file.
export async function termixRequest(method, path, options = {}) {
  return request(MAIN_BASE_URL, method, path, options);
}

const main = (method, path, options) => request(MAIN_BASE_URL, method, path, options);
const metrics = (method, path, options) => request(METRICS_BASE_URL, method, path, options);
const dashboard = (method, path, options) => request(DASHBOARD_BASE_URL, method, path, options);
const tunnel = (method, path, options) => request(TUNNEL_BASE_URL, method, path, options);

export const termix = {
  // --- SSH hosts (main API, mounted at /host) ---
  getAllHosts: () => main("GET", "/host/db/host"),
  getHostById: (id) => main("GET", `/host/db/host/${id}`),
  createHost: (host) => main("POST", "/host/db/host", { body: host }),
  updateHost: (id, host) => main("PUT", `/host/db/host/${id}`, { body: host }),
  deleteHost: (id) => main("DELETE", `/host/db/host/${id}`),

  // --- Server / host status & metrics (separate metrics service) ---
  getAllHostStatuses: () => metrics("GET", "/status"),
  getHostStatusById: (id) => metrics("GET", `/status/${id}`),
  getHostMetrics: (id) => metrics("GET", `/metrics/${id}`),

  // --- SSH tunnels (separate tunnel service) ---
  getAllTunnelStatuses: () => tunnel("GET", "/ssh/tunnel/status"),
  getTunnelStatusByName: (name) =>
    tunnel("GET", `/ssh/tunnel/status/${encodeURIComponent(name)}`),
  connectTunnel: ({ name, sourceHostId, tunnelIndex }) =>
    tunnel("POST", "/ssh/tunnel/connect", { body: { name, sourceHostId, tunnelIndex } }),
  disconnectTunnel: (tunnelName) =>
    tunnel("POST", "/ssh/tunnel/disconnect", { body: { tunnelName } }),

  // --- Dashboard / activity (separate dashboard service) ---
  getRecentActivity: (limit) => dashboard("GET", "/activity/recent", { query: { limit } }),

  // --- Alerts (main API, mounted at /alerts) ---
  getActiveAlerts: () => main("GET", "/alerts"),
  getDismissedAlerts: () => main("GET", "/alerts/dismissed"),
};
