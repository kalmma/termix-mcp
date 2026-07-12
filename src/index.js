#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { termix } from "./termix-client.js";

const server = new McpServer({
  name: "termix-mcp-server",
  version: "0.1.0",
});

function textResult(data) {
  return {
    content: [
      {
        type: "text",
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(err) {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: err instanceof Error ? err.message : String(err),
      },
    ],
  };
}

async function run(fn) {
  try {
    const data = await fn();
    return textResult(data);
  } catch (err) {
    return errorResult(err);
  }
}

// ---------------------------------------------------------------------------
// SSH hosts
// ---------------------------------------------------------------------------

server.tool(
  "list_ssh_hosts",
  "List all saved SSH hosts for the authenticated Termix user.",
  {},
  async () => run(() => termix.getAllHosts())
);

server.tool(
  "get_ssh_host",
  "Get a single SSH host by its numeric ID.",
  { id: z.number().int().describe("The SSH host ID") },
  async ({ id }) => run(() => termix.getHostById(id))
);

server.tool(
  "create_ssh_host",
  "Create a new SSH host configuration in Termix. Pass the host object as JSON " +
    "matching the Termix host schema (name, ip, port, username, authType, etc). " +
    "Field shape varies by authType (password, key, credential reference, " +
    "Tailscale, ...) - inspect an existing host via get_ssh_host/list_ssh_hosts " +
    "for a concrete example on your instance before creating a new one.",
  { host: z.record(z.any()).describe("Host configuration object") },
  async ({ host }) => run(() => termix.createHost(host))
);

server.tool(
  "update_ssh_host",
  "Update an existing SSH host by ID. Pass only the fields to change.",
  {
    id: z.number().int().describe("The SSH host ID"),
    host: z.record(z.any()).describe("Partial or full host configuration object"),
  },
  async ({ id, host }) => run(() => termix.updateHost(id, host))
);

server.tool(
  "delete_ssh_host",
  "Delete an SSH host by ID. This is irreversible.",
  { id: z.number().int().describe("The SSH host ID") },
  async ({ id }) => run(() => termix.deleteHost(id))
);

// ---------------------------------------------------------------------------
// Status & metrics
// ---------------------------------------------------------------------------

server.tool(
  "get_all_host_statuses",
  "Get the online/offline status of all hosts for the authenticated user.",
  {},
  async () => run(() => termix.getAllHostStatuses())
);

server.tool(
  "get_host_status",
  "Get the online/offline status of a specific host by ID.",
  { id: z.number().int().describe("The SSH host ID") },
  async ({ id }) => run(() => termix.getHostStatusById(id))
);

server.tool(
  "get_host_metrics",
  "Get live metrics (CPU, memory, disk, network, processes, system info) for a host.",
  { id: z.number().int().describe("The SSH host ID") },
  async ({ id }) => run(() => termix.getHostMetrics(id))
);

// ---------------------------------------------------------------------------
// SSH tunnels
// ---------------------------------------------------------------------------

server.tool(
  "list_tunnel_statuses",
  "Get the status of all configured SSH tunnels.",
  {},
  async () => run(() => termix.getAllTunnelStatuses())
);

server.tool(
  "get_tunnel_status",
  "Get the status of a single SSH tunnel by name.",
  { name: z.string().describe("The tunnel name") },
  async ({ name }) => run(() => termix.getTunnelStatusByName(name))
);

server.tool(
  "connect_ssh_tunnel",
  "Establish a configured SSH tunnel connection.",
  {
    name: z.string().describe("Tunnel name"),
    sourceHostId: z.number().int().describe("ID of the source host the tunnel is defined on"),
    tunnelIndex: z.number().int().describe("Index of the tunnel definition on that host"),
  },
  async ({ name, sourceHostId, tunnelIndex }) =>
    run(() => termix.connectTunnel({ name, sourceHostId, tunnelIndex }))
);

server.tool(
  "disconnect_ssh_tunnel",
  "Disconnect an active SSH tunnel by name.",
  { tunnelName: z.string().describe("The tunnel name") },
  async ({ tunnelName }) => run(() => termix.disconnectTunnel(tunnelName))
);

// ---------------------------------------------------------------------------
// Docker: not exposed as tools. Confirmed against the live Termix backend
// source that container management (list/start/stop/restart) runs over a
// stateful SSH-session + Socket.IO channel, not plain REST request/response
// - it doesn't fit this server's simple per-tool model, so no docker_* tools
// are registered rather than shipping ones that would just 404.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Dashboard / alerts
// ---------------------------------------------------------------------------

server.tool(
  "get_recent_activity",
  "Get the most recent activity log entries for the authenticated user.",
  { limit: z.number().int().optional().describe("Max number of entries to return") },
  async ({ limit }) => run(() => termix.getRecentActivity(limit))
);

server.tool(
  "get_active_alerts",
  "Get currently active (non-dismissed) alerts.",
  {},
  async () => run(() => termix.getActiveAlerts())
);

server.tool(
  "get_dismissed_alerts",
  "Get previously dismissed alerts.",
  {},
  async () => run(() => termix.getDismissedAlerts())
);

// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[termix-mcp-server] Connected via stdio.");
