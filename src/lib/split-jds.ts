export const MIN_JD_CHARS = 80;

/** Explicit user separators (still supported). */
const EXPLICIT_SPLIT = /\n\s*---+\s*\n/;

const MARKER =
  /About the job|About the role|Job description|Role description|Position description|About this job|About this role/gi;

export type DetectedJd = {
  text: string;
  company: string;
  role: string;
  /** Optional job posting URL from structured paste */
  url?: string;
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
  const markerTarget = findJobHeaderStarts(text).length;
  const normalized = candidates
    .map((parts) => mergeTinyJobFragments(sanitizeParts(cleanBlocks(parts))))
    .filter((parts) => parts.length >= 2);

  if (!normalized.length) return [];

  if (markerTarget >= 2) {
    normalized.sort((a, b) => {
      const da = Math.abs(a.length - markerTarget);
      const db = Math.abs(b.length - markerTarget);
      if (da !== db) return da - db;
      return a.length - b.length;
    });
    return normalized[0];
  }

  normalized.sort((a, b) => {
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
 * Treat each "About the job" as a posting boundary.
 * LinkedIn dumps almost never mention this phrase mid-JD, so counting all
 * matches is more accurate than over-filtering (which under-counted jobs).
 */
function findJobHeaderStarts(text: string): number[] {
  const re = /About the job\b/gi;
  const indices: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const idx = match.index;
    // Skip duplicate / overlapping matches only
    if (indices.length && idx - indices[indices.length - 1] < 8) continue;
    indices.push(idx);
  }

  return indices;
}

function splitAtIndices(text: string, indices: number[]): string[] {
  if (indices.length < 2) return [];
  const parts: string[] = [];
  for (let i = 0; i < indices.length; i++) {
    const start = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1] : text.length;
    const slice = text.slice(start, end).trim();
    // Keep every header section — even short ones (real JDs can be brief)
    if (slice.length >= 40) parts.push(slice);
  }
  // Do NOT mergeTiny here — that was merging real short JDs and under-counting
  return parts;
}

/**
 * If a false header creates a tiny extra JD, fold it back.
 */
function mergeTinyJobFragments(parts: string[]): string[] {
  if (parts.length <= 1) return parts;

  const lengths = [...parts.map((p) => p.length)].sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)] || 0;
  // More aggressive: false extras are usually much shorter than real LinkedIn JDs
  const threshold = Math.max(400, Math.floor(median * 0.25));

  const out: string[] = [];
  for (const part of parts) {
    if (out.length > 0 && part.length < threshold) {
      out[out.length - 1] = `${out[out.length - 1]}\n\n${part}`;
      continue;
    }
    out.push(part);
  }
  return out;
}

/** How many strict JD headers were found (for UI debugging). */
export function countJobHeaders(raw: string): number {
  return findJobHeaderStarts(String(raw || "")).length;
}

/**
 * Fast local split for pasted JD text.
 * Handles LinkedIn-style dumps where "About the job" is inline, not alone on a line.
 */
