"use client";

export default function Error({
  error,
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
            Try again, or sign in again if this keeps happening.
          </p>
          {error.digest ? (
            <p className="hint">Reference: {error.digest}</p>
          ) : null}
          <div className="error-actions">
            <a href="/api/auth/clear" className="primary">
              Sign in
            </a>
            <a href="/api/auth/clear" className="text-btn">
              Sign out
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
