import type { PersonalInfo, TailoredResume } from "./types";

export const JOB_STEPS = [
  "scraping",
  "fetch_jd",
  "extracting",
  "generating",
  "validating",
  "zipping",
] as const;

export type JobStep = (typeof JOB_STEPS)[number];

export const JOB_STEP_LABELS: Record<JobStep, string> = {
  scraping: "Loading JD text",
  fetch_jd: "Reading job description",
  extracting: "Extracting JD",
  generating: "Generating resume",
  validating: "Validating content",
  zipping: "Zipping package",
};

export type ProgressEvent =
  | {
      type: "step";
      index: number;
      jobUrl: string;
      step: JobStep;
      message: string;
    }
  | {
      type: "job_done";
      index: number;
      jobUrl: string;
      company: string;
      zipName: string;
      folderName: string;
      resumeDocxName: string;
      resumePdfName: string;
      coverLetterDocxName: string;
      coverLetterTxtName?: string;
      atsScore: number;
      atsSummary: string;
      extracted: {
        company: string;
        jobTitle: string;
        summary: string;
        type: string;
        salaryExpectation: string;
        workMode: string;
        hardTechnicalSkills: string[];
        softSkills: string[];
        mustHave: string[];
        niceToHave: string[];
        qualifications: string[];
        responsibilities: string[];
        requiredSkills: string[];
        yearsOfExperience: string;
        educationRequirements: string;
        benefits: string[];
        locationRequirement: string;
      };
      /** Tailored resume content for in-UI preview */
      resume: TailoredResume;
      coverLetter: string;
      personal: PersonalInfo;
      /** Inline file bytes when the server filesystem is ephemeral (e.g. Vercel). */
      downloads?: {
        zipBase64?: string;
        resumeDocxBase64: string;
        resumePdfBase64: string;
        coverLetterDocxBase64: string;
        coverLetterTxtBase64?: string;
      };
    }
  | {
      /** File bytes sent after job_done so a large payload can't kill the success event. */
      type: "job_files";
      index: number;
      jobUrl: string;
      resumeDocxName: string;
      resumePdfName: string;
      coverLetterDocxName: string;
      coverLetterTxtName?: string;
      zipName: string;
      downloads: {
        zipBase64?: string;
        resumeDocxBase64: string;
        resumePdfBase64: string;
        coverLetterDocxBase64: string;
        coverLetterTxtBase64?: string;
      };
    }
  | {
      type: "job_error";
      index: number;
      jobUrl: string;
      step?: JobStep;
      error: string;
    }
  | {
      type: "done";
      succeeded: number;
      failed: number;
    }
  | {
      type: "fatal";
      error: string;
    };
