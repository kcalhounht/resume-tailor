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
        <section className="composer" id="developer-chrome">
          <div className="section-head">
            <div>
              <h2>Get the avatar on this Chrome</h2>
              <p className="hint">
                There is no Web Store listing yet, so Add to Chrome cannot
                install for you or for users. Load unpacked on this computer,
                then pin Resume Tailor and click the avatar for the right-hand
                panel.
              </p>
            </div>
          </div>
          <ol className="install-steps">
            <li>
              <a href="/api/extension/zip" download="resume-tailor-extension.zip">
                Download the extension zip
              </a>
              and unzip it.
            </li>
            <li>
              Open <code>chrome://extensions</code>, turn on Developer mode,
              click Load unpacked, and choose that unzipped folder.
            </li>
            <li>
              Puzzle piece → pin <strong>Resume Tailor</strong>, then click
              that avatar.
            </li>
          </ol>
        </section>
      </main>
    </div>
  );
}
