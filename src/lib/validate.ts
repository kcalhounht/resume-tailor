import { z } from "zod";
import { MIN_JOB_DESCRIPTION_CHARS } from "./limits";
import { isValidProfileEmail, parseProfileDraft } from "./profile";
import type { CandidateProfile } from "./types";

const personalSchema = z.object({
  name: z.string().trim().min(2, "Name is required"),
  phone: z.string().trim().min(1, "Phone is required"),
  linkedin: z.string().trim().min(1, "LinkedIn is required"),
  portfolio: z.string().trim().optional().default(""),
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .refine(isValidProfileEmail, "Enter a valid email"),
  location: z.string().trim().min(1, "Location is required"),
});

const experienceSchema = z.object({
  id: z.string().optional(),
  company: z.string().trim().min(1, "Company is required"),
  title: z.string().trim().min(1, "Title is required"),
  period: z.string().trim().min(1, "Period is required"),
  location: z.string().trim().min(1, "Location is required"),
});

const educationSchema = z.object({
  id: z.string().optional(),
  school: z.string().trim().min(1, "School is required"),
  discipline: z.string().trim().min(1, "Discipline is required"),
  degree: z.string().trim().min(1, "Degree is required"),
  period: z.string().trim().min(1, "Education period is required"),
});

export const candidateProfileSchema = z.object({
  personal: personalSchema,
  experiences: z
    .array(experienceSchema)
    .min(1, "Add at least one work experience"),
  education: z
    .array(educationSchema)
    .min(1, "Add at least one education"),
});

export const tailorRequestSchema = z
  .object({
    profile: candidateProfileSchema,
    jobDescriptions: z
      .array(
        z
          .string()
          .trim()
          .min(
            MIN_JOB_DESCRIPTION_CHARS,
            `Each job description must be at least ${MIN_JOB_DESCRIPTION_CHARS} characters`,
          ),
      )
      .min(1),
    indices: z.array(z.number().int().positive()).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.indices && value.indices.length !== value.jobDescriptions.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "indices length must match jobDescriptions length",
        path: ["indices"],
      });
    }
  });

export function parseTailorRequest(body: unknown): {
  profile: CandidateProfile;
  jobDescriptions: string[];
  indices?: number[];
} {
  const parsed = tailorRequestSchema.parse(body);
  const profile = parseProfileDraft(parsed.profile);
  if (!profile) {
    throw new Error("Invalid profile");
  }
  return {
    profile,
    jobDescriptions: parsed.jobDescriptions,
    indices: parsed.indices,
  };
}
