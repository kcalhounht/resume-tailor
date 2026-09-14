import { listTailorRecords, type TailorRecord } from "@/lib/tailor-records";
import { listPublicUsers } from "@/lib/users";

export type AdminTailorRecord = TailorRecord & {
  userName: string;
  userEmail: string;
};

export async function listAdminTailorRecords(): Promise<AdminTailorRecord[]> {
  const [users, records] = await Promise.all([
    listPublicUsers(),
    listTailorRecords(),
  ]);
  const byId = new Map(users.map((user) => [user.id, user]));
  return records.map((record) => {
    const user = byId.get(record.userId);
    return {
      ...record,
      userName: user?.name || "Deleted user",
      userEmail: user?.email || "",
    };
  });
}
