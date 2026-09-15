# Chrome Web Store listing

Regular Chrome users cannot Load unpacked. Publish this folder once; then everyone installs with **Add to Chrome**.

1. From the repo root: `npm run extension:zip`
2. Open [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole) (one-time registration fee).
3. New item → upload `resume-tailor-extension.zip`.
4. Single purpose: dock Resume Tailor on the right and capture a job posting when the user clicks Use this tab.
5. Privacy policy URL: `https://YOUR-APP.vercel.app/privacy`
6. Host permission justification: read the current tab only after the user clicks Use this tab, so the job text can be sent to their Resume Tailor site.
7. Submit for review (public or unlisted).
8. On Vercel set `NEXT_PUBLIC_CHROME_WEBSTORE_URL` to the listing URL.

After that, visitors click **Add Chrome extension** in the app. The extension detects the live site automatically.
