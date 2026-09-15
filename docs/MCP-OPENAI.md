# Consulting GPT from Claude Code

This repo ships an MCP server that lets Claude Code put questions to OpenAI's GPT
models mid-session. Source: `tools/mcp/openai/`. Wiring: `.mcp.json`.

---

## What this is, and what it is not

**It is** a tool Claude can call. Claude stays the model driving the session; GPT
becomes something it can consult — a second opinion on a design decision, an
independent review of a diff, a sanity check on an unfamiliar error.

**It is not** a way to run Claude Code on GPT. Claude Code only accepts Anthropic
models, whether through the Anthropic API, Amazon Bedrock or Google Vertex AI. No
configuration swaps the driving model for a GPT one, and this server does not try to.

It is also **separate from the app's own AI layer**. Lexicon calls OpenAI at runtime
to serve learners (see [AI.md](AI.md)); that path goes through
`src/lib/ai/provider.ts` and is untouched by anything here. This server exists only
for development sessions. The two share `OPENAI_API_KEY` and nothing else.

---

## Setup

```bash
npm install                      # tsx and the MCP SDK are devDependencies
echo 'OPENAI_API_KEY="sk-..."' >> .env.local
```

Then start Claude Code from the repo root. Because `.mcp.json` is project-scoped,
Claude Code asks you to approve the server the first time — answer yes. Confirm it
came up with `/mcp`; the server should be listed as connected with three tools.

The server reads `.env.local` and then `.env` from the repo root by itself, since a
stdio subprocess never passes through the Next.js runtime that normally loads them.
Anything already exported wins over both files, so `OPENAI_API_KEY=sk-... claude`
works for a one-off session.

### Without a key

The server still starts and each tool returns a message saying what to set. This is
deliberate: a server that exits at startup shows up only as "failed to connect",
which tells you nothing. Note that adding the key requires **restarting the Claude
Code session** — the server process reads the environment once, at startup.

---

## The tools

| Tool | Use it for |
|---|---|
| `ask_gpt` | A free-form question. Arguments: `prompt`, plus optional `system`, `model`, `temperature`, `max_tokens` |
| `gpt_code_review` | An independent review of a file, diff or snippet. Arguments: `code`, plus optional `focus`, `language`, `context`, `model` |
| `list_gpt_models` | The model IDs this key can reach, so a `model` override is not a guess. Optional `contains` filter |

In practice you ask for them in plain language — *"ask GPT whether the SRS interval
logic in src/lib/srs.ts has an off-by-one"* — and Claude picks the tool and fills in
the arguments.

Two things to know about how they behave:

- **The model sees nothing automatically.** It has no access to this repo, your
  session, or the conversation. Whatever it needs must be in the arguments, which is
  why Claude will usually read the relevant files before calling.
- **A failure is reported, not hidden.** The app's provider degrades silently to its
  rules engine because a learner must never see an error; here the opposite is
  right. A rate limit or an unknown model comes back as a tool error, because a quiet
  empty answer is one Claude might mistake for GPT's actual opinion.

---

## Configuration

Every variable is optional except the key. Set them in `.env.local`.

| Variable | Default | Effect |
|---|---|---|
| `OPENAI_API_KEY` | — | Required. Shared with the app's AI layer |
| `OPENAI_MCP_MODEL` | falls back to `OPENAI_MODEL`, then `gpt-4o` | The model consulted here |
| `OPENAI_MODEL` | `gpt-4o` | The app's model; used only as a fallback for the above |
| `OPENAI_BASE_URL` | unset | Any OpenAI-compatible endpoint — a gateway, a proxy, a local model |
| `OPENAI_MCP_TIMEOUT_MS` | `90000` | Per-request timeout. Higher than the app's 25s: a review of a long diff is not a learner waiting on a page |
| `OPENAI_MCP_MAX_TOKENS` | `4000` | Output cap |

`OPENAI_MCP_MODEL` exists so the two paths can diverge. You may want a slower,
stronger model for a second opinion on concurrency than for grading an essay.

Reasoning models (the o-series, the gpt-5 family) reject `temperature` and rename
`max_tokens` to `max_completion_tokens`. The server detects the family from the model
name and adapts the request, so `model: "gpt-5"` works without further configuration.

---

## Before you use it: what leaves the machine

Every argument is sent to OpenAI, or to whatever `OPENAI_BASE_URL` points at. Code
passed to `gpt_code_review` leaves this repository. Treat it as you would pasting
into a web chat window, and do not send secrets, customer data, or anything under an
agreement that forbids third-party processing. If that rules the server out for your
work, delete `.mcp.json` — the app's own AI layer keeps working either way.

The API key is read from a gitignored `.env.local` and never written to any file the
server produces. `.mcp.json` deliberately contains no `env` block, so the key is not
committed with the wiring.

---

## Verifying and debugging

Run the server by hand. It will sit waiting for JSON-RPC on stdin, which is the
correct behaviour — you are looking for the readiness line on stderr:

```bash
npx tsx tools/mcp/openai/server.ts
# [mcp:openai] ready
```

Point it at something local to exercise the call path without spending tokens:

```bash
OPENAI_API_KEY=test OPENAI_BASE_URL=http://127.0.0.1:8799/v1 npx tsx tools/mcp/openai/server.ts
```

The pure parts — env parsing, request shaping, prompt assembly — are covered by
`npm run test` (`tools/mcp/openai/*.test.ts`).

| Symptom | Cause |
|---|---|
| Server missing from `/mcp` | Claude Code was not started from the repo root, or the project server was not approved |
| "No OpenAI API key found" after adding the key | The session predates the key; restart Claude Code |
| 401 from OpenAI | Key is wrong, revoked, or belongs to a different organisation than `OPENAI_BASE_URL` |
| 404 on a model that exists | The key has no access to it. Check with `list_gpt_models` |
| Server connects, then dies | `npm install` has not been run, so `tsx` is missing |

### One rule when editing the server

`stdout` carries the JSON-RPC stream. A single stray `console.log` corrupts the
protocol and the server drops off `/mcp` with no useful error. All diagnostics go to
`console.error`, which Claude Code shows in the MCP server logs.
