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
            The Chrome extension reads the job posting in the current tab when
            you open the side panel or click <strong>Use this tab</strong>, then
            sends that text only to this Resume Tailor site. The optional
            bookmark does the same when you click it. Nothing is sold, and there
            is no analytics SDK.
          </p>
        </div>
      </main>
    </div>
  );
}
