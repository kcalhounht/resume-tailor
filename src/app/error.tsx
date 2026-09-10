"use client";

import Link from "next/link";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <main className="auth-main">
        <div className="auth-card">
          <p className="brand">Resume Tailor</p>
          <h1>This page could not load</h1>
          <p className="hint">
            Try again. If it keeps failing, sign out and sign back in.
          </p>
          {error.digest ? (
            <p className="hint">Reference: {error.digest}</p>
          ) : null}
          <div className="error-actions">
            <button type="button" className="primary" onClick={() => unstable_retry()}>
              Try again
            </button>
            <Link href="/" className="text-btn">
              Home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
