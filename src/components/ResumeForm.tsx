"use client";

import { FormEvent, useMemo, useState, type ClipboardEvent } from "react";
import {
  JOB_STEPS,
  JOB_STEP_LABELS,
  type JobStep,
  type ProgressEvent,
} from "@/lib/progress";
import { MIN_JOB_DESCRIPTION_CHARS } from "@/lib/limits";
import {
  emptyProfile,
  isProfileReady,
  normalizeProfile,
  profileBlockReason,
} from "@/lib/profile";
import CandidateForm from "@/components/CandidateForm";
import { AccountPanel } from "@/components/AccountPanel";
import { UserSettingsPanel } from "@/components/UserSettingsPanel";
import type { CandidateProfile } from "@/lib/types";
import type { SessionPayload } from "@/lib/session";
import { saveProfile } from "@/app/actions/profile";
import { DEFAULT_PAGE_STYLE, type PageStyle } from "@/lib/appearance";

type StepStatus = "pending" | "active" | "done" | "error";

type JobProgress = {
  index: number;
  jobDescription: string;
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
  error?: string;
  downloadUrls?: {
    zip: string;
    resumeDocx: string;
    coverLetterDocx: string;
  };
};

const STEP_SHORT: Record<JobStep, string> = {
  extracting: "Extract",
  generating: "Generate",
  validating: "Validate",
  zipping: "Zip",
};

function initialStepStatuses(): Record<JobStep, StepStatus> {
  return {
    extracting: "pending",
    generating: "pending",
    validating: "pending",
    zipping: "pending",
  };
}

