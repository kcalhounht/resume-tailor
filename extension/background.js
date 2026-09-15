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

function sameOrigin(url, origin) {
  try {
    return originAliases(origin).includes(new URL(url).origin);
  } catch {
    return false;
  }
}

async function openApp(appUrl) {
  const origin = new URL(appUrl).origin;
  const existing = (
    await Promise.all(
      originAliases(origin).map((alias) => chrome.tabs.query({ url: `${alias}/*` })),
    )
  ).flat();
  let appTab = existing.find((tab) => tab.id) || null;

  const inject = (tabId) =>
    chrome.scripting
      .executeScript({
        target: { tabId },
        files: ["content-app.js"],
      })
      .catch(() => {});

  if (appTab?.id) {
    await chrome.tabs.update(appTab.id, { active: true });
    if (appTab.windowId != null) {
      await chrome.windows.update(appTab.windowId, { focused: true });
    }
    inject(appTab.id);
  } else {
    appTab = await chrome.tabs.create({ url: `${origin}/` });
    if (appTab.id) inject(appTab.id);
  }

  const targetId = appTab?.id;
  if (!targetId) return;

  const onUpdated = (tabId, info) => {
    if (tabId !== targetId || info.status !== "complete") return;
    inject(tabId);
  };
  chrome.tabs.onUpdated.addListener(onUpdated);
  setTimeout(
    () => chrome.tabs.onUpdated.removeListener(onUpdated),
    5 * 60 * 1000,
  );
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await registerAppContentScript(await getAppUrl());
  } catch {
    // permission for a custom host may not be granted yet
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync" || !changes.appUrl) return;
  getAppUrl()
    .then((appUrl) => registerAppContentScript(appUrl))
    .catch(() => {});
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "resume-tailor:capture") return;
  (async () => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) throw new Error("No active tab.");

      const appUrl = await getAppUrl();
      if (tab.url && sameOrigin(tab.url, appUrl)) {
        throw new Error("Open a job posting, then send it from there.");
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
      await openApp(appUrl);
      sendResponse({ ok: true });
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
