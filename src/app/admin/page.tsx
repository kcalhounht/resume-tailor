import Link from "next/link";
import AuthBar from "@/components/AuthBar";
import AdminPanel from "@/components/AdminPanel";

export default function AdminPage() {
  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />

      <header className="topbar topbar-wide">
        <div className="topbar-inner">
          <div className="brand-block">
            <p className="brand">Resume Tailor</p>
            <p className="brand-sub">
              <Link href="/">← Back</Link>
              {" · "}
              Database management
            </p>
          </div>
          <AuthBar />
        </div>
      </header>

      <main className="main main-wide">
        <AdminPanel />
      </main>
    </div>
  );
}
