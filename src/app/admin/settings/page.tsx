import AdminSettings from "@/components/AdminSettings";
import SiteHeader from "@/components/SiteHeader";
import { requireAdmin } from "@/app/actions/auth";
import { getDefaultLlmModel } from "@/lib/llm";
import { getSettings, toPublicSettings } from "@/lib/settings";
import { parsePageStyle } from "@/lib/appearance";

export const metadata = {
  title: "Settings | Resume Tailor",
  description: "Administrator settings for accounts and generation.",
};

export default async function AdminSettingsPage() {
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
      </main>
    </div>
  );
}
