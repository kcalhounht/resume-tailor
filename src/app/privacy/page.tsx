export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <main className="auth-main">
        <div className="auth-card">
          <p className="brand">Resume Tailor</p>
          <h1>Privacy</h1>
          <p className="hint">
            The <strong>Send job to Resume Tailor</strong> bookmark reads the
            job posting in the current tab when you click it, then opens Resume
            Tailor on the right with that text in Generate resume. If you later
            install the optional Chrome extension, it reads the current tab only
            when you click <strong>Use this tab</strong>. In both cases the text
            is sent only to this Resume Tailor site. Nothing is sold, and there
            is no analytics SDK.
          </p>
        </div>
      </main>
    </div>
  );
}
