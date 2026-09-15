# Resume Tailor extension

Chrome/Edge Manifest V3 extension that keeps Resume Tailor in the **right side panel** and sends the current tab’s job posting into **Generate resume**.

## For everyone (Vercel / production)

Do **not** ask people to Load unpacked. Publish once to the [Chrome Web Store](STORE.md). Users then click **Add to Chrome**.

Until the listing is live, testers can download the zip from `/api/extension/zip` and Load unpacked themselves.

## Developer load unpacked

1. Open `chrome://extensions` and enable **Developer mode**.
2. **Load unpacked** → select this `extension/` directory.
3. Open the app. The extension remembers that site (including a Vercel URL).
4. Click **Open in side panel**, or the toolbar icon.

On any job page, click **Use this tab**. Highlight text first if you want that selection.
