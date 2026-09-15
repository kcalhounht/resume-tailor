# Resume Tailor extension

Chrome/Edge Manifest V3 add-on that keeps Resume Tailor in the **right side panel** and sends the current tab’s job posting into **Generate resume**.

## For everyone

Do **not** ask people to download a zip or Load unpacked. They cannot enable Developer mode on most machines.

Ship the in-app bookmark instead: `/extension` → drag **Send job to Resume Tailor** onto the bookmarks bar. That path does not need this folder.

## Optional store listing

If you want a real Chrome side panel, publish this folder once. See [STORE.md](STORE.md). Until a listing exists, only developers should load this unpacked.

## Developer load unpacked

1. Open `chrome://extensions` and enable **Developer mode**.
2. **Load unpacked** → select this `extension/` directory.
3. Open the app. The extension remembers that site (including a Vercel URL).
4. Click **Open in side panel**, or the toolbar icon.

On any job page, click **Use this tab**. Highlight text first if you want that selection.