function previewJd(text: string, max = 140) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max).trim()}…`;
}

function createJobProgress(index: number, jobDescription: string): JobProgress {
  return {
    index,
    jobDescription,
    status: "queued",
    currentStep: null,
    stepStatuses: initialStepStatuses(),
    stepMessage: "Queued",
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

export default function ResumeForm({
  initialProfile,
  session,
  initialPageStyle = DEFAULT_PAGE_STYLE,
}: {
  initialProfile?: CandidateProfile;
  session: SessionPayload;
  initialPageStyle?: PageStyle;
}) {
  const [tab, setTab] = useState<
    "profile" | "generate" | "account" | "settings"
  >("profile");
  const [profile, setProfile] = useState<CandidateProfile>(
    () => initialProfile ?? emptyProfile(),
  );
  const [jobTexts, setJobTexts] = useState<{ id: string; text: string }[]>(() => [
    { id: crypto.randomUUID(), text: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [retryingIndices, setRetryingIndices] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [jobs, setJobs] = useState<JobProgress[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [appliedSessionName, setAppliedSessionName] = useState(session.name);

  if (session.name !== appliedSessionName) {
    setAppliedSessionName(session.name);
    setProfile((current) => {
      if (current.personal.name === session.name) return current;
      return {
        ...current,
        personal: { ...current.personal, name: session.name },
      };
    });
  }

  const jobEntries = useMemo(
    () => jobTexts.map((job, i) => ({ text: job.text.trim(), slot: i })),
    [jobTexts],
  );
  const readyJobs = useMemo(
    () =>
      jobEntries.filter(
        (entry) => entry.text.length >= MIN_JOB_DESCRIPTION_CHARS,
      ),
    [jobEntries],
  );
  const hasAnyJd = jobEntries.some((entry) => entry.text.length > 0);
  const profileReady = isProfileReady(profile);

  const summary = useMemo(() => {
    const done = jobs.filter((j) => j.status === "done").length;
    const failed = jobs.filter((j) => j.status === "error").length;
    const running = jobs.filter((j) => j.status === "running").length;
    return { done, failed, running, total: jobs.length };
  }, [jobs]);

  function isRetrying(index: number) {
    return retryingIndices.includes(index);
  }

  function patchJob(index: number, updater: (job: JobProgress) => JobProgress) {
    setJobs((prev) =>
      prev.map((job) => (job.index === index ? updater(job) : job)),
    );
  }

  function setJobText(slot: number, value: string) {
    setJobTexts((prev) =>
      prev.map((job, i) => (i === slot ? { ...job, text: value } : job)),
    );
  }

  function onPasteJob(
    slot: number,
    event: ClipboardEvent<HTMLTextAreaElement>,
  ) {
    const pasted = event.clipboardData.getData("text");
    if (!pasted) return;
    event.preventDefault();
    const el = event.currentTarget;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    setJobText(slot, el.value.slice(0, start) + pasted + el.value.slice(end));
  }

  function addJob() {
    setJobTexts((prev) => [...prev, { id: crypto.randomUUID(), text: "" }]);
  }

  function removeJob(slot: number) {
    setJobTexts((prev) =>
      prev.length === 1
        ? [{ id: prev[0].id, text: "" }]
        : prev.filter((_, i) => i !== slot),
    );
  }

  async function runJobs(
    targets: Array<{ jobDescription: string; index: number }>,
    mode: "batch" | "retry",
  ) {
    setError(null);

    if (mode === "batch") {
      setJobs(
        targets.map((t) => createJobProgress(t.index, t.jobDescription)),
      );
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
        createJobProgress(target.index, target.jobDescription),
      );
      setStatus(`Retrying job ${target.index}…`);
    }

    try {
      const response = await fetch("/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile: normalizeProfile(profile),
          jobDescriptions: targets.map((t) => t.jobDescription),
          indices: targets.map((t) => t.index),
        }),
      });

      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Failed to start processing.");
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

    if (!isProfileReady(profile)) {
      const reason =
        profileBlockReason(profile) ||
        "Fill your profile, then generate.";
      setError(reason);
      setTab("profile");
      return;
    }

    if (!readyJobs.length) {
      const longest = Math.max(0, ...jobEntries.map((e) => e.text.length));
      setError(
        `Paste a fuller job description (${MIN_JOB_DESCRIPTION_CHARS}+ characters). You currently have ${longest}.`,
      );
      return;
    }

    await runJobs(
      readyJobs.map((entry, i) => ({
        jobDescription: entry.text,
        index: i + 1,
      })),
      "batch",
    );
  }

  async function onRetry(job: JobProgress) {
    if (isRetrying(job.index)) return;
    await runJobs(
      [{ jobDescription: job.jobDescription, index: job.index }],
      "retry",
    );
  }

  const batchBusy = loading || retryingIndices.length > 0;

  return (
    <div className="workspace">
      <div className="tabs" role="tablist" aria-label="Resume Tailor">
        <button
          type="button"
          role="tab"
          id="tab-profile"
          aria-selected={tab === "profile"}
          aria-controls="panel-profile"
          className={`tab${tab === "profile" ? " active" : ""}`}
          onClick={() => setTab("profile")}
        >
          Profile
          <span className={`tab-meta${profileReady ? "" : " short"}`}>
            {profileReady ? "Ready" : "Incomplete"}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          id="tab-generate"
          aria-selected={tab === "generate"}
          aria-controls="panel-generate"
          className={`tab${tab === "generate" ? " active" : ""}`}
          onClick={() => setTab("generate")}
        >
          Generate resume
        </button>
        <button
          type="button"
          role="tab"
          id="tab-account"
          aria-selected={tab === "account"}
          aria-controls="panel-account"
          className={`tab${tab === "account" ? " active" : ""}`}
          onClick={() => setTab("account")}
        >
          Account
        </button>
        <button
          type="button"
          role="tab"
          id="tab-settings"
          aria-selected={tab === "settings"}
          aria-controls="panel-settings"
          className={`tab${tab === "settings" ? " active" : ""}`}
          onClick={() => setTab("settings")}
        >
          Settings
        </button>
      </div>

      {tab === "profile" && (
        <section
          className="composer"
          id="panel-profile"
          role="tabpanel"
          aria-labelledby="tab-profile"
        >
          <div className="section-head" id="your-background">
            <div>
              <h2>Your profile</h2>
              <p className="hint">
                Required before generate: name plus one experience with company,
                title, period, and location.
              </p>
            </div>
          </div>

          <CandidateForm
            profile={profile}
            onChange={(next) => {
              setSaveMessage(null);
              setProfile(next);
            }}
            disabled={saving || batchBusy}
          />

          <div className="composer-footer">
            <button
              type="button"
              className="primary"
              disabled={saving || batchBusy}
              onClick={() => {
                void (async () => {
                  setError(null);
                  setSaveMessage(null);
                  setSaving(true);
                  try {
                    await saveProfile(profile);
                    setSaveMessage("Profile saved.");
                  } catch {
                    setError("Could not save your profile.");
                  } finally {
                    setSaving(false);
                  }
                })();
              }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {saveMessage && <p className="inline-status">{saveMessage}</p>}
            {error && tab === "profile" && <p className="error">{error}</p>}
          </div>
        </section>
      )}

      {tab === "account" && <AccountPanel session={session} />}
      {tab === "settings" && (
        <UserSettingsPanel initialStyle={initialPageStyle} />
      )}

      {tab === "generate" && (
        <>
      <form
        className="composer"
        id="panel-generate"
        role="tabpanel"
        aria-labelledby="tab-generate"
        onSubmit={onSubmit}
      >
        <div className="section-head">
          <div>
            <h2>Job descriptions</h2>
            <p className="hint">
              Paste the full posting text (at least {MIN_JOB_DESCRIPTION_CHARS}{" "}
              characters). Add another to generate multiple packages in
              parallel.
            </p>
          </div>
          <div className="link-count" aria-live="polite">
            {readyJobs.length} ready
          </div>
        </div>

        <div className="jd-list">
          {jobTexts.map((job, slot) => (
            <div key={job.id} className="jd-item">
              <div className="jd-item-head">
                <label htmlFor={`jd-${job.id}`}>Job {slot + 1}</label>
                <span
                  className={`jd-char-count${
                    job.text.trim().length > 0 &&
                    job.text.trim().length < MIN_JOB_DESCRIPTION_CHARS
                      ? " short"
                      : ""
                  }`}
                >
                  {job.text.trim().length.toLocaleString()}/
                  {MIN_JOB_DESCRIPTION_CHARS} chars
                </span>
                {jobTexts.length > 1 && (
                  <button
                    type="button"
                    className="text-btn section-remove"
                    onClick={() => removeJob(slot)}
                  >
                    Remove
                  </button>
                )}
              </div>
              <textarea
                id={`jd-${job.id}`}
                rows={8}
                value={job.text}
                onChange={(e) => setJobText(slot, e.target.value)}
                onPaste={(e) => onPasteJob(slot, e)}
                placeholder="Paste the full job description here…"
                spellCheck={false}
              />
            </div>
          ))}
        </div>

        <div className="composer-footer">
          <button
            type="submit"
            className="primary"
            disabled={batchBusy || !hasAnyJd}
          >
            {loading ? "Processing…" : "Generate packages"}
          </button>
          <button
            type="button"
            className="text-btn add-job"
            onClick={addJob}
            disabled={batchBusy}
          >
            Add another job
          </button>
          {status && <p className="inline-status">{status}</p>}
          {!profileReady && (
            <p className="inline-status warn-status">
              {profileBlockReason(profile)}
            </p>
          )}
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

        {jobs.length === 0 ? (
          <div className="empty-board">
            <p>Paste a job description and generate.</p>
            <ol>
              <li>Extract JD fields</li>
              <li>Write resume + cover letter</li>
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
                            (job.status === "error" ? "Failed" : "Job posting")}
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
                      <p className="job-preview" title={job.jobDescription}>
                        {previewJd(job.jobDescription)}
                      </p>
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
                    job.coverLetterDocxName && (
                    <div className="download-row">
                      <span className="download-label">Downloads</span>
                      <div className="download-actions">
                        <a
                          className="download-btn"
                          href={
                            job.downloadUrls?.resumeDocx ??
                            `/api/download?folder=${encodeURIComponent(job.folderName)}&name=${encodeURIComponent(job.resumeDocxName)}`
                          }
                          download={job.resumeDocxName}
                        >
                          <DownloadIcon />
                          {job.resumeDocxName}
                        </a>
                        <a
                          className="download-btn"
                          href={
                            job.downloadUrls?.coverLetterDocx ??
                            `/api/download?folder=${encodeURIComponent(job.folderName)}&name=${encodeURIComponent(job.coverLetterDocxName)}`
                          }
                          download={job.coverLetterDocxName}
                        >
                          <DownloadIcon />
                          {job.coverLetterDocxName}
                        </a>
                        <a
                          className="download-btn zip"
                          href={
                            job.downloadUrls?.zip ??
                            `/api/download?file=${encodeURIComponent(job.zipName)}`
                          }
                          download={job.zipName}
                        >
                          <DownloadIcon />
                          {job.zipName}
                        </a>
                      </div>
                    </div>
                  )}

                  {job.status === "error" && (
                    <div className="retry-row">
                      <button
                        type="button"
                        className="retry-btn"
                        disabled={isRetrying(job.index)}
                        onClick={() => void onRetry(job)}
                      >
                        <RetryIcon />
                        {isRetrying(job.index) ? "Retrying…" : "Retry"}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
        </>
      )}
    </div>
  );
}
