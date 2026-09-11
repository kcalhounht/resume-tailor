import SignInForm from "@/components/SignInForm";

function safeNextPath(value: string | string[] | undefined): string {
  const next = Array.isArray(value) ? value[0] : value;
  if (!next?.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return "/";
  }
  if (next.includes("://")) return "/";
  if (next.startsWith("/signin") || next.startsWith("/signup")) return "/";
  if (next.startsWith("/api/")) return "/";
  return next;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; cleared?: string | string[] }>;
}) {
  const params = await searchParams;
  const cleared = params.cleared === "1" || params.cleared?.[0] === "1";
  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <main className="auth-main">
        <div className="auth-card">
          <p className="brand">Resume Tailor</p>
          <h1>Sign in</h1>
          <p className="hint">
            {cleared
              ? "Signed out. Use your email and password to continue."
              : "Use your account to open Profile and Generate resume."}
          </p>
          <SignInForm next={safeNextPath(params.next)} />
        </div>
      </main>
    </div>
  );
}
