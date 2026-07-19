import AuthBar from "@/components/AuthBar";
import ProfileForm from "@/components/ProfileForm";

export default function ProfilePage() {
  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />

      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-block">
            <p className="brand">Resume Tailor</p>
            <p className="brand-sub">Your profile</p>
          </div>
          <AuthBar />
        </div>
      </header>

      <main className="main">
        <ProfileForm />
      </main>
    </div>
  );
}
