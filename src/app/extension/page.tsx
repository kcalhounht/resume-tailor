import Link from "next/link";

const STORE_URL = process.env.NEXT_PUBLIC_CHROME_WEBSTORE_URL?.trim() || "";

export const dynamic = "force-dynamic";

export default function ExtensionInstallPage() {
  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <main className="auth-main">
        <div className="auth-card install-card">
          <p className="brand">Resume Tailor</p>
          <h1>Add the Chrome extension</h1>
          <p className="hint">
            Chrome cannot install an extension from this website in one click
            unless it is listed in the Chrome Web Store. Until then, download
            the zip and load it unpacked.
          </p>

          {STORE_URL ? (
            <p>
              <a className="primary install-store-btn" href={STORE_URL}>
                Add to Chrome
              </a>
            </p>
          ) : null}

          <p>
            <a
              className={
                STORE_URL ? "text-btn" : "primary install-store-btn"
              }
              href="/resume-tailor-extension.zip"
              download
            >
              Download extension zip
            </a>
          </p>

          <h2>Then load it</h2>
          <ol className="install-steps">
            <li>Unzip <code>resume-tailor-extension.zip</code>.</li>
            <li>
              In the address bar open <code>chrome://extensions</code> (Edge:{" "}
              <code>edge://extensions</code>).
            </li>
            <li>Turn on <strong>Developer mode</strong>.</li>
            <li>
              Click <strong>Load unpacked</strong> and select the unzipped
              folder (the one that contains <code>manifest.json</code>).
            </li>
            <li>
              Return here and click <strong>Open in side panel</strong>.
            </li>
          </ol>

          <p className="auth-switch">
            <Link href="/signin">Back to sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
