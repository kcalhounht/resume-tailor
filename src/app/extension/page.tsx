import Link from "next/link";
import { CaptureBookmarklet } from "@/components/CaptureBookmarklet";
import {
  ADD_TO_CHROME_HREF,
  chromeWebStoreUrl,
} from "@/lib/chrome-webstore";
import { loadCurrentUser } from "@/lib/dal";
import { isAdminUser } from "@/lib/users";

const STORE_URL = chromeWebStoreUrl();

export const dynamic = "force-dynamic";

export default async function ExtensionInstallPage() {
  const current = await loadCurrentUser();
  const isDeveloper = isAdminUser(current?.user);

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <main className="auth-main">
        <div className="auth-card install-card">
          <p className="brand">Resume Tailor</p>
          <h1>Add it to Chrome, then click its icon</h1>
          <p className="hint">
            Users never Load unpacked. <strong>Add to Chrome</strong> opens the
            Chrome Web Store listing — the same path as Adblock or Acrobat.
            After Chrome installs it, pin the avatar and click it to dock
            Resume Tailor on the right.
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
                <a className="primary install-store-btn" href={ADD_TO_CHROME_HREF}>
                  Add to Chrome
                </a>
              </p>
              <ol className="install-steps">
                <li>
                  Click <strong>Add to Chrome</strong>. Chrome opens the store
                  listing.
                </li>
                <li>
                  On that page, click Chrome’s <strong>Add to Chrome</strong>{" "}
                  and confirm.
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
            <p className="hint">
              This site is not connected to a Chrome Web Store listing yet, so
              Chrome cannot install the right-hand panel for visitors. The
              owner publishes once (developer dashboard), then{" "}
              <strong>Add to Chrome</strong> works for everyone.
            </p>
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
          {isDeveloper ? (
            <>
              <h2>Developers only</h2>
              <p className="hint">
                Load unpacked is just for you. Visitors never see this, and{" "}
                <strong>Add to Chrome</strong> must not send them a zip.
              </p>
              {!STORE_URL ? (
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
                    <code>NEXT_PUBLIC_CHROME_WEBSTORE_URL</code> on Vercel and
                    redeploy.
                  </li>
                </ol>
              ) : null}
              <p className="hint">
                Local testing:{" "}
                <a href="/api/extension/zip" download="resume-tailor-extension.zip">
                  download the zip
                </a>
                , then Load unpacked on <code>chrome://extensions</code>.
              </p>
            </>
          ) : null}
          <p className="auth-switch">
            <Link href="/signin">Back to sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
