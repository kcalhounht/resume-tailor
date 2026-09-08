"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signin, type AuthFormState } from "@/app/actions/auth";

export default function SignInForm() {
  const [state, action, pending] = useActionState(
    signin,
    undefined as AuthFormState | undefined,
  );

  return (
    <form className="auth-form" action={action}>
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
      <button className="primary" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="auth-switch">
        New here? <Link href="/signup">Create an account</Link>
      </p>
    </form>
  );
}
