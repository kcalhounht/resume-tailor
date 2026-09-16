import { connection } from "next/server";
import AdminSettings from "@/components/AdminSettings";
import SiteHeader from "@/components/SiteHeader";
import { requireAdmin } from "@/lib/dal";
import { getDefaultLlmModel } from "@/lib/llm";
import { getSettings, toPublicSettings } from "@/lib/settings";
import { parsePageStyle } from "@/lib/appearance";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Settings | Resume Tailor",
  description: "Administrator settings for accounts and generation.",
};

export default async function AdminSettingsPage() {
  await connection();
  const { session, user } = await requireAdmin();
  const settings = await getSettings();

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <SiteHeader
        name={session.name}
        email={session.email}
        isAdmin
        current="settings"
        pageStyle={parsePageStyle(user.pageStyle)}
      />
      <main className="main admin-main">
        <AdminSettings
          initialSettings={toPublicSettings(settings)}
          defaultLlmModel={getDefaultLlmModel()}
        />
        <section className="composer">
          <div className="section-head">
            <div>
              <h2>Developer Chrome</h2>
              <p className="hint">
                Only you Load unpacked. Signed-in users click Add to Chrome and
                confirm in Chrome — they never use this zip.
              </p>
            </div>
          </div>
          <p className="hint">
            <a href="/api/extension/zip" download="resume-tailor-extension.zip">
              Download the extension zip
            </a>
            , then chrome://extensions → Developer mode → Load unpacked.
          </p>
        </section>
      </main>
    </div>
  );
}
