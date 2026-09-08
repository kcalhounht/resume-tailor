"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signup, type AuthFormState } from "@/app/actions/auth";

export default function SignUpForm() {
  const [state, action, pending] = useActionState(
    signup,
    undefined as AuthFormState | undefined,
  );

  return (
    <form className="auth-form" action={action}>
      <div className="field">
        <label htmlFor="name">Name</label>
        <input
          id="name"
          name="name"
          autoComplete="name"
          placeholder="Jane Doe"
          required
        />
        {state?.errors?.name && (
          <p className="field-error">{state.errors.name[0]}</p>
        )}
      </div>
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
          autoComplete="new-password"
          placeholder="At least 8 characters"
          required
          minLength={8}
        />
        {state?.errors?.password && (
          <p className="field-error">{state.errors.password[0]}</p>
        )}
      </div>
      <div className="field">
        <label htmlFor="confirmPassword">Confirm password</label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="Re-enter your password"
          required
          minLength={8}
        />
        {state?.errors?.confirmPassword && (
          <p className="field-error">{state.errors.confirmPassword[0]}</p>
        )}
      </div>
      {state?.message && <p className="error">{state.message}</p>}
      <button className="primary" type="submit" disabled={pending}>
        {pending ? "Creating account…" : "Sign up"}
      </button>
      <p className="auth-switch">
        Already have an account? <Link href="/signin">Sign in</Link>
      </p>
    </form>
  );
}
