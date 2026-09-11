"use client";

import { useEffect, useRef, useState } from "react";
import type { CandidateProfile } from "@/lib/types";
import { parseProfileDraft } from "@/lib/profile";
import type { ImportProgressEvent } from "@/lib/progress";

const CIRCLE_SIZE = 38;
const CIRCLE_RADIUS = 14.5;
const CIRCLE_LENGTH = 2 * Math.PI * CIRCLE_RADIUS;
const PERCENT_PER_SECOND = 40;
const STEP_LABELS = ["Reading PDF", "Extracting profile", "Filling fields"] as const;

function labelForPercent(percent: number) {
  if (percent < 100 / 3) return STEP_LABELS[0];
  if (percent < 200 / 3) return STEP_LABELS[1];
  return STEP_LABELS[2];
}

function CircleChart({
  percent,
  label,
}: {
  percent: number;
  label: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = CIRCLE_LENGTH * (1 - clamped / 100);
  return (
    <div
      className="import-circle"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
    >
      <svg
        width={CIRCLE_SIZE}
        height={CIRCLE_SIZE}
        viewBox="0 0 38 38"
        aria-hidden
      >
        <circle
          className="import-circle-track"
          cx="19"
          cy="19"
          r={CIRCLE_RADIUS}
          fill="none"
          strokeWidth="3.2"
        />
        <circle
          className="import-circle-fill"
          cx="19"
          cy="19"
          r={CIRCLE_RADIUS}
          fill="none"
          strokeWidth="3.2"
          strokeDasharray={CIRCLE_LENGTH}
          strokeDashoffset={offset}
          transform="rotate(-90 19 19)"
        />
      </svg>
      <span className="import-circle-pct">
        {clamped > 0 ? Math.round(clamped) : ""}
      </span>
    </div>
  );
}

export function ResumePdfImport({
  disabled,
  onImported,
  onError,
}: {
  disabled?: boolean;
  onImported: (profile: CandidateProfile, source: "llm" | "text") => void;
  onError: (message: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const percentRef = useRef(0);
  const completeRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    if (!busy) return;

    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const cap = completeRef.current ? 100 : 94;
      const next = Math.min(cap, percentRef.current + PERCENT_PER_SECOND * dt);
      percentRef.current = next;
      setPercent(next);
      if (next < 100) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [busy]);

  function waitForCircleFill() {
    completeRef.current = true;
    return new Promise<void>((resolve) => {
      const check = () => {
        if (percentRef.current >= 99.5) resolve();
        else requestAnimationFrame(check);
      };
      check();
    });
  }

  async function importFile(file: File) {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/import-resume", {
      method: "POST",
      body,
    });

    if (!response.ok || !response.body) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(payload?.error || "Could not read that resume.");
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/event-stream")) {
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        profile?: CandidateProfile;
        source?: "llm" | "text";
      };
      if (!payload.ok) {
        throw new Error(payload.error || "Could not read that resume.");
      }
      const profile = parseProfileDraft(payload.profile);
      if (!profile) {
        throw new Error("Could not read a profile from that resume.");
      }
      onImported(profile, payload.source === "llm" ? "llm" : "text");
      await waitForCircleFill();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let imported = false;

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
        const event = JSON.parse(line.slice(6)) as ImportProgressEvent;
        if (event.type === "done") {
          const profile = parseProfileDraft(event.profile);
          if (!profile) {
            throw new Error("Could not read a profile from that resume.");
          }
          onImported(profile, event.source);
          imported = true;
        } else if (event.type === "error") {
          throw new Error(event.error || "Could not read that resume.");
        }
      }
    }

    if (!imported) {
      throw new Error("Could not read that resume.");
    }
    await waitForCircleFill();
  }

  const label = busy ? labelForPercent(percent) : "Resume import";

  return (
    <div className="resume-import">
      <input
        ref={fileRef}
        className="sr-only"
        type="file"
        accept="application/pdf,.pdf"
        disabled={disabled || busy}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          completeRef.current = false;
          percentRef.current = 0;
          setPercent(0);
          setBusy(true);
          void importFile(file)
            .catch((err: unknown) => {
              onError(
                err instanceof Error ? err.message : "Could not read that resume.",
              );
            })
            .finally(() => {
              setBusy(false);
              completeRef.current = false;
              percentRef.current = 0;
              setPercent(0);
            });
        }}
      />
      {busy ? <CircleChart percent={percent} label={label} /> : null}
      <button
        type="button"
        className="text-btn"
        disabled={disabled || busy}
        onClick={() => fileRef.current?.click()}
      >
        Upload resume PDF
      </button>
    </div>
  );
}
