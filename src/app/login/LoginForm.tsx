"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(() => {
    const value = searchParams.get("next");
    return value && value.startsWith("/") ? value : "/";
  }, [searchParams]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Login failed");
      }
      router.replace(nextPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
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
            <p className="brand-sub">Sign in to continue</p>
          </div>

          <label className="field">
            <span>Username</span>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              autoFocus
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          {error && <p className="error">{error}</p>}

          <button type="submit" className="primary login-submit" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <p className="auth-switch">
            New here? <Link href="/signup">Create an account</Link>
          </p>
        </form>
      </main>
    </div>
  );
}
