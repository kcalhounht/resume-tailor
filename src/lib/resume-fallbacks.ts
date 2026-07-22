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
  const fromJd = extracted.hardTechnicalSkills.map(String).filter(Boolean);
  if (fromJd.length >= 3) return fromJd;
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
  const skills = skillPhrase(skillPool(extracted), roleIndex, 3);
  const place = exp.location.trim() || "hybrid";
  const variants = [
    `At ${exp.company}, contributed as ${exp.title} in a ${place.toLowerCase()} environment, focusing on ${skills} and reliable delivery with product and engineering partners.`,
    `${exp.title} at ${exp.company} supporting scalable systems with ${skills}; collaborated across teams to ship production features aligned to business priorities.`,
    `Served as ${exp.title} at ${exp.company} (${place}), owning implementation and iteration of services involving ${skills} for customer-facing and internal platforms.`,
    `${exp.company} engineering team member as ${exp.title}, delivering features and operational improvements around ${skills} in a ${place.toLowerCase()} setting.`,
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
    `Delivered production features as ${exp.title} at ${exp.company}, applying ${skillPhrase(skills, 0)} to improve reliability for critical workflows.`,
    `Partnered with product and engineering teams at ${exp.company} to design and ship solutions using ${skillPhrase(skills, 1)}, accelerating release readiness.`,
    `Owned end-to-end implementation involving ${skillPhrase(skills, 2)}, including reviews, testing, and rollout support for ${exp.company} stakeholders.`,
    `Improved maintainability at ${exp.company} by refactoring components around ${skillPhrase(skills, 3)} and clarifying ownership across related services.`,
    `Strengthened ${exp.location.toLowerCase() || "team"} delivery practices with ${skillPhrase(skills, 4)}, reducing incident risk through clearer monitoring and deployments.`,
    `Translated requirements into shipped increments using ${skillPhrase(skills, 5)}, keeping scope aligned to ${exp.company} product priorities.`,
    `Supported production readiness for ${exp.company} initiatives by hardening automated checks and applying ${skillPhrase(skills, 6)} across release cycles.`,
    `Led troubleshooting and iterative improvements on ${skillPhrase(skills, 2)} paths, cutting recurring defects and stabilizing delivery for ${exp.company} customers.`,
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
