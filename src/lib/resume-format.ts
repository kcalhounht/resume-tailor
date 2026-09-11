export const RESUME_FONT_IDS = [
  "calibri",
  "aptos",
  "times",
  "georgia",
  "arial",
] as const;

export const RESUME_STYLE_IDS = [
  "classic",
  "modern",
  "compact",
  "executive",
] as const;

export const RESUME_ACCENT_IDS = [
  "navy",
  "black",
  "forest",
  "burgundy",
] as const;

export type ResumeFont = (typeof RESUME_FONT_IDS)[number];
export type ResumeLayoutStyle = (typeof RESUME_STYLE_IDS)[number];
export type ResumeAccent = (typeof RESUME_ACCENT_IDS)[number];

export type ResumeFormat = {
  font: ResumeFont;
  style: ResumeLayoutStyle;
  accent: ResumeAccent;
};

export const DEFAULT_RESUME_FORMAT: ResumeFormat = {
  font: "calibri",
  style: "classic",
  accent: "navy",
};

export const RESUME_FONT_OPTIONS: Array<{
  id: ResumeFont;
  name: string;
  hint: string;
}> = [
  { id: "calibri", name: "Calibri", hint: "Clean sans-serif (default)" },
  { id: "aptos", name: "Aptos", hint: "Microsoft 365 sans-serif" },
  { id: "times", name: "Times", hint: "Traditional serif" },
  { id: "georgia", name: "Georgia", hint: "Readable serif" },
  { id: "arial", name: "Arial", hint: "Simple sans-serif" },
];

export const RESUME_STYLE_OPTIONS: Array<{
  id: ResumeLayoutStyle;
  name: string;
  hint: string;
}> = [
  { id: "classic", name: "Classic", hint: "Navy headings, standard spacing" },
  { id: "modern", name: "Modern", hint: "Title case, open layout" },
  { id: "compact", name: "Compact", hint: "Smaller type and tighter margins" },
  { id: "executive", name: "Executive", hint: "Formal, no all-caps name" },
];

export const RESUME_ACCENT_OPTIONS: Array<{
  id: ResumeAccent;
  name: string;
  color: string;
}> = [
  { id: "navy", name: "Navy", color: "#1F4E79" },
  { id: "black", name: "Black", color: "#222222" },
  { id: "forest", name: "Forest", color: "#1F6B4A" },
  { id: "burgundy", name: "Burgundy", color: "#6B2D3C" },
];

export type ResumeLook = {
  docxFont: string;
  pdfRegular: string;
  pdfBold: string;
  pdfItalic: string;
  accent: string;
  ink: string;
  muted: string;
  nameSize: number;
  headingSize: number;
  bodySize: number;
  contactSize: number;
  nameAllCaps: boolean;
  headingAllCaps: boolean;
  marginTwip: number;
  pdfMargin: number;
  pdfNameSize: number;
  pdfHeadingSize: number;
  pdfBodySize: number;
  pdfMetaSize: number;
  headingRule: string;
};

function asFont(value: unknown): ResumeFont {
  return RESUME_FONT_IDS.includes(value as ResumeFont)
    ? (value as ResumeFont)
    : DEFAULT_RESUME_FORMAT.font;
}

function asStyle(value: unknown): ResumeLayoutStyle {
  return RESUME_STYLE_IDS.includes(value as ResumeLayoutStyle)
    ? (value as ResumeLayoutStyle)
    : DEFAULT_RESUME_FORMAT.style;
}

function asAccent(value: unknown): ResumeAccent {
  return RESUME_ACCENT_IDS.includes(value as ResumeAccent)
    ? (value as ResumeAccent)
    : DEFAULT_RESUME_FORMAT.accent;
}

export const RESUME_FORMAT_COOKIE = "rt_resume_format";

export function resumeFormatCookieOptions() {
  return {
    httpOnly: false,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  };
}

export function parseResumeFormat(value: unknown): ResumeFormat {
  if (typeof value === "string") {
    try {
      return parseResumeFormat(JSON.parse(value));
    } catch {
      return { ...DEFAULT_RESUME_FORMAT };
    }
  }
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_RESUME_FORMAT };
  }
  const raw = value as Record<string, unknown>;
  return {
    font: asFont(raw.font),
    style: asStyle(raw.style),
    accent: asAccent(raw.accent),
  };
}

const FONT_MAP: Record<
  ResumeFont,
  { docx: string; pdfRegular: string; pdfBold: string; pdfItalic: string }
> = {
  calibri: {
    docx: "Calibri",
    pdfRegular: "Helvetica",
    pdfBold: "Helvetica-Bold",
    pdfItalic: "Helvetica-Oblique",
  },
  aptos: {
    docx: "Aptos",
    pdfRegular: "Helvetica",
    pdfBold: "Helvetica-Bold",
    pdfItalic: "Helvetica-Oblique",
  },
  arial: {
    docx: "Arial",
    pdfRegular: "Helvetica",
    pdfBold: "Helvetica-Bold",
    pdfItalic: "Helvetica-Oblique",
  },
  times: {
    docx: "Times New Roman",
    pdfRegular: "Times-Roman",
    pdfBold: "Times-Bold",
    pdfItalic: "Times-Italic",
  },
  georgia: {
    docx: "Georgia",
    pdfRegular: "Times-Roman",
    pdfBold: "Times-Bold",
    pdfItalic: "Times-Italic",
  },
};

const ACCENT_MAP: Record<ResumeAccent, string> = {
  navy: "1F4E79",
  black: "222222",
  forest: "1F6B4A",
  burgundy: "6B2D3C",
};

export function resumeLook(format?: ResumeFormat | null): ResumeLook {
  const next = parseResumeFormat(format);
  const font = FONT_MAP[next.font];
  const compact = next.style === "compact";
  const modern = next.style === "modern";
  const executive = next.style === "executive";

  return {
    docxFont: font.docx,
    pdfRegular: font.pdfRegular,
    pdfBold: font.pdfBold,
    pdfItalic: font.pdfItalic,
    accent: ACCENT_MAP[next.accent],
    ink: "1A1A1A",
    muted: "555555",
    nameSize: compact ? 34 : 40,
    headingSize: compact ? 20 : 22,
    bodySize: compact ? 18 : 20,
    contactSize: compact ? 16 : 18,
    nameAllCaps: !modern && !executive,
    headingAllCaps: !modern,
    marginTwip: compact ? 540 : 720,
    pdfMargin: compact ? 40 : 50,
    pdfNameSize: compact ? 17 : 20,
    pdfHeadingSize: compact ? 10 : 11,
    pdfBodySize: compact ? 9.5 : 10.5,
    pdfMetaSize: compact ? 9 : 10,
    headingRule: modern ? "CCCCCC" : "222222",
  };
}
