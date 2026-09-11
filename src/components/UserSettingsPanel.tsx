"use client";

import { useState } from "react";
import { saveOwnPageStyle } from "@/app/actions/appearance";
import { saveOwnResumeFormat } from "@/app/actions/resume-format";
import { PAGE_STYLES, type PageStyle } from "@/lib/appearance";
import {
  parseResumeFormat,
  RESUME_ACCENT_OPTIONS,
  RESUME_FONT_OPTIONS,
  RESUME_STYLE_OPTIONS,
  type ResumeAccent,
  type ResumeFont,
  type ResumeFormat,
  type ResumeLayoutStyle,
} from "@/lib/resume-format";

export function UserSettingsPanel({
  initialStyle,
  initialResumeFormat,
  canOperate = true,
}: {
  initialStyle: PageStyle;
  initialResumeFormat: ResumeFormat;
  canOperate?: boolean;
}) {
  const [selected, setSelected] = useState<PageStyle>(initialStyle);
  const [saved, setSaved] = useState<PageStyle>(initialStyle);
  const [resumeFormat, setResumeFormat] = useState<ResumeFormat>(
    initialResumeFormat,
  );
  const [savedResumeFormat, setSavedResumeFormat] =
    useState<ResumeFormat>(initialResumeFormat);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function saveResumePatch(patch: Partial<ResumeFormat>) {
    if (!canOperate) return;
    const next = parseResumeFormat({ ...resumeFormat, ...patch });
    setResumeFormat(next);
    setError(null);
    setBusy(true);
    void saveOwnResumeFormat(next)
      .then((savedFormat) => {
        setResumeFormat(savedFormat.resumeFormat);
        setSavedResumeFormat(savedFormat.resumeFormat);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error
            ? err.message
            : "Could not save resume format.",
        );
        setResumeFormat(savedResumeFormat);
      })
      .finally(() => setBusy(false));
  }

  return (
    <section
      className="composer"
      id="panel-settings"
      role="tabpanel"
      aria-labelledby="tab-settings"
    >
      <div className="section-head">
        <div>
          <h2>Page style</h2>
          <p className="hint">
            Choose another look for Resume Tailor. Your choice is saved to your
            account and used across the site.
          </p>
          {!canOperate ? (
            <p className="hint">
              This account is disabled, so page style and resume format cannot
              be changed.
            </p>
          ) : null}
        </div>
      </div>

      <div className="style-grid">
        {PAGE_STYLES.map((option) => {
          const active = selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              className={`style-card${active ? " active" : ""}`}
              disabled={busy || !canOperate}
              aria-pressed={active}
              onClick={() => {
                if (!canOperate) return;
                setSelected(option.id);
                setError(null);
                document.documentElement.setAttribute("data-theme", option.id);
                setBusy(true);
                void saveOwnPageStyle(option.id)
                  .then(() => {
                    setSaved(option.id);
                  })
                  .catch((err: unknown) => {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Could not save that style.",
                    );
                    setSelected(saved);
                    document.documentElement.setAttribute("data-theme", saved);
                  })
                  .finally(() => setBusy(false));
              }}
            >
              <span
                className="style-swatch"
                style={{
                  background: `linear-gradient(135deg, ${option.paper} 0%, ${option.surface} 55%, ${option.accent} 100%)`,
                }}
                aria-hidden
              />
              <span className="style-card-name">{option.name}</span>
              <span className="style-card-hint">{option.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="section-head resume-format-head">
        <div>
          <h2>Resume format</h2>
          <p className="hint">
            Font, layout, and accent color for generated resumes and cover
            letters. Changes apply the next time you generate.
          </p>
        </div>
      </div>

      <div className="format-block">
        <p className="format-label">Font</p>
        <div className="format-options">
          {RESUME_FONT_OPTIONS.map((option) => {
            const active = resumeFormat.font === option.id;
            return (
              <button
                key={option.id}
                type="button"
                className={`format-option${active ? " active" : ""}`}
                disabled={busy || !canOperate}
                aria-pressed={active}
                onClick={() => saveResumePatch({ font: option.id as ResumeFont })}
              >
                <span className="format-option-name">{option.name}</span>
                <span className="format-option-hint">{option.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="format-block">
        <p className="format-label">Layout style</p>
        <div className="format-options">
          {RESUME_STYLE_OPTIONS.map((option) => {
            const active = resumeFormat.style === option.id;
            return (
              <button
                key={option.id}
                type="button"
                className={`format-option${active ? " active" : ""}`}
                disabled={busy || !canOperate}
                aria-pressed={active}
                onClick={() =>
                  saveResumePatch({ style: option.id as ResumeLayoutStyle })
                }
              >
                <span className="format-option-name">{option.name}</span>
                <span className="format-option-hint">{option.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="format-block">
        <p className="format-label">Accent color</p>
        <div className="format-options">
          {RESUME_ACCENT_OPTIONS.map((option) => {
            const active = resumeFormat.accent === option.id;
            return (
              <button
                key={option.id}
                type="button"
                className={`format-option${active ? " active" : ""}`}
                disabled={busy || !canOperate}
                aria-pressed={active}
                onClick={() =>
                  saveResumePatch({ accent: option.id as ResumeAccent })
                }
              >
                <span
                  className="format-swatch"
                  style={{ background: option.color }}
                  aria-hidden
                />
                <span className="format-option-name">{option.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
