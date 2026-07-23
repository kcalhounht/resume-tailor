import type { ExtractedJD } from "./types";

type ExperienceSeed = {
  company: string;
  title: string;
  location: string;
};

function normalizeBulletKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function skillPool(extracted: ExtractedJD): string[] {
  const fromJd = [
    ...extracted.hardTechnicalSkills,
    ...extracted.requiredSkills,
  ]
    .map(String)
    .filter(Boolean);
  if (fromJd.length >= 3) return [...new Set(fromJd)];
  return [
    ...fromJd,
    "APIs",
    "cloud services",
    "distributed systems",
    "data pipelines",
    "CI/CD",
    "observability",
    "platform tooling",
  ];
}

function skillPhrase(skills: string[], start: number, count = 3): string {
  if (!skills.length) return "core platform technologies";
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    const item = skills[(start + i) % skills.length];
    if (!picked.includes(item)) picked.push(item);
  }
  return picked.join(", ");
}

function jdFocusLines(extracted: ExtractedJD): string[] {
  const lines = [
    ...extracted.responsibilities,
    ...extracted.mustHave,
    extracted.summary,
  ]
    .map((s) => String(s || "").trim())
    .filter((s) => s.length >= 12)
    .map((s) => s.replace(/^[-•\s]+/, "").slice(0, 90));
  return [...new Set(lines)].slice(0, 8);
}

function hashSeed(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** Distinct role overview — JD-shaped, not a fixed template per company. */
export function buildExperienceOverview(
  exp: ExperienceSeed,
  extracted: ExtractedJD,
  roleIndex: number,
): string {
  const skills = skillPhrase(skillPool(extracted), roleIndex + 1, 3);
  const place = exp.location.trim() || "hybrid";
  const target = extracted.jobTitle || extracted.type || "engineering";
  const focus =
    jdFocusLines(extracted)[roleIndex % Math.max(1, jdFocusLines(extracted).length)] ||
    `${target} delivery`;
  const variants = [
    `At ${exp.company}, worked as ${exp.title} (${place}) with ownership of ${skills}, aligning day-to-day delivery to ${focus}.`,
    `${exp.title} at ${exp.company} supporting ${target} outcomes through ${skills}, with emphasis on ${focus}.`,
    `As ${exp.title} at ${exp.company}, contributed across ${skills} while advancing ${focus} for production stakeholders.`,
    `${exp.company} role as ${exp.title} focused on practical ${skills} work tied to ${focus} in a ${place.toLowerCase()} setting.`,
  ];
  return variants[(roleIndex + hashSeed(exp.company)) % variants.length];
}

/**
 * Fill experience bullets without the same rigid verb+metric formula every time.
 * Mix JD responsibilities/must-haves so each JD produces different shapes.
 */
export function buildVariedExperienceBullets(
  exp: ExperienceSeed,
  extracted: ExtractedJD,
  existing: string[],
  targetCount = 7,
): string[] {
  const skills = skillPool(extracted);
  const focuses = jdFocusLines(extracted);
  const seed = hashSeed(`${exp.company}|${exp.title}|${extracted.jobTitle}`);
  const n = (i: number) => 3 + ((seed + i * 7) % 9); // 3..11 style variety
  const users = [2, 5, 8, 12, 20, 35, 50][(seed + 1) % 7];
  const ms = [120, 180, 250, 320, 420, 500][(seed + 2) % 6];

  const templates = [
    `Delivered work at ${exp.company} on ${skillPhrase(skills, seed, 3)} tied to ${focuses[0] || extracted.jobTitle || "core platform goals"}, shipping ${n(0)} production changes across a quarter.`,
    `Owned a slice of ${focuses[1] || "service reliability"} as ${exp.title}, using ${skillPhrase(skills, seed + 1, 2)} to keep p95 near ${ms}ms for ${users}k+ weekly users.`,
    `Partnered on ${focuses[2] || "feature delivery"} at ${exp.company}: implemented ${skillPhrase(skills, seed + 2, 3)} paths and closed ${10 + ((seed + 3) % 20)} review/QA follow-ups before release.`,
    `Improved operational readiness for ${exp.company} systems around ${skillPhrase(skills, seed + 3, 2)}, cutting recurring incident noise by clearing ${15 + ((seed + 4) % 25)} backlog items.`,
    `Built tooling/process for ${focuses[3] || "faster iteration"} with ${skillPhrase(skills, seed + 4, 3)}, enabling ${n(4)} safer rollouts per month for ${exp.title} responsibilities.`,
    `Translated ${extracted.jobTitle || extracted.type || "role"} requirements into concrete ${exp.company} deliverables using ${skillPhrase(skills, seed + 5, 2)}, covering data/quality checks on ${n(5)} critical flows.`,
    `Strengthened ${focuses[4] || "production observability"} at ${exp.company} with ${skillPhrase(skills, seed + 6, 3)}, documenting runbooks and reducing handoff time for on-call rotations.`,
    `Advanced ${focuses[5] || "platform capabilities"} as ${exp.title}: extended ${skillPhrase(skills, seed + 7, 2)} components used by ${n(7)} internal consumers without blocking release trains.`,
  ];

  // Rotate template order by company so roles don't share the same sequence.
  const rotated = [
    ...templates.slice(seed % templates.length),
    ...templates.slice(0, seed % templates.length),
  ];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const bullet of existing) {
    const key = normalizeBulletKey(bullet);
    if (!key || seen.has(key)) continue;
    const prefix = key.slice(0, 72);
    if ([...seen].some((s) => s.slice(0, 72) === prefix)) continue;
    // Drop obvious canned openings that make every JD look identical.
    if (
      /^built and shipped production features as /i.test(key) ||
      /^led design and delivery of services with /i.test(key) ||
      /^scaled platform components around /i.test(key)
    ) {
      continue;
    }
    seen.add(key);
    out.push(bullet);
  }

  for (const template of rotated) {
    if (out.length >= targetCount) break;
    const key = normalizeBulletKey(template);
    if (seen.has(key)) continue;
    const prefix = key.slice(0, 72);
    if ([...seen].some((s) => s.slice(0, 72) === prefix)) continue;
    seen.add(key);
    out.push(template);
  }

  return out.slice(0, Math.max(targetCount, Math.min(8, out.length)));
}
