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
            The Resume Tailor browser extension reads the job posting on the
            current tab only when you click <strong>Use this tab</strong>. That
            text is sent to the Resume Tailor site you are signed into so it can
            fill Generate resume. The extension does not sell data, does not
            include analytics, and does not send page contents anywhere else.
          </p>
        </div>
      </main>
    </div>
  );
}
