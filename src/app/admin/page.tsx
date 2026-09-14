import { connection } from "next/server";
import AdminPanel from "@/components/AdminPanel";
import SiteHeader from "@/components/SiteHeader";
import { listAdminTailorRecords } from "@/lib/admin-records";
import { requireAdmin } from "@/lib/dal";
import { getSettings } from "@/lib/settings";
import { listPublicUsers } from "@/lib/users";
import { parsePageStyle } from "@/lib/appearance";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Database | Resume Tailor",
  description: "Administrator database for accounts, profiles, and tailoring records.",
};

export default async function AdminPage() {
  await connection();
  const { session, user } = await requireAdmin();
  const [users, records, settings] = await Promise.all([
    listPublicUsers(),
    listAdminTailorRecords(),
    getSettings(),
  ]);

  return (
    <div className="page">
      <div className="atmosphere" aria-hidden />
      <SiteHeader
        name={session.name}
        email={session.email}
        isAdmin
        current="admin"
        pageStyle={parsePageStyle(user.pageStyle)}
      />
      <main className="main admin-main">
        <AdminPanel
          adminId={user.id}
          initialUsers={users}
          initialRecords={records}
          defaultRole={settings.defaultRole}
          defaultPriority={settings.defaultPriority}
        />
      </main>
    </div>
  );
}
