#!/bin/bash
#
# SessionStart hook — prepares a Claude Code on the web container to run this repo.
#
# A remote session starts from a fresh clone with no `node_modules`, so every
# command that matters (vitest, next lint, tsc) fails, and the `openai` MCP
# server in tools/mcp/openai/ dies at startup because `tsx` cannot resolve
# @modelcontextprotocol/sdk — the session then reports it as "failed to connect"
# with no hint as to why. Installing dependencies here fixes all of them at once.
#
# Everything is logged to stderr: stdout belongs to the hook's JSON protocol.

set -euo pipefail

# Local sessions already have a working checkout; don't touch them.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

log() { echo "[session-start] $*" >&2; }

# `npm install` over `npm ci`: it reuses whatever the cached container image
# already has instead of deleting node_modules and starting from scratch.
log "Installing npm dependencies…"
npm install --no-audit --no-fund >&2

# The Prisma client is generated code, not a published package — without this
# every `@prisma/client` import fails to typecheck and `next build` stops.
# `generate` reads only the schema, so no database connection is needed.
log "Generating Prisma client…"
npx prisma generate >&2

log "Ready: dependencies installed and Prisma client generated."
