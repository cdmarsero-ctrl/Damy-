# Connecting Claude Code to n8n

`.mcp.json` registers an `n8n` entry that points Claude Code at the MCP endpoint an
n8n instance exposes. Unlike the [GPT server](MCP-OPENAI.md), nothing runs from this
repo: the server is n8n itself, reached over HTTP. This file only holds the wiring.

---

## What this is, and what it is not

**It is** a way for Claude to see and trigger the workflows an n8n instance chooses
to expose, during a development session — for example, running an automation that
seeds a test environment or posts a build summary somewhere.

**It is not** part of the app. Lexicon never calls n8n at runtime, and removing the
entry from `.mcp.json` changes nothing for learners.

---

## Setup

1. **On the n8n instance**, enable instance-level MCP access in its settings, then
   generate an access token there. Mark as available to MCP only the workflows you
   want Claude to reach; the rest stay invisible to it.
2. **In your shell**, export the endpoint and the token before starting Claude Code:

   ```bash
   export N8N_MCP_URL="https://n8n.example.com/mcp-server/http"
   export N8N_MCP_TOKEN="..."
   claude
   ```

3. Approve the project server when Claude Code asks, then confirm with `/mcp` that
   `n8n` is listed as connected.

### Why the shell, and not `.env.local`

Claude Code expands `${VAR}` in `.mcp.json` from its own process environment when it
starts. It does not read `.env` files — the GPT server loads those itself because it
is a process this repo runs, but an HTTP entry has no such process. A value written
only in `.env.local` never reaches it. Use `export`, a tool such as `direnv`, or your
shell profile.

### The defaults in `.mcp.json`

```json
"url": "${N8N_MCP_URL:-http://localhost:5678/mcp-server/http}",
"headers": { "Authorization": "Bearer ${N8N_MCP_TOKEN:-}" }
```

Both variables have defaults on purpose. A `${VAR}` with no default and no value
makes Claude Code reject the configuration, which would also take the `openai`
server down with it. With the defaults, an unconfigured machine tries a local n8n on
its standard port (5678) and gets a connection error for `n8n` alone.

---

## Before you use it: what leaves the machine

Every tool call sends its arguments to the n8n instance, and the workflow it runs may
forward them further — to email, a spreadsheet, a third-party API. What happens next
is defined in n8n, not here, so check each exposed workflow before letting Claude
call it. A workflow with side effects (sending, deleting, paying) runs for real.

The token grants whatever MCP access the instance gives it. It lives only in your
environment: `.mcp.json` references it by name and must never contain the value,
because that file is committed.

---

## Verifying and debugging

Check the endpoint and token without Claude Code in the way. A `401` means the token;
a `404` usually means MCP access is not enabled on the instance or the path is wrong:

```bash
curl -i -X POST "$N8N_MCP_URL" \
  -H "Authorization: Bearer $N8N_MCP_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

| Symptom | Cause |
|---|---|
| `n8n` missing from `/mcp` | Claude Code was not started from the repo root, or the project server was not approved |
| Fails to connect to `localhost:5678` | `N8N_MCP_URL` is not exported in the shell that started Claude Code |
| 401 Unauthorized | `N8N_MCP_TOKEN` is unset, wrong, or was regenerated in n8n |
| 404 Not Found | Instance-level MCP access is disabled, or the URL lacks `/mcp-server/http` |
| Connects, but lists no tools | No workflow on the instance is marked as available to MCP |
| Fails only in a cloud session | The environment's network policy does not allow the n8n domain |

Changing either variable requires restarting Claude Code: they are expanded once, at
startup.

### Using it from Codex or Every Code

Neither reads `.mcp.json`. Codex CLI uses `~/.codex/config.toml`; Every Code, the
Codex fork, uses `~/.code/config.toml`. The block is the same for both:

```toml
[features]
experimental_use_rmcp_client = true

[mcp_servers.n8n]
url = "https://n8n.example.com/mcp-server/http"
bearer_token_env_var = "N8N_MCP_TOKEN"
```

- `bearer_token_env_var` names the variable to read the token from, so the file never
  holds the value. Export `N8N_MCP_TOKEN` in the shell that starts the client, as
  above. Older releases do not recognise the key; update the client if the server
  connects without authenticating.
- If the file already has a `[features]` table, add the `experimental_use_rmcp_client`
  line to it instead. A repeated table makes the whole file invalid TOML.
- Confirm with `/mcp` inside the client: `n8n` should be listed with its tools.
