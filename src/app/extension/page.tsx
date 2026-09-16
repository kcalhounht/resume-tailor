import Link from "next/link";
import { CaptureBookmarklet } from "@/components/CaptureBookmarklet";
import {
  ADD_TO_CHROME_HREF,
  chromeWebStoreUrl,
} from "@/lib/chrome-webstore";

const STORE_URL = chromeWebStoreUrl();

export const dynamic = "force-dynamic";

export default function ExtensionInstallPage() {
  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <main className="auth-main">
        <div className="auth-card install-card">
          <p className="brand">Resume Tailor</p>
          {STORE_URL ? (
            <>
              <h1>Add to Chrome, then click the avatar</h1>
              <p className="hint">
                Sign in, click <strong>Add to Chrome</strong>, confirm in
                Chrome, then click the Resume Tailor avatar. Chrome docks the
                app on the right.
              </p>
            </>
          ) : (
            <>
              <h1>Chrome cannot add the avatar yet</h1>
              <p className="hint">
                You signed in and clicked <strong>Add to Chrome</strong>. Chrome
                can only add the Resume Tailor avatar from a Web Store listing.
                That listing is not connected, so there is no avatar to click
                and the right-hand panel cannot open.
              </p>
            </>
          )}
          <div className="side-panel-demo" aria-hidden="true">
            <div className="side-panel-demo-page">
              <p className="side-panel-demo-chrome">Current tab</p>
              <p className="side-panel-demo-title">Job posting</p>
              <p>LinkedIn, Indeed, Greenhouse — whatever you are reading.</p>
            </div>
            <div className="side-panel-demo-panel">
              <p className="side-panel-demo-chrome">Resume Tailor</p>
              <p className="side-panel-demo-title">Generate resume</p>
              <p>Opens when you click the toolbar avatar.</p>
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
                <li>Open Resume Tailor and sign in.</li>
                <li>
                  Click <strong>Add to Chrome</strong>. Chrome opens the Web
                  Store listing.
                </li>
                <li>
                  Confirm Chrome’s prompt. Resume Tailor is added to your
                  extensions — the avatar appears.
                </li>
                <li>
                  Puzzle piece → pin that avatar, then click it. The app opens
                  on the right.
                </li>
              </ol>
            </>
          ) : (
            <p className="hint">
              Chrome can add the avatar for everyone only from a Web Store
              listing. The owner publishes once, then this same{" "}
              <strong>Add to Chrome</strong> button does that for every signed-in
              user.
            </p>
          )}
          <h2>Without the side panel</h2>
          <p className="hint">
            Drag this bookmark to send a job into Resume Tailor. It will not
            split the window like Acrobat.
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
