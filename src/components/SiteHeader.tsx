import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";

export default function SiteHeader({
  name,
  email,
  isAdmin = false,
  current = "home",
}: {
  name: string;
  email: string;
  isAdmin?: boolean;
  current?: "home" | "admin";
}) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand-block">
          <p className="brand">Resume Tailor</p>
          <p className="brand-sub">
            ATS packets from your background and a job description
          </p>
        </div>
        <div className="session-box">
          <p className="session-name">{name}</p>
          <p className="session-email">{email}</p>
          <div className="session-actions">
            {current === "admin" ? (
              <Link href="/" className="text-btn">
                Home
              </Link>
            ) : isAdmin ? (
              <Link href="/admin" className="text-btn">
                Admin
              </Link>
            ) : null}
            <SignOutButton />
          </div>
        </div>
      </div>
    </header>
  );
}
