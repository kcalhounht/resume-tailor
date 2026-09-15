# Resume Tailor extension

Chrome/Edge Manifest V3 add-on that docks Resume Tailor in the **right side panel** (same Chrome UI as Adobe Acrobat) and sends the current tab’s job posting into **Generate resume**.

## For everyone

This layout is a browser extension. People install it from the Chrome Web Store the same way they install Adblock: **Add to Chrome**, pin the icon, click it. A website cannot inject that side panel on its own.

Publish this folder once. See [STORE.md](STORE.md). Then set `NEXT_PUBLIC_CHROME_WEBSTORE_URL` so `/extension` shows **Add to Chrome**.

Do **not** ask typical users to Load unpacked.

## After install

1. Pin **Resume Tailor** on the toolbar.
2. Open a job posting (LinkedIn, Indeed, a careers page).
3. Click the toolbar icon. Chrome opens Resume Tailor on the right; the job stays on the left.
4. The panel captures the current tab when it opens. Use **Use this tab** again after you switch jobs.

## Developer load unpacked

1. Open `chrome://extensions` and enable **Developer mode**.
2. **Load unpacked** → select this `extension/` directory.
3. Open the app so the extension can remember that origin (including a Vercel URL).
4. Click the toolbar icon, or **Open in side panel** in the app.
