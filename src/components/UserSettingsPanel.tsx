"use client";

import { useState } from "react";
import { saveOwnPageStyle } from "@/app/actions/appearance";
import { saveOwnResumeFormat } from "@/app/actions/resume-format";
import { applyPageStyle, persistResumeFormatCookie } from "@/lib/appearance-client";
import { PAGE_STYLES, type PageStyle } from "@/lib/appearance";
import {
  parseResumeFormat,
  resumeLook,
  RESUME_ACCENT_OPTIONS,
  RESUME_FONT_OPTIONS,
  RESUME_KEYWORD_OPTIONS,
  RESUME_STYLE_OPTIONS,
  type ResumeAccent,
  type ResumeFont,
  type ResumeFormat,
  type ResumeLayoutStyle,
} from "@/lib/resume-format";

export function UserSettingsPanel({
  pageStyle,
  resumeFormat,
  canOperate = true,
  onPageStyleChange,
  onResumeFormatChange,
}: {
  pageStyle: PageStyle;
  resumeFormat: ResumeFormat;
  canOperate?: boolean;
  onPageStyleChange?: (style: PageStyle) => void;
  onResumeFormatChange?: (format: ResumeFormat) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const look = resumeLook(resumeFormat);
  const boldKeywords = resumeFormat.boldKeywords !== false;
  const fontOption =
    RESUME_FONT_OPTIONS.find((option) => option.id === resumeFormat.font) ??
    RESUME_FONT_OPTIONS[0];
  const styleOption =
    RESUME_STYLE_OPTIONS.find((option) => option.id === resumeFormat.style) ??
    RESUME_STYLE_OPTIONS[0];
  const accentOption =
    RESUME_ACCENT_OPTIONS.find((option) => option.id === resumeFormat.accent) ??
    RESUME_ACCENT_OPTIONS[0];

  function savePageStyle(next: PageStyle) {
    if (!canOperate || busy) return;
    const previous = pageStyle;
    onPageStyleChange?.(next);
    applyPageStyle(next);
    setError(null);
    setBusy(true);
    void saveOwnPageStyle(next)
      .then((saved) => {
        onPageStyleChange?.(saved.pageStyle);
        applyPageStyle(saved.pageStyle);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Could not save that style.",
        );
        onPageStyleChange?.(previous);
        applyPageStyle(previous);
      })
      .finally(() => setBusy(false));
  }

  function saveResumePatch(patch: Partial<ResumeFormat>) {
    if (!canOperate || busy) return;
    const previous = resumeFormat;
    const next = parseResumeFormat({ ...resumeFormat, ...patch });
    onResumeFormatChange?.(next);
    persistResumeFormatCookie(next);
    setError(null);
    setBusy(true);
    void saveOwnResumeFormat(next)
      .then((savedFormat) => {
        onResumeFormatChange?.(savedFormat.resumeFormat);
        persistResumeFormatCookie(savedFormat.resumeFormat);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error
            ? err.message
            : "Could not save resume format.",
        );
        onResumeFormatChange?.(previous);
        persistResumeFormatCookie(previous);
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
          const active = pageStyle === option.id;
          return (
            <button
              key={option.id}
              type="button"
              className={`style-card${active ? " active" : ""}`}
              disabled={busy || !canOperate}
              aria-pressed={active}
              onClick={() => savePageStyle(option.id)}
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
            Font, layout, accent, and keyword emphasis for generated resumes
            and cover letters. Changes apply to the next package you generate.
          </p>
        </div>
      </div>

      <div
        className="format-preview"
        style={{ fontFamily: fontOption.cssFamily }}
      >
        <p
          className="format-preview-name"
          style={{
            color: `#${look.nameColor}`,
            textTransform: look.nameAllCaps ? "uppercase" : "none",
            letterSpacing: look.nameAllCaps ? "0.08em" : "0",
          }}
        >
          Jane Doe
        </p>
        <p className="format-preview-role" style={{ color: `#${look.accent}` }}>
          Product Manager | SQL, Python, Tableau
        </p>
        <p
          className="format-preview-heading"
          style={{
            color: `#${look.accent}`,
            borderBottomColor: `#${look.headingRule}`,
            textTransform: look.headingAllCaps ? "uppercase" : "none",
          }}
        >
          Summary
        </p>
        <p className="format-preview-body">
          {fontOption.name} · {styleOption.name} · {accentOption.name}. Sample
          line with{" "}
          <span style={{ fontWeight: boldKeywords ? 700 : 400 }}>
            AWS
          </span>
          ,{" "}
          <span style={{ fontWeight: boldKeywords ? 700 : 400 }}>
            Kubernetes
          </span>
          , and{" "}
          <span style={{ fontWeight: boldKeywords ? 700 : 400 }}>
            Terraform
          </span>
          .
        </p>
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
                <span
                  className="format-option-name font-preview"
                  style={{ fontFamily: option.cssFamily }}
                >
                  {option.name}
                </span>
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

      <div className="format-block">
        <p className="format-label">Keyword emphasis</p>
        <div className="format-options keyword-options">
          {RESUME_KEYWORD_OPTIONS.map((option) => {
            const active = boldKeywords === option.id;
            return (
              <button
                key={String(option.id)}
                type="button"
                className={`format-option${active ? " active" : ""}`}
                disabled={busy || !canOperate}
                aria-pressed={active}
                onClick={() => saveResumePatch({ boldKeywords: option.id })}
              >
                <span className="format-option-name">{option.name}</span>
                <span className="format-option-hint">{option.hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
