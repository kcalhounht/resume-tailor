import OpenAI from "openai";

const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";

/**
 * OpenRouter reserves credits against max_tokens even when unused.
 * Models like DeepSeek default to 32k–65k output ceilings, which fails
 * low-balance accounts with HTTP 402. Keep these well under ~20k.
 */
export const LLM_MAX_TOKENS = {
  extract: 4_096,
  /** Strong multi-role resume JSON needs headroom; keep under ~20k for OpenRouter credit checks. */
  generate: 16_384,
  split: 8_192,
  label: 2_048,
  extractResume: 6_144,
} as const;

export function getLlmModel() {
  return process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
}

export function getLlmClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Add it to your .env.local file.",
    );
  }

  return new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer":
        process.env.OPENROUTER_SITE_URL || "http://localhost:3000",
      "X-Title": process.env.OPENROUTER_APP_NAME || "Resume Tailor",
    },
  });
}

/** Map OpenRouter / OpenAI SDK errors into actionable messages. */
export function formatOpenRouterError(err: unknown): string {
  if (!(err instanceof Error)) return "OpenRouter request failed";

  const anyErr = err as Error & {
    status?: number;
    code?: string | number;
    error?: { message?: string; code?: string | number };
  };
  const detail =
    anyErr.error?.message || anyErr.message || "OpenRouter request failed";
  const status = Number(anyErr.status || anyErr.code || anyErr.error?.code || 0);
  const blob = `${status} ${detail}`;

  if (/402|more credits|fewer max_tokens|can only afford/i.test(blob)) {
    return (
      "OpenRouter needs more credits for this request (or a lower max_tokens). " +
      "Add credits at https://openrouter.ai/settings/credits — " +
      "this app now requests smaller max_tokens so modest balances should work after redeploy."
    );
  }
  if (/api key|unauthorized|401|403|not set/i.test(blob)) {
    return `OpenRouter auth failed: ${detail}. Check OPENROUTER_API_KEY in Vercel and redeploy.`;
  }
  if (/model|404|not found/i.test(blob) && !/credits/i.test(blob)) {
    return `OpenRouter model error: ${detail}. Check OPENROUTER_MODEL (expected deepseek/deepseek-v4-flash).`;
  }
  return detail;
}
