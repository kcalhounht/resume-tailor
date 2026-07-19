"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function AuthBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [username, setUsername] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (!cancelled && response.ok && data?.username) {
          setUsername(String(data.username));
          setIsAdmin(Boolean(data.isAdmin));
        }
      } catch {
        // ignore — middleware handles auth gate
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  async function onLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="auth-bar">
      {username && <span className="auth-user">{username}</span>}
      {username && (
        <>
          <Link
            href="/"
            className={
              pathname === "/"
                ? "ghost-btn auth-link auth-link-active"
                : "ghost-btn auth-link"
            }
          >
            Home
          </Link>
          <Link
            href="/profile"
            className={
              pathname === "/profile"
                ? "ghost-btn auth-link auth-link-active"
                : "ghost-btn auth-link"
            }
          >
            Profile
          </Link>
        </>
      )}
      {isAdmin && pathname !== "/admin" && (
        <Link href="/admin" className="ghost-btn auth-link">
          Database
        </Link>
      )}
      <button
        type="button"
        className="ghost-btn"
        onClick={() => void onLogout()}
        disabled={loggingOut}
      >
        {loggingOut ? "Signing out…" : "Log out"}
      </button>
    </div>
  );
}
