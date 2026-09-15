import { describe, expect, it } from "vitest";

import { ConfigError, mergeEnv, parseEnvFile, resolveConfig } from "./config";

describe("parseEnvFile", () => {
  it("reads the forms .env.example actually uses", () => {
    const parsed = parseEnvFile(
      [
        "# a comment",
        "",
        'OPENAI_API_KEY="sk-quoted"',
        "OPENAI_MODEL=gpt-4o",
        "export OPENAI_BASE_URL='https://gateway.example/v1'",
        "ACCESS_TTL_MINUTES=30 # trailing comment",
      ].join("\n"),
    );

    expect(parsed).toEqual({
      OPENAI_API_KEY: "sk-quoted",
      OPENAI_MODEL: "gpt-4o",
      OPENAI_BASE_URL: "https://gateway.example/v1",
      ACCESS_TTL_MINUTES: "30",
    });
  });

  it("keeps '=' and '#' that belong to the value", () => {
    const parsed = parseEnvFile(['DATABASE_URL="postgres://u:p@h/db?schema=public"', 'K="a # b"'].join("\n"));

    expect(parsed.DATABASE_URL).toBe("postgres://u:p@h/db?schema=public");
    expect(parsed.K).toBe("a # b");
  });

  it("expands escapes inside double quotes only", () => {
    const parsed = parseEnvFile(['A="one\\ntwo"', "B='one\\ntwo'"].join("\n"));

    expect(parsed.A).toBe("one\ntwo");
    expect(parsed.B).toBe("one\\ntwo");
  });

  it("skips lines that are not assignments", () => {
    expect(parseEnvFile(["no equals sign", "=novalue", "9BAD=x", "  "].join("\n"))).toEqual({});
  });
});

describe("mergeEnv", () => {
  it("lets the real environment win over every file", () => {
    const merged = mergeEnv({ OPENAI_MODEL: "from-shell" }, [{ OPENAI_MODEL: "from-file" }]);

    expect(merged.OPENAI_MODEL).toBe("from-shell");
  });

  it("lets .env.local win over .env", () => {
    const merged = mergeEnv({}, [{ OPENAI_MODEL: "local" }, { OPENAI_MODEL: "shared" }]);

    expect(merged.OPENAI_MODEL).toBe("local");
  });

  it("ignores empty shell values so an unset export does not blank a file value", () => {
    const merged = mergeEnv({ OPENAI_API_KEY: "" }, [{ OPENAI_API_KEY: "sk-file" }]);

    expect(merged.OPENAI_API_KEY).toBe("sk-file");
  });
});

describe("resolveConfig", () => {
  it("refuses to build a config without a key", () => {
    expect(() => resolveConfig({})).toThrow(ConfigError);
    expect(() => resolveConfig({ OPENAI_API_KEY: "   " })).toThrow(ConfigError);
  });

  it("prefers the MCP-specific model over the app's", () => {
    const config = resolveConfig({
      OPENAI_API_KEY: "sk-test",
      OPENAI_MODEL: "gpt-4o",
      OPENAI_MCP_MODEL: "gpt-5",
    });

    expect(config.model).toBe("gpt-5");
  });

  it("falls back to the app's model, then to a default", () => {
    expect(resolveConfig({ OPENAI_API_KEY: "sk", OPENAI_MODEL: "gpt-4.1" }).model).toBe("gpt-4.1");
    expect(resolveConfig({ OPENAI_API_KEY: "sk" }).model).toBe("gpt-4o");
  });

  it("ignores unusable numeric overrides rather than starting with a zero timeout", () => {
    const config = resolveConfig({
      OPENAI_API_KEY: "sk",
      OPENAI_MCP_TIMEOUT_MS: "not-a-number",
      OPENAI_MCP_MAX_TOKENS: "-5",
    });

    expect(config.timeoutMs).toBe(90_000);
    expect(config.maxTokens).toBe(4_000);
  });

  it("treats a blank base URL as unset", () => {
    expect(resolveConfig({ OPENAI_API_KEY: "sk", OPENAI_BASE_URL: "  " }).baseUrl).toBeUndefined();
  });
});
