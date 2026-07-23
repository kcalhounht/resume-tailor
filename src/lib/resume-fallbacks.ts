import type { ExtractedJD } from "./types";
import { STRONG_ACTION_VERBS } from "./action-verbs";

type ExperienceSeed = {
  company: string;
  title: string;
  location: string;
};

const JD_LEAK_RE =
  /\b(about the job|about the role|about this job|who are we\??|job description|what you.?ll do|responsibilities include|we are looking for|the leading .{0,40} company)\b/i;

/** Phrases from old ROLE_FAMILIES fillers — never ship these. */
export const CANNED_FILLER_RE =
  /pairing architecture decisions with hands-on implementation|progressive delivery controls|limiting blast radius of risky changes|health signals used in weekly reliability reviews|balancing cost against throughput goals|under clearer interfaces during the .+ tenure|focused on production delivery — model\/system quality|combines hands-on implementation with clear ownership from design through monitoring|supporting .+ outcomes through|delivered work at |owned a slice of |built tooling\/process for |translated .+ requirements into concrete /i;

const BANNED_TEMPLATE_OPENERS = [
  /^delivered work at /i,
  /^owned a slice of /i,
  /^partnered on /i,
  /^improved operational readiness for /i,
  /^built tooling\/process for /i,
  /^translated .+ requirements into concrete /i,
  /^strengthened .+ at /i,
  /^advanced .+ as /i,
  /supporting .+ outcomes through /i,
  /^spearheaded .+ delivery at /i,
  /^unified fragmented /i,
  /^deployed progressive delivery /i,
  /^instrumented .+ pipelines measuring /i,
  /^scaled batch and online workloads /i,
  /^modernized .+ delivery around /i,
  /^provisioned environments and pipelines /i,
];

const VERB_BANK = [...STRONG_ACTION_VERBS];

function normalizeBulletKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function skillPool(extracted: ExtractedJD): string[] {
  const fromJd = [
    ...extracted.hardTechnicalSkills,
    ...extracted.requiredSkills,
    ...extracted.mustHave,
  ]
    .map(String)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 40 && !JD_LEAK_RE.test(s));
  return [...new Set(fromJd)].slice(0, 24);
}

function skillPhrase(skills: string[], start: number, count = 2): string {
  if (!skills.length) return "production systems";
  const picked: string[] = [];
  for (let i = 0; i < count * 4 && picked.length < count; i++) {
    const item = skills[(start + i) % skills.length];
    if (item && !picked.includes(item)) picked.push(item);
  }
  return picked.join(" and ");
}

