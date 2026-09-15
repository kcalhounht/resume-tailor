import Link from "next/link";
import { CaptureBookmarklet } from "@/components/CaptureBookmarklet";

const STORE_URL = process.env.NEXT_PUBLIC_CHROME_WEBSTORE_URL?.trim() || "";
const ADD_HREF = STORE_URL || "/api/extension/zip";

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
            The right-hand panel is a browser feature. Add Resume Tailor to
            Chrome first. Then click its avatar next to Acrobat — not a button
            on this website.
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
          <p>
            <a
              className="primary install-store-btn"
              href={ADD_HREF}
              {...(STORE_URL
                ? {}
                : { download: "resume-tailor-extension.zip" })}
            >
              Add to Chrome
            </a>
          </p>
          <ol className="install-steps">
            <li>
              {STORE_URL ? (
                <>Click <strong>Add to Chrome</strong> and confirm.</>
              ) : (
                <>
                  Click <strong>Add to Chrome</strong> to download the zip. Open{" "}
                  <code>chrome://extensions</code>, turn on Developer mode,{" "}
                  <strong>Load unpacked</strong>, and choose the unzipped{" "}
                  <code>extension</code> folder.
                </>
              )}
            </li>
            <li>
              Puzzle piece on the toolbar → pin the <strong>Resume Tailor</strong>{" "}
              avatar.
            </li>
            <li>
              Click that avatar. Chrome docks Resume Tailor on the right.
            </li>
          </ol>
          <h2>Without the side panel</h2>
          <p className="hint">
            A bookmark can still send a job, but it will not split the window
            like Acrobat.
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
