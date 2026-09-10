"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/app/actions/auth";
import {
  getSettings,
  saveSettings,
  type AppSettings,
} from "@/lib/settings";

const settingsSchema = z.object({
  defaultRole: z.enum(["admin", "user"]),
  defaultPriority: z.enum(["able", "disable"]),
  allowSignup: z.boolean(),
  llmModel: z.string().trim().max(120),
});

export async function loadSettings(): Promise<AppSettings> {
  await requireAdmin();
  return getSettings();
}

export async function updateSettings(input: AppSettings): Promise<AppSettings> {
  await requireAdmin();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid settings.");
  }
  const saved = await saveSettings(parsed.data);
  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  revalidatePath("/signup");
  return saved;
}
