"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/app/actions/auth";
import {
  getSettings,
  saveSettings,
  toPublicSettings,
  type PublicSettings,
} from "@/lib/settings";

const settingsSchema = z.object({
  defaultRole: z.enum(["admin", "user"]),
  defaultPriority: z.enum(["able", "disable"]),
  allowSignup: z.boolean(),
  llmModel: z.string().trim().max(120),
  openRouterApiKey: z.string().optional(),
});

export async function loadSettings(): Promise<PublicSettings> {
  await requireAdmin();
  return toPublicSettings(await getSettings());
}

export async function updateSettings(input: {
  defaultRole: "admin" | "user";
  defaultPriority: "able" | "disable";
  allowSignup: boolean;
  llmModel: string;
  openRouterApiKey?: string;
}): Promise<PublicSettings> {
  await requireAdmin();
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid settings.");
  }
  const saved = await saveSettings(parsed.data);
  revalidatePath("/admin");
  revalidatePath("/admin/settings");
  revalidatePath("/signup");
  return toPublicSettings(saved);
}
