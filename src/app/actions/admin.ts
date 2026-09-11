"use server";

import { z } from "zod";
import { requireAdmin } from "@/app/actions/auth";
import { hashPassword } from "@/lib/password";
import { parseProfileDraft } from "@/lib/profile";
import { deleteJobOutput } from "@/lib/package";
import {
  deleteTailorRecord,
  deleteTailorRecordsForUser,
  listTailorRecords,
  type TailorRecord,
} from "@/lib/tailor-records";
import {
  createUser,
  deleteUser,
  listPublicUsers,
  profileFromUser,
  saveUserProfile,
  updateUserAccount,
  type PublicUser,
  type UserPriority,
  type UserRole,
} from "@/lib/users";
import type { CandidateProfile } from "@/lib/types";

export type AdminTailorRecord = TailorRecord & {
  userName: string;
  userEmail: string;
};

async function toAdminRecords(
  records: TailorRecord[],
): Promise<AdminTailorRecord[]> {
  const users = await listPublicUsers();
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

const accountSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  email: z.email("Enter a valid email."),
  role: z.enum(["admin", "user"]),
  priority: z.enum(["able", "disable"]),
  password: z.string().optional(),
});

export async function createAccount(input: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  priority: UserPriority;
}): Promise<PublicUser> {
  await requireAdmin();
  const parsed = accountSchema
    .extend({
      password: z.string().min(8, "Password must be at least 8 characters."),
    })
    .safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid account.");
  }
  const user = await createUser({
    name: parsed.data.name,
    email: parsed.data.email,
    passwordHash: await hashPassword(parsed.data.password),
    role: parsed.data.role,
    priority: parsed.data.priority,
  });
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    priority: user.priority,
    createdAt: user.createdAt,
    profile: profileFromUser(user),
  };
}

export async function updateAccount(
  userId: string,
  input: {
    name: string;
    email: string;
    role: UserRole;
    priority: UserPriority;
    password?: string;
  },
): Promise<PublicUser> {
  const { user: admin } = await requireAdmin();
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid account.");
  }
  if (parsed.data.password && parsed.data.password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  if (admin.id === userId && parsed.data.role !== "admin") {
    throw new Error("You cannot remove your own administrator access.");
  }
  if (admin.id === userId && parsed.data.priority === "disable") {
    throw new Error("You cannot disable your own account.");
  }
  return updateUserAccount(userId, {
    name: parsed.data.name,
    email: parsed.data.email,
    role: parsed.data.role,
    priority: parsed.data.priority,
    passwordHash: parsed.data.password
      ? await hashPassword(parsed.data.password)
      : undefined,
  });
}

export async function removeAccount(userId: string): Promise<void> {
  const { user: admin } = await requireAdmin();
  if (admin.id === userId) {
    throw new Error("You cannot delete your own account.");
  }
  const records = await deleteTailorRecordsForUser(userId);
  await Promise.all(
    records.map((record) =>
      deleteJobOutput({
        folderName: record.folderName,
        zipName: record.zipName,
      }),
    ),
  );
  await deleteUser(userId);
}

export async function listAdminTailorRecords(): Promise<AdminTailorRecord[]> {
  await requireAdmin();
  return toAdminRecords(await listTailorRecords());
}

export async function removeTailorRecord(recordId: string): Promise<void> {
  await requireAdmin();
  const record = await deleteTailorRecord(recordId);
  if (!record) throw new Error("Tailoring record not found.");
  await deleteJobOutput({
    folderName: record.folderName,
    zipName: record.zipName,
  });
}

export async function clearUserTailorRecords(userId: string): Promise<void> {
  await requireAdmin();
  const records = await deleteTailorRecordsForUser(userId);
  await Promise.all(
    records.map((record) =>
      deleteJobOutput({
        folderName: record.folderName,
        zipName: record.zipName,
      }),
    ),
  );
}

export async function saveAccountProfile(
  userId: string,
  profile: CandidateProfile,
): Promise<void> {
  await requireAdmin();
  const parsed = parseProfileDraft(profile);
  if (!parsed) throw new Error("Invalid profile.");
  await saveUserProfile(userId, parsed);
}

