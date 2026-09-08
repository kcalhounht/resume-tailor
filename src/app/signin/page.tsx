import SignInForm from "@/components/SignInForm";

export default function SignInPage() {
  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <main className="auth-main">
        <div className="auth-card">
          <p className="brand">Resume Tailor</p>
          <h1>Sign in</h1>
          <p className="hint">Use your account to open Profile and Generate resume.</p>
          <SignInForm />
        </div>
      </main>
    </div>
  );
}
