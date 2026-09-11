"use client";

import { useRef, useState } from "react";
import type { CandidateProfile } from "@/lib/types";
import { parseProfileDraft } from "@/lib/profile";

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
  const [busy, setBusy] = useState(false);

  async function importFile(file: File) {
    const body = new FormData();
    body.append("file", file);
    const response = await fetch("/api/import-resume", {
      method: "POST",
      body,
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      error?: string;
      profile?: CandidateProfile;
      source?: "llm" | "text";
    };
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Could not read that resume.");
    }
    const profile = parseProfileDraft(payload.profile);
    if (!profile) {
      throw new Error("Could not read a profile from that resume.");
    }
    onImported(profile, payload.source === "llm" ? "llm" : "text");
  }

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
          setBusy(true);
          void importFile(file)
            .catch((err: unknown) => {
              onError(
                err instanceof Error ? err.message : "Could not read that resume.",
              );
            })
            .finally(() => setBusy(false));
        }}
      />
      <button
        type="button"
        className="text-btn"
        disabled={disabled || busy}
        onClick={() => fileRef.current?.click()}
      >
        {busy ? "Reading resume…" : "Upload resume PDF"}
      </button>
    </div>
  );
}
