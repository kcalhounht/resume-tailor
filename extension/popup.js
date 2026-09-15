const DEFAULT_APP_URL = "http://localhost:3000";
const button = document.getElementById("capture");
const status = document.getElementById("status");
const options = document.getElementById("options");

function normalizeAppUrl(value) {
  const raw = String(value || DEFAULT_APP_URL).trim() || DEFAULT_APP_URL;
  return new URL(raw.includes("://") ? raw : `https://${raw}`).origin;
}

async function ensureAppPermission() {
  const stored = await chrome.storage.sync.get({ appUrl: DEFAULT_APP_URL });
  const originPattern = `${normalizeAppUrl(stored.appUrl)}/*`;
  const already = await chrome.permissions.contains({
    origins: [originPattern],
  });
  if (already) return;
  const granted = await chrome.permissions.request({
    origins: [originPattern],
  });
  if (!granted) {
    throw new Error("Allow access to your Resume Tailor site in the prompt.");
  }
}

button.addEventListener("click", async () => {
  status.hidden = true;
  button.disabled = true;
  try {
    await ensureAppPermission();
    const response = await chrome.runtime.sendMessage({
      type: "resume-tailor:capture",
    });
    if (!response?.ok) {
      status.hidden = false;
      status.textContent = response?.error || "Could not capture that page.";
      return;
    }
    window.close();
  } catch (err) {
    status.hidden = false;
    status.textContent =
      err instanceof Error ? err.message : "Could not capture that page.";
  } finally {
    button.disabled = false;
  }
});

options.addEventListener("click", (event) => {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});
