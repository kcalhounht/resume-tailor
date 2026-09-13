"use client";

import Link from "next/link";
import "./globals.css";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div className="page">
          <div className="atmosphere" aria-hidden />
          <main className="auth-main">
            <div className="auth-card">
              <p className="brand">Resume Tailor</p>
              <h1>Something went wrong</h1>
              <p className="hint">
                The app hit an unexpected error. Sign in again to continue.
              </p>
              {error.digest ? (
                <p className="hint">Reference: {error.digest}</p>
              ) : null}
              <Link href="/api/auth/clear" className="primary">
                Sign in
              </Link>
              <p className="hint">
                <Link href="/api/auth/clear">Sign out</Link>
              </p>
            </div>
          </main>
        </div>
      </body>
    </html>
  );
}