export function splitJobDescriptions(raw: string): string[] {
  const text = String(raw || "").trim();
  if (!text) return [];

  if (EXPLICIT_SPLIT.test(text)) {
    const explicit = mergeTinyJobFragments(
      sanitizeParts(cleanBlocks(text.split(EXPLICIT_SPLIT))),
    );
    if (explicit.length >= 1) return explicit;
  }

  const headerStarts = findJobHeaderStarts(text);
  if (headerStarts.length >= 2) {
    const byHeaders = splitAtIndices(text, headerStarts);
    if (byHeaders.length >= 2) return byHeaders;
  }

  const markerCount = countMatches(text, MARKER);
  const candidates: string[][] = [];

  // Only use weaker signals when strict headers are missing
  if (headerStarts.length < 2 && markerCount < 2) {
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

/** Always use OpenRouter when pasted text looks like at least one JD. */
export function shouldDetectJdsWithOpenRouter(raw: string): boolean {
  return String(raw || "").trim().length >= MIN_JD_CHARS;
}

/**
 * Soft-chunk a large paste so each OpenRouter call stays within Vercel time limits.
 * Prefers cutting on known "About the job" headers. Keep chunks small (~8–10k).
 */
export function chunkPasteForLlm(raw: string, maxChars = 9000): string[] {
  const text = String(raw || "").trim();
  if (!text) return [];
  if (text.length <= maxChars) return [text];

  const starts = findJobHeaderStarts(text);
  if (starts.length < 2) {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += maxChars) {
      chunks.push(text.slice(i, i + maxChars));
    }
    return chunks.map((c) => c.trim()).filter((c) => c.length >= MIN_JD_CHARS);
  }

  const chunks: string[] = [];
  let chunkStart = starts[0];
  let prevBreak = starts[0];

  for (let i = 0; i < starts.length; i++) {
    const jobEnd = i + 1 < starts.length ? starts[i + 1] : text.length;
    if (jobEnd - chunkStart > maxChars && prevBreak > chunkStart) {
      chunks.push(text.slice(chunkStart, prevBreak));
      chunkStart = prevBreak;
    }
    prevBreak = jobEnd;
  }
  chunks.push(text.slice(chunkStart));

  return chunks.map((c) => c.trim()).filter((c) => c.length >= MIN_JD_CHARS);
}

/** One job per About-the-job header when possible — used only to size OpenRouter requests. */
export function chunkPasteByJobHeaders(raw: string, maxJobsPerChunk = 4): string[] {
  const text = String(raw || "").trim();
  if (!text) return [];
  const starts = findJobHeaderStarts(text);
  if (starts.length < 2) return chunkPasteForLlm(text);

  const jobSlices: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1] : text.length;
    const slice = text.slice(starts[i], end).trim();
    if (slice.length >= MIN_JD_CHARS) jobSlices.push(slice);
  }

  const MAX = 12000;
  const chunks: string[] = [];
  let batch: string[] = [];
  let batchLen = 0;

  const flush = () => {
    if (!batch.length) return;
    chunks.push(batch.join("\n\n"));
    batch = [];
    batchLen = 0;
  };

  for (const slice of jobSlices) {
    if (slice.length > MAX) {
      flush();
      chunks.push(...chunkPasteForLlm(slice, MAX));
      continue;
    }
    if (
      batch.length >= maxJobsPerChunk ||
      (batchLen + slice.length > MAX && batch.length > 0)
    ) {
      flush();
    }
    batch.push(slice);
    batchLen += slice.length;
  }
  flush();

  return chunks.filter((c) => c.length >= MIN_JD_CHARS);
}

