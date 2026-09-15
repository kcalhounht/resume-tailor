# Resume Tailor extension

Add this to Chrome first. Then click the **Resume Tailor** toolbar avatar to dock the app on the right (same Chrome UI as Adobe Acrobat).

## After it is in the browser

1. Puzzle piece → pin **Resume Tailor**.
2. Open a job posting.
3. Click the Resume Tailor icon. Chrome opens the right-hand panel.

A website button cannot open that panel. The in-app **Add to Chrome** link only installs it.

## Publish

See [STORE.md](STORE.md). Set `NEXT_PUBLIC_CHROME_WEBSTORE_URL` so `/extension` is a store install.

## Developer

1. `chrome://extensions` → Developer mode → **Load unpacked** → this folder.
2. A welcome tab explains pinning. Click the toolbar icon to open the panel.
