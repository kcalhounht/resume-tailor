const PENDING_JD_KEY = "pendingJd";
const DEFAULT_APP_URL = "http://localhost:3000";

function appOriginFrom(value) {
  try {
    const raw = String(value || DEFAULT_APP_URL).trim() || DEFAULT_APP_URL;
    return new URL(raw.includes("://") ? raw : `https://${raw}`).origin;
  } catch {
    return "";
  }
}

function isAppOrigin(pageOrigin, appUrl) {
  const app = appOriginFrom(appUrl);
  if (pageOrigin === app) return true;
  const local = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);
  return local.has(pageOrigin) && local.has(app);
}

function deliver(text) {
  const next = String(text || "").trim();
  if (!next) return;
  try {
    sessionStorage.setItem("rt_extension_jd", next);
  } catch {
    // sessionStorage can be blocked
  }
  window.postMessage(
    {
      source: "resume-tailor-extension",
      type: "resume-tailor:job-description",
      text: next,
    },
    window.location.origin,
  );
}

function consumePending(stored) {
  const text = stored?.[PENDING_JD_KEY];
  if (typeof text === "string" && text.trim()) deliver(text);
}

chrome.storage.sync.get({ appUrl: DEFAULT_APP_URL }, ({ appUrl }) => {
  if (!isAppOrigin(window.location.origin, appUrl)) return;

  chrome.storage.local.get(PENDING_JD_KEY, consumePending);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[PENDING_JD_KEY]) return;
    const text = changes[PENDING_JD_KEY].newValue;
    if (typeof text === "string" && text.trim()) deliver(text);
  });

  window.addEventListener("message", (event) => {
    if (event.origin !== window.location.origin) return;
    if (event.source !== window) return;
    const data = event.data;
    if (
      data?.source === "resume-tailor-app" &&
      data?.type === "resume-tailor:jd-consumed"
    ) {
      chrome.storage.local.remove(PENDING_JD_KEY);
    }
  });
});
