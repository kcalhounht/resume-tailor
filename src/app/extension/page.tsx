import Link from "next/link";
import { CaptureBookmarklet } from "@/components/CaptureBookmarklet";
import { OpenSidePanelButton } from "@/components/OpenSidePanelButton";

export const dynamic = "force-dynamic";

export default function ExtensionInstallPage() {
  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <main className="auth-main">
        <div className="auth-card install-card">
          <p className="brand">Resume Tailor</p>
          <h1>Use it beside any job tab</h1>
          <p className="hint">
            Chrome will not let a website install an extension, and most people
            cannot turn on Developer mode. Drag this bookmark instead.
          </p>
          <CaptureBookmarklet className="primary install-store-btn bookmarklet-btn" />
          <ol className="install-steps">
            <li>
              Show the bookmarks bar (<code>Ctrl+Shift+B</code> or{" "}
              <code>⌘+Shift+B</code>).
            </li>
            <li>
              Drag <strong>Send job to Resume Tailor</strong> onto that bar.
            </li>
            <li>
              Open a job posting, then click the bookmark. Resume Tailor opens
              on the right with the posting filled in. Allow popups if asked.
            </li>
          </ol>
          <p className="hint">
            Try it on a{" "}
            <Link href="/extension/sample">sample job posting</Link> after you
            add the bookmark.
          </p>
          <p className="hint">
            Already signed in? <strong>Open on the right</strong> puts this app
            in a side window.
          </p>
          <OpenSidePanelButton className="side-panel-btn" />
          <p className="auth-switch">
            <Link href="/signin">Back to sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
