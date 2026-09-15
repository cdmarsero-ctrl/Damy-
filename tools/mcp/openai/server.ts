/**
 * An MCP server that lets Claude Code consult OpenAI's GPT models from inside a
 * session in this repo.
 *
 * It does not change which model drives Claude Code — that is always Claude. It
 * adds three tools Claude can call when a second opinion is worth having: a free-form
 * question, a code review, and a model listing.
 *
 * Wiring lives in `.mcp.json` at the repo root; setup and usage are in
 * docs/MCP-OPENAI.md.
 *
 * One hard rule for anything added here: stdout carries the JSON-RPC stream, so
 * nothing may ever be written to it. Diagnostics go to stderr, which Claude Code
 * surfaces in the MCP server logs.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type OpenAI from "openai";
import { z } from "zod";

import { ConfigError, loadConfig, type ServerConfig } from "./config";
import {
  DEFAULT_SYSTEM_PROMPT,
  REVIEW_SYSTEM_PROMPT,
  ask,
  buildReviewPrompt,
  createClient,
  describeError,
} from "./gpt";

const SERVER_NAME = "openai";
const SERVER_VERSION = "1.0.0";

/** Most model lists run to hundreds of entries; a full dump is context Claude cannot use. */
const MODEL_LIST_LIMIT = 60;

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function text(value: string): ToolResult {
  return { content: [{ type: "text", text: value }] };
}

function failure(value: string): ToolResult {
  return { content: [{ type: "text", text: value }], isError: true };
}

/**
 * Resolved lazily and cached.
 *
 * The server starts even with no API key so that Claude Code shows it as connected
 * and each tool call can explain what is missing. A server that exits at startup
 * only ever reports "failed to connect", which tells the user nothing actionable.
 */
function makeClientFactory(): () => { client: OpenAI; config: ServerConfig } {
  let cached: { client: OpenAI; config: ServerConfig } | null = null;

  return () => {
    if (cached) return cached;
    const config = loadConfig();
    cached = { client: createClient(config), config };
    return cached;
  };
}

const getClient = makeClientFactory();

/** Every tool body runs through this, so a throw becomes a readable tool error. */
async function guarded(run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ConfigError) return failure(error.message);
    return failure(describeError(error));
  }
}

const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

server.registerTool(
  "ask_gpt",
  {
    title: "Ask GPT",
    description:
      "Put a question to an OpenAI GPT model and return its answer verbatim. Use it " +
      "for a second opinion on a design decision, an unfamiliar error, or a tradeoff " +
      "worth checking against another model. Include the relevant code or context in " +
      "the prompt — the model sees nothing of this repo or conversation.",
    inputSchema: {
      prompt: z.string().min(1).describe("The question, with all context the model needs."),
      system: z
        .string()
        .optional()
        .describe("Overrides the default system prompt. Omit unless you need a specific persona."),
      model: z
        .string()
        .optional()
        .describe("Model override, e.g. 'gpt-4o' or 'gpt-5'. Defaults to OPENAI_MCP_MODEL."),
      temperature: z
        .number()
        .min(0)
        .max(2)
        .optional()
        .describe("0 for analysis, higher for brainstorming. Ignored by reasoning models."),
      max_tokens: z.number().int().positive().optional().describe("Output token cap."),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  async ({ prompt, system, model, temperature, max_tokens }) =>
    guarded(async () => {
      const { client, config } = getClient();
      const answer = await ask(client, {
        system: system ?? DEFAULT_SYSTEM_PROMPT,
        user: prompt,
        model: model ?? config.model,
        temperature: temperature ?? 0.3,
        maxTokens: max_tokens ?? config.maxTokens,
        timeoutMs: config.timeoutMs,
      });
      return text(answer);
    }),
);

server.registerTool(
  "gpt_code_review",
  {
    title: "Review code with GPT",
    description:
      "Send a file, diff or snippet to a GPT model for an independent review and " +
      "return its findings. Useful as a cross-check before opening a PR, or when a " +
      "bug has survived your own reading of the code. Paste the code itself — the " +
      "model cannot read the repo.",
    inputSchema: {
      code: z.string().min(1).describe("The code or unified diff to review."),
      focus: z
        .string()
        .optional()
        .describe("What to concentrate on, e.g. 'concurrency' or 'the auth check'."),
      language: z.string().optional().describe("Language hint for the code fence, e.g. 'ts'."),
      context: z
        .string()
        .optional()
        .describe("What the code is meant to do, and anything the reviewer should assume."),
      model: z.string().optional().describe("Model override. Defaults to OPENAI_MCP_MODEL."),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  async ({ code, focus, language, context, model }) =>
    guarded(async () => {
      const { client, config } = getClient();
      const review = await ask(client, {
        system: REVIEW_SYSTEM_PROMPT,
        user: buildReviewPrompt({ code, focus, language, context }),
        model: model ?? config.model,
        temperature: 0.1, // a review should be reproducible
        maxTokens: config.maxTokens,
        timeoutMs: config.timeoutMs,
      });
      return text(review);
    }),
);

server.registerTool(
  "list_gpt_models",
  {
    title: "List available GPT models",
    description:
      "List the model IDs this API key can reach, so a `model` override can be chosen " +
      "without guessing. Filter with `contains` to keep the list short.",
    inputSchema: {
      contains: z
        .string()
        .optional()
        .describe("Case-insensitive substring filter, e.g. 'gpt-5'."),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
  },
  async ({ contains }) =>
    guarded(async () => {
      const { client, config } = getClient();
      const page = await client.models.list();

      const needle = contains?.trim().toLowerCase();
      const ids = page.data
        .map((model) => model.id)
        .filter((id) => !needle || id.toLowerCase().includes(needle))
        .sort();

      if (ids.length === 0) {
        return text(needle ? `No model IDs match "${contains}".` : "The API returned no models.");
      }

      const shown = ids.slice(0, MODEL_LIST_LIMIT);
      const suffix =
        ids.length > shown.length
          ? `\n\n…and ${ids.length - shown.length} more. Narrow the list with \`contains\`.`
          : "";

      return text(`Default model: ${config.model}\n\n${shown.join("\n")}${suffix}`);
    }),
);

async function main(): Promise<void> {
  // A missing key is reported per tool call, not at startup — but saying so once in
  // the server log saves the user a round trip to find out why answers stop coming.
  try {
    loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) console.error(`[mcp:${SERVER_NAME}] ${error.message}`);
    else throw error;
  }

  await server.connect(new StdioServerTransport());
  console.error(`[mcp:${SERVER_NAME}] ready`);
}

main().catch((error: unknown) => {
  console.error(`[mcp:${SERVER_NAME}] failed to start:`, describeError(error));
  process.exit(1);
});
