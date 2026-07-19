import ResumeForm from "@/components/ResumeForm";
import AuthBar from "@/components/AuthBar";

export default function Home() {
  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />

      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand-block">
            <p className="brand">Resume Tailor</p>
            <p className="brand-sub">
              Enter your profile, paste a JD, get ATS packets
            </p>
          </div>
          <AuthBar />
        </div>
      </header>

      <main className="main">
        <ResumeForm />
      </main>
    </div>
  );
}
