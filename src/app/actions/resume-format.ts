"use server";

import { revalidatePath } from "next/cache";
import { requireAbleUser } from "@/app/actions/auth";
import {
  parseResumeFormat,
  type ResumeFormat,
} from "@/lib/resume-format";
import { updateUserResumeFormat } from "@/lib/users";

export async function saveOwnResumeFormat(input: {
  font?: string;
  style?: string;
  accent?: string;
}): Promise<{ resumeFormat: ResumeFormat }> {
  const user = await requireAbleUser();
  const resumeFormat = await updateUserResumeFormat(
    user.id,
    parseResumeFormat(input),
  );
  revalidatePath("/");
  return { resumeFormat };
}
