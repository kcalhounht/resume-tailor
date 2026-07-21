const MIN_JD_CHARS = 80;

/** Explicit user separators (still supported). */
const EXPLICIT_SPLIT = /\n\s*---+\s*\n/;

const MARKER =
  /About the job|About the role|Job description|Role description|Position description|About this job|About this role/gi;

const ABOUT_JOB = /About the job\b/gi;

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

function hasJobMarker(block: string): boolean {
  return countMatches(block, MARKER) > 0;
}

function looksLikeFooterOrPreamble(block: string): boolean {
  const flat = block.replace(/\s+/g, " ").trim();
  if (flat.length < 220 && !hasJobMarker(block)) return true;
  if (
    /^(contact:|discover the power|apply!|to learn more|www\.|https?:\/\/)/i.test(
      flat,
    ) &&
    !hasJobMarker(block)
  ) {
    return true;
  }
  // LinkedIn chrome / nav leftovers
  if (
    !hasJobMarker(block) &&
    flat.length < 500 &&
    /people also viewed|similar jobs|set alert|easy apply/i.test(flat)
  ) {
    return true;
  }
  return false;
}

/** Drop/merge fragments so we don't invent an extra JD. */
function sanitizeParts(parts: string[]): string[] {
  if (parts.length <= 1) return parts;

  const out: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (looksLikeFooterOrPreamble(trimmed)) {
      // Attach weak chunk to previous real JD when possible
      if (out.length > 0) {
        out[out.length - 1] = `${out[out.length - 1]}\n\n${trimmed}`;
      }
      // else drop leading preamble
      continue;
    }
    out.push(trimmed);
  }

  return out.filter((b) => b.length >= MIN_JD_CHARS);
}

/**
 * Prefer splits that match "About the job" markers instead of maximizing
 * fragment count (www/URL splits often over-detect).
 */
function pickBestSplit(
  text: string,
  candidates: string[][],
): string[] {
  const markerTarget = countMatches(text, ABOUT_JOB);
  const normalized = candidates
    .map((parts) => sanitizeParts(cleanBlocks(parts)))
    .filter((parts) => parts.length >= 2);

  if (!normalized.length) return [];

  if (markerTarget >= 2) {
    // Closest to marker count wins; ties prefer fewer extras
    normalized.sort((a, b) => {
      const da = Math.abs(a.length - markerTarget);
      const db = Math.abs(b.length - markerTarget);
      if (da !== db) return da - db;
      return a.length - b.length;
    });
    return normalized[0];
  }

  // No reliable marker count: prefer moderate splits (not max fragmentation)
  normalized.sort((a, b) => {
    // Prefer 2-8 jobs, then more content coverage
    const score = (parts: string[]) => {
      const lenPenalty = parts.length > 8 ? parts.length - 8 : 0;
      const tooFew = parts.length < 2 ? 10 : 0;
      return tooFew + lenPenalty;
    };
    const sa = score(a);
    const sb = score(b);
    if (sa !== sb) return sa - sb;
    return b.length - a.length;
  });
  return normalized[0];
}

/**
 * Fast local split for pasted JD text.
 * Handles LinkedIn-style dumps where "About the job" is inline, not alone on a line.
 */
export function splitJobDescriptions(raw: string): string[] {
  const text = String(raw || "").trim();
  if (!text) return [];

  if (EXPLICIT_SPLIT.test(text)) {
    const explicit = sanitizeParts(cleanBlocks(text.split(EXPLICIT_SPLIT)));
    if (explicit.length >= 1) return explicit;
  }

  const aboutCount = countMatches(text, ABOUT_JOB);
  const markerCount = countMatches(text, MARKER);

  // Primary: split on About the job (most common LinkedIn paste)
  if (aboutCount >= 2) {
    let parts = text.split(/(?=About the job\b)/i).map((p) => p.trim());
    // Leading text before first "About the job" is usually not its own JD
    if (parts.length >= 2 && !/About the job\b/i.test(parts[0])) {
      parts = parts.slice(1);
    }
    const cleaned = sanitizeParts(cleanBlocks(parts));
    if (cleaned.length >= 2) return cleaned;
  }

  const candidates: string[][] = [];

  if (markerCount >= 2) {
    candidates.push(
      text.split(
        /(?=(?:About the job|About the role|About this job|Job description|Role description|Position description)\b)/i,
      ),
    );
    candidates.push(text.split(/(?=About the role\b)/i));
    candidates.push(text.split(/(?=Job description\b)/i));
  }

  // Only use weaker signals when markers are missing
  if (markerCount < 2) {
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
  }

  const multi = pickBestSplit(text, candidates);
  if (multi.length >= 2) return multi;

  return text.length >= MIN_JD_CHARS ? [text] : [];
}

export function shouldRefineJdSplit(raw: string, heuristicCount: number): boolean {
  const text = String(raw || "").trim();
  if (text.length < 1800) return false;

  const aboutCount = countMatches(text, ABOUT_JOB);
  // If About-the-job count already matches detected jobs, trust it
  if (aboutCount >= 2 && heuristicCount === aboutCount) {
    return false;
  }

  if (heuristicCount >= 2) {
    // Only refine when clearly under-split on a huge paste
    return text.length >= 12000 && heuristicCount < aboutCount;
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
