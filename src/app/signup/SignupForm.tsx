"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SignupForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(
    () => username.trim().length >= 3 && password.length >= 6 && password === confirm,
    [username, password, confirm],
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Signup failed");
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <main className="login-main">
        <form className="login-card" onSubmit={onSubmit}>
          <div className="login-brand">
            <p className="brand">Resume Tailor</p>
            <p className="brand-sub">Create an account</p>
          </div>

          <label className="field">
            <span>Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              minLength={3}
              autoFocus
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
            />
          </label>

          <label className="field">
            <span>Confirm password</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              minLength={6}
            />
          </label>

          {error && <p className="error">{error}</p>}

          <button
            type="submit"
            className="primary login-submit"
            disabled={loading || !canSubmit}
          >
            {loading ? "Creating account…" : "Sign up"}
          </button>

          <p className="auth-switch">
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
