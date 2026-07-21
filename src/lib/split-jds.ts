const MIN_JD_CHARS = 80;

/** Explicit user separators (still supported). */
const EXPLICIT_SPLIT = /\n\s*---+\s*\n/;

const MARKER =
  /About the job|About the role|Job description|Role description|Position description|About this job|About this role/gi;

export type DetectedJd = {
  text: string;
  company: string;
  role: string;
};

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

  const siteHits = text.match(/\bwww\.[a-z0-9.-]+\.[a-z]{2,}\b/gi) || [];
  if (new Set(siteHits.map((s) => s.toLowerCase())).size >= 2) {
    candidates.push(
      text.split(/(?=\n[^\n]{0,80}\bwww\.[a-z0-9.-]+\.[a-z]{2,}\b)/i),
    );
  }

  const careerUrlRe =
    /https?:\/\/[^\s)]*(?:careers|jobs|greenhouse|lever\.co|ashbyhq|workday|linkedin\.com\/jobs)[^\s)]*/gi;
  if (countMatches(text, careerUrlRe) >= 2) {
    candidates.push(
      text.split(
        /(?=https?:\/\/[^\s)]*(?:careers|jobs|greenhouse|lever\.co|ashbyhq|workday|linkedin\.com\/jobs)[^\s)]*)/i,
      ),
    );
  }

  if (countMatches(text, /Show more/gi) >= 2) {
    candidates.push(text.split(/(?=Show more\b)/i));
  }

  const multi = bestSplit(candidates);
  if (multi.length >= 2) return multi;

  return text.length >= MIN_JD_CHARS ? [text] : [];
}

export function shouldRefineJdSplit(raw: string, heuristicCount: number): boolean {
  const text = String(raw || "").trim();
  if (text.length < 1800) return false;
  if (heuristicCount >= 2) {
    return text.length >= 12000 && heuristicCount < 8;
  }
  const markerHits = countMatches(text, MARKER);
  const wwwHits = new Set(
    (text.match(/\bwww\.[a-z0-9.-]+\.[a-z]{2,}\b/gi) || []).map((s) =>
      s.toLowerCase(),
    ),
  ).size;
  return markerHits >= 2 || wwwHits >= 2 || text.length >= 4000;
}

function cleanLabel(value: string, maxLen = 80): string {
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/^[,.:;\-–—|]+/, "")
    .replace(/[,.:;\-–—|]+$/, "")
    .trim();
  if (!cleaned) return "";
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen - 1)}…`;
}

/**
 * Best-effort company + role extraction for UI labels.
 */
export function extractJdMeta(jd: string): { company: string; role: string } {
  const text = String(jd || "").trim();
  const flat = text.replace(/\s+/g, " ").trim();
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let company = "";
  let role = "";

  const atCompany =
    flat.match(
      /\b(?:at|@)\s+([A-Z][A-Za-z0-9&.'’\-\s]{1,60}?)(?:[,.]|\s+(?:we|is|are|believes?|helps?|provides?|offers?|looking|hiring|seeking)\b)/,
    ) ||
    flat.match(
      /\bAbout the (?:job|role)\s+At\s+([A-Z][A-Za-z0-9&.'’\-\s]{1,60}?)(?:[,.]|\s+)/i,
    );
  if (atCompany?.[1]) company = cleanLabel(atCompany[1]);

  if (!company) {
    const www = flat.match(/\bwww\.([a-z0-9-]+)\.[a-z]{2,}\b/i);
    if (www?.[1] && !/linkedin|google|facebook|indeed/i.test(www[1])) {
      company = cleanLabel(www[1].replace(/-/g, " "));
      company = company.charAt(0).toUpperCase() + company.slice(1);
    }
  }

  if (!company) {
    const mail = flat.match(
      /@([a-z0-9-]+)\.(?:com|io|co|ai|net|org|dev)\b/i,
    );
    if (mail?.[1] && !/gmail|yahoo|outlook|hotmail|icloud/i.test(mail[1])) {
      company = cleanLabel(mail[1].replace(/-/g, " "));
      company = company.charAt(0).toUpperCase() + company.slice(1);
    }
  }

  const rolePatterns = [
    /\b(?:hiring|seeking|looking for|join us as|role(?:\s+title)?\s*[:\-]|position\s*[:\-]|title\s*[:\-])\s+([A-Z][A-Za-z0-9+/#&.'’\-\s]{2,70})/,
    /\b((?:Senior|Junior|Staff|Principal|Lead|Head of)?\s*(?:Software|Full[-\s]?Stack|Backend|Frontend|Front[-\s]?End|Back[-\s]?End|Data|AI|ML|DevOps|Cloud|Mobile|iOS|Android|Product|QA|Security)?\s*(?:Engineer|Developer|Scientist|Analyst|Architect|Manager|Designer|Consultant|Specialist)(?:\s+[IVX0-9]+)?)\b/i,
  ];
  for (const re of rolePatterns) {
    const m = flat.match(re);
    if (m?.[1]) {
      role = cleanLabel(m[1]);
      break;
    }
  }

  if (!role) {
    const skip =
      /^(about the job|about the role|job description|responsibilities|requirements|qualifications|show more|show less|we are|our team)/i;
    const candidate = lines.find(
      (l) =>
        !skip.test(l) &&
        l.length >= 6 &&
        l.length <= 90 &&
        /engineer|developer|manager|analyst|scientist|designer|architect|lead|specialist|consultant/i.test(
          l,
        ),
    );
    if (candidate) role = cleanLabel(candidate);
  }

  if (!company) company = "Unknown company";
  if (!role) role = "Unknown role";

  return { company, role };
}

export function toDetectedJobs(texts: string[]): DetectedJd[] {
  return texts.map((text) => {
    const meta = extractJdMeta(text);
    return { text, company: meta.company, role: meta.role };
  });
}

export function splitJobDescriptionsDetailed(raw: string): DetectedJd[] {
  return toDetectedJobs(splitJobDescriptions(raw));
}

export function jdPreviewTitle(jd: string, maxLen = 90): string {
  const meta = extractJdMeta(jd);
  if (meta.company !== "Unknown company" || meta.role !== "Unknown role") {
    const label = `${meta.company} · ${meta.role}`;
    if (label.length <= maxLen) return label;
    return `${label.slice(0, maxLen - 1)}…`;
  }

  let flat = String(jd || "").replace(/\s+/g, " ").trim();
  flat = flat.replace(
    /^(About the job|About the role|About this job|Job description|Role description|Position description)\s*/i,
    "",
  );
  if (flat.length <= maxLen) return flat || "Job description";
  return `${flat.slice(0, maxLen - 1)}…`;
}

export function jdPreviewSnippet(jd: string, maxLen = 160): string {
  const flat = String(jd || "")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= maxLen) return flat;
  return `${flat.slice(0, maxLen - 1)}…`;
}

export { MIN_JD_CHARS };
