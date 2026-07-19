import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginRoute() {
  return (
    <Suspense
      fallback={
        <div className="page">
          <div className="atmosphere" aria-hidden />
          <main className="login-main">
            <div className="login-card">
              <p className="brand">Resume Tailor</p>
              <p className="brand-sub">Loading…</p>
            </div>
          </main>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
