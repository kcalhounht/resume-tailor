import { z } from "zod";
import type { CandidateProfile } from "./types";

const personalSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().min(1, "Phone is required"),
  linkedin: z.string().trim().min(1, "LinkedIn URL is required"),
  email: z.string().trim().email("Valid email is required"),
  location: z.string().trim().min(1, "Location is required"),
});

const experienceSchema = z.object({
  company: z.string().trim().min(1, "Company is required"),
  title: z.string().trim().min(1, "Title is required"),
  period: z.string().trim().min(1, "Period is required"),
  location: z.string().trim().min(1, "Experience location is required"),
});

const educationSchema = z.object({
  school: z.string().trim().min(1, "School is required"),
  degree: z.string().trim().min(1, "Degree is required"),
  discipline: z.string().trim().min(1, "Discipline is required"),
  period: z.string().trim().min(1, "Education period is required"),
  location: z.string().trim().optional().default(""),
});

export const candidateProfileSchema = z.object({
  personal: personalSchema,
  experiences: z.array(experienceSchema).min(1, "Add at least one experience"),
  education: z.array(educationSchema).min(1, "Add at least one education entry"),
});

/** Allows incomplete drafts so users can save personal info before generating. */
export const draftProfileSchema = z.object({
  personal: z.object({
    name: z.string(),
    phone: z.string(),
    linkedin: z.string(),
    email: z.string(),
    location: z.string(),
  }),
  experiences: z
    .array(
      z.object({
        company: z.string(),
        title: z.string(),
        period: z.string(),
        location: z.string(),
      }),
    )
    .min(1, "Add at least one experience"),
  education: z
    .array(
      z.object({
        school: z.string(),
        degree: z.string(),
        discipline: z.string().optional().default(""),
        period: z.string(),
        location: z.string(),
      }),
    )
    .min(1, "Add at least one education entry"),
});

export const tailorRequestSchema = z
  .object({
    /** profile_jd = form profile + JD; resume_pdf = uploaded resume PDF + JD */
    mode: z.enum(["profile_jd", "resume_pdf"]).default("profile_jd"),
    /** Placeholder ids such as manual://pasted-job-1 */
    jobUrls: z.array(z.string().trim().min(1)).min(1),
    indices: z.array(z.number().int().positive()).optional(),
    /** Pasted JD text per job (required, ≥ ~80 chars each) */
    manualJds: z.array(z.string()).min(1),
    /** Required for profile_jd mode */
    profile: candidateProfileSchema.optional(),
    /** Base64 PDF (optionally data-URL prefixed). Required for resume_pdf mode */
    resumePdfBase64: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.indices && value.indices.length !== value.jobUrls.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "indices length must match jobUrls length",
        path: ["indices"],
      });
    }
    if (value.manualJds.length !== value.jobUrls.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "manualJds length must match jobUrls length",
        path: ["manualJds"],
      });
    }

    value.manualJds.forEach((jd, i) => {
      if (jd.trim().length < 80) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Each job needs pasted JD text of at least ~80 characters",
          path: ["manualJds", i],
        });
      }
    });

    if (value.mode === "profile_jd") {
      if (!value.profile) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Profile is required for JD-only mode",
          path: ["profile"],
        });
      }
    }

    if (value.mode === "resume_pdf") {
      if (!value.resumePdfBase64?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Upload a resume PDF for resume + JD mode",
          path: ["resumePdfBase64"],
        });
      }
    }
  });

export type TailorRequest = {
  mode: "profile_jd" | "resume_pdf";
  jobUrls: string[];
  indices?: number[];
  manualJds: string[];
  profile?: CandidateProfile;
  resumePdfBase64?: string;
};

export function parseTailorRequest(body: unknown): TailorRequest {
  return tailorRequestSchema.parse(body) as TailorRequest;
}
