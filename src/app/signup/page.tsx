import SignUpForm from "@/components/SignUpForm";

export default function SignUpPage() {
  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <main className="auth-main">
        <div className="auth-card">
          <p className="brand">Resume Tailor</p>
          <h1>Create an account</h1>
          <p className="hint">
            Sign up to save your profile and generate tailored resumes.
          </p>
          <SignUpForm />
        </div>
      </main>
    </div>
  );
}
