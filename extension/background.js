const DEFAULT_APP_URL = "http://localhost:3000";
const PENDING_JD_KEY = "pendingJd";
const CONTENT_SCRIPT_ID = "resume-tailor-app";
const MIN_JOB_CHARS = 80;

function normalizeAppUrl(value) {
  const raw = String(value || DEFAULT_APP_URL).trim() || DEFAULT_APP_URL;
  const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  return url.origin;
}

async function getAppUrl() {
  const stored = await chrome.storage.sync.get({ appUrl: DEFAULT_APP_URL });
  return normalizeAppUrl(stored.appUrl);
}

function isLocalAppOrigin(origin) {
  return origin === "http://127.0.0.1:3000" || origin === "http://localhost:3000";
}

async function registerAppContentScript(appUrl) {
  const origin = new URL(appUrl).origin;
  try {
    await chrome.scripting.unregisterContentScripts({
      ids: [CONTENT_SCRIPT_ID],
    });
  } catch {
    // not registered yet
  }
  if (isLocalAppOrigin(origin)) return;
  await chrome.scripting.registerContentScripts([
    {
      id: CONTENT_SCRIPT_ID,
      js: ["content-app.js"],
      matches: [`${origin}/*`],
      runAt: "document_idle",
      allFrames: true,
      persistAcrossSessions: true,
    },
  ]);
}

function captureJobText(minChars) {
  const selected = window.getSelection?.()?.toString().trim();
  if (selected && selected.length >= minChars) return selected;

  const selectors = [
    "#job-details",
    ".jobs-description__content",
    ".jobs-box__html-content",
    "#jobDescriptionText",
    "[data-testid='jobDescription']",
    ".jobsearch-JobComponent-description",
    ".job-description",
    ".job-post",
    "article",
    "[role='main']",
  ];
  for (const selector of selectors) {
    const node = document.querySelector(selector);
    const text = node?.innerText?.trim() || "";
    if (text.length >= minChars) return text.slice(0, 50000);
  }
  return (document.body?.innerText || "").trim().slice(0, 50000);
}

function originAliases(origin) {
  const local = ["http://localhost:3000", "http://127.0.0.1:3000"];
  if (local.includes(origin)) return local;
  return [origin];
}

function isResumeTailorUi(url, origin) {
  try {
    const parsed = new URL(url);
    if (!originAliases(origin).includes(parsed.origin)) return false;
    // In-app sample posting is a stand-in for LinkedIn/Indeed, not the app shell.
    if (parsed.pathname.startsWith("/extension/sample")) return false;
    return true;
  } catch {
    return false;
  }
}

async function getActiveJobTab() {
  const [focused] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  if (focused?.id) return focused;
  const [current] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return current;
}

function openPanelForTab(tab) {
  if (!tab) return;
  if (tab.id != null) {
    chrome.sidePanel.open({ tabId: tab.id });
    return;
  }
  if (tab.windowId != null) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
}

async function enableSidePanel() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  await chrome.sidePanel.setOptions({
    path: "sidepanel.html",
    enabled: true,
  });
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await enableSidePanel().catch(() => {});
  try {
    await registerAppContentScript(await getAppUrl());
  } catch {
    // permission for a custom host may not be granted yet
  }
  if (details.reason === "install") {
    chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
  }
});

chrome.runtime.onStartup.addListener(() => {
  enableSidePanel().catch(() => {});
});

enableSidePanel().catch(() => {});

// If setPanelBehavior is not in effect, clicking the toolbar avatar still docks the panel.
chrome.action.onClicked.addListener((tab) => {
  openPanelForTab(tab);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.appUrl) return;
  getAppUrl()
    .then((appUrl) => registerAppContentScript(appUrl))
    .catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "resume-tailor:active-tab") {
    (async () => {
      const tab = await getActiveJobTab();
      sendResponse({
        ok: Boolean(tab?.id),
        title: tab?.title || "",
        url: tab?.url || "",
      });
    })();
    return true;
  }

  if (message?.type === "resume-tailor:open-side-panel") {
    const tabId = sender.tab?.id;
    const windowId = sender.tab?.windowId;
    if (tabId == null && windowId == null) {
      sendResponse({ ok: false, error: "No browser window to dock." });
      return;
    }
    // Must run in this turn. An async/await wrapper drops Chrome's user gesture,
    // and then sidePanel.open() fails — the page button looks like a no-op.
    const target = tabId != null ? { tabId } : { windowId };
    try {
      const opening = chrome.sidePanel.open(target);
      opening.then(
        () => sendResponse({ ok: true }),
        (err) =>
          sendResponse({
            ok: false,
            error:
              err instanceof Error ? err.message : "Could not open the side panel.",
          }),
      );
    } catch (err) {
      sendResponse({
        ok: false,
        error:
          err instanceof Error ? err.message : "Could not open the side panel.",
      });
    }
    return true;
  }

  if (message?.type !== "resume-tailor:capture") return;
  (async () => {
    try {
      const tab = await getActiveJobTab();
      if (!tab?.id) throw new Error("No active tab.");

      const appUrl = await getAppUrl();
      if (tab.url && isResumeTailorUi(tab.url, appUrl)) {
        throw new Error("Open a job posting, then capture it from there.");
      }
      if (tab.url && !/^https?:/i.test(tab.url)) {
        throw new Error("Open a regular web page, then capture that tab.");
      }

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: captureJobText,
        args: [MIN_JOB_CHARS],
      });
      const text = String(results?.[0]?.result || "").trim();
      if (text.length < MIN_JOB_CHARS) {
        throw new Error("Select the job description, or open the full posting.");
      }

      await chrome.storage.local.set({ [PENDING_JD_KEY]: text });
      try {
        await registerAppContentScript(appUrl);
      } catch {
        // localhost is already in the manifest
      }
      sendResponse({ ok: true, text });
    } catch (err) {
      sendResponse({
        ok: false,
        error:
          err instanceof Error ? err.message : "Could not capture that page.",
      });
    }
  })();
  return true;
});
