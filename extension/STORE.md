# Chrome Web Store listing

This is how people get the **right-hand side panel** (the same Chrome UI Adobe Acrobat uses). Bookmarklets cannot split the window that way.

1. From the repo root: `npm run extension:zip`
2. Open [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole) (one-time registration fee).
3. New item → upload `resume-tailor-extension.zip`.
4. Single purpose: dock Resume Tailor in Chrome’s side panel and send the current tab’s job posting into Generate resume.
5. Privacy policy URL: `https://resume-tailor-five-phi.vercel.app/privacy` (or your live origin). Confirm `extension/app-config.js` uses that same origin before you upload.
6. Host permission justification: read the current tab so the job text can be sent to the user’s Resume Tailor site when they open the panel or click Use this tab.
7. Submit for review (public or unlisted).
8. On Vercel set `NEXT_PUBLIC_CHROME_WEBSTORE_URL` to the listing URL (for example `https://chromewebstore.google.com/detail/...`) and redeploy.

After that, in-app **Add to Chrome** and `/install` send visitors to the listing. Chrome shows its own **Add to Chrome** button there — that is the only install Chrome allows for everyone. Pin the icon, then click it on a job tab.
