# Chrome Web Store listing

This folder is optional. End users already get a job-capture bookmark from `/extension` without Developer mode.

Publish here only if you want Chrome’s built-in side panel.

1. From the repo root: `npm run extension:zip`
2. Open [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole) (one-time registration fee).
3. New item → upload `resume-tailor-extension.zip`.
4. Single purpose: dock Resume Tailor on the right and capture a job posting when the user clicks Use this tab.
5. Privacy policy URL: `https://YOUR-APP.vercel.app/privacy`
6. Host permission justification: read the current tab only after the user clicks Use this tab, so the job text can be sent to their Resume Tailor site.
7. Submit for review (public or unlisted).

Regular Chrome users still should not be asked to Load unpacked.
