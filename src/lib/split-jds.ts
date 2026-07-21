const MIN_JD_CHARS = 80;

/** Explicit user separators (still supported). */
const EXPLICIT_SPLIT = /\n\s*---+\s*\n/;

const MARKER =
  /About the job|About the role|Job description|Role description|Position description|About this job|About this role/gi;

function cleanBlocks(blocks: string[]): string[] {
  return blocks
    .map((b) => b.replace(/\u0000/g, "").trim())
    .filter((b) => b.length >= MIN_JD_CHARS);
}

function countMatches(text: string, re: RegExp): number {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  return (text.match(new RegExp(re.source, flags)) || []).length;
}

function bestSplit(candidates: string[][]): string[] {
  const valid = candidates
    .map(cleanBlocks)
    .filter((parts) => parts.length >= 2)
    .sort((a, b) => b.length - a.length);
  return valid[0] || [];
}

/**
 * Fast local split for pasted JD text.
 * Handles LinkedIn-style dumps where "About the job" is inline, not alone on a line.
 */
export function splitJobDescriptions(raw: string): string[] {
  const text = String(raw || "").trim();
  if (!text) return [];

  if (EXPLICIT_SPLIT.test(text)) {
    const explicit = cleanBlocks(text.split(EXPLICIT_SPLIT));
    if (explicit.length >= 1) return explicit;
  }

  const candidates: string[][] = [];

  // 1) Split on "About the job" / similar markers anywhere (inline or own line)
  if (countMatches(text, MARKER) >= 2) {
    candidates.push(text.split(/(?=About the job\b)/i));
    candidates.push(text.split(/(?=About the role\b)/i));
    candidates.push(text.split(/(?=About this job\b)/i));
    candidates.push(text.split(/(?=Job description\b)/i));
    candidates.push(
      text.split(
        /(?=(?:About the job|About the role|About this job|Job description|Role description|Position description)\b)/i,
      ),
    );
  }

  // 2) Repeated company websites / contact footers often end a posting
  const siteHits = text.match(/\bwww\.[a-z0-9.-]+\.[a-z]{2,}\b/gi) || [];
  if (new Set(siteHits.map((s) => s.toLowerCase())).size >= 2) {
    candidates.push(
      text.split(/(?=\n[^\n]{0,80}\bwww\.[a-z0-9.-]+\.[a-z]{2,}\b)/i),
    );
  }

  // 3) Multiple career/job URLs
  const careerUrlRe =
    /https?:\/\/[^\s)]*(?:careers|jobs|greenhouse|lever\.co|ashbyhq|workday|linkedin\.com\/jobs)[^\s)]*/gi;
  if (countMatches(text, careerUrlRe) >= 2) {
    candidates.push(
      text.split(
        /(?=https?:\/\/[^\s)]*(?:careers|jobs|greenhouse|lever\.co|ashbyhq|workday|linkedin\.com\/jobs)[^\s)]*)/i,
      ),
    );
  }

  // 4) "Show more" / LinkedIn artifacts between posts
  if (countMatches(text, /Show more/gi) >= 2) {
    candidates.push(text.split(/(?=Show more\b)/i));
  }

  const multi = bestSplit(candidates);
  if (multi.length >= 2) return multi;

  return text.length >= MIN_JD_CHARS ? [text] : [];
}

/** True when paste is long enough that an LLM split is worth trying. */
export function shouldRefineJdSplit(raw: string, heuristicCount: number): boolean {
  const text = String(raw || "").trim();
  if (text.length < 1800) return false;
  if (heuristicCount >= 2) {
    // Still refine very large dumps that may be under-split
    return text.length >= 12000 && heuristicCount < 8;
  }
  // One blob but looks like it might contain several posts
  const markerHits = countMatches(text, MARKER);
  const wwwHits = new Set(
    (text.match(/\bwww\.[a-z0-9.-]+\.[a-z]{2,}\b/gi) || []).map((s) =>
      s.toLowerCase(),
    ),
  ).size;
  return markerHits >= 2 || wwwHits >= 2 || text.length >= 4000;
}

/** Short label for UI lists. */
export function jdPreviewTitle(jd: string, maxLen = 90): string {
  let flat = String(jd || "").replace(/\s+/g, " ").trim();
  flat = flat.replace(
    /^(About the job|About the role|About this job|Job description|Role description|Position description)\s*/i,
    "",
  );

  const lines = String(jd || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const skip =
    /^(about the job|about the role|about this job|job description|role description|position description|the role|responsibilities|show more|show less)$/i;

  let line =
    lines.find((l) => !skip.test(l) && l.length >= 4) ||
    flat ||
    "Job description";

  line = line.replace(
    /^(About the job|About the role|About this job|Job description)\s*/i,
    "",
  );

  if (line.length <= maxLen) return line || "Job description";
  return `${line.slice(0, maxLen - 1)}…`;
}

export function jdPreviewSnippet(jd: string, maxLen = 160): string {
  const flat = String(jd || "")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= maxLen) return flat;
  return `${flat.slice(0, maxLen - 1)}…`;
}

export { MIN_JD_CHARS };
