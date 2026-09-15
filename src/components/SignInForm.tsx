"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useActionState } from "react";
import { signin, type AuthFormState } from "@/app/actions/auth";

export default function SignInForm({ next = "/" }: { next?: string }) {
  const [state, action, pending] = useActionState(
    signin,
    undefined as AuthFormState | undefined,
  );

  useEffect(() => {
    if (state?.redirectTo) {
      window.location.assign(state.redirectTo);
    }
  }, [state]);

  const busy = pending || Boolean(state?.redirectTo);

  return (
    <form className="auth-form" action={action}>
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@email.com"
          required
        />
        {state?.errors?.email && (
          <p className="field-error">{state.errors.email[0]}</p>
        )}
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        {state?.errors?.password && (
          <p className="field-error">{state.errors.password[0]}</p>
        )}
      </div>
      {state?.message && <p className="error">{state.message}</p>}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="auth-switch">
        New here? <Link href="/signup">Create an account</Link>
      </p>
      <p className="auth-switch">
        <Link href="/extension">Send a job from any tab</Link>
      </p>
    </form>
  );
}
