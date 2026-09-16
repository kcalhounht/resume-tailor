import Link from "next/link";
import { CaptureBookmarklet } from "@/components/CaptureBookmarklet";

const STORE_URL = process.env.NEXT_PUBLIC_CHROME_WEBSTORE_URL?.trim() || "";

export const dynamic = "force-dynamic";

export default function ExtensionInstallPage() {
  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <main className="auth-main">
        <div className="auth-card install-card">
          <p className="brand">Resume Tailor</p>
          <h1>Add it to Chrome, then click its icon</h1>
          <p className="hint">
            The right-hand panel is a browser feature, like Adobe Acrobat.
            Regular Chrome users can only get that if Resume Tailor is on the
            Chrome Web Store. Downloading a zip and Load unpacked is something
            most people cannot do (no Developer mode on work/school Chromes).
          </p>
          <div className="side-panel-demo" aria-hidden="true">
            <div className="side-panel-demo-page">
              <p className="side-panel-demo-chrome">Current tab</p>
              <p className="side-panel-demo-title">Job posting</p>
              <p>LinkedIn, Indeed, Greenhouse — whatever you are reading.</p>
            </div>
            <div className="side-panel-demo-panel">
              <p className="side-panel-demo-chrome">Resume Tailor</p>
              <p className="side-panel-demo-title">Generate resume</p>
              <p>Opens when you click the toolbar icon.</p>
            </div>
          </div>
          {STORE_URL ? (
            <>
              <p>
                <a className="primary install-store-btn" href={STORE_URL}>
                  Add to Chrome
                </a>
              </p>
              <ol className="install-steps">
                <li>
                  Click <strong>Add to Chrome</strong> and confirm — same as
                  Adblock.
                </li>
                <li>
                  Puzzle piece → pin the <strong>Resume Tailor</strong> avatar.
                </li>
                <li>
                  Click that avatar. Chrome docks Resume Tailor on the right.
                </li>
              </ol>
            </>
          ) : (
            <>
              <p className="hint">
                This site has no store listing yet, so visitors cannot
                one-click install. Publish <code>extension/</code> once (see{" "}
                <code>extension/STORE.md</code>), then set{" "}
                <code>NEXT_PUBLIC_CHROME_WEBSTORE_URL</code> on Vercel. After
                that, <strong>Add to Chrome</strong> works for everyone.
              </p>
              <ol className="install-steps">
                <li>
                  Open the{" "}
                  <a href="https://chrome.google.com/webstore/devconsole">
                    Chrome Web Store developer dashboard
                  </a>{" "}
                  (one-time developer fee).
                </li>
                <li>
                  Upload the zip from <code>npm run extension:zip</code> and
                  submit for review (public or unlisted is fine).
                </li>
                <li>
                  Paste the listing URL into{" "}
                  <code>NEXT_PUBLIC_CHROME_WEBSTORE_URL</code> and redeploy.
                </li>
              </ol>
              <p className="hint">
                For you only, while testing:{" "}
                <a href="/api/extension/zip" download="resume-tailor-extension.zip">
                  download the zip
                </a>
                , then Load unpacked on <code>chrome://extensions</code>. Do
                not ask other users to do that.
              </p>
            </>
          )}
          <h2>Without the side panel</h2>
          <p className="hint">
            Anyone can drag this bookmark. It sends a job into Resume Tailor,
            but it will not split the window like Acrobat.
          </p>
          <CaptureBookmarklet className="side-panel-btn bookmarklet-btn" />
          <p className="hint">
            Try the bookmark on a{" "}
            <Link href="/extension/sample">sample job posting</Link>.
          </p>
          <p className="auth-switch">
            <Link href="/signin">Back to sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
