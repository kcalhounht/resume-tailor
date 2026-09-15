const DEFAULT_APP_URL = "http://localhost:3000";
const button = document.getElementById("capture");
const status = document.getElementById("status");
const options = document.getElementById("options");
const frame = document.getElementById("app");
const tabTitle = document.getElementById("tab-title");
const tabUrl = document.getElementById("tab-url");

function normalizeAppUrl(value) {
  const raw = String(value || DEFAULT_APP_URL).trim() || DEFAULT_APP_URL;
  return new URL(raw.includes("://") ? raw : `https://${raw}`).origin;
}

async function getAppUrl() {
  const stored = await chrome.storage.sync.get({ appUrl: DEFAULT_APP_URL });
  return normalizeAppUrl(stored.appUrl);
}

function loadApp(appUrl) {
  const next = `${appUrl}/`;
  if (frame.dataset.src === next) return;
  frame.dataset.src = next;
  frame.src = next;
}

function showError(message) {
  status.hidden = false;
  status.textContent = message;
}

function deliverToApp(text, appUrl) {
  try {
    frame.contentWindow?.postMessage(
      {
        source: "resume-tailor-extension",
        type: "resume-tailor:job-description",
        text,
      },
      appUrl,
    );
  } catch {
    // iframe may not be ready; content script still delivers from storage
  }
}

async function refreshTabLabel() {
  const response = await chrome.runtime.sendMessage({
    type: "resume-tailor:active-tab",
  });
  if (!response?.ok) {
    tabTitle.textContent = "No active tab";
    tabUrl.textContent = "Open a job posting in this window.";
    return;
  }
  tabTitle.textContent = response.title || "Current tab";
  tabUrl.textContent = response.url || "";
}

button.addEventListener("click", async () => {
  status.hidden = true;
  button.disabled = true;
  try {
    const appUrl = await getAppUrl();
    loadApp(appUrl);
    const response = await chrome.runtime.sendMessage({
      type: "resume-tailor:capture",
    });
    if (!response?.ok) {
      showError(response?.error || "Could not capture that page.");
      return;
    }
    deliverToApp(response.text, appUrl);
  } catch (err) {
    showError(err instanceof Error ? err.message : "Could not capture that page.");
  } finally {
    button.disabled = false;
  }
});

options.addEventListener("click", (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

chrome.tabs.onActivated.addListener(() => {
  refreshTabLabel().catch(() => {});
});
chrome.tabs.onUpdated.addListener((_tabId, info) => {
  if (info.status === "complete" || info.title || info.url) {
    refreshTabLabel().catch(() => {});
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.appUrl) return;
  getAppUrl().then(loadApp).catch(() => {});
});

getAppUrl().then(loadApp).catch(() => {});
refreshTabLabel().catch(() => {});
