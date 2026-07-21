"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  JOB_STEPS,
  JOB_STEP_LABELS,
  type JobStep,
  type ProgressEvent,
} from "@/lib/progress";
import { EMPTY_PROFILE } from "@/lib/profile";
import type {
  CandidateProfile,
  EducationInput,
  ExperienceInput,
  PersonalInfo,
  TailoredResume,
} from "@/lib/types";
import {
  downloadFile,
  isDirectoryPickerSupported,
  pickDownloadFolder,
  type DownloadFolderHandle,
} from "@/lib/download-folder";
import { splitJobDescriptions } from "@/lib/split-jds";
import ResumePreview from "@/components/ResumePreview";

type StepStatus = "pending" | "active" | "done" | "error";

const EMPTY_EXPERIENCE: ExperienceInput = {
  company: "",
  title: "",
  period: "",
  location: "",
};

const EMPTY_EDUCATION: EducationInput = {
  school: "",
  degree: "",
  discipline: "",
  period: "",
  location: "",
};

function cloneProfile(profile: CandidateProfile): CandidateProfile {
  return {
    personal: { ...profile.personal },
    experiences: profile.experiences.map((exp) => ({ ...exp })),
    education: profile.education.map((edu) => ({ ...edu })),
  };
}

function validateProfile(profile: CandidateProfile): string | null {
  const { personal, experiences, education } = profile;
  if (!personal.name.trim()) return "Enter your full name.";
  if (!personal.email.trim()) return "Enter your email.";
  if (!personal.phone.trim()) return "Enter your phone number.";
  if (!personal.linkedin.trim()) return "Enter your LinkedIn URL.";
  if (!personal.location.trim()) return "Enter your location.";
  if (!experiences.length) return "Add at least one experience.";
  for (let i = 0; i < experiences.length; i++) {
    const exp = experiences[i];
    if (
      !exp.company.trim() ||
      !exp.title.trim() ||
      !exp.period.trim() ||
      !exp.location.trim()
    ) {
      return `Fill in all fields for experience #${i + 1}.`;
    }
  }
  if (!education.length) return "Add at least one education entry.";
  for (let i = 0; i < education.length; i++) {
    const edu = education[i];
    if (
      !edu.school.trim() ||
      !edu.degree.trim() ||
      !edu.discipline.trim() ||
      !edu.period.trim() ||
      !edu.location.trim()
    ) {
      return `Fill in all fields for education #${i + 1}.`;
    }
  }
  return null;
}

type JobProgress = {
  index: number;
  jobUrl: string;
  status: "queued" | "running" | "done" | "error";
  currentStep: JobStep | null;
  stepStatuses: Record<JobStep, StepStatus>;
  stepMessage: string;
  company?: string;
  zipName?: string;
  folderName?: string;
  resumeDocxName?: string;
  resumePdfName?: string;
  coverLetterDocxName?: string;
  jobTitle?: string;
  atsScore?: number;
  sourceJd?: string;
  error?: string;
  downloadUrls?: {
    zip: string;
    resumeDocx: string;
    resumePdf: string;
    coverLetterDocx: string;
  };
  resume?: TailoredResume;
  coverLetter?: string;
  personal?: PersonalInfo;
};

const STEP_SHORT: Record<JobStep, string> = {
  scraping: "Load",
  fetch_jd: "Read",
  extracting: "Extract",
  generating: "Generate",
  validating: "Validate",
  zipping: "Zip",
};

function initialStepStatuses(): Record<JobStep, StepStatus> {
  return {
    scraping: "pending",
    fetch_jd: "pending",
    extracting: "pending",
    generating: "pending",
    validating: "pending",
    zipping: "pending",
  };
}

function createJobProgress(
  index: number,
  jobUrl: string,
  sourceJd?: string,
): JobProgress {
  return {
    index,
    jobUrl,
    status: "queued",
    currentStep: null,
    stepStatuses: initialStepStatuses(),
    stepMessage: "Queued",
    sourceJd,
  };
}

function markStepProgress(
  job: JobProgress,
  step: JobStep,
  message: string,
): JobProgress {
  const stepStatuses = { ...job.stepStatuses };
  const stepIndex = JOB_STEPS.indexOf(step);

  for (let i = 0; i < JOB_STEPS.length; i++) {
    const key = JOB_STEPS[i];
    if (i < stepIndex) stepStatuses[key] = "done";
    else if (i === stepIndex) stepStatuses[key] = "active";
    else if (stepStatuses[key] === "active") stepStatuses[key] = "pending";
  }

  return {
    ...job,
    status: "running",
    currentStep: step,
    stepStatuses,
    stepMessage: message,
    error: undefined,
  };
}