function cleanFocus(raw: string): string {
  let s = String(raw || "")
    .replace(/^[-•\s]+/, "")
    .replace(/["“”']/g, "")
    .trim();
  if (JD_LEAK_RE.test(s) || CANNED_FILLER_RE.test(s)) {
    const cut = s.split(/About the job|Who are we|Job description/i)[0]?.trim();
    s = cut && cut.length >= 12 ? cut : "";
  }
  s = s.replace(/\s+/g, " ").slice(0, 90);
  if (s.length < 12 || JD_LEAK_RE.test(s) || CANNED_FILLER_RE.test(s)) return "";
  return s;
}

function jdFocusLines(extracted: ExtractedJD): string[] {
  const lines = [
    ...extracted.responsibilities,
    ...extracted.mustHave,
    extracted.summary,
  ]
    .map(cleanFocus)
    .filter(Boolean);
  return [...new Set(lines)].slice(0, 10);
}

function hashSeed(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

function isBannedTemplate(text: string): boolean {
  const t = text.trim();
  if (JD_LEAK_RE.test(t) || CANNED_FILLER_RE.test(t)) return true;
  return BANNED_TEMPLATE_OPENERS.some((re) => re.test(t));
}

export function sanitizeExperienceBullet(text: string): string {
  let t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  t = t
    .replace(
      /\s*(?:tied to|aligned to|matching)?\s*["']?About the job[\s\S]*$/i,
      "",
    )
    .replace(/\s*Who are we\??[\s\S]*$/i, "")
    .replace(/\s*the leading .{0,60} company\.?/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[,\s]+$/g, "")
    .trim();
  if (t.length < 24 || isBannedTemplate(t)) return "";
  return t;
}

export function isCannedFillerText(text: string): boolean {
  return CANNED_FILLER_RE.test(text || "");
}

/** Distinct role overview — Ivan template usually omits these; keep short if needed. */
export function buildExperienceOverview(
  exp: ExperienceSeed,
  extracted: ExtractedJD,
  roleIndex: number,
): string {
  const skills = skillPhrase(skillPool(extracted), roleIndex * 3, 2);
  const target = extracted.jobTitle || extracted.type || "engineering";
  return `${exp.title} at ${exp.company}. Focused on ${skills} work aligned to ${target} delivery.`;
}

/**
 * Last-resort bullets ONLY when LLM returned nothing.
 * Built from JD responsibilities + unique verbs — no shared mad-lib shells across roles.
 */
export function buildVariedExperienceBullets(
  exp: ExperienceSeed,
  extracted: ExtractedJD,
  existing: string[],
  targetCount = 6,
  _usedOpeners?: Set<string>,
  _usedStructures?: Set<string>,
  _knownCompanies?: string[],
  openerCounts?: Map<string, number>,
): string[] {
  const skills = skillPool(extracted);
  const focuses = jdFocusLines(extracted);
  const seed = hashSeed(`${exp.company}|${exp.title}|${extracted.jobTitle}`);
  const verbCounts = openerCounts || new Map<string, number>();
  const seen = new Set<string>();
  const out: string[] = [];

  const tryPush = (raw: string) => {
    const bullet = sanitizeExperienceBullet(raw);
    if (!bullet || isCannedFillerText(bullet)) return false;
    const key = normalizeBulletKey(bullet);
    if (key.length < 24 || seen.has(key)) return false;
    const opener = (bullet.trim().split(/\s+/)[0] || "").toLowerCase();
    if (opener && (verbCounts.get(opener) || 0) >= 2) return false;
    const prefix = key.slice(0, 48);
    if ([...seen].some((s) => s.slice(0, 48) === prefix)) return false;
    seen.add(key);
    if (opener) verbCounts.set(opener, (verbCounts.get(opener) || 0) + 1);
    out.push(bullet);
    return true;
  };

  for (const bullet of existing) {
    if (out.length >= targetCount) break;
    tryPush(bullet);
  }

  // Responsibility-driven fills — each role gets a different offset into focuses/verbs
  const roleOffset = seed % Math.max(7, VERB_BANK.length);
  for (let i = 0; out.length < targetCount && i < 12; i++) {
    const verb = VERB_BANK[(roleOffset + i * 3) % VERB_BANK.length];
    const focus =
      focuses[(seed + i) % Math.max(1, focuses.length)] ||
      `${extracted.jobTitle || "platform"} delivery`;
    const sk = skillPhrase(skills, seed + i * 2, 2);
    // Unique shape per (company, i) — avoid identical skeletons across employers
    const shapes = [
      `${verb} ${sk} solutions at ${exp.company} to advance ${focus}, improving production readiness for the ${exp.title} scope.`,
      `${verb} ${focus} initiatives at ${exp.company} with ${sk}, delivering clearer ownership and faster engineering feedback loops.`,
      `${verb} production ${sk} capabilities for ${exp.company} stakeholders while serving as ${exp.title}, tightening reliability around ${focus}.`,
      `${verb} cross-team ${sk} delivery at ${exp.company} against ${focus} goals, reducing rework during release and review cycles.`,
    ];
    tryPush(shapes[(seed + i) % shapes.length]);
  }

  return out.slice(0, Math.max(targetCount, Math.min(8, out.length)));
}
