import Link from "next/link";
import { CaptureBookmarklet } from "@/components/CaptureBookmarklet";
import { OpenSidePanelButton } from "@/components/OpenSidePanelButton";

const STORE_URL = process.env.NEXT_PUBLIC_CHROME_WEBSTORE_URL?.trim() || "";

export const dynamic = "force-dynamic";

export default function ExtensionInstallPage() {
  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <main className="auth-main">
        <div className="auth-card install-card">
          <p className="brand">Resume Tailor</p>
          <h1>Dock it on the right of any tab</h1>
          <p className="hint">
            Same Chrome side panel Adobe Acrobat uses: the job (or any site)
            stays on the left, Resume Tailor sits on the right. Adblock-style
            extensions install from the Chrome Web Store, then pin to the
            toolbar.
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
              <p>Use this tab fills the posting from the page on the left.</p>
            </div>
          </div>
          {STORE_URL ? (
            <p>
              <a className="primary install-store-btn" href={STORE_URL}>
                Add to Chrome
              </a>
            </p>
          ) : (
            <p className="hint">
              After the site owner publishes the extension (see{" "}
              <code>extension/STORE.md</code>), this page shows{" "}
              <strong>Add to Chrome</strong>. Until then, only someone who can
              load the <code>extension/</code> folder will see the split view.
            </p>
          )}
          <ol className="install-steps">
            <li>Install Resume Tailor from Chrome (Add to Chrome).</li>
            <li>
              Puzzle piece → pin <strong>Resume Tailor</strong> on the toolbar.
            </li>
            <li>
              Open a job posting, then click that icon. Chrome docks Resume
              Tailor on the right, like Acrobat.
            </li>
          </ol>
          <p className="hint">
            Already installed? Open the panel from here:
          </p>
          <OpenSidePanelButton className="side-panel-btn" />
          <h2>Without the side panel</h2>
          <p className="hint">
            A bookmark can still send a job, but Chrome will not split the
            window this way without the extension.
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
