/**
 * Minimal client for the Termix REST API.
 *
 * Termix (https://github.com/Termix-SSH/Termix) is a self-hosted SSH /
 * server-management tool. Its backend exposes a REST API (documented at
 * https://docs.termix.site/api/termix-api) secured with a Bearer token
 * (JWT or a user-scoped API key created under User Profile -> API Keys).
 *
 * Configure via environment variables:
 *   TERMIX_BASE_URL - e.g. http://localhost:30001 or https://termix.example.com
 *   TERMIX_API_KEY  - Bearer token / API key
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

const BASE_URL = (process.env.TERMIX_BASE_URL || "http://localhost:30001").replace(/\/+$/, "");
const API_KEY = process.env.TERMIX_API_KEY || "";

if (!API_KEY) {
  console.error(
    "[termix-mcp-server] Warning: TERMIX_API_KEY is not set. All requests to Termix will fail with 401."
  );
}

/**
 * Perform a request against the Termix API.
 *
 * @param {string} method - HTTP method
 * @param {string} path - path starting with "/", e.g. "/ssh/db/host"
 * @param {object} [options]
 * @param {object} [options.query] - query string params
 * @param {object} [options.body] - JSON body for POST/PUT/PATCH
 */
export async function termixRequest(method, path, { query, body } = {}) {
  const url = new URL(BASE_URL + path);
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

export const termix = {
  // --- SSH hosts ---
  getAllHosts: () => termixRequest("GET", "/ssh/db/host"),
  getHostById: (id) => termixRequest("GET", `/ssh/db/host/${id}`),
  createHost: (host) => termixRequest("POST", "/ssh/db/host", { body: host }),
  updateHost: (id, host) => termixRequest("PUT", `/ssh/db/host/${id}`, { body: host }),
  deleteHost: (id) => termixRequest("DELETE", `/ssh/db/host/${id}`),

  // --- Server / host status & metrics ---
  getAllHostStatuses: () => termixRequest("GET", "/status"),
  getHostStatusById: (id) => termixRequest("GET", `/status/${id}`),
  getHostMetrics: (id) => termixRequest("GET", `/metrics/${id}`),

  // --- SSH tunnels ---
  getAllTunnelStatuses: () => termixRequest("GET", "/ssh/tunnel/status"),
  getTunnelStatusByName: (name) =>
    termixRequest("GET", `/ssh/tunnel/status/${encodeURIComponent(name)}`),
  connectTunnel: ({ name, sourceHostId, tunnelIndex }) =>
    termixRequest("POST", "/ssh/tunnel/connect", { body: { name, sourceHostId, tunnelIndex } }),
  disconnectTunnel: (tunnelName) =>
    termixRequest("POST", "/ssh/tunnel/disconnect", { body: { tunnelName } }),

  // --- Docker (requires an established SSH session for Docker) ---
  // NOTE: the exact path/body for session establishment was not directly
  // confirmed against the live docs UI - verify against
  // https://docs.termix.site/api/establish-ssh-session-for-docker before relying on it.
  establishDockerSession: (hostId) =>
    termixRequest("POST", "/docker/session", { body: { hostId } }),
  listContainers: (sessionId, all = true) =>

    termixRequest("GET", `/docker/containers/${encodeURIComponent(sessionId)}`, {
      query: { all },
    }),
  startContainer: (sessionId, containerId) =>
    termixRequest("POST", `/docker/containers/${encodeURIComponent(sessionId)}/${containerId}/start`),
  stopContainer: (sessionId, containerId) =>
    termixRequest("POST", `/docker/containers/${encodeURIComponent(sessionId)}/${containerId}/stop`),
  restartContainer: (sessionId, containerId) =>
    termixRequest(
      "POST",
      `/docker/containers/${encodeURIComponent(sessionId)}/${containerId}/restart`
    ),

  // --- Dashboard / activity ---
  getRecentActivity: (limit) => termixRequest("GET", "/activity/recent", { query: { limit } }),

  // --- Alerts ---
  getActiveAlerts: () => termixRequest("GET", "/alerts/active"),
  getDismissedAlerts: () => termixRequest("GET", "/alerts/dismissed"),
};
