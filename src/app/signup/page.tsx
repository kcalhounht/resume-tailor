import Link from "next/link";
import SignUpForm from "@/components/SignUpForm";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/settings";
import { hasAnyUser } from "@/lib/users";

export default async function SignUpPage() {
  let settings = DEFAULT_SETTINGS;
  let siteHasUser = false;
  try {
    [settings, siteHasUser] = await Promise.all([
      getSettings(),
      hasAnyUser(),
    ]);
  } catch {
    settings = DEFAULT_SETTINGS;
    siteHasUser = false;
  }
  const signupClosed = !settings.allowSignup && siteHasUser;

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <main className="auth-main">
        <div className="auth-card">
          <p className="brand">Resume Tailor</p>
          <h1>Create an account</h1>
          {signupClosed ? (
            <>
              <p className="hint">
                Public sign-up is turned off. Ask an administrator to create an
                account for you.
              </p>
              <p className="auth-switch">
                Already have an account? <Link href="/signin">Sign in</Link>
              </p>
            </>
          ) : (
            <>
              <p className="hint">
                Sign up to save your profile and generate tailored resumes.
              </p>
              <SignUpForm />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
