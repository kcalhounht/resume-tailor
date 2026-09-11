import ResumeForm from "@/components/ResumeForm";
import SiteHeader from "@/components/SiteHeader";
import { requireSession } from "@/app/actions/auth";
import { findUserById, isAdminUser, isUserAble, profileFromUser } from "@/lib/users";
import { parsePageStyle } from "@/lib/appearance";
import { parseResumeFormat } from "@/lib/resume-format";

export default async function Home() {
  const session = await requireSession();
  const user = await findUserById(session.userId);

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <SiteHeader
        name={session.name}
        email={session.email}
        isAdmin={isAdminUser(user)}
        pageStyle={parsePageStyle(user?.pageStyle)}
      />
      <main className="main">
        <ResumeForm
          initialProfile={profileFromUser(user)}
          session={session}
          initialPageStyle={parsePageStyle(user?.pageStyle)}
          initialResumeFormat={parseResumeFormat(user?.resumeFormat)}
          canOperate={isUserAble(user)}
        />
      </main>
    </div>
  );
}
