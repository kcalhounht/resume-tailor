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
            Regular users should install from the Chrome Web Store. Chrome does
            not let a website load an unpacked folder for everyone.
          </p>

          {STORE_URL ? (
            <p>
              <a className="primary install-store-btn" href={STORE_URL}>
                Add to Chrome
              </a>
            </p>
          ) : (
            <p className="hint">
              The store listing is not linked yet. After the site owner publishes
              the extension, this page will show an <strong>Add to Chrome</strong>{" "}
              button.
            </p>
          )}

          <h2>If you run this site</h2>
          <ol className="install-steps">
            <li>
              Zip the extension: <code>npm run extension:zip</code>
            </li>
            <li>
              Open the{" "}
              <a href="https://chrome.google.com/webstore/devconsole">
                Chrome Web Store developer dashboard
              </a>{" "}
              (one-time developer fee).
            </li>
            <li>
              Upload <code>resume-tailor-extension.zip</code>, submit for review,
              and set the item visibility to public or unlisted.
            </li>
            <li>
              On Vercel, set{" "}
              <code>NEXT_PUBLIC_CHROME_WEBSTORE_URL</code> to the listing URL.
              Users then click <strong>Add to Chrome</strong> and{" "}
              <strong>Open in side panel</strong>.
            </li>
          </ol>

          <h2>Tester fallback</h2>
          <p className="hint">
            Load unpacked still works for you, but most people cannot use it.
            Testers can{" "}
            <a href="/api/extension/zip">download the zip</a>, unzip it, then
            on <code>chrome://extensions</code> enable Developer mode and Load
            unpacked.
          </p>

          <p className="auth-switch">
            <Link href="/signin">Back to sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
