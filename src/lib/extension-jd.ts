export const EXTENSION_JD_STORAGE_KEY = "rt_extension_jd";
export const EXTENSION_JD_MESSAGE_SOURCE = "resume-tailor-extension";
export const EXTENSION_JD_MESSAGE_TYPE = "resume-tailor:job-description";
export const EXTENSION_APP_MESSAGE_SOURCE = "resume-tailor-app";
export const EXTENSION_JD_CONSUMED_TYPE = "resume-tailor:jd-consumed";
export const EXTENSION_AVAILABLE_TYPE = "resume-tailor:available";
export const EXTENSION_PING_TYPE = "resume-tailor:ping";
export const EXTENSION_OPEN_PANEL_TYPE = "resume-tailor:open-side-panel";
export const EXTENSION_SIDE_PANEL_RESULT_TYPE =
  "resume-tailor:side-panel-result";

export const INSTALL_SIDE_PANEL_MESSAGE =
  "Install the Resume Tailor Chrome extension from the Chrome Web Store (or the Install instructions page). Chrome does not allow most people to Load unpacked. After it is installed, this button docks the app on the right so you can capture a job from any tab.";

export function jobDescriptionFromExtensionMessage(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const payload = data as Record<string, unknown>;
  if (payload.source !== EXTENSION_JD_MESSAGE_SOURCE) return "";
  if (payload.type !== EXTENSION_JD_MESSAGE_TYPE) return "";
  return typeof payload.text === "string" ? payload.text : "";
}

export function isTrustedExtensionJobEvent(event: MessageEvent): string {
  const text = jobDescriptionFromExtensionMessage(event.data);
  if (!text) return "";
  if (event.origin === window.location.origin && event.source === window) {
    return text;
  }
  if (
    event.source === window.parent &&
    typeof event.origin === "string" &&
    event.origin.startsWith("chrome-extension:")
  ) {
    return text;
  }
  return "";
}
