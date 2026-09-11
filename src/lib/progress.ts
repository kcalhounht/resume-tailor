export const JOB_STEPS = [
  "extracting",
  "generating",
  "validating",
  "zipping",
] as const;

export type JobStep = (typeof JOB_STEPS)[number];

export const JOB_STEP_LABELS: Record<JobStep, string> = {
  extracting: "Extracting JD",
  generating: "Generating resume",
  validating: "Validating content",
  zipping: "Zipping package",
};

export type ProgressEvent =
  | {
      type: "step";
      index: number;
      step: JobStep;
      message: string;
    }
  | {
      type: "job_done";
      index: number;
      company: string;
      zipName: string;
      folderName: string;
      resumeDocxName: string;
      resumePdfName: string;
      coverLetterDocxName: string;
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
      };
      /** Inline file bytes when the server filesystem is ephemeral (e.g. Vercel). */
      downloads?: {
        zipBase64: string;
        resumeDocxBase64: string;
        coverLetterDocxBase64: string;
      };
    }
  | {
      type: "job_error";
      index: number;
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

export const IMPORT_STEPS = ["read", "extract", "fill"] as const;

export type ImportStep = (typeof IMPORT_STEPS)[number];

export const IMPORT_STEP_LABELS: Record<ImportStep, string> = {
  read: "Reading PDF",
  extract: "Extracting profile",
  fill: "Filling fields",
};

export const IMPORT_STEP_PERCENT: Record<ImportStep, number> = {
  read: 28,
  extract: 72,
  fill: 100,
};

export type ImportProgressEvent =
  | {
      type: "step";
      step: ImportStep;
      percent: number;
      message: string;
    }
  | {
      type: "done";
      percent: 100;
      profile: unknown;
      source: "llm" | "text";
    }
  | {
      type: "error";
      error: string;
    };
