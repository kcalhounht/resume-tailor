"use server";

import { requireAbleUser } from "@/app/actions/auth";
import { parseProfileDraft, profileBlockReason } from "@/lib/profile";
import { saveUserProfile } from "@/lib/users";
import type { CandidateProfile } from "@/lib/types";

export async function saveProfile(profile: CandidateProfile) {
  const user = await requireAbleUser();
  const parsed = parseProfileDraft(profile);
  if (!parsed) throw new Error("Invalid profile.");
  const reason = profileBlockReason(parsed);
  if (reason) throw new Error(reason);
  await saveUserProfile(user.id, parsed);
}
