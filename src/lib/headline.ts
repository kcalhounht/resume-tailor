import type { ExtractedJD, SkillGroup } from "./types";
import { sanitizePlainText } from "./validate-resume";

/** `Target Role | Skill, Skill, Skill` (3–4 hard skills). */
export function buildResumeHeadline(
  extracted: ExtractedJD,
  skills: SkillGroup[] = [],
  generated?: string,
): string {
  const cleaned = sanitizePlainText(generated || "");
  if (cleaned) return cleaned;

  const role = sanitizePlainText(extracted.jobTitle || extracted.type);
  const picks = Array.from(
    new Set(
      [
        ...extracted.hardTechnicalSkills,
        ...skills.flatMap((group) => group.items),
      ]
        .map((item) => sanitizePlainText(item))
        .filter(Boolean),
    ),
  ).slice(0, 4);

  if (role && picks.length) return `${role} | ${picks.join(", ")}`;
  return role || picks.join(", ");
}
