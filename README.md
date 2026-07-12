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
| `get_recent_activity` | Recent activity log |
| `get_active_alerts` / `get_dismissed_alerts` | Alert status |

Docker container management (list/start/stop/restart) is **not** exposed as
tools: on the live backend it runs over a stateful SSH-session +
Socket.IO channel, not plain REST request/response, so it doesn't fit this
server's simple per-tool model. It was removed after being verified against
the actual Termix backend source (see "Notes & caveats" below) — the earlier
version of this README advertised it, but it never actually worked against
a real instance.

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
web UI — for a default local Docker install this is typically
`http://localhost:30001`; adjust if you've changed ports or are running
behind a reverse proxy.

Termix's backend is actually split across several independent services on
different ports, confirmed by reading the Termix backend source directly
(the hosted API docs return 403 to automated fetches, and didn't fully
match what a live v2.5.0 instance actually does):

| Service | Default port | Used for |
|---|---|---|
| main API | 30001 (`TERMIX_BASE_URL`) | SSH hosts CRUD, alerts |
| metrics API | 30005 (`TERMIX_METRICS_URL`) | host online/offline status, live metrics |
| dashboard API | 30006 (`TERMIX_DASHBOARD_URL`) | recent activity log |
| tunnel API | 30003 (`TERMIX_TUNNEL_URL`) | SSH tunnel status/connect/disconnect |

You only need to set `TERMIX_BASE_URL` (+ `TERMIX_API_KEY`) — the other
three default to the same host as `TERMIX_BASE_URL` with the port swapped,
which matches a stock Termix deployment. Only set them explicitly if your
setup exposes these services on different hosts/ports (e.g. behind a
reverse proxy with custom routing).

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

- All endpoints currently wired up (`/host/db/host`, `/status`,
  `/metrics/:id`, `/ssh/tunnel/*`, `/activity/recent`, `/alerts`) were
  individually verified against a live Termix v2.5.0 instance — both by
  reading the actual backend route definitions in the
  [Termix source](https://github.com/Termix-SSH/Termix/tree/main/src/backend)
  and by making real authenticated requests. The hosted API docs
  (`docs.termix.site`) return 403 to automated fetches and, in an earlier
  version of this project, some assumed paths/ports turned out wrong when
  checked against the real backend — trust the source + your own live
  instance over the docs site if they disagree.
- `create_ssh_host` accepts a free-form JSON object for the host body
  because the schema varies a lot depending on auth type (password, key,
  credential reference, Tailscale, etc.) — inspect an existing host via
  `get_ssh_host`/`list_ssh_hosts` for a concrete example on your instance.
  `update_ssh_host`'s body shape wasn't independently verified beyond "same
  shape as create" — check a real host object first if a field doesn't
  seem to apply.
- Destructive tools (`delete_ssh_host`, `disconnect_ssh_tunnel`) are
  exposed as regular tools with no extra confirmation step built in — if
  you're wiring this into an agent that acts autonomously, consider gating
  those in your client/agent policy.
- No pagination/filtering helpers are included; responses are returned
  as-is from the Termix API.

## Extending

Add new endpoints in two steps:

1. Add a method to `termix` in `src/termix-client.js` that calls one of
   the per-service helpers (`main`, `metrics`, `dashboard`, `tunnel`) with
   `(method, path, { query, body })` — pick whichever service actually
   owns that route (see the port table above, or check
   `src/backend/database/database.ts`'s `app.use(...)` calls and each
   service file's own `PORT` constant in the
   [Termix source](https://github.com/Termix-SSH/Termix/tree/main/src/backend)
   if you're not sure).
2. Register a `server.tool(...)` in `src/index.js` that calls it.

Don't trust route names/paths from the hosted docs site without checking
the backend source or a live request first — that's what caused the wrong
paths this project shipped with initially.

## License

MIT — see [LICENSE](./LICENSE).
