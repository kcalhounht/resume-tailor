import { scoreAtsMatch } from "./ats-score";
import { extractJobDescription } from "./extract";
import { generateTailoredPackage } from "./generate";
import { saveJobPackage } from "./package";
import { validateAndFixResume } from "./validate-resume";
import type { JobStep } from "./progress";
import type { CandidateProfile, ExtractedJD, PersonalInfo, TailoredResume } from "./types";

export async function processOneJob(options: {
  index: number;
  jobUrl: string;
  profile: CandidateProfile;
  personal: PersonalInfo;
  /** Pasted JD text (required — scraping was removed) */
  manualJd?: string;
  /** Raw text from an uploaded resume (resume_pdf mode) */
  sourceResumeText?: string;
  onStep: (step: JobStep, message: string) => void;
}): Promise<{
  index: number;
  jobUrl: string;
  company: string;
  zipName: string;
  folderName: string;
  resumeDocxName: string;
  resumePdfName: string;
  coverLetterDocxName: string;
  extracted: ExtractedJD;
  atsScore: number;
  atsSummary: string;
  resume: TailoredResume;
  coverLetter: string;
  personal: PersonalInfo;
  downloads?: {
    zipBase64?: string;
    resumeDocxBase64: string;
    resumePdfBase64: string;
    coverLetterDocxBase64: string;
  };
}> {
  const {
    index,
    jobUrl,
    profile,
    personal,
    manualJd,
    sourceResumeText,
    onStep,
  } = options;

  onStep("scraping", "Loading pasted job description…");
  const pasted = manualJd?.trim() || "";
  if (pasted.length < 80) {
    throw new Error(
      "Paste at least ~80 characters of job description text. URL scraping is not available.",
    );
  }

  const rawText = pasted.slice(0, 50000);
  const pageTitle = `Pasted JD ${index}`;
  onStep(
    "fetch_jd",
    `Loaded JD (${rawText.length.toLocaleString()} chars)`,
  );

  onStep("extracting", "Extracting structured JD…");
  const extracted = await extractJobDescription(rawText, pageTitle, jobUrl);

  onStep(
    "generating",
    sourceResumeText
      ? "Tailoring uploaded resume to the JD (accuracy pass)…"
      : "Generating resume and cover letter (accuracy pass)…",
  );
  let tailored = await generateTailoredPackage(profile, extracted, rawText, {
    sourceResumeText,
  });

  onStep("validating", "Validating resume format and content…");
  const validation = validateAndFixResume(tailored, profile, extracted);
  tailored = validation.package;

  if (!validation.ok) {
    const critical = validation.issues
      .filter((i) => i.level === "error")
      .map((i) => i.message)
      .join("; ");
    if (!tailored.resume.summary || !tailored.coverLetter) {
      throw new Error(
        critical || "Resume failed validation after formatting fixes.",
      );
    }
  }

  const fixedCount = validation.issues.filter((i) => i.level === "fixed").length;
  const ats = scoreAtsMatch(tailored.resume, extracted, rawText);
  onStep(
    "zipping",
    `Validated${fixedCount ? ` (${fixedCount} fixes)` : ""} · ATS ${ats.score}/100 · packaging…`,
  );

  const saved = await saveJobPackage({
    index,
    extracted,
    personal,
    tailored,
  });

  return {
    index,
    jobUrl,
    company: saved.company,
    zipName: saved.zipName,
    folderName: saved.folderName,
    resumeDocxName: saved.resumeDocxName,
    resumePdfName: saved.resumePdfName,
    coverLetterDocxName: saved.coverLetterDocxName,
    extracted,
    atsScore: ats.score,
    atsSummary: `ATS score ${ats.score}/100`,
    resume: tailored.resume,
    coverLetter: tailored.coverLetter,
    personal,
    downloads: saved.downloads,
  };
}
