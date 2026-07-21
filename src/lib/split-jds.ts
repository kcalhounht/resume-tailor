const MIN_JD_CHARS = 80;

/** Explicit user separators (still supported). */
const EXPLICIT_SPLIT = /\n\s*---+\s*\n/;

/**
 * Common headings that often mark the start of a new pasted posting
 * when users dump several JDs without --- separators.
 */
const SECTION_START =
  /(?=^(?:About the job|About the role|Job description|Role description|Position description|The role|What you'll do|What you will do|Responsibilities)\s*$)/im;

/** LinkedIn / board style: blank line then a short title-like line then About the job */
const TITLE_THEN_ABOUT =
  /\n(?=[^\n]{8,100}\n(?:About the job|About the role|Job description)\b)/gi;

function cleanBlocks(blocks: string[]): string[] {
  return blocks
    .map((b) => b.replace(/\u0000/g, "").trim())
    .filter((b) => b.length >= MIN_JD_CHARS);
}

function splitByRegex(text: string, re: RegExp): string[] {
  const parts = text.split(re).map((p) => p.trim()).filter(Boolean);
  return cleanBlocks(parts);
}

/**
 * Split pasted text into one or more job descriptions.
 * Order of preference:
 * 1) Explicit `---` separators
 * 2) Repeated section headings (About the job, etc.)
 * 3) Title line followed by About the job
 * 4) Single JD fallback
 */
export function splitJobDescriptions(raw: string): string[] {
  const text = String(raw || "").trim();
  if (!text) return [];

  if (EXPLICIT_SPLIT.test(text)) {
    const explicit = cleanBlocks(text.split(EXPLICIT_SPLIT));
    if (explicit.length >= 1) return explicit;
  }

  // Multiple "About the job" / similar headings
  const headingHits = text.match(
    /^(?:About the job|About the role|Job description|Role description|Position description)\s*$/gim,
  );
  if (headingHits && headingHits.length >= 2) {
    const byHeading = splitByRegex(text, SECTION_START);
    if (byHeading.length >= 2) return byHeading;
  }

  // Repeated "title\nAbout the job" patterns
  const aboutCount = (text.match(/\bAbout the job\b/gi) || []).length;
  if (aboutCount >= 2) {
    const byTitle = splitByRegex(text, TITLE_THEN_ABOUT);
    if (byTitle.length >= 2) return byTitle;

    // Fallback: split keeping "About the job" with following content
    const aboutSplit = cleanBlocks(
      text.split(/(?=^About the job\b)/im),
    );
    if (aboutSplit.length >= 2) return aboutSplit;
  }

  // Very long paste with multiple http(s) career URLs — soft signal
  const urls = text.match(/https?:\/\/[^\s)]+/gi) || [];
  const careerUrls = urls.filter((u) =>
    /careers|jobs|greenhouse|lever\.co|ashbyhq|workday|linkedin\.com\/jobs/i.test(
      u,
    ),
  );
  if (careerUrls.length >= 2 && text.length > MIN_JD_CHARS * 3) {
    // Split around career URLs when they appear as their own "header" blocks
    const urlSplit = cleanBlocks(
      text.split(
        /(?=\nhttps?:\/\/(?:[^\s)]*(?:careers|jobs|greenhouse|lever\.co|ashbyhq|workday|linkedin\.com\/jobs)[^\s)]*)\s*\n)/i,
      ),
    );
    if (urlSplit.length >= 2) return urlSplit;
  }

  return text.length >= MIN_JD_CHARS ? [text] : [];
}

export { MIN_JD_CHARS };
