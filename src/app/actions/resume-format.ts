"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAbleUser } from "@/app/actions/auth";
import {
  parseResumeFormat,
  resumeFormatCookieOptions,
  RESUME_FORMAT_COOKIE,
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
  (await cookies()).set(
    RESUME_FORMAT_COOKIE,
    JSON.stringify(resumeFormat),
    resumeFormatCookieOptions(),
  );
  revalidatePath("/");
  return { resumeFormat };
}
