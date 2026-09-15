const DEFAULT_APP_URL = "http://localhost:3000";
const input = document.getElementById("appUrl");
const saved = document.getElementById("saved");

function normalizeAppUrl(value) {
  const raw = String(value || DEFAULT_APP_URL).trim() || DEFAULT_APP_URL;
  return new URL(raw.includes("://") ? raw : `https://${raw}`).origin;
}

chrome.storage.sync.get({ appUrl: DEFAULT_APP_URL }, ({ appUrl }) => {
  input.value = appUrl || DEFAULT_APP_URL;
});

document.getElementById("save").addEventListener("click", async () => {
  saved.hidden = true;
  let origin;
  try {
    origin = normalizeAppUrl(input.value);
  } catch {
    saved.hidden = false;
    saved.textContent = "Enter a valid site URL.";
    return;
  }

  input.value = origin;
  const originPattern = `${origin}/*`;
  const already = await chrome.permissions.contains({
    origins: [originPattern],
  });
  if (!already) {
    const granted = await chrome.permissions.request({
      origins: [originPattern],
    });
    if (!granted) {
      await chrome.storage.sync.set({ appUrl: origin });
      saved.hidden = false;
      saved.textContent =
        "Saved the URL, but the site permission was not granted.";
      return;
    }
  }

  await chrome.storage.sync.set({ appUrl: origin });
  saved.hidden = false;
  saved.textContent = "Saved.";
});
