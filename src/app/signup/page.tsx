import Link from "next/link";
import { connection } from "next/server";
import SignUpForm from "@/components/SignUpForm";
import { getSession } from "@/app/actions/auth";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/settings";
import { hasAnyUser } from "@/lib/users";

export default async function SignUpPage() {
  await connection();
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
  const session = await getSession();

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
              {session ? (
                <p className="hint">
                  You are signed in as {session.email}. Signing up will switch
                  to the new account.
                </p>
              ) : null}
              <SignUpForm />
            </>
          )}
        </div>
      </main>
    </div>
  );
}