/** @deprecated use shouldDetectJdsWithOpenRouter */
export function shouldRefineJdSplit(raw: string, _heuristicCount = 0): boolean {
  return shouldDetectJdsWithOpenRouter(raw);
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
    ) ||
    flat.match(
      /\bWho are\s+([A-Z][A-Za-z0-9&.'’\-]{1,40})\b/i,
    ) ||
    flat.match(
      /\b([A-Z][A-Za-z0-9&.'’\-]{1,40})\s+(?:API Management|is the leading|is hiring|is looking)\b/,
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

const FIELD_LINE =
  /^(?:company|employer|organization|org|job\s*url|url|link|role|title|position|job\s*title)\s*:\s*(.+)$/i;
const JD_START =
  /^(?:jd|job\s*description|description|job\s*text|posting)\s*:\s*(.*)$/i;

function readField(
  lines: string[],
  names: RegExp,
): { value: string; lineIndex: number } | null {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(names);
    if (m?.[1]?.trim()) {
      return { value: m[1].trim(), lineIndex: i };
    }
  }
  return null;
}

function parseOneStructuredBlock(block: string, index: number): DetectedJd | null {
  const raw = String(block || "").replace(/\u0000/g, "").trim();
  if (!raw) return null;

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const companyHit =
    readField(lines, /^(?:company|employer|organization|org)\s*:\s*(.+)$/i) ||
    null;
  const urlHit =
    readField(
      lines,
      /^(?:job\s*url|url|link|posting\s*url|job\s*link)\s*:\s*(.+)$/i,
    ) || null;
  const roleHit =
    readField(
      lines,
      /^(?:role|title|position|job\s*title)\s*:\s*(.+)$/i,
    ) || null;

  let jdText = "";
  const jdLineIdx = lines.findIndex((l) => JD_START.test(l));
  if (jdLineIdx >= 0) {
    const first = lines[jdLineIdx].match(JD_START)?.[1]?.trim() || "";
    const rest = lines.slice(jdLineIdx + 1).join("\n").trim();
    jdText = [first, rest].filter(Boolean).join("\n").trim();
  } else if (companyHit || urlHit) {
    // Structured header fields present: JD is remaining non-field lines
    const skip = new Set<number>();
    if (companyHit) skip.add(companyHit.lineIndex);
    if (urlHit) skip.add(urlHit.lineIndex);
    if (roleHit) skip.add(roleHit.lineIndex);
    jdText = lines
      .filter((_, i) => !skip.has(i))
      .filter((l) => !FIELD_LINE.test(l))
      .join("\n")
      .trim();
  }

  if (jdText.length < MIN_JD_CHARS) return null;

  const company =
    cleanLabel(companyHit?.value || "") ||
    extractJdMeta(jdText).company ||
    "Unknown company";
  const role =
    cleanLabel(roleHit?.value || "") ||
    extractJdMeta(jdText).role ||
    "Unknown role";
  let url = (urlHit?.value || "").trim();
  if (url && !/^https?:\/\//i.test(url) && /^[\w.-]+\.[a-z]{2,}/i.test(url)) {
    url = `https://${url}`;
  }
  if (!url) url = `manual://structured-job-${index + 1}`;

  // Keep company/role/url visible to downstream extract
  const text = [
    `Company: ${company}`,
    `Role: ${role}`,
    `URL: ${url}`,
    "",
    jdText,
  ].join("\n");

  return { text, company, role, url };
}

/**
 * True when the paste looks like structured Company/URL/JD blocks.
 */
export function looksLikeStructuredJdPaste(raw: string): boolean {
  const text = String(raw || "").trim();
  if (!text) return false;

  const companyHits = (
    text.match(/^(?:company|employer|organization|org)\s*:/gim) || []
  ).length;
  const urlHits = (
    text.match(/^(?:job\s*url|url|link|posting\s*url|job\s*link)\s*:/gim) || []
  ).length;
  const jdHits = (
    text.match(/^(?:jd|job\s*description|description|job\s*text|posting)\s*:/gim) ||
    []
  ).length;

  if (companyHits >= 1 && (urlHits >= 1 || jdHits >= 1)) return true;
  if (companyHits >= 2) return true;
  return false;
}

/**
 * Parse structured JD lists into exact jobs (one block = one JD).
 * Preferred separators: --- between jobs.
 */
export function parseStructuredJdList(raw: string): DetectedJd[] {
  const text = String(raw || "").trim();
  if (!text || !looksLikeStructuredJdPaste(text)) return [];

  let blocks: string[] = [];
  if (EXPLICIT_SPLIT.test(text)) {
    blocks = text.split(EXPLICIT_SPLIT).map((b) => b.trim()).filter(Boolean);
  } else {
    // Split before each new Company: line (except the first)
    const parts = text.split(
      /\n(?=(?:company|employer|organization|org)\s*:)/i,
    );
    blocks = parts.map((b) => b.trim()).filter(Boolean);
  }

  const jobs: DetectedJd[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const parsed = parseOneStructuredBlock(blocks[i], jobs.length);
    if (parsed) jobs.push(parsed);
  }
  return jobs;
}
