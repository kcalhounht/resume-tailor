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

/** Distinct role overview — never the same canned line for every company. */
export function buildExperienceOverview(
  exp: ExperienceSeed,
  extracted: ExtractedJD,
  roleIndex: number,
): string {
  const skills = skillPhrase(skillPool(extracted), roleIndex, 4);
  const place = exp.location.trim() || "hybrid";
  const target = extracted.jobTitle || extracted.type || "engineering";
  const variants = [
    `At ${exp.company}, served as ${exp.title} in a ${place.toLowerCase()} setting, owning delivery around ${skills} with clear accountability for production quality aligned to ${target} outcomes.`,
    `${exp.title} at ${exp.company} building and operating scalable systems with ${skills}; partnered with product and platform teams to ship measurable improvements for customer-facing and internal workloads.`,
    `As ${exp.title} at ${exp.company} (${place}), led implementation and iteration of services involving ${skills}, emphasizing latency, reliability, and maintainable architecture.`,
    `${exp.company} engineering contributor as ${exp.title}, delivering features and operational hardening around ${skills} with ownership from design reviews through production rollout.`,
  ];
  return variants[roleIndex % variants.length];
}

/**
 * Fill experience bullets to 7–8 without repeating the same sentence.
 * Uses company/title/skills so fallback content stays specific per role.
 */
export function buildVariedExperienceBullets(
  exp: ExperienceSeed,
  extracted: ExtractedJD,
  existing: string[],
  targetCount = 7,
): string[] {
  const skills = skillPool(extracted);
  const templates = [
    `Built and shipped production features as ${exp.title} at ${exp.company} using ${skillPhrase(skills, 0)}, cutting critical-path p95 latency by ~28% for workflows serving 10k+ daily active users.`,
    `Led design and delivery of services with ${skillPhrase(skills, 1)} at ${exp.company}, raising release throughput to 8+ production increments per quarter with automated regression coverage and safer rollbacks.`,
    `Owned end-to-end implementation involving ${skillPhrase(skills, 2)}, including reviews and staged rollouts that reduced recurring production defects by ~30% for ${exp.company} workloads.`,
    `Scaled platform components around ${skillPhrase(skills, 3)} at ${exp.company}, supporting ~10x peak request volume during campaigns while keeping p95 latency within agreed SLOs.`,
    `Automated delivery and monitoring with ${skillPhrase(skills, 4)}, reducing mean time to detect incidents from hours to under 10 minutes across ${exp.company} ${exp.location.toLowerCase() || "engineering"} environments.`,
    `Delivered customer-facing capabilities with ${skillPhrase(skills, 5)}, improving completion/conversion on priority ${exp.company} journeys by a measurable mid-teens percentage lift.`,
    `Migrated and hardened core paths using ${skillPhrase(skills, 6)}, cutting infrastructure/runtime cost by ~20% while holding availability targets for ${exp.company} production systems.`,
    `Drove performance and reliability work on ${skillPhrase(skills, 2)} stacks, clearing a backlog of 40+ stability items and reducing on-call noise for ${exp.company} teams.`,
  ];

  const seen = new Set<string>();
  const out: string[] = [];

  for (const bullet of existing) {
    const key = normalizeBulletKey(bullet);
    if (!key || seen.has(key)) continue;
    // Drop near-duplicates (same opening clause)
    const prefix = key.slice(0, 72);
    if ([...seen].some((s) => s.slice(0, 72) === prefix)) continue;
    seen.add(key);
    out.push(bullet);
  }

  for (const template of templates) {
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
