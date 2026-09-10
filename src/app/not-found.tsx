import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <main className="auth-main">
        <div className="auth-card">
          <p className="brand">Resume Tailor</p>
          <h1>Page not found</h1>
          <p className="hint">That address is not a page in Resume Tailor.</p>
          <p className="auth-switch">
            <Link href="/">Back to Home</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
