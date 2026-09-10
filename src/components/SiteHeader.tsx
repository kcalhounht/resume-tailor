import Link from "next/link";
import SignOutButton from "@/components/SignOutButton";

function NavItem({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: string;
}) {
  if (current) {
    return <span className="text-btn current">{children}</span>;
  }
  return (
    <Link href={href} className="text-btn">
      {children}
    </Link>
  );
}

export default function SiteHeader({
  name,
  email,
  isAdmin = false,
  current = "home",
}: {
  name: string;
  email: string;
  isAdmin?: boolean;
  current?: "home" | "admin" | "settings";
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
            <NavItem href="/" current={current === "home"}>
              Home
            </NavItem>
            {isAdmin ? (
              <>
                <NavItem href="/admin" current={current === "admin"}>
                  Database
                </NavItem>
                <NavItem href="/admin/settings" current={current === "settings"}>
                  Settings
                </NavItem>
              </>
            ) : null}
            <SignOutButton />
          </div>
        </div>
      </div>
    </header>
  );
}
