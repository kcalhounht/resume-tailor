import { scoreAtsMatch } from "./ats-score";
import { extractJobDescription } from "./extract";
import { generateTailoredPackage } from "./generate";
import { saveJobPackage } from "./package";
import { MIN_JOB_DESCRIPTION_CHARS } from "./limits";
import { validateAndFixResume } from "./validate-resume";
import type { JobStep } from "./progress";
import type { CandidateProfile, ExtractedJD, PersonalInfo } from "./types";

export async function processOneJob(options: {
  index: number;
  jobDescription: string;
  profile: CandidateProfile;
  personal: PersonalInfo;
  outputSuffix?: string;
  onStep: (step: JobStep, message: string) => void;
}): Promise<{
  index: number;
  company: string;
  zipName: string;
  folderName: string;
  resumeDocxName: string;
  resumePdfName: string;
  coverLetterDocxName: string;
  extracted: ExtractedJD;
  atsScore: number;
  atsSummary: string;
  downloads?: {
    zipBase64: string;
    resumeDocxBase64: string;
    coverLetterDocxBase64: string;
  };
}> {
  const { index, profile, personal, outputSuffix, onStep } = options;
  const rawText = options.jobDescription.trim().slice(0, 50000);

  if (rawText.length < MIN_JOB_DESCRIPTION_CHARS) {
    throw new Error(
      `Paste at least ~${MIN_JOB_DESCRIPTION_CHARS} characters of the job description.`,
    );
  }

  onStep("extracting", "Extracting structured JD…");
  const extracted = await extractJobDescription(rawText);

  onStep("generating", "Generating resume & cover letter…");
  let tailored = await generateTailoredPackage(profile, extracted, rawText);

  onStep("validating", "Validating resume format and content…");
  let validation = validateAndFixResume(tailored, profile, extracted);

  if (!validation.ok) {
    onStep("validating", "Fixing validation issues and regenerating…");
    tailored = await generateTailoredPackage(profile, extracted, rawText);
    validation = validateAndFixResume(tailored, profile, extracted);
  }

  tailored = validation.package;

  if (!validation.ok) {
    const critical = validation.issues
      .filter((i) => i.level === "error")
      .map((i) => i.message)
      .join("; ");
    throw new Error(
      critical || "Resume failed validation after formatting fixes.",
    );
  }

  const fixedCount = validation.issues.filter((i) => i.level === "fixed").length;
  const ats = scoreAtsMatch(tailored.resume, extracted, rawText);
  onStep(
    "zipping",
    `Validated${fixedCount ? ` (${fixedCount} fixes)` : ""} · ATS ${ats.score}/100 · packaging…`,
  );

  const saved = await saveJobPackage({
    index,
    rawJd: rawText,
    extracted,
    personal,
    tailored,
    suffix: outputSuffix,
  });

  return {
    index,
    company: saved.company,
    zipName: saved.zipName,
    folderName: saved.folderName,
    resumeDocxName: saved.resumeDocxName,
    resumePdfName: saved.resumePdfName,
    coverLetterDocxName: saved.coverLetterDocxName,
    extracted,
    atsScore: ats.score,
    atsSummary: `ATS score ${ats.score}/100`,
    downloads: saved.downloads,
  };
}
