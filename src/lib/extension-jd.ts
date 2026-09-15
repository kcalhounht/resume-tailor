export const EXTENSION_JD_STORAGE_KEY = "rt_extension_jd";
export const EXTENSION_JD_MESSAGE_SOURCE = "resume-tailor-extension";
export const EXTENSION_JD_MESSAGE_TYPE = "resume-tailor:job-description";
export const EXTENSION_APP_MESSAGE_SOURCE = "resume-tailor-app";
export const EXTENSION_JD_CONSUMED_TYPE = "resume-tailor:jd-consumed";

export function jobDescriptionFromExtensionMessage(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const payload = data as Record<string, unknown>;
  if (payload.source !== EXTENSION_JD_MESSAGE_SOURCE) return "";
  if (payload.type !== EXTENSION_JD_MESSAGE_TYPE) return "";
  return typeof payload.text === "string" ? payload.text : "";
}
