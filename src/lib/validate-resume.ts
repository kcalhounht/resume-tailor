import type {
  CandidateProfile,
  ExtractedJD,
  SkillGroup,
  TailoredPackage,
  TailoredResume,
} from "./types";
import { buildResumeHeadline } from "./headline";
import {
  alignExperienceYears,
  summaryMentionsYears,
  yearsOfExperienceFromProfile,
} from "./experience-years";

export interface ValidationIssue {
  level: "error" | "warning" | "fixed";
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  package: TailoredPackage;
}

/** Strip markdown and other artifacts the model often injects. */
export function sanitizePlainText(input: string): string {
  let text = String(input || "");

  // Convert **bold** / __bold__ / *italic* / _italic_ to plain text
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/__([^_]+)__/g, "$1");
  text = text.replace(/\*([^*\n]+)\*/g, "$1");
  text = text.replace(/_([^_\n]+)_/g, "$1");

  // Remove leftover markers and backticks
  text = text.replace(/```(?:json)?/gi, "");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/\*\*/g, "");
  text = text.replace(/__/g, "");
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/^\s*[-*•]\s+/gm, "");
  text = text.replace(/\u00a0/g, " ");
  text = text.replace(/[ \t]{2,}/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

function collectMarkdownIssues(label: string, text: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (/\*\*|__|```|`/.test(text)) {
    issues.push({
      level: "fixed",
      message: `Removed markdown formatting from ${label}.`,
    });
  }
  if (/^\s*#{1,6}\s+/m.test(text)) {
    issues.push({
      level: "fixed",
      message: `Removed heading markers from ${label}.`,
    });
  }
  return issues;
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const MIN_SUMMARY_WORDS = 91;

function summaryExpansionParts(
  profile: CandidateProfile,
  extracted: ExtractedJD,
): string[] {
  const years = yearsOfExperienceFromProfile(profile);
  const role = extracted.jobTitle || extracted.type || "the target role";
  const skills = extracted.hardTechnicalSkills.filter(Boolean).slice(0, 8);
  const parts: string[] = [];

  if (years) {
    parts.push(
      `Brings ${years} years of experience delivering production software for ${role}, with emphasis on reliability, delivery speed, and outcomes that match the job description.`,
    );
  }

  parts.push(
    `The professional focus is ${role} work involving ${
      skills.join(", ") || "core engineering, analysis, and delivery practices"
    } in a ${extracted.workMode || "flexible"} environment.`,
  );

  for (const exp of profile.experiences) {
    if (!exp.company?.trim()) continue;
    parts.push(
      `At ${exp.company} as ${exp.title || "a contributor"} (${exp.period || "the listed period"}) in ${
        exp.location || "a distributed setting"
      }, owned feature delivery, technical execution, and partnership with stakeholders on business-critical workflows.`,
    );
  }

  const education = profile.education.find((edu) => edu.school?.trim());
  if (education) {
    parts.push(
      `Academic preparation includes ${education.degree || "study"} in ${
        education.discipline || "the listed discipline"
      } at ${education.school}.`,
    );
  }

  parts.push(
    `Day-to-day strengths include requirements analysis, iterative delivery, documentation, code quality, testing, and production support so hiring screens can match the full scope of this background to ${role}.`,
  );

  return parts;
}

function fillSummaryToMinWords(
  summary: string,
  profile: CandidateProfile,
  extracted: ExtractedJD,
): { text: string; expanded: boolean } {
  let text = sanitizePlainText(summary);
  if (wordCount(text) >= MIN_SUMMARY_WORDS) {
    return { text, expanded: false };
  }

  for (const part of summaryExpansionParts(profile, extracted)) {
    if (wordCount(text) >= MIN_SUMMARY_WORDS) break;
    text = text ? `${text} ${part}` : part;
  }

  let guard = 0;
  while (wordCount(text) < MIN_SUMMARY_WORDS && guard < 8) {
    text = `${text} Additional depth includes collaboration, operational support, and continuous improvement on production systems.`.trim();
    guard += 1;
  }

  return { text: sanitizePlainText(text), expanded: true };
}

function hasUnrealisticPercent(text: string): boolean {
  const matches = text.match(/(\d{2,3})\s*%/g) || [];
  return matches.some((m) => {
    const n = Number(m.replace(/[^\d]/g, ""));
    return n >= 90;
  });
}

function sanitizeSkills(skills: SkillGroup[]): SkillGroup[] {
  return skills
    .map((group) => ({
      category: sanitizePlainText(group.category),
      items: group.items
        .map((item) => sanitizePlainText(item))
        .filter(Boolean),
    }))
    .filter((group) => group.category && group.items.length > 0);
}

const MIN_SKILL_ITEMS = 41;
const MAX_SKILL_ITEMS = 49;
const FILL_SKILL_ITEMS = 45;

const FALLBACK_SKILL_ITEMS = [
  "Agile",
  "Scrum",
  "Kanban",
  "Git",
  "GitHub",
  "CI/CD",
  "REST APIs",
  "GraphQL",
  "SQL",
  "NoSQL",
  "Unit Testing",
  "Integration Testing",
  "Code Review",
  "Documentation",
  "Debugging",
  "Linux",
  "Jira",
  "Confluence",
  "System Design",
  "Monitoring",
  "Troubleshooting",
  "API Design",
  "Data Modeling",
  "Performance Tuning",
  "Cloud Fundamentals",
  "Python",
  "JavaScript",
  "TypeScript",
  "Java",
  "HTML",
  "CSS",
  "Docker",
  "Kubernetes",
  "AWS",
  "Azure",
  "PostgreSQL",
  "Excel",
  "Stakeholder Communication",
  "Requirements Analysis",
  "Sprint Planning",
  "Incident Response",
  "Root Cause Analysis",
  "Test Automation",
  "Object-Oriented Design",
  "Data Visualization",
  "ETL",
  "Microservices",
  "Security Basics",
  "Accessibility",
  "Cross-functional Collaboration",
  "Mentoring",
  "Technical Writing",
  "Customer Support",
  "Quality Assurance",
  "Release Management",
];

function skillItemCount(groups: SkillGroup[]): number {
  return groups.reduce((count, group) => count + group.items.length, 0);
}

function skillItemKey(item: string): string {
  return item.trim().toLowerCase();
}

function fitSkillItemsToRange(
  groups: SkillGroup[],
  extracted: ExtractedJD,
): { groups: SkillGroup[]; trimmed: boolean; filled: boolean } {
  const seen = new Set<string>();
  const next = groups
    .map((group) => ({
      category: group.category,
      items: group.items.filter((item) => {
        const key = skillItemKey(item);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);

  let trimmed = false;
  let filled = false;

  if (skillItemCount(next) > MAX_SKILL_ITEMS) {
    trimmed = true;
    for (let i = next.length - 1; i >= 0 && skillItemCount(next) > MAX_SKILL_ITEMS; i -= 1) {
      while (next[i].items.length && skillItemCount(next) > MAX_SKILL_ITEMS) {
        const removed = next[i].items.pop();
        if (removed) seen.delete(skillItemKey(removed));
      }
    }
  }

  const kept = next.filter((group) => group.items.length > 0);

  if (skillItemCount(kept) < MIN_SKILL_ITEMS) {
    filled = true;
    let bucket = kept.find((group) =>
      /technical|tools|core|practices/i.test(group.category),
    );
    if (!bucket) {
      bucket = { category: "Tools/Practices", items: [] };
      kept.push(bucket);
    }
    const extras = [
      ...extracted.hardTechnicalSkills,
      ...extracted.softSkills,
      ...FALLBACK_SKILL_ITEMS,
    ]
      .map((item) => sanitizePlainText(String(item)))
      .filter(Boolean);

    for (const item of extras) {
      if (skillItemCount(kept) >= FILL_SKILL_ITEMS) break;
      const key = skillItemKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      bucket.items.push(item);
    }
  }

  return {
    groups: kept.filter((group) => group.items.length > 0),
    trimmed,
    filled,
  };
}

/**
 * Validate resume content and auto-fix formatting issues
 * (markdown bold markers, wrong company names, short bullets, etc.).
 */
export function validateAndFixResume(
  tailored: TailoredPackage,
  profile: CandidateProfile,
  extracted: ExtractedJD,
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const resume = tailored.resume;

  issues.push(...collectMarkdownIssues("headline", resume.headline || ""));
  issues.push(...collectMarkdownIssues("summary", resume.summary));
  for (const [i, exp] of resume.experiences.entries()) {
    if (exp.overview) {
      issues.push(...collectMarkdownIssues(`experience ${i + 1} overview`, exp.overview));
    }
    for (const [j, bullet] of exp.bullets.entries()) {
      issues.push(
        ...collectMarkdownIssues(`experience ${i + 1} bullet ${j + 1}`, bullet),
      );
    }
  }
  issues.push(...collectMarkdownIssues("cover letter", tailored.coverLetter));

  const headline = buildResumeHeadline(
    extracted,
    resume.skills,
    resume.headline,
  );
  let summary = sanitizePlainText(resume.summary);
  let coverLetter = sanitizePlainText(tailored.coverLetter);
  let skills = sanitizeSkills(resume.skills);
  const fittedSkills = fitSkillItemsToRange(skills, extracted);
  skills = fittedSkills.groups;
  if (fittedSkills.trimmed) {
    issues.push({
      level: "fixed",
      message: "Trimmed skills to under 50 items across all groups.",
    });
  }
  if (fittedSkills.filled) {
    issues.push({
      level: "fixed",
      message: "Filled skills to more than 40 items across all groups.",
    });
  }
  const keywords = resume.keywords
    .map((k) => sanitizePlainText(k))
    .filter(Boolean);

  const filledSummary = fillSummaryToMinWords(summary, profile, extracted);
  summary = filledSummary.text;
  if (filledSummary.expanded) {
    issues.push({
      level: "fixed",
      message: "Expanded the summary to more than 90 words from the profile and job description.",
    });
  }
  if (wordCount(summary) < MIN_SUMMARY_WORDS) {
    issues.push({
      level: "error",
      message: "Summary must be more than 90 words.",
    });
  }

  const yearsOfExperience = yearsOfExperienceFromProfile(profile);
  if (yearsOfExperience) {
    const alignedSummary = alignExperienceYears(summary, yearsOfExperience);
    if (alignedSummary.changed) {
      summary = alignedSummary.text;
      issues.push({
        level: "fixed",
        message: `Corrected years of experience in the summary to ${yearsOfExperience} years from the profile.`,
      });
    } else if (!summaryMentionsYears(summary)) {
      issues.push({
        level: "error",
        message: `Summary must include ${yearsOfExperience} years of experience from the profile.`,
      });
    }

    const alignedCover = alignExperienceYears(coverLetter, yearsOfExperience);
    if (alignedCover.changed) {
      coverLetter = alignedCover.text;
      issues.push({
        level: "fixed",
        message: `Corrected years of experience in the cover letter to ${yearsOfExperience} years from the profile.`,
      });
    }
  }

  if (!coverLetter || wordCount(coverLetter) < 40) {
    issues.push({
      level: "error",
      message: "Cover letter is missing or too short.",
    });
  }

  if (skills.length < 3) {
    issues.push({
      level: "warning",
      message: "Skills should be grouped into at least 3 categories.",
    });
  }

  const totalSkillItems = skillItemCount(skills);
  if (totalSkillItems < MIN_SKILL_ITEMS) {
    issues.push({
      level: "error",
      message: "Skills must include more than 40 and under 50 items across all groups.",
    });
  } else if (totalSkillItems > MAX_SKILL_ITEMS) {
    issues.push({
      level: "error",
      message: "Skills must include more than 40 and under 50 items across all groups.",
    });
  }

  for (const group of skills) {
    if (group.items.length < 2) {
      issues.push({
        level: "warning",
        message: `Skill group "${group.category}" has fewer than 2 items.`,
      });
    }
  }

  if (resume.experiences.length !== profile.experiences.length) {
    issues.push({
      level: "fixed",
      message: "Aligned experience entries to the candidate profile.",
    });
  }

  const experiences = profile.experiences.map((exp, index) => {
    const generated = resume.experiences[index];
    const title = sanitizePlainText(generated?.title || exp.title);
    let overview = sanitizePlainText(generated?.overview || "");
    let bullets = (generated?.bullets || [])
      .map((b) => sanitizePlainText(b))
      .filter(Boolean);

    if (generated?.company && generated.company !== exp.company) {
      issues.push({
        level: "fixed",
        message: `Corrected company name for role ${index + 1} to "${exp.company}".`,
      });
    }

    if (generated?.period && generated.period !== exp.period) {
      issues.push({
        level: "fixed",
        message: `Corrected period for ${exp.company} to match profile.`,
      });
    }

    if (generated?.location && generated.location !== exp.location) {
      issues.push({
        level: "fixed",
        message: `Corrected location for ${exp.company} to match profile.`,
      });
    }

    if (!overview || overview.split(/\s+/).filter(Boolean).length < 12) {
      issues.push({
        level: "fixed",
        message: `Added company/responsibility overview for ${exp.company}.`,
      });
      overview = `${exp.company} delivers software products for its customers in a ${exp.location.toLowerCase()} environment; as ${title}, owned feature delivery and technical execution across core product workflows.`;
    }

    if (bullets.length < 7) {
      issues.push({
        level: "fixed",
        message: `Added missing bullets for ${exp.company} (need 7–8).`,
      });
      while (bullets.length < 7) {
        bullets.push(
          `Collaborated with cross-functional partners to deliver ${extracted.hardTechnicalSkills.slice(0, 2).join(" and ") || "production software"} improvements that strengthened reliability and delivery outcomes for ${exp.company} customers.`,
        );
      }
    }

    if (bullets.length > 8) {
      issues.push({
        level: "fixed",
        message: `Trimmed ${exp.company} experience to 8 bullets.`,
      });
      bullets = bullets.slice(0, 8);
    }

    for (const [j, bullet] of bullets.entries()) {
      if (wordCount(bullet) < 12) {
        issues.push({
          level: "warning",
          message: `${exp.company} bullet ${j + 1} is shorter than expected.`,
        });
      }
      if (hasUnrealisticPercent(bullet)) {
        issues.push({
          level: "warning",
          message: `${exp.company} bullet ${j + 1} contains a high percentage claim.`,
        });
      }
      if (/\*\*|__/.test(bullet)) {
        issues.push({
          level: "error",
          message: `${exp.company} bullet ${j + 1} still contains markdown markers.`,
        });
      }
    }

    return {
      company: exp.company,
      title: title || exp.title,
      period: exp.period,
      location: exp.location,
      overview,
      bullets,
    };
  });

  const education =
    Array.isArray(resume.education) && resume.education.length
      ? resume.education.map((edu, index) => ({
          id: edu.id || profile.education[index]?.id || profile.education[0]?.id || "",
          school: sanitizePlainText(edu.school) || profile.education[0]?.school || "",
          discipline:
            sanitizePlainText(edu.discipline) ||
            profile.education[0]?.discipline ||
            "",
          degree: sanitizePlainText(edu.degree) || profile.education[0]?.degree || "",
          period: sanitizePlainText(edu.period) || profile.education[0]?.period || "",
        }))
      : profile.education;

  // Prefer profile education school names when the model drifts
  const fixedEducation = profile.education.map((edu, index) => {
    const generated = education[index];
    if (!generated) return edu;
    if (generated.school && generated.school !== edu.school) {
      issues.push({
        level: "fixed",
        message: `Corrected school name to "${edu.school}".`,
      });
    }
    return {
      id: edu.id,
      school: edu.school,
      discipline: edu.discipline,
      degree: generated.degree || edu.degree,
      period: edu.period,
    };
  });

  if (/\*\*|__|```/.test(summary) || /\*\*|__|```/.test(coverLetter)) {
    issues.push({
      level: "error",
      message: "Markdown markers remain after cleanup.",
    });
  }

  const cleanedResume: TailoredResume = {
    headline,
    summary,
    skills,
    experiences,
    education: fixedEducation,
    keywords,
  };

  const critical = issues.filter((i) => i.level === "error");
  return {
    ok: critical.length === 0 && Boolean(summary) && Boolean(coverLetter),
    issues,
    package: {
      resume: cleanedResume,
      coverLetter,
    },
  };
}
