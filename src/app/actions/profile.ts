"use server";

import { requireSession } from "@/app/actions/auth";
import { parseProfileDraft } from "@/lib/profile";
import { saveUserProfile } from "@/lib/users";
import type { CandidateProfile } from "@/lib/types";

export async function saveProfile(profile: CandidateProfile) {
  const session = await requireSession();
  const parsed = parseProfileDraft(profile);
  if (!parsed) throw new Error("Invalid profile.");
  await saveUserProfile(session.userId, parsed);
}
