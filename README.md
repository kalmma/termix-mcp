# Termix MCP Server

An [MCP](https://modelcontextprotocol.io) server that lets Claude (or any
other MCP client) talk to a self-hosted [Termix](https://github.com/Termix-SSH/Termix)
instance — the open-source SSH client / server-management tool — via its
REST API.

This is a community/unofficial project, not affiliated with the Termix team.

## What it can do

| Tool | Description |
|---|---|
| `list_ssh_hosts` | List all saved SSH hosts |
| `get_ssh_host` | Get a host by ID |
| `create_ssh_host` | Create a new host |
| `update_ssh_host` | Update a host |
| `delete_ssh_host` | Delete a host |
| `get_all_host_statuses` | Online/offline status of all hosts |
| `get_host_status` | Status of one host |
| `get_host_metrics` | CPU/memory/disk/network metrics for a host |
| `list_tunnel_statuses` | Status of all SSH tunnels |
| `get_tunnel_status` | Status of one tunnel |
| `connect_ssh_tunnel` | Start a configured tunnel |
| `disconnect_ssh_tunnel` | Stop a tunnel |
| `establish_docker_session` | Open a Docker-over-SSH session on a host |
| `list_docker_containers` | List containers on that session |
| `start_docker_container` / `stop_docker_container` / `restart_docker_container` | Control a container |
| `get_recent_activity` | Recent activity log |
| `get_active_alerts` / `get_dismissed_alerts` | Alert status |

## Requirements

- Node.js 18+
- A running, self-hosted Termix instance (see the
  [Termix install docs](https://docs.termix.site/install/))
- A Termix API key (see below)

## Creating a Termix API key

Verified live against Termix v2.5.0.

1. Log into your Termix web UI.
2. Click your username in the bottom-left corner of the sidebar, then
   choose **User Profile**.
3. Open the **API Keys** tab (in the left panel of the User Profile page).
4. Click **New Key**.
5. Give it a name (e.g. `mcp-server`) and, optionally, an expiry date
   (`dd-mm-jjjj` field — leave blank for a key that doesn't expire).
6. Click **Create Key**.

**Known quirk:** in the version tested here (v2.5.0), Termix does **not**
display or let you copy the full key value anywhere in the UI after
creation — only a short prefix (`tmx_xxxxxxxx…`) is shown, for
identification only. There's no visible one-time reveal dialog or copy
button for the full secret. If your version behaves the same way, check
the [Termix GitHub repo](https://github.com/Termix-SSH/Termix) (issues/
releases) for the current recommended way to obtain a usable key value —
this may be a UI gap that gets fixed, or there may be an alternative flow
(e.g. via the setup wizard, or a config/CLI option) depending on your
version. A JWT bearer token (obtained by logging in) is a working fallback
if API keys aren't usable in your version — see the Termix API docs'
Authentication section for details.

Each key inherits the permissions of the user that created it, and is sent
as `Authorization: Bearer <key>` on every request — which is exactly what
this MCP server does (see `TERMIX_API_KEY` below).

## Setup

```bash
git clone <your-fork-url> termix-mcp
cd termix-mcp
npm install
npm run setup
```

`npm run setup` runs an interactive prompt that asks for your Termix URL
and API key, and writes them to a local `.env` file for you (git-ignored,
so it's never committed). It's the easiest way to get started.

If you'd rather not use the interactive prompt, do it manually instead:

```bash
cp .env.example .env
# edit .env and fill in TERMIX_BASE_URL and TERMIX_API_KEY
```

`TERMIX_BASE_URL` is the base URL of the Termix **backend API**, not the
web UI — check the docs for your deployment (for a default local Docker
install this is typically `http://localhost:30001`; adjust if you've
changed ports or are running behind a reverse proxy).

### Run it directly

```bash
npm start
```

The server communicates over stdio, so it's meant to be launched by an MCP
client (Claude Desktop, Claude Code, etc.), not run standalone in a terminal
for interactive use.

### Configure in Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "termix": {
      "command": "node",
      "args": ["/absolute/path/to/termix-mcp/src/index.js"],
      "env": {
        "TERMIX_BASE_URL": "http://localhost:30001",
        "TERMIX_API_KEY": "your_termix_api_key_here"
      }
    }
  }
}
```

Restart Claude Desktop afterwards. If you already ran `npm run setup`
(which created a `.env` file), you can omit the `"env"` block entirely —
the server loads `.env` automatically.

### Configure in Claude Code

```bash
claude mcp add termix -- node /absolute/path/to/termix-mcp/src/index.js
```

Then set `TERMIX_BASE_URL` / `TERMIX_API_KEY` in your shell environment or
in the MCP server config, per the Claude Code docs.

## Notes & caveats

- This was built from the public Termix API reference at
  <https://docs.termix.site/api/termix-api>. Most endpoints used here
  (SSH hosts, statuses, metrics, tunnels, activity) were verified directly
  against that reference. A few (Docker session establishment, alerts,
  and the exact `create_ssh_host`/`update_ssh_host` body schema) are
  inferred from naming conventions and REST patterns and were **not**
  individually confirmed — check the live docs for your Termix version
  before relying on them in production, and adjust `src/termix-client.js`
  if a path or body shape has changed.
- `create_ssh_host` accepts a free-form JSON object for the host body
  because the schema varies a lot depending on auth type (password, key,
  credential reference, Tailscale, etc.) — see the Termix docs / JSON
  import format page for the full field list.
- Destructive tools (`delete_ssh_host`, `disconnect_ssh_tunnel`, container
  stop/restart) are exposed as regular tools with no extra confirmation
  step built in — if you're wiring this into an agent that acts
  autonomously, consider gating those in your client/agent policy.
- No pagination/filtering helpers are included; responses are returned
  as-is from the Termix API.

## Extending

Add new endpoints in two steps:

1. Add a method to `termix` in `src/termix-client.js` that calls
   `termixRequest(method, path, { query, body })`.
2. Register a `server.tool(...)` in `src/index.js` that calls it.

The full Termix API surface (100+ operations covering credentials, RBAC,
snippets, file manager, users/OIDC, etc.) is documented at
<https://docs.termix.site/api/termix-api> if you want to add more tools.

## License

MIT — see [LICENSE](./LICENSE).
