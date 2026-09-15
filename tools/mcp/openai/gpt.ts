/**
 * The OpenAI call path for the MCP server, plus the prompt builders its tools use.
 *
 * Shape mirrors `src/lib/ai/provider.ts` — hard timeout, one retry on transient
 * failure — but the failure policy is inverted. The app silently degrades to its
 * rules engine because a learner must never see a 500; here the caller is Claude,
 * and a clear error ("rate limited", "unknown model") is far more useful than a
 * quiet empty answer it might treat as GPT's actual opinion.
 */

import OpenAI from "openai";

import type { ServerConfig } from "./config";

export function createClient(config: ServerConfig): OpenAI {
  return new OpenAI({
    apiKey: config.apiKey,
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    maxRetries: 0, // retries are handled below, so the timeout stays honest
  });
}

/**
 * Reasoning models (the o-series and gpt-5 family) reject `temperature` and renamed
 * `max_tokens` to `max_completion_tokens`. Sending the wrong pair is a 400, so the
 * family is detected from the name rather than discovered at request time.
 */
export function isReasoningModel(model: string): boolean {
  return /^(o[134]|gpt-5)/i.test(model.trim());
}

export interface AskOptions {
  system: string;
  user: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

/** Builds the request body, adapted to the model family. Pure, so it is testable. */
export function buildRequest(
  options: AskOptions,
): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
  const base = {
    model: options.model,
    messages: [
      { role: "system" as const, content: options.system },
      { role: "user" as const, content: options.user },
    ],
  };

  if (isReasoningModel(options.model)) {
    return { ...base, max_completion_tokens: options.maxTokens };
  }
  return { ...base, temperature: options.temperature, max_tokens: options.maxTokens };
}

/** A response the API accepted but we cannot use. Retrying would just bill twice. */
export class ModelResponseError extends Error {}

function isRetryable(error: unknown): boolean {
  if (error instanceof ModelResponseError) return false;
  if (error instanceof OpenAI.APIError) {
    return error.status === 429 || (error.status !== undefined && error.status >= 500);
  }
  // Network errors and aborts.
  return true;
}

/** Turns any thrown value into a message worth showing Claude. */
export function describeError(error: unknown): string {
  if (error instanceof OpenAI.APIError) {
    const detail = error.message || error.name;
    if (error.status === 401) return `OpenAI rejected the API key (401): ${detail}`;
    if (error.status === 404) return `Model not found or not available to this key (404): ${detail}`;
    if (error.status === 429) return `OpenAI rate limit or quota exceeded (429): ${detail}`;
    return `OpenAI request failed (${error.status ?? "no status"}): ${detail}`;
  }
  if (error instanceof Error) {
    return error.name === "AbortError" ? "OpenAI request timed out" : error.message;
  }
  return "Unknown error calling OpenAI";
}

async function once(client: OpenAI, options: AskOptions): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    // `chat.completions` rather than the Responses API: it is what every
    // OpenAI-compatible gateway behind OPENAI_BASE_URL implements, and this server
    // must keep working when that variable points somewhere other than OpenAI.
    const completion = await client.chat.completions.create(buildRequest(options), {
      signal: controller.signal,
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) {
      const reason = completion.choices[0]?.finish_reason;
      throw new ModelResponseError(
        reason === "length"
          ? "The model hit the output token cap before producing an answer. Raise max_tokens or narrow the question."
          : "The model returned an empty response.",
      );
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/** Calls the model, retrying once on a transient failure. Throws with a readable message. */
export async function ask(client: OpenAI, options: AskOptions): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await once(client, options);
    } catch (error) {
      if (attempt === 0 && isRetryable(error)) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        continue;
      }
      throw new Error(describeError(error));
    }
  }
  throw new Error("Unreachable");
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

/**
 * The default system prompt for `ask_gpt`.
 *
 * It tells GPT that its reader is another model rather than a person, because the
 * value of a second opinion lies in its disagreements: hedging and pleasantries
 * are noise once the answer is being weighed against Claude's own.
 */
export const DEFAULT_SYSTEM_PROMPT =
  "You are being consulted by another AI coding assistant working in a software " +
  "repository. Answer directly and concretely. State your reasoning, name your " +
  "assumptions, and say plainly when you are unsure or when you disagree with the " +
  "premise of the question. Skip preamble, apologies and restatements of the question.";

export interface ReviewInput {
  code: string;
  focus?: string;
  language?: string;
  context?: string;
}

export const REVIEW_SYSTEM_PROMPT =
  "You are a senior engineer reviewing code for another AI coding assistant. " +
  "Report only concrete, verifiable problems: correctness bugs, unhandled edge " +
  "cases, race conditions, security issues, and API misuse. For each finding give " +
  "the location, why it is wrong, and the input or state that triggers it. Do not " +
  "restate what the code does, and do not raise style preferences unless they cause " +
  "a defect. If you find nothing substantive, say so instead of inventing findings.";

/** Assembles the review request. Pure, so the framing is covered by tests. */
export function buildReviewPrompt(input: ReviewInput): string {
  const sections: string[] = [];

  if (input.context?.trim()) sections.push(`Context:\n${input.context.trim()}`);
  if (input.focus?.trim()) sections.push(`Review focus:\n${input.focus.trim()}`);

  const fence = input.language?.trim() ? `\`\`\`${input.language.trim()}` : "```";
  sections.push(`Code under review:\n${fence}\n${input.code}\n\`\`\``);

  return sections.join("\n\n");
}
