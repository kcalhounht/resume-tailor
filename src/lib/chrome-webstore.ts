const STORE_HOSTS = new Set([
  "chromewebstore.google.com",
  "chrome.google.com",
]);

export function chromeWebStoreUrl(): string {
  const raw = process.env.NEXT_PUBLIC_CHROME_WEBSTORE_URL?.trim() || "";
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return "";
    if (!STORE_HOSTS.has(url.hostname)) return "";
    if (
      url.hostname === "chrome.google.com" &&
      !url.pathname.startsWith("/webstore/")
    ) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

export const ADD_TO_CHROME_HREF = "/install";
