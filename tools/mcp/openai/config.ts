/**
 * Configuration for the OpenAI MCP server.
 *
 * This process is started by Claude Code over stdio, not by Next.js, so nothing
 * has loaded `.env` for us: `src/lib/env.ts` runs inside the Next runtime and is
 * unavailable here. We therefore do the minimum ourselves — read the repo's own
 * `.env.local` and `.env`, and let anything already exported win.
 *
 * Deliberately not a dotenv dependency: the server needs four variables, and a
 * twenty-line parser is cheaper to audit than another package in the tree.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

/** Repo root, resolved from this file's location: tools/mcp/openai -> ../../.. */
export const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");

/**
 * Parses `KEY=value` lines.
 *
 * Supports `export` prefixes, `#` comments, and single- or double-quoted values.
 * Escape sequences (`\n`, `\"`) are expanded only inside double quotes, matching
 * the convention `.env.example` is written against.
 */
export function parseEnvFile(contents: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const withoutExport = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separator = withoutExport.indexOf("=");
    if (separator <= 0) continue;

    const key = withoutExport.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = withoutExport.slice(separator + 1).trim();

    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"');
    } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      value = value.slice(1, -1);
    } else {
      // Unquoted: an unescaped `#` starts a trailing comment.
      const comment = value.indexOf(" #");
      if (comment !== -1) value = value.slice(0, comment).trim();
    }

    result[key] = value;
  }

  return result;
}

/**
 * Merges env files under the real environment. Earlier files win over later ones,
 * and `process.env` wins over all of them — so `OPENAI_API_KEY=... claude` and a
 * CI secret both override whatever is on disk.
 */
export function mergeEnv(
  processEnv: Record<string, string | undefined>,
  files: Array<Record<string, string>>,
): Record<string, string | undefined> {
  const merged: Record<string, string | undefined> = {};

  for (const file of [...files].reverse()) {
    Object.assign(merged, file);
  }
  for (const [key, value] of Object.entries(processEnv)) {
    if (value !== undefined && value !== "") merged[key] = value;
  }

  return merged;
}

function readIfPresent(file: string): Record<string, string> {
  try {
    return parseEnvFile(readFileSync(file, "utf8"));
  } catch {
    // A missing or unreadable .env is the normal case, not an error.
    return {};
  }
}

export interface ServerConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs: number;
  maxTokens: number;
}

/** The message tools return when no key is configured — actionable, not just "failed". */
export const MISSING_KEY_MESSAGE =
  "No OpenAI API key found. Set OPENAI_API_KEY in the repo's .env.local (or export it " +
  "before launching Claude Code), then restart the session so the MCP server picks it up.";

export class ConfigError extends Error {}

/**
 * Builds the config from an already-merged environment.
 *
 * `OPENAI_MCP_MODEL` exists so that the model Claude consults here can differ from
 * `OPENAI_MODEL`, which serves learner traffic in the app: you may want a stronger,
 * slower model for a second opinion on code than for grading an essay.
 */
export function resolveConfig(env: Record<string, string | undefined>): ServerConfig {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new ConfigError(MISSING_KEY_MESSAGE);

  return {
    apiKey,
    model: env.OPENAI_MCP_MODEL?.trim() || env.OPENAI_MODEL?.trim() || "gpt-4o",
    baseUrl: env.OPENAI_BASE_URL?.trim() || undefined,
    timeoutMs: positiveInt(env.OPENAI_MCP_TIMEOUT_MS, 90_000),
    maxTokens: positiveInt(env.OPENAI_MCP_MAX_TOKENS, 4_000),
  };
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/** Reads `.env.local` then `.env` from the repo root and resolves the config. */
export function loadConfig(): ServerConfig {
  const files = [
    readIfPresent(path.join(REPO_ROOT, ".env.local")),
    readIfPresent(path.join(REPO_ROOT, ".env")),
  ];
  return resolveConfig(mergeEnv(process.env, files));
}
