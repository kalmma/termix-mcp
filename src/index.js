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
    "Check https://docs.termix.site/api/create-ssh-host for the exact fields " +
    "supported by your Termix version before using this in production.",
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
// Docker
// ---------------------------------------------------------------------------

server.tool(
  "establish_docker_session",
  "Establish an SSH session for Docker management on a given host. Returns a " +
    "sessionId to use with the other docker_* tools. NOTE: verify this endpoint " +
    "against https://docs.termix.site/api/establish-ssh-session-for-docker " +
    "for your Termix version, as it may require TOTP verification for some hosts.",
  { hostId: z.number().int().describe("The SSH host ID to establish a Docker session on") },
  async ({ hostId }) => run(() => termix.establishDockerSession(hostId))
);

server.tool(
  "list_docker_containers",
  "List Docker containers on a host, using a sessionId from establish_docker_session.",
  {
    sessionId: z.string().describe("Docker SSH session ID"),
    all: z.boolean().optional().describe("Include stopped containers (default true)"),
  },
  async ({ sessionId, all }) => run(() => termix.listContainers(sessionId, all ?? true))
);

server.tool(
  "start_docker_container",
  "Start a Docker container.",
  {
    sessionId: z.string().describe("Docker SSH session ID"),
    containerId: z.string().describe("Container ID or name"),
  },
  async ({ sessionId, containerId }) => run(() => termix.startContainer(sessionId, containerId))
);

server.tool(
  "stop_docker_container",
  "Stop a Docker container.",
  {
    sessionId: z.string().describe("Docker SSH session ID"),
    containerId: z.string().describe("Container ID or name"),
  },
  async ({ sessionId, containerId }) => run(() => termix.stopContainer(sessionId, containerId))
);

server.tool(
  "restart_docker_container",
  "Restart a Docker container.",
  {
    sessionId: z.string().describe("Docker SSH session ID"),
    containerId: z.string().describe("Container ID or name"),
  },
  async ({ sessionId, containerId }) => run(() => termix.restartContainer(sessionId, containerId))
);

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
