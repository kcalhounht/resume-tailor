export const OPENROUTER_KEY_MISSING_MESSAGE =
  "OpenRouter API key is missing. Add a key on Admin → Settings, then try again.";

export const OPENROUTER_CREDITS_EXCEEDED_MESSAGE =
  "OpenRouter credits are used up. Add credits at OpenRouter, then try again.";

export const OPENROUTER_KEY_REJECTED_MESSAGE =
  "OpenRouter rejected the API key. Add a valid key on Admin → Settings, then try again.";

const FILLED_FROM_TEXT_SUFFIX =
  " Profile fields were filled from the PDF text.";

export function isOpenRouterUserMessage(message: string) {
  return (
    message.startsWith(OPENROUTER_KEY_MISSING_MESSAGE) ||
    message.startsWith(OPENROUTER_CREDITS_EXCEEDED_MESSAGE) ||
    message.startsWith(OPENROUTER_KEY_REJECTED_MESSAGE)
  );
}

export function withFilledFromTextNotice(message: string) {
  return message.endsWith(FILLED_FROM_TEXT_SUFFIX)
    ? message
    : `${message}${FILLED_FROM_TEXT_SUFFIX}`;
}

function collectErrorText(err: unknown): { status?: number; text: string } {
  if (!err || typeof err !== "object") {
    return { text: String(err ?? "") };
  }

  const rec = err as Record<string, unknown>;
  const status =
    typeof rec.status === "number"
      ? rec.status
      : typeof rec.statusCode === "number"
        ? rec.statusCode
        : undefined;
  const parts: string[] = [];
  if (typeof rec.message === "string") parts.push(rec.message);
  if (typeof rec.code === "string" || typeof rec.code === "number") {
    parts.push(String(rec.code));
  }
  const nested = rec.error;
  if (typeof nested === "string") {
    parts.push(nested);
  } else if (nested && typeof nested === "object") {
    const inner = nested as Record<string, unknown>;
    if (typeof inner.message === "string") parts.push(inner.message);
    if (inner.code != null) parts.push(String(inner.code));
  }
  return { status, text: parts.join(" ").toLowerCase() };
}

export function openRouterUserMessage(err: unknown): string | null {
  const existing = err instanceof Error ? err.message : "";
  if (existing && isOpenRouterUserMessage(existing)) return existing;

  const { status, text } = collectErrorText(err);

  if (
    status === 402 ||
    /\b402\b/.test(text) ||
    text.includes("insufficient credits") ||
    text.includes("insufficient_quota") ||
    text.includes("payment required") ||
    (text.includes("credit") &&
      (text.includes("insufficient") ||
        text.includes("exceed") ||
        text.includes("used up") ||
        text.includes("payment required")))
  ) {
    return OPENROUTER_CREDITS_EXCEEDED_MESSAGE;
  }

  if (
    text.includes("api key is not set") ||
    text.includes("api key is missing") ||
    text.includes("openrouter api key")
  ) {
    return OPENROUTER_KEY_MISSING_MESSAGE;
  }

  if (
    status === 401 ||
    text.includes("invalid api key") ||
    text.includes("incorrect api key") ||
    text.includes("user not found") ||
    (text.includes("unauthorized") && text.includes("key"))
  ) {
    return OPENROUTER_KEY_REJECTED_MESSAGE;
  }

  return null;
}

export function isOpenRouterConfigError(err: unknown) {
  return openRouterUserMessage(err) !== null;
}

export function toOpenRouterError(err: unknown, fallback?: string): Error {
  const mapped = openRouterUserMessage(err);
  if (mapped) return new Error(mapped);
  if (err instanceof Error) return err;
  return new Error(fallback || String(err));
}
