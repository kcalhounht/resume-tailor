export const GENERATION_STOPPED_MESSAGE = "Generation stopped.";

export function abortedError(): Error {
  const err = new Error(GENERATION_STOPPED_MESSAGE);
  err.name = "AbortError";
  return err;
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortedError();
}

export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name?: string }).name) : "";
  return name === "AbortError" || name === "APIUserAbortError";
}
