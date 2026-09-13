import "server-only";

import OpenAI from "openai";

import { hasLiveAI, serverEnv } from "../env";

/**
 * Thin wrapper over the model provider.
 *
 * Everything that calls a model goes through `completeJson`, which guarantees:
 *  - a hard timeout, so a hung provider cannot hold a request open
 *  - one retry on transient failure (429 / 5xx / network), with backoff
 *  - a parsed, shape-checked result or `null` — callers then fall back to the
 *    rules engine rather than surfacing an error to the learner
 *
 * Swapping providers means changing this file only; see docs/EXTENDING.md.
 */

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!hasLiveAI()) return null;
  if (client) return client;

  const env = serverEnv();
  client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    ...(env.OPENAI_BASE_URL ? { baseURL: env.OPENAI_BASE_URL } : {}),
    maxRetries: 0, // we handle retries ourselves so the timeout stays honest
  });
  return client;
}

export const AI_TIMEOUT_MS = 25_000;

export interface CompleteOptions {
  system: string;
  user: string;
  /** Lower for grading and correction, higher for conversation. */
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

function isRetryable(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) {
    return error.status === 429 || (error.status !== undefined && error.status >= 500);
  }
  // Network errors and aborts.
  return true;
}

async function once(options: CompleteOptions): Promise<string | null> {
  const api = getClient();
  if (!api) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? AI_TIMEOUT_MS);

  try {
    const response = await api.chat.completions.create(
      {
        model: serverEnv().OPENAI_MODEL,
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens ?? 1200,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
      },
      { signal: controller.signal },
    );
    return response.choices[0]?.message?.content ?? null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Requests a JSON object from the model and validates it with `check`.
 * Returns `null` on any failure — an unusable model response must never become
 * a 500 for the learner.
 */
export async function completeJson<T>(
  options: CompleteOptions,
  check: (value: unknown) => T | null,
): Promise<T | null> {
  if (!hasLiveAI()) return null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw = await once(options);
      if (!raw) return null;

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        console.warn("[ai] model returned non-JSON content");
        return null;
      }

      const checked = check(parsed);
      if (checked === null) {
        console.warn("[ai] model response failed shape validation");
        return null;
      }
      return checked;
    } catch (error) {
      const retryable = isRetryable(error);
      if (attempt === 0 && retryable) {
        await new Promise((resolve) => setTimeout(resolve, 600));
        continue;
      }
      console.warn("[ai] request failed, falling back to rules engine:", describe(error));
      return null;
    }
  }
  return null;
}

function describe(error: unknown): string {
  if (error instanceof OpenAI.APIError) return `${error.status} ${error.name}`;
  if (error instanceof Error) return error.name === "AbortError" ? "timeout" : error.message;
  return "unknown error";
}

export { hasLiveAI };
