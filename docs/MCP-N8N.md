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

Claude Code authenticates with **OAuth**, the method n8n recommends. There is no
token to copy or store: you approve access once in the browser, and Claude Code keeps
and refreshes the credentials itself, outside this repo.

1. **On the n8n instance**, an owner or admin enables MCP access under
   **Settings › Instance-level MCP › Enable MCP access**. Mark as available to MCP
   only the workflows you want Claude to reach; the rest stay invisible to it.
2. **In your shell**, export the endpoint before starting Claude Code. Copy it from
   **Connection details › Connect** on that settings page; it ends in
   `/mcp-server/http`:

   ```bash
   export N8N_MCP_URL="https://n8n.example.com/mcp-server/http"
   claude
   ```

3. Approve the project server when Claude Code asks. Then run `/mcp`, select `n8n`
   and choose **Authenticate**. A browser opens on n8n; approve access there.
4. Back in Claude Code, `/mcp` should list `n8n` as connected, with its tools.

To revoke access, use **Clear authentication** on the same `/mcp` entry, or remove
the connection from n8n.

### Why the shell, and not `.env.local`

Claude Code expands `${VAR}` in `.mcp.json` from its own process environment when it
starts. It does not read `.env` files — the GPT server loads those itself because it
is a process this repo runs, but an HTTP entry has no such process. A value written
only in `.env.local` never reaches it. Use `export`, a tool such as `direnv`, or your
shell profile.

### The default in `.mcp.json`

```json
"url": "${N8N_MCP_URL:-http://localhost:5678/mcp-server/http}"
```

The variable has a default on purpose. A `${VAR}` with no default and no value makes
Claude Code reject the configuration, which would also take the `openai` server down
with it. With the default, an unconfigured machine tries a local n8n on its standard
port (5678) and gets a connection error for `n8n` alone.

The entry has no `headers` block, and that matters: a fixed `Authorization` header
would be sent instead of the OAuth credentials, so adding one switches the entry back
to token authentication.

### OAuth in a remote or cloud session

The approval step redirects the browser back to Claude Code on the machine it runs
on. That works on your own computer. In a cloud session, or over SSH, the redirect
may not reach the session; authenticate from a local Claude Code instead, or use a
token as described under *Token fallback* below.

---

## Before you use it: what leaves the machine

Every tool call sends its arguments to the n8n instance, and the workflow it runs may
forward them further — to email, a spreadsheet, a third-party API. What happens next
is defined in n8n, not here, so check each exposed workflow before letting Claude
call it. A workflow with side effects (sending, deleting, paying) runs for real.

The OAuth grant acts as your n8n user, with whatever MCP access the instance gives
it. Claude Code stores the credentials in your user configuration, never in this
repo. Do not add a token to `.mcp.json`: that file is committed.

---

## Verifying and debugging

Check that the endpoint answers, without Claude Code in the way. Before
authenticating, a `401` is the expected reply: it is how the server asks for OAuth.
A `404` usually means MCP access is not enabled on the instance or the path is wrong:

```bash
curl -i -X POST "$N8N_MCP_URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

| Symptom | Cause |
|---|---|
| `n8n` missing from `/mcp` | Claude Code was not started from the repo root, or the project server was not approved |
| Fails to connect to `localhost:5678` | `N8N_MCP_URL` is not exported in the shell that started Claude Code |
| Listed as needing authentication | The OAuth step has not been done yet, or the grant was revoked. Run **Authenticate** from `/mcp` |
| "You do not have sufficient permissions to authorize this request" | MCP access is turned off on the instance; an owner or admin must enable it |
| Browser approval never returns to Claude Code | The session is remote; see *OAuth in a remote or cloud session* |
| 404 Not Found | Instance-level MCP access is disabled, or the URL lacks `/mcp-server/http` |
| Connects, but lists no tools | No workflow on the instance is marked as available to MCP |
| Fails only in a cloud session | The environment's network policy does not allow the n8n domain |

Changing `N8N_MCP_URL` requires restarting Claude Code: it is expanded once, at
startup.

### Using it from Codex or Every Code

Neither reads `.mcp.json`. Codex CLI uses `~/.codex/config.toml`; Every Code, the
Codex fork, uses `~/.code/config.toml`. Both can sign in with OAuth too. The block is
the same for both, with no token in it:

```toml
[features]
experimental_use_rmcp_client = true

[mcp_servers.n8n]
url = "https://n8n.example.com/mcp-server/http"
```

Then sign in once from the terminal. A browser opens on n8n; approve access there:

```bash
codex mcp login n8n   # Codex
code mcp login n8n    # Every Code (installed as `coder` if `code` is taken)
```

- The client keeps the credentials in the system keyring, or in its own config
  directory where no keyring is available, and refreshes them itself.
  `mcp logout n8n` removes them.
- The `experimental_use_rmcp_client` flag is what enables OAuth for HTTP servers.
  Newer releases may have renamed or retired it; if `mcp login` reports that OAuth
  is unsupported, check the flag your version expects.
- `mcp login` is documented for Codex. Every Code inherits Codex's MCP client, but
  its own docs do not mention the command; if your version lacks it, update the
  client or use the token fallback below.
- If the file already has a `[features]` table, add the `experimental_use_rmcp_client`
  line to it instead. A repeated table makes the whole file invalid TOML.
- Confirm with `/mcp` inside the client: `n8n` should be listed with its tools.

#### Token fallback

For a remote machine where the browser redirect cannot come back, or a client
without `mcp login`, use a personal access token instead. Generate it in n8n under
**Connection details › Connect › API key**, and copy it before leaving the tab:
n8n shows only a redacted value afterwards. Add one line to the block above:

```toml
bearer_token_env_var = "N8N_MCP_TOKEN"
```

It names the variable to read the token from, so the file never holds the value.
Export `N8N_MCP_TOKEN` in the shell that starts the client. Generating a new token
in n8n revokes the previous one at once; update the variable and restart the client.
