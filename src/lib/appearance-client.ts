"use client";

import {
  PAGE_STYLE_COOKIE,
  pageStyleCookieOptions,
  parsePageStyle,
  type PageStyle,
} from "@/lib/appearance";
import {
  parseResumeFormat,
  RESUME_FORMAT_COOKIE,
  resumeFormatCookieOptions,
  type ResumeFormat,
} from "@/lib/resume-format";

let rememberedPageStyle: PageStyle | null = null;

function cookieSuffix(secure: boolean) {
  return `; Path=/; Max-Age=${365 * 24 * 60 * 60}; SameSite=Lax${
    secure ? "; Secure" : ""
  }`;
}

export function applyPageStyle(style: PageStyle) {
  const next = parsePageStyle(style);
  rememberedPageStyle = next;
  if (typeof document === "undefined") return next;
  document.documentElement.setAttribute("data-theme", next);
  const secure =
    pageStyleCookieOptions().secure || location.protocol === "https:";
  document.cookie = `${PAGE_STYLE_COOKIE}=${next}${cookieSuffix(secure)}`;
  return next;
}

export function currentPageStyle(fallback: PageStyle): PageStyle {
  return rememberedPageStyle ?? parsePageStyle(fallback);
}

export function persistResumeFormatCookie(format: ResumeFormat) {
  if (typeof document === "undefined") return;
  const next = parseResumeFormat(format);
  const secure =
    resumeFormatCookieOptions().secure || location.protocol === "https:";
  document.cookie = `${RESUME_FORMAT_COOKIE}=${encodeURIComponent(
    JSON.stringify(next),
  )}${cookieSuffix(secure)}`;
}