function base64ToObjectUrl(base64: string, mime: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

function FolderIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function resumeDocxUrl(job: JobProgress): string | null {
  if (!job.resumeDocxName) return null;
  if (job.downloadUrls?.resumeDocx) return job.downloadUrls.resumeDocx;
  if (!job.folderName) return null;
  return `/api/download?folder=${encodeURIComponent(job.folderName)}&name=${encodeURIComponent(job.resumeDocxName)}`;
}

function resumePdfUrl(job: JobProgress): string | null {
  if (!job.resumePdfName) return null;
  if (job.downloadUrls?.resumePdf) return job.downloadUrls.resumePdf;
  if (!job.folderName) return null;
  return `/api/download?folder=${encodeURIComponent(job.folderName)}&name=${encodeURIComponent(job.resumePdfName)}`;
}

function zipUrl(job: JobProgress): string | null {
  if (!job.zipName) return null;
  if (job.downloadUrls?.zip) return job.downloadUrls.zip;
  return `/api/download?file=${encodeURIComponent(job.zipName)}`;
}

function coverLetterDocxUrl(job: JobProgress): string | null {
  if (!job.coverLetterDocxName) return null;
  if (job.downloadUrls?.coverLetterDocx) return job.downloadUrls.coverLetterDocx;
  if (!job.folderName) return null;
  return `/api/download?folder=${encodeURIComponent(job.folderName)}&name=${encodeURIComponent(job.coverLetterDocxName)}`;
}

function markJobDone(
  job: JobProgress,
  data: Extract<ProgressEvent, { type: "job_done" }>,
): JobProgress {
  const stepStatuses = { ...job.stepStatuses };
  for (const step of JOB_STEPS) stepStatuses[step] = "done";

  const DOCX =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const downloadUrls = data.downloads
    ? {
        zip: base64ToObjectUrl(data.downloads.zipBase64, "application/zip"),
        resumeDocx: base64ToObjectUrl(data.downloads.resumeDocxBase64, DOCX),
        resumePdf: base64ToObjectUrl(
          data.downloads.resumePdfBase64,
          "application/pdf",
        ),
        coverLetterDocx: base64ToObjectUrl(
          data.downloads.coverLetterDocxBase64,
          DOCX,
        ),
      }
    : undefined;

  return {
    ...job,
    status: "done",
    currentStep: null,
    stepStatuses,
    stepMessage: "Complete",
    company: data.company,
    zipName: data.zipName,
    folderName: data.folderName,
    resumeDocxName: data.resumeDocxName,
    resumePdfName: data.resumePdfName,
    coverLetterDocxName: data.coverLetterDocxName,
    jobTitle: data.extracted.jobTitle,
    atsScore: data.atsScore,
    error: undefined,
    downloadUrls,
    resume: data.resume,
    coverLetter: data.coverLetter,
    personal: data.personal,
  };
}

function markJobError(
  job: JobProgress,
  data: Extract<ProgressEvent, { type: "job_error" }>,
): JobProgress {
  const stepStatuses = { ...job.stepStatuses };
  if (data.step) stepStatuses[data.step] = "error";

  return {
    ...job,
    status: "error",
    currentStep: data.step ?? job.currentStep,
    stepStatuses,
    stepMessage: data.error,
    error: data.error,
  };
}

function hostFromUrl(url: string) {
  if (url.startsWith("manual://")) return "Pasted JD";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3v12m0 0l4-4m-4 4l-4-4M5 21h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 4v6h6M20 20v-6h-6M5.5 9A7 7 0 0119 8m-.5 7A7 7 0 015 16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PreviewIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function StatusBadge({ status }: { status: JobProgress["status"] }) {
  const label =
    status === "queued"
      ? "Queued"
      : status === "running"
        ? "Running"
        : status === "done"
          ? "Done"
          : "Failed";
  return <span className={`badge badge-${status}`}>{label}</span>;
}

export default function ResumeForm() {
  const [profile, setProfile] = useState<CandidateProfile>(() =>
    cloneProfile(EMPTY_PROFILE),
  );
  const [profileLoading, setProfileLoading] = useState(true);
  const [inputMode, setInputMode] = useState<"profile_jd" | "resume_pdf">(
    "profile_jd",
  );
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [resumePdfBase64, setResumePdfBase64] = useState<string | null>(null);
  const [pastedJd, setPastedJd] = useState("");
  const [loading, setLoading] = useState(false);
  const [retryingIndices, setRetryingIndices] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobProgress[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [manualJds, setManualJds] = useState<Record<number, string>>({});
  const [previewJobIndex, setPreviewJobIndex] = useState<number | null>(null);
  const [repackaging, setRepackaging] = useState(false);
  const [repackageMessage, setRepackageMessage] = useState<string | null>(null);
  const [folderSupported, setFolderSupported] = useState(false);
  const [downloadFolder, setDownloadFolder] =
    useState<DownloadFolderHandle | null>(null);
  const [downloadFolderName, setDownloadFolderName] = useState<string | null>(
    null,
  );
  const [folderBusy, setFolderBusy] = useState(false);

  const downloadFolderRef = useRef<DownloadFolderHandle | null>(null);
  const resumeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    downloadFolderRef.current = downloadFolder;
  }, [downloadFolder]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/profile");
        const data = await response.json().catch(() => null);
        if (!cancelled && response.ok && data?.profile) {
          setProfile(cloneProfile(data.profile));
        }
      } catch {
        // Keep empty profile if load fails
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setFolderSupported(isDirectoryPickerSupported());
  }, []);

  const pastedJdJobs = useMemo(() => splitJobDescriptions(pastedJd), [pastedJd]);

  const canSubmit =
    pastedJdJobs.length > 0 &&
    (inputMode === "profile_jd" || Boolean(resumePdfBase64));

  async function onResumeFileChange(file: File | null) {
    setError(null);
    if (!file) {
      setResumeFileName(null);
      setResumePdfBase64(null);
      return;
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please upload a PDF resume.");
      setResumeFileName(null);
      setResumePdfBase64(null);
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("PDF must be under 8 MB.");
      setResumeFileName(null);
      setResumePdfBase64(null);
      return;
    }

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    setResumeFileName(file.name);
    setResumePdfBase64(btoa(binary));
  }

  async function saveProfileToDb(): Promise<boolean> {
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to save profile");
      }
      if (data.profile) {
        setProfile(cloneProfile(data.profile));
      }
      return true;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save profile";
      setError(message);
      return false;
    }
  }

  function updatePersonal<K extends keyof PersonalInfo>(
    key: K,
    value: PersonalInfo[K],
  ) {
    setProfile((prev) => ({
      ...prev,
      personal: { ...prev.personal, [key]: value },
    }));
  }

  function updateExperience(
    index: number,
    key: keyof ExperienceInput,
    value: string,
  ) {
    setProfile((prev) => ({
      ...prev,
      experiences: prev.experiences.map((exp, i) =>
        i === index ? { ...exp, [key]: value } : exp,
      ),
    }));
  }

  function addExperience() {
    setProfile((prev) => ({
      ...prev,
      experiences: [...prev.experiences, { ...EMPTY_EXPERIENCE }],
    }));
  }

  function removeExperience(index: number) {
    setProfile((prev) => ({
      ...prev,
      experiences: prev.experiences.filter((_, i) => i !== index),
    }));
  }

  function updateEducation(
    index: number,
    key: keyof EducationInput,
    value: string,
  ) {
    setProfile((prev) => ({
      ...prev,
      education: prev.education.map((edu, i) =>
        i === index ? { ...edu, [key]: value } : edu,
      ),
    }));
  }

  function addEducation() {
    setProfile((prev) => ({
      ...prev,
      education: [...prev.education, { ...EMPTY_EDUCATION }],
    }));
  }

  function removeEducation(index: number) {
    setProfile((prev) => ({
      ...prev,
      education: prev.education.filter((_, i) => i !== index),
    }));
  }

  const summary = useMemo(() => {
    const done = jobs.filter((j) => j.status === "done").length;
    const failed = jobs.filter((j) => j.status === "error").length;
    const running = jobs.filter((j) => j.status === "running").length;
    return { done, failed, running, total: jobs.length };
  }, [jobs]);

  const completedJobs = useMemo(
    () => jobs.filter((j) => j.status === "done" && j.resume && j.personal),
    [jobs],
  );

  const previewJob = useMemo(
    () =>
      previewJobIndex == null
        ? null
        : jobs.find((j) => j.index === previewJobIndex) || null,
    [jobs, previewJobIndex],
  );

  async function updateDownloadsFromPreview(job: JobProgress) {
    if (!job.resume || !job.personal || !job.coverLetter) return;
    setRepackaging(true);
    setRepackageMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/repackage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          index: job.index,
          company: job.company || "Company",
          jobTitle: job.jobTitle || "Role",
          personal: job.personal,
          resume: job.resume,
          coverLetter: job.coverLetter,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to update downloads");
      }

      const DOCX =
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const downloadUrls = data.downloads
        ? {
            zip: base64ToObjectUrl(data.downloads.zipBase64, "application/zip"),
            resumeDocx: base64ToObjectUrl(
              data.downloads.resumeDocxBase64,
              DOCX,
            ),
            resumePdf: base64ToObjectUrl(
              data.downloads.resumePdfBase64,
              "application/pdf",
            ),
            coverLetterDocx: base64ToObjectUrl(
              data.downloads.coverLetterDocxBase64,
              DOCX,
            ),
          }
        : undefined;

      setJobs((prev) =>
        prev.map((item) =>
          item.index === job.index
            ? {
                ...item,
                company: data.company || item.company,
                zipName: data.zipName || item.zipName,
                folderName: data.folderName || item.folderName,
                resumeDocxName: data.resumeDocxName || item.resumeDocxName,
                resumePdfName: data.resumePdfName || item.resumePdfName,
                coverLetterDocxName:
                  data.coverLetterDocxName || item.coverLetterDocxName,
                downloadUrls: downloadUrls ?? item.downloadUrls,
              }
            : item,
        ),
      );
      setRepackageMessage("Downloads updated with your edits.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update downloads");
      setRepackageMessage(null);
    } finally {
      setRepackaging(false);
    }
  }

  function isRetrying(index: number) {
    return retryingIndices.includes(index);
  }

  function patchJob(index: number, updater: (job: JobProgress) => JobProgress) {
    setJobs((prev) =>
      prev.map((job) => (job.index === index ? updater(job) : job)),
    );
  }

  function setManualJd(index: number, value: string) {
    setManualJds((prev) => ({ ...prev, [index]: value }));
  }

  async function chooseDownloadFolder() {
    if (!isDirectoryPickerSupported()) {
      setError("Folder selection needs Chrome or Edge.");
      return;
    }

    setFolderBusy(true);
    setError(null);
    try {
      const handle = await pickDownloadFolder();
      downloadFolderRef.current = handle;
      setDownloadFolder(handle);
      setDownloadFolderName(handle.name);
      setStatus(`Download folder set to “${handle.name}”`);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(
        err instanceof Error ? err.message : "Could not select a download folder",
      );
    } finally {
      setFolderBusy(false);
    }
  }

  async function downloadJobFile(
    url: string,
    fileName: string,
    folderName?: string,
  ) {
    try {
      await downloadFile(
        url,
        fileName,
        downloadFolderRef.current,
        downloadFolderRef.current && folderName ? folderName : undefined,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  }

  async function runJobs(
    targets: Array<{ url: string; index: number; manualJd?: string }>,
    mode: "batch" | "retry",
  ) {
    setError(null);

    if (mode === "batch") {
      setJobs(
        targets.map((t) => createJobProgress(t.index, t.url, t.manualJd)),
      );
      setManualJds({});
      setRetryingIndices([]);
      setLoading(true);
      setStatus(
        `Running ${targets.length} job${targets.length > 1 ? "s" : ""} in parallel`,
      );
    } else {
      const target = targets[0];
      setRetryingIndices((prev) =>
        prev.includes(target.index) ? prev : [...prev, target.index],
      );
      patchJob(target.index, () =>
        createJobProgress(target.index, target.url, target.manualJd),
      );
      setStatus(`Retrying job ${target.index}…`);
    }

    try {
      const response = await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: inputMode,
          profile: inputMode === "profile_jd" ? profile : undefined,
          resumePdfBase64:
            inputMode === "resume_pdf" ? resumePdfBase64 : undefined,
          jobUrls: targets.map((t) => t.url),
          indices: targets.map((t) => t.index),
          manualJds: targets.map((t) => t.manualJd || ""),
        }),
      });

      if (!response.ok || !response.body) {
        const raw = await response.text().catch(() => "");
        let message = "Failed to start processing.";
        try {
          const data = JSON.parse(raw) as { error?: string };
          if (data?.error) message = data.error;
        } catch {
          if (raw.trim()) {
            message = `Failed to start processing (${response.status}): ${raw.slice(0, 200)}`;
          } else {
            message = `Failed to start processing (HTTP ${response.status}).`;
          }
        }
        throw new Error(message);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          const line = chunk
            .split("\n")
            .find((entry) => entry.startsWith("data: "));
          if (!line) continue;

          const event = JSON.parse(line.slice(6)) as ProgressEvent;

          if (event.type === "step") {
            patchJob(event.index, (job) =>
              markStepProgress(job, event.step, event.message),
            );
          } else if (event.type === "job_done") {
            patchJob(event.index, (job) => markJobDone(job, event));
          } else if (event.type === "job_error") {
            patchJob(event.index, (job) => markJobError(job, event));
          } else if (event.type === "done") {
            setStatus(
              mode === "retry"
                ? event.succeeded
                  ? `Retry finished · job succeeded`
                  : `Retry finished · job failed`
                : `Finished · ${event.succeeded} succeeded${
                    event.failed ? ` · ${event.failed} failed` : ""
                  }`,
            );
          } else if (event.type === "fatal") {
            setError(event.error);
            setStatus(null);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setStatus(null);
    } finally {
      if (mode === "batch") {
        setLoading(false);
      } else {
        const targetIndex = targets[0]?.index;
        if (targetIndex != null) {
          setRetryingIndices((prev) => prev.filter((i) => i !== targetIndex));
        }
      }
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();

    if (inputMode === "profile_jd") {
      const profileError = validateProfile(profile);
      if (profileError) {
        setError(profileError);
        return;
      }
    } else if (!resumePdfBase64) {
      setError("Upload your original resume PDF.");
      return;
    }

    if (!pastedJd.trim()) {
      setError("Paste a job description.");
      return;
    }
    if (!pastedJdJobs.length) {
      setError(
        "Paste at least ~80 characters of JD text. Multiple JDs are auto-detected (or separate with ---).",
      );
      return;
    }

    if (inputMode === "profile_jd") {
      const saved = await saveProfileToDb();
      if (!saved) return;
    }

    await runJobs(
      pastedJdJobs.map((jd, i) => ({
        url: `manual://pasted-job-${i + 1}`,
        index: i + 1,
        manualJd: jd,
      })),
      "batch",
    );
  }

  async function onRetry(job: JobProgress) {
    if (isRetrying(job.index)) return;

    if (inputMode === "profile_jd") {
      const profileError = validateProfile(profile);
      if (profileError) {
        setError(profileError);
        return;
      }
    } else if (!resumePdfBase64) {
      setError("Upload your original resume PDF before retrying.");
      return;
    }

    const pasted = (manualJds[job.index] || job.sourceJd || "").trim();
    if (pasted.length < 80) {
      setError(
        `Job ${job.index}: paste at least ~80 characters of the job description before retrying.`,
      );
      return;
    }
    await runJobs(
      [
        {
          url: job.jobUrl,
          index: job.index,
          manualJd: pasted,
        },
      ],
      "retry",
    );
  }

  const batchBusy = loading || retryingIndices.length > 0;

  const { personal, experiences, education } = profile;

  return (
    <div className="workspace">
      <form className="composer" onSubmit={onSubmit}>
        <div
          className="mode-toggle"
          role="tablist"
          aria-label="Tailor input mode"
        >
          <button
            type="button"
            role="tab"
            className={`mode-btn${inputMode === "profile_jd" ? " active" : ""}`}
            aria-selected={inputMode === "profile_jd"}
            disabled={batchBusy}
            onClick={() => setInputMode("profile_jd")}
          >
            Profile + JD
          </button>
          <button
            type="button"
            role="tab"
            className={`mode-btn${inputMode === "resume_pdf" ? " active" : ""}`}
            aria-selected={inputMode === "resume_pdf"}
            disabled={batchBusy}
            onClick={() => setInputMode("resume_pdf")}
          >
            Resume PDF + JD
          </button>
        </div>

        {inputMode === "profile_jd" ? (
        <>
        <section className="profile-section">
          <div className="section-head">
            <div>
              <h2>Personal information</h2>
              <p className="hint">
                {profileLoading
                  ? "Loading your saved profile…"
                  : "Edit here or on your Profile page. Saved automatically when you generate."}
              </p>
            </div>
          </div>

          <div className="field-grid">
            <label className="field">
              <span>Full name</span>
              <input
                type="text"
                value={personal.name}
                onChange={(e) => updatePersonal("name", e.target.value)}
                placeholder="Jane Doe"
                required
                autoComplete="name"
              />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={personal.email}
                onChange={(e) => updatePersonal("email", e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </label>
            <label className="field">
              <span>Phone</span>
              <input
                type="tel"
                value={personal.phone}
                onChange={(e) => updatePersonal("phone", e.target.value)}
                placeholder="+1 555 000 0000"
                required
                autoComplete="tel"
              />
            </label>
            <label className="field">
              <span>Location</span>
              <input
                type="text"
                value={personal.location}
                onChange={(e) => updatePersonal("location", e.target.value)}
                placeholder="City, Country"
                required
              />
            </label>
            <label className="field field-span">
              <span>LinkedIn URL</span>
              <input
                type="url"
                value={personal.linkedin}
                onChange={(e) => updatePersonal("linkedin", e.target.value)}
                placeholder="https://www.linkedin.com/in/…"
                required
              />
            </label>
          </div>
        </section>

        <section className="profile-section">
          <div className="section-head">
            <div>
              <h2>Experience</h2>
              <p className="hint">
                Company names, periods, and locations stay as entered. Bullets
                are tailored per job.
              </p>
            </div>
            <button
              type="button"
              className="ghost-btn"
              onClick={addExperience}
              disabled={batchBusy}
            >
              + Add experience
            </button>
          </div>

          <div className="entry-list">
            {experiences.map((exp, index) => (
              <div key={`exp-${index}`} className="entry-card">
                <div className="entry-card-head">
                  <span className="entry-label">Experience {index + 1}</span>
                  {experiences.length > 1 && (
                    <button
                      type="button"
                      className="ghost-btn danger-text"
                      onClick={() => removeExperience(index)}
                      disabled={batchBusy}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="field-grid">
                  <label className="field">
                    <span>Company</span>
                    <input
                      type="text"
                      value={exp.company}
                      onChange={(e) =>
                        updateExperience(index, "company", e.target.value)
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Title</span>
                    <input
                      type="text"
                      value={exp.title}
                      onChange={(e) =>
                        updateExperience(index, "title", e.target.value)
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Period</span>
                    <input
                      type="text"
                      value={exp.period}
                      onChange={(e) =>
                        updateExperience(index, "period", e.target.value)
                      }
                      placeholder="Jan 2020 – Present"
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Location</span>
                    <input
                      type="text"
                      value={exp.location}
                      onChange={(e) =>
                        updateExperience(index, "location", e.target.value)
                      }
                      placeholder="Remote"
                      required
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="profile-section">
          <div className="section-head">
            <div>
              <h2>Education</h2>
              <p className="hint">School, degree, discipline, period, and location.</p>
            </div>
            <button
              type="button"
              className="ghost-btn"
              onClick={addEducation}
              disabled={batchBusy}
            >
              + Add education
            </button>
          </div>

          <div className="entry-list">
            {education.map((edu, index) => (
              <div key={`edu-${index}`} className="entry-card">
                <div className="entry-card-head">
                  <span className="entry-label">Education {index + 1}</span>
                  {education.length > 1 && (
                    <button
                      type="button"
                      className="ghost-btn danger-text"
                      onClick={() => removeEducation(index)}
                      disabled={batchBusy}
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="field-grid">
                  <label className="field">
                    <span>School</span>
                    <input
                      type="text"
                      value={edu.school}
                      onChange={(e) =>
                        updateEducation(index, "school", e.target.value)
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Degree</span>
                    <input
                      type="text"
                      value={edu.degree}
                      onChange={(e) =>
                        updateEducation(index, "degree", e.target.value)
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Discipline</span>
                    <input
                      type="text"
                      value={edu.discipline}
                      onChange={(e) =>
                        updateEducation(index, "discipline", e.target.value)
                      }
                      placeholder="Computer Science"
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Period</span>
                    <input
                      type="text"
                      value={edu.period}
                      onChange={(e) =>
                        updateEducation(index, "period", e.target.value)
                      }
                      placeholder="2019 – 2023"
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Location</span>
                    <input
                      type="text"
                      value={edu.location}
                      onChange={(e) =>
                        updateEducation(index, "location", e.target.value)
                      }
                      required
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>
        </>
        ) : (
        <section className="profile-section">
          <div className="section-head">
            <div>
              <h2>Original resume (PDF)</h2>
              <p className="hint">
                Upload your current resume. We rewrite it to fit the job
                description below.
              </p>
            </div>
          </div>

          <div className="upload-row">
            <input
              ref={resumeInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="file-input"
              disabled={batchBusy}
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                void onResumeFileChange(file);
              }}
            />
            <button
              type="button"
              className="download-btn"
              disabled={batchBusy}
              onClick={() => resumeInputRef.current?.click()}
            >
              {resumeFileName ? "Change PDF" : "Choose PDF"}
            </button>
            <span className="upload-name">
              {resumeFileName
                ? resumeFileName
                : "No file selected (PDF, max 8 MB)"}
            </span>
          </div>
        </section>
        )}

        <section className="profile-section">
          <div className="section-head">
            <div>
              <h2>Job description</h2>
              <p className="hint">
                Paste one or more JDs. Multiple postings are auto-split when
                possible; you can still use a --- line between jobs.
              </p>
            </div>
            <div className="link-count" aria-live="polite">
              {pastedJdJobs.length} JD{pastedJdJobs.length === 1 ? "" : "s"}
            </div>
          </div>

          <textarea
            required
            rows={12}
            value={pastedJd}
            onChange={(e) => setPastedJd(e.target.value)}
            placeholder={
              "Paste one or more job descriptions…\n\nMultiple JDs are detected automatically when possible.\nOptional: put --- on its own line between jobs."
            }
            spellCheck={false}
          />
        </section>

        <div className="composer-footer">
          <button
            type="submit"
            className="primary"
            disabled={batchBusy || !canSubmit}
          >
            {loading ? "Processing…" : "Generate packages"}
          </button>
          {status && <p className="inline-status">{status}</p>}
        </div>

        {error && <p className="error">{error}</p>}
      </form>

      <section className="board">
        <div className="section-head">
          <div>
            <h2>Progress</h2>
            <p className="hint">
              {jobs.length === 0
                ? "Results appear here after you generate."
                : `${summary.done} done · ${summary.running} running · ${summary.failed} failed`}
            </p>
          </div>
        </div>

        <div className="progress-details">
          {jobs.length === 0 ? (
            <div className="empty-board">
              <p>
                {inputMode === "resume_pdf"
                  ? "Upload a resume PDF, paste a JD, then generate."
                  : "Fill your profile, paste a JD, then generate."}
              </p>
              <ol>
                <li>
                  {inputMode === "resume_pdf"
                    ? "Upload original resume PDF"
                    : "Fill in your profile"}
                </li>
                <li>Paste JD text</li>
                <li>Write resume</li>
                <li>Validate format and content</li>
                <li>Score ATS match</li>
                <li>Package downloads</li>
              </ol>
            </div>
          ) : (
            <ul className="job-list">
              {jobs.map((job) => (
                <li key={job.index} className={`job-row status-${job.status}`}>
                  <div className="job-list-main">
                    <div className="job-list-head">
                      <span className="job-index">{job.index}</span>
                      <div className="job-identity">
                        <div className="job-title-row">
                          <strong>
                            {job.company ||
                              (job.status === "error"
                                ? "Failed"
                                : hostFromUrl(job.jobUrl))}
                          </strong>
                          <StatusBadge status={job.status} />
                          {typeof job.atsScore === "number" && (
                            <span
                              className={`ats-score ${
                                job.atsScore >= 85
                                  ? "high"
                                  : job.atsScore >= 70
                                    ? "mid"
                                    : "low"
                              }`}
                            >
                              ATS {job.atsScore}/100
                            </span>
                          )}
                        </div>
                        {job.jobTitle && (
                          <p className="job-role">{job.jobTitle}</p>
                        )}
                      </div>
                    </div>

                    <ol className="pipeline" aria-label="Processing steps">
                      {JOB_STEPS.map((step, i) => (
                        <li
                          key={step}
                          className={`pipe-step ${job.stepStatuses[step]}`}
                          title={JOB_STEP_LABELS[step]}
                        >
                          <span className="pipe-node">{i + 1}</span>
                          <span className="pipe-label">{STEP_SHORT[step]}</span>
                        </li>
                      ))}
                    </ol>

                    {job.status === "running" && (
                      <p className="job-live">{job.stepMessage}</p>
                    )}
                    {job.error && <p className="job-error">{job.error}</p>}

                    {job.status === "done" &&
                      job.folderName &&
                      job.zipName &&
                      job.resumeDocxName &&
                      job.resumePdfName &&
                      job.coverLetterDocxName && (
                      <div className="download-row">
                        <span className="download-label">Downloads</span>
                        <div className="download-actions">
                          <button
                            type="button"
                            className="download-btn"
                            onClick={() => {
                              const url = resumeDocxUrl(job);
                              if (!url || !job.resumeDocxName) return;
                              void downloadJobFile(
                                url,
                                job.resumeDocxName,
                                job.folderName,
                              );
                            }}
                          >
                            <DownloadIcon />
                            Resume DOCX
                          </button>
                          <button
                            type="button"
                            className="download-btn"
                            onClick={() => {
                              const url = resumePdfUrl(job);
                              if (!url || !job.resumePdfName) return;
                              void downloadJobFile(
                                url,
                                job.resumePdfName,
                                job.folderName,
                              );
                            }}
                          >
                            <DownloadIcon />
                            Resume PDF
                          </button>
                          <button
                            type="button"
                            className="download-btn"
                            onClick={() => {
                              const url = coverLetterDocxUrl(job);
                              if (!url || !job.coverLetterDocxName) return;
                              void downloadJobFile(
                                url,
                                job.coverLetterDocxName,
                                job.folderName,
                              );
                            }}
                          >
                            <DownloadIcon />
                            Cover letter
                          </button>
                          <button
                            type="button"
                            className="download-btn zip"
                            onClick={() => {
                              const url = zipUrl(job);
                              if (!url || !job.zipName) return;
                              void downloadJobFile(
                                url,
                                job.zipName,
                                job.folderName,
                              );
                            }}
                          >
                            <DownloadIcon />
                            Package
                          </button>
                        </div>
                      </div>
                    )}

                    {job.status === "error" && (
                      <div className="manual-jd-panel">
                        <label className="manual-jd-label" htmlFor={`manual-jd-${job.index}`}>
                          Edit job description and retry
                        </label>
                        <textarea
                          id={`manual-jd-${job.index}`}
                          className="manual-jd-input"
                          rows={6}
                          value={manualJds[job.index] ?? job.sourceJd ?? ""}
                          onChange={(e) => setManualJd(job.index, e.target.value)}
                          placeholder="Paste or edit the full job description text here…"
                          spellCheck={false}
                        />
                        <div className="retry-row">
                          <button
                            type="button"
                            className="retry-btn primary-ghost"
                            disabled={
                              isRetrying(job.index) ||
                              (manualJds[job.index] ?? job.sourceJd ?? "").trim()
                                .length < 80
                            }
                            onClick={() => void onRetry(job)}
                          >
                            <RetryIcon />
                            {isRetrying(job.index) ? "Retrying…" : "Retry"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {folderSupported && (
            <div className="progress-details-footer">
              <button
                type="button"
                className="download-btn"
                disabled={folderBusy}
                onClick={() => void chooseDownloadFolder()}
              >
                <FolderIcon />
                {folderBusy
                  ? "Selecting…"
                  : downloadFolder
                    ? downloadFolderName || "Change folder"
                    : "Save to folder"}
              </button>
            </div>
          )}
        </div>

        {completedJobs.length > 0 && (
          <div className="preview-bar">
            <div className="preview-bar-copy">
              <strong>Preview</strong>
              <span className="hint">
                View the tailored resume content in the page.
              </span>
            </div>
            <div className="preview-bar-actions">
              {completedJobs.map((job) => (
                <button
                  key={job.index}
                  type="button"
                  className={
                    previewJobIndex === job.index
                      ? "preview-btn active"
                      : "preview-btn"
                  }
                  onClick={() =>
                    setPreviewJobIndex((current) =>
                      current === job.index ? null : job.index,
                    )
                  }
                >
                  <PreviewIcon />
                  {completedJobs.length === 1
                    ? previewJobIndex === job.index
                      ? "Hide preview"
                      : "Preview"
                    : previewJobIndex === job.index
                      ? `Hide #${job.index}`
                      : `Preview #${job.index}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {previewJob?.resume && previewJob.personal && previewJob.coverLetter != null && (
          <div className="resume-preview-wrap">
            <ResumePreview
              personal={previewJob.personal}
              resume={previewJob.resume}
              coverLetter={previewJob.coverLetter}
              title={
                previewJob.company || previewJob.jobTitle
                  ? `${previewJob.company || "Resume"}${previewJob.jobTitle ? ` · ${previewJob.jobTitle}` : ""}`
                  : undefined
              }
              onPersonalChange={(personal) => {
                setJobs((prev) =>
                  prev.map((job) =>
                    job.index === previewJob.index
                      ? { ...job, personal }
                      : job,
                  ),
                );
              }}
              onResumeChange={(resume) => {
                setJobs((prev) =>
                  prev.map((job) =>
                    job.index === previewJob.index ? { ...job, resume } : job,
                  ),
                );
              }}
              onCoverLetterChange={(coverLetter) => {
                setJobs((prev) =>
                  prev.map((job) =>
                    job.index === previewJob.index
                      ? { ...job, coverLetter }
                      : job,
                  ),
                );
              }}
            />
            <div className="resume-preview-actions">
              <button
                type="button"
                className="primary"
                disabled={repackaging}
                onClick={() => void updateDownloadsFromPreview(previewJob)}
              >
                {repackaging ? "Updating downloads…" : "Update downloads"}
              </button>
              {repackageMessage && (
                <p className="profile-save-msg">{repackageMessage}</p>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
