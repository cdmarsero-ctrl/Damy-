import { z } from "zod";

/**
 * Fail-fast environment validation.
 *
 * Server code imports `env`; anything under src/app/**\/page.tsx that runs on the
 * client must use the NEXT_PUBLIC_* values re-exported at the bottom instead.
 */
const serverSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET must be at least 32 characters — run: openssl rand -base64 48"),
  ACCESS_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_MODEL: z.string().default("gpt-4o"),
  OPENAI_BASE_URL: z.string().optional().default(""),
  RATE_LIMIT_AUTH_PER_MIN: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_AI_PER_MIN: z.coerce.number().int().positive().default(20),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

function load(): ServerEnv {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and fill it in.`);
  }
  return parsed.data;
}

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (!cached) cached = load();
  return cached;
}

/** True when a real model provider is configured. Drives the "AI on/offline"
 *  badge in the UI so learners always know what produced their feedback. */
export function hasLiveAI(): boolean {
  return serverEnv().OPENAI_API_KEY.trim().length > 0;
}

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Lexicon";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
