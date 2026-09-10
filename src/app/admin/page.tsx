import AdminPanel from "@/components/AdminPanel";
import SiteHeader from "@/components/SiteHeader";
import { listAdminTailorRecords } from "@/app/actions/admin";
import { requireAdmin } from "@/app/actions/auth";
import { getSettings } from "@/lib/settings";
import { listPublicUsers } from "@/lib/users";

export const metadata = {
  title: "Admin | Resume Tailor",
  description: "Administrator database for accounts, profiles, and tailoring records.",
};

export default async function AdminPage() {
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
