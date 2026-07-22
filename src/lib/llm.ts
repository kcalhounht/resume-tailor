import OpenAI from "openai";

const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";

/**
 * OpenRouter reserves credits against max_tokens even when unused.
 * Keep ceilings low so thin balances (a few thousand affordable tokens) still work.
 * Override with OPENROUTER_MAX_TOKENS_* env vars if needed.
 */
function envMax(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 256 ? Math.floor(n) : fallback;
}

export const LLM_MAX_TOKENS = {
  extract: envMax("OPENROUTER_MAX_TOKENS_EXTRACT", 2_048),
  /** Resume JSON only (cover letter is a separate cheaper call). */
  generate: envMax("OPENROUTER_MAX_TOKENS_GENERATE", 4_500),
  coverLetter: envMax("OPENROUTER_MAX_TOKENS_COVER", 1_200),
  split: envMax("OPENROUTER_MAX_TOKENS_SPLIT", 3_000),
  label: envMax("OPENROUTER_MAX_TOKENS_LABEL", 1_024),
  extractResume: envMax("OPENROUTER_MAX_TOKENS_RESUME", 2_048),
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
      "Add credits at https://openrouter.ai/settings/credits"
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

export function isCreditError(err: unknown): boolean {
  return /402|more credits|fewer max_tokens|can only afford/i.test(
    formatOpenRouterError(err),
  );
}
