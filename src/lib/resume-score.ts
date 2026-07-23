import type {
  CandidateProfile,
  ExtractedJD,
  PersonalInfo,
  TailoredPackage,
  TailoredResume,
} from "./types";
import { STRONG_ACTION_VERBS } from "./action-verbs";

export type RuleResult = {
  rule: string;
  score: number;
  max_score: number;
  issues: string[];
  suggestions: string[];
};

export type ResumeScoreReport = {
  overall_score: number;
  category_scores: {
    impact: number;
    keyword_alignment: number;
    experience_quality: number;
    writing_quality: number;
    ats_compatibility: number;
  };
  rule_results: RuleResult[];
  missing_keywords: string[];
  weak_sections: string[];
  improvement_suggestions: string[];
};

const STRONG_VERBS = new RegExp(
  `\\b(${[...new Set(
    STRONG_ACTION_VERBS.map((v) =>
      v.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ),
  )].join("|")})\\b`,
  "i",
);

const WEAK_VERBS =
  /\b(helped|assisted|worked on|responsible for|participated|supported|handled|tasked with)\b/i;

const FILLER =
  /\b(responsible for|worked on|helped with|various|several|different|tasks included|duties included)\b/i;

const BUZZWORDS =
  /\b(hard-working|passionate|results-driven|team player|innovative|self-motivated|strategic thinker|go-getter|detail-oriented|proven track record)\b/i;

const OWNERSHIP =
  /\b(owned|led|architected|managed|designed|drove|delivered|established|spearheaded)\b/i;

const COMPLEXITY =
  /\b(production|enterprise|cloud|distributed|real-?time|pipeline|high availability|large-scale|gpu|kubernetes|microservices|dataset|throughput|latency)\b/i;

const METRIC =
  /(\d|\$|€|£|%|\bms\b|\bqps\b|\brps\b|\busers?\b|\bcustomers?\b|\brevenue\b|\bcost\b|\blatency\b|\baccuracy\b|\befficiency\b|\brequests?\b|\bservices?\b|\bTB\b|\bGB\b|\bMB\b)/i;

function words(text: string): number {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function allBullets(resume: TailoredResume): string[] {
  return (resume.experiences || []).flatMap((e) =>
    (e.bullets || []).map((b) => String(b || "").trim()).filter(Boolean),
  );
}

function resumeCorpus(resume: TailoredResume): string {
  return [
    resume.summary,
    ...(resume.skills || []).flatMap((g) => [g.category, ...(g.items || [])]),
    ...(resume.experiences || []).flatMap((e) => [
      e.title,
      e.company,
      e.overview,
      ...(e.bullets || []),
    ]),
  ]
    .join(" ")
    .toLowerCase();
}

function importantJdKeywords(extracted: ExtractedJD): string[] {
  const raw = [
    ...extracted.hardTechnicalSkills,
    ...extracted.requiredSkills,
    ...extracted.mustHave,
    extracted.jobTitle,
    extracted.type,
  ]
    .map((s) => String(s || "").trim())
    .filter((s) => s.length >= 2);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.slice(0, 40);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function ruleQuantified(bullets: string[]): RuleResult {
  if (!bullets.length) {
    return {
      rule: "Quantified Achievements",
      score: 0,
      max_score: 10,
      issues: ["No experience bullets found."],
      suggestions: ["Add measurable outcomes to bullets (users, latency, cost, scale)."],
    };
  }
  const withMetrics = bullets.filter((b) => METRIC.test(b)).length;
  const ratio = withMetrics / bullets.length;
  let score = 0;
  if (ratio <= 0) score = 0;
  else if (ratio < 0.25) score = 4;
  else if (ratio < 0.55) score = 7;
  else if (ratio < 0.75) score = 9;
  else score = 10;

  const issues: string[] = [];
  const suggestions: string[] = [];
  if (ratio < 0.75) {
    issues.push(
      `Only ${withMetrics}/${bullets.length} bullets contain measurable impact.`,
    );
    suggestions.push(
      "Add hard numbers to most bullets (%, $, users, latency ms, dataset size, services).",
    );
  }
  return { rule: "Quantified Achievements", score, max_score: 10, issues, suggestions };
}

function ruleAchievementStructure(bullets: string[]): RuleResult {
  if (!bullets.length) {
    return {
      rule: "Achievement-Oriented Bullet Structure",
      score: 0,
      max_score: 10,
      issues: ["No bullets to evaluate."],
      suggestions: ["Write bullets as Action + Method/Tech + Result."],
    };
  }
  let strong = 0;
  let mid = 0;
  for (const b of bullets) {
    const hasAction = STRONG_VERBS.test(b);
    const hasResult = METRIC.test(b) || /\b(improved|reduced|increased|cut|saved|boosted)\b/i.test(b);
    const hasTech = /\b(python|java|aws|sql|react|docker|kubernetes|pytorch|api|cloud|pipeline|llm|nlp)\b/i.test(
      b,
    );
    if (hasAction && hasResult && (hasTech || words(b) >= 18)) strong += 1;
    else if (hasAction && (hasResult || hasTech)) mid += 1;
  }
  const ratio = strong / bullets.length;
  let score = 0;
  if (ratio >= 0.7) score = 10;
  else if (ratio >= 0.45 || mid / bullets.length >= 0.6) score = 7;
  else if (mid / bullets.length >= 0.3) score = 4;
  else score = 1;

  return {
    rule: "Achievement-Oriented Bullet Structure",
    score,
    max_score: 10,
    issues:
      score < 9
        ? ["Some bullets look like duties or lack Action + Tech + Result."]
        : [],
    suggestions:
      score < 9
        ? ["Rewrite weak bullets as: strong verb + tech/method + measurable result."]
        : [],
  };
}

function ruleActionVerbs(bullets: string[]): RuleResult {
  if (!bullets.length) {
    return {
      rule: "Action Verb Strength",
      score: 0,
      max_score: 5,
      issues: ["No bullets."],
      suggestions: ["Start each bullet with a strong action verb."],
    };
  }
  const strong = bullets.filter((b) => STRONG_VERBS.test(b.split(/\s+/)[0] || "") || STRONG_VERBS.test(b)).length;
  const weak = bullets.filter((b) => WEAK_VERBS.test(b)).length;
  const ratio = strong / bullets.length;
  let score = 1;
  if (ratio >= 0.85 && weak === 0) score = 5;
  else if (ratio >= 0.7) score = 4;
  else if (ratio >= 0.45) score = 3;
  else if (ratio >= 0.25) score = 2;

  // Penalize repeated opening verbs
  const openers = bullets.map((b) => (b.trim().split(/\s+/)[0] || "").toLowerCase());
  const counts = new Map<string, number>();
  for (const v of openers) counts.set(v, (counts.get(v) || 0) + 1);
  const maxRepeat = Math.max(...counts.values(), 0);
  if (maxRepeat >= 3) score = Math.max(0, score - 1);

  return {
    rule: "Action Verb Strength",
    score,
    max_score: 5,
    issues: weak
      ? [`Found ${weak} weak verb phrase(s) (helped/assisted/worked on/responsible for).`]
      : maxRepeat >= 3
        ? ["Opening action verbs are repeated too often."]
        : [],
    suggestions: [
      "Use strong verbs (Built, Led, Designed, Optimized…) and rotate them across bullets.",
    ],
  };
}

function ruleAchievementDensity(bullets: string[]): RuleResult {
  if (!bullets.length) {
    return {
      rule: "Achievement Density",
      score: 0,
      max_score: 10,
      issues: ["No bullets."],
      suggestions: ["Convert responsibilities into achievements."],
    };
  }
  const achievementish = bullets.filter(
    (b) =>
      METRIC.test(b) &&
      STRONG_VERBS.test(b) &&
      !/\b(responsible for|duties included|tasks included)\b/i.test(b),
  ).length;
  const ratio = achievementish / bullets.length;
  let score = 1;
  if (ratio > 0.7) score = 10;
  else if (ratio > 0.4) score = 7;
  else if (ratio > 0.2) score = 4;
  else score = 1;

  return {
    rule: "Achievement Density",
    score,
    max_score: 10,
    issues:
      ratio <= 0.7
        ? [`Achievement density is ${(ratio * 100).toFixed(0)}% (target >70%).`]
        : [],
    suggestions: ["Make >70% of bullets quantified achievements, not duty lists."],
  };
}

function ruleKeywordMatch(
  resume: TailoredResume,
  extracted: ExtractedJD,
): { result: RuleResult; missing: string[] } {
  const keywords = importantJdKeywords(extracted);
  const corpus = resumeCorpus(resume);
  if (!keywords.length) {
    return {
      result: {
        rule: "Job Description Keyword Matching",
        score: 6,
        max_score: 10,
        issues: ["JD keyword list is thin; limited matching signal."],
        suggestions: ["Ensure JD extract includes hard technical skills."],
      },
      missing: [],
    };
  }
  const missing = keywords.filter((k) => !corpus.includes(k.toLowerCase()));
  const matched = keywords.length - missing.length;
  const ratio = matched / keywords.length;
  let score = 1;
  if (ratio > 0.75) score = 10;
  else if (ratio > 0.5) score = 7;
  else if (ratio > 0.3) score = 4;
  else score = 1;

  return {
    result: {
      rule: "Job Description Keyword Matching",
      score,
      max_score: 10,
      issues:
        missing.length > 0
          ? [`Missing important JD keywords: ${missing.slice(0, 8).join(", ")}`]
          : [],
      suggestions:
        missing.length > 0
          ? ["Mirror missing JD terms in Summary, Skills, and Experience bullets."]
          : [],
    },
    missing: missing.slice(0, 20),
  };
}

function ruleSkillEvidence(resume: TailoredResume, extracted: ExtractedJD): RuleResult {
  const skills = (resume.skills || []).flatMap((g) => g.items || []).map((s) => s.toLowerCase());
  const uniqueSkills = [...new Set(skills)].slice(0, 40);
  if (!uniqueSkills.length) {
    return {
      rule: "Skill Evidence",
      score: 0,
      max_score: 5,
      issues: ["Skills section is empty."],
      suggestions: ["Add JD-aligned skill groups with evidence in Experience."],
    };
  }
  const experienceText = (resume.experiences || [])
    .flatMap((e) => [e.overview, ...(e.bullets || [])])
    .join(" ")
    .toLowerCase();
  const important = importantJdKeywords(extracted)
    .map((k) => k.toLowerCase())
    .slice(0, 20);
  const pool = important.length ? important : uniqueSkills;
  const evidenced = pool.filter(
    (s) => experienceText.includes(s) || resume.summary.toLowerCase().includes(s),
  ).length;
  const ratio = evidenced / Math.max(1, pool.length);
  let score = 1;
  if (ratio >= 0.9) score = 5;
  else if (ratio >= 0.7) score = 4;
  else if (ratio >= 0.4) score = 3;
  else if (ratio >= 0.2) score = 2;

  return {
    rule: "Skill Evidence",
    score,
    max_score: 5,
    issues:
      score < 5
        ? ["Some listed/JD skills lack evidence in Experience achievements."]
        : [],
    suggestions: ["Demonstrate important skills inside accomplishment bullets, not only the Skills list."],
  };
}

function ruleContextualKeywords(resume: TailoredResume): RuleResult {
  const bullets = allBullets(resume);
  if (!bullets.length) {
    return {
      rule: "Contextual Keyword Usage",
      score: 0,
      max_score: 5,
      issues: ["No bullets for contextual keyword checks."],
      suggestions: ["Use technologies inside achievement bullets with outcomes."],
    };
  }
  const contextual = bullets.filter(
    (b) =>
      /\b(python|java|aws|sql|react|docker|kubernetes|pytorch|tensorflow|llm|nlp|api|postgres|spark)\b/i.test(
        b,
      ) && METRIC.test(b),
  ).length;
  const ratio = contextual / bullets.length;
  let score = 1;
  if (ratio >= 0.45) score = 5;
  else if (ratio >= 0.3) score = 4;
  else if (ratio >= 0.15) score = 3;
  else score = 1;

  return {
    rule: "Contextual Keyword Usage",
    score,
    max_score: 5,
    issues: score < 4 ? ["Keywords often lack implementation + outcome context."] : [],
    suggestions: ["Pair each key technology with what you built and the measurable result."],
  };
}

function ruleOwnership(bullets: string[]): RuleResult {
  if (!bullets.length) {
    return {
      rule: "Ownership and Leadership",
      score: 0,
      max_score: 5,
      issues: ["No bullets."],
      suggestions: ["Show ownership with Owned/Led/Architected/Drove where true."],
    };
  }
  const hits = bullets.filter((b) => OWNERSHIP.test(b)).length;
  const ratio = hits / bullets.length;
  let score = 1;
  if (ratio >= 0.35) score = 5;
  else if (ratio >= 0.2) score = 4;
  else if (ratio >= 0.1) score = 3;
  else score = 1;

  return {
    rule: "Ownership and Leadership",
    score,
    max_score: 5,
    issues: score < 4 ? ["Limited ownership/leadership language."] : [],
    suggestions: ["Add bullets that show owning projects, decisions, or mentoring."],
  };
}

function ruleComplexity(bullets: string[]): RuleResult {
  if (!bullets.length) {
    return {
      rule: "Technical Complexity and Scale",
      score: 0,
      max_score: 5,
      issues: ["No bullets."],
      suggestions: ["Describe production/cloud/distributed/ML-scale work."],
    };
  }
  const hits = bullets.filter((b) => COMPLEXITY.test(b) || METRIC.test(b)).length;
  const ratio = hits / bullets.length;
  let score = 1;
  if (ratio >= 0.55) score = 5;
  else if (ratio >= 0.35) score = 4;
  else if (ratio >= 0.2) score = 3;
  else score = 1;

  return {
    rule: "Technical Complexity and Scale",
    score,
    max_score: 5,
    issues: score < 4 ? ["Not enough production-scale / complex system signals."] : [],
    suggestions: ["Mention production systems, scale, pipelines, latency, or cloud infrastructure."],
  };
}

function ruleCareerGrowth(resume: TailoredResume): RuleResult {
  const exps = resume.experiences || [];
  if (exps.length < 2) {
    return {
      rule: "Career Growth",
      score: 3,
      max_score: 5,
      issues: ["Not enough roles to strongly evidence progression."],
      suggestions: ["Within each role, show increasing scope and ownership over time."],
    };
  }
  const titles = exps.map((e) => e.title.toLowerCase()).join(" ");
  const seniorSignal = /(senior|lead|staff|principal|manager|architect)/i.test(titles);
  const scopeGrow =
    allBullets(resume).filter((b) => OWNERSHIP.test(b) || COMPLEXITY.test(b)).length >= 4;
  let score = 2;
  if (seniorSignal && scopeGrow) score = 5;
  else if (seniorSignal || scopeGrow) score = 4;
  else score = 2;

  return {
    rule: "Career Growth",
    score,
    max_score: 5,
    issues: score < 4 ? ["Career progression signals are limited."] : [],
    suggestions: ["Show growing scope, seniority, and technical advancement across roles."],
  };
}

function ruleRelevance(resume: TailoredResume, extracted: ExtractedJD): RuleResult {
  const target = (extracted.jobTitle || extracted.type || "").toLowerCase();
  const corpus = resumeCorpus(resume);
  const titleBits = target.split(/\s+/).filter((t) => t.length > 2);
  const titleHits = titleBits.filter((t) => corpus.includes(t)).length;
  const skillHits = importantJdKeywords(extracted)
    .slice(0, 12)
    .filter((k) => corpus.includes(k.toLowerCase())).length;
  let score = 1;
  if (titleHits >= Math.min(2, titleBits.length) && skillHits >= 6) score = 5;
  else if (skillHits >= 4) score = 4;
  else if (skillHits >= 2) score = 3;
  else score = 1;

  return {
    rule: "Relevant Experience Match",
    score,
    max_score: 5,
    issues: score < 4 ? ["Experience is only partially aligned to the target role."] : [],
    suggestions: ["Rewrite overviews/bullets using the target title language and JD responsibilities."],
  };
}

function ruleBulletLength(bullets: string[]): RuleResult {
  if (!bullets.length) {
    return {
      rule: "Bullet Length",
      score: 0,
      max_score: 3,
      issues: ["No bullets."],
      suggestions: ["Use 15-30 word accomplishment bullets."],
    };
  }
  const good = bullets.filter((b) => {
    const w = words(b);
    return w >= 15 && w <= 30;
  }).length;
  // Also accept slightly longer technical bullets up to 38
  const ok = bullets.filter((b) => {
    const w = words(b);
    return w >= 15 && w <= 38;
  }).length;
  const ratio = ok / bullets.length;
  let score = 0;
  if (ratio >= 0.8) score = 3;
  else if (ratio >= 0.5) score = 2;
  else score = 1;

  return {
    rule: "Bullet Length",
    score,
    max_score: 3,
    issues:
      good / bullets.length < 0.6
        ? ["Many bullets are outside the preferred 15-30 word range."]
        : [],
    suggestions: ["Keep most bullets between 15-30 words for scannability."],
  };
}

function ruleFiller(bullets: string[], summary: string): RuleResult {
  const corpus = [...bullets, summary];
  const hits = corpus.filter((t) => FILLER.test(t)).length;
  let score = 3;
  if (hits >= 4) score = 0;
  else if (hits >= 2) score = 1;
  else if (hits === 1) score = 2;

  return {
    rule: "Filler Word Detection",
    score,
    max_score: 3,
    issues: hits ? [`Found ${hits} filler phrase(s).`] : [],
    suggestions: ["Remove filler like 'responsible for', 'worked on', 'various', 'several'."],
  };
}

function ruleBuzzwords(bullets: string[], summary: string): RuleResult {
  const corpus = [...bullets, summary];
  const hits = corpus.filter((t) => BUZZWORDS.test(t)).length;
  let score = 3;
  if (hits >= 3) score = 0;
  else if (hits === 2) score = 1;
  else if (hits === 1) score = 2;

  return {
    rule: "Buzzword Detection",
    score,
    max_score: 3,
    issues: hits ? [`Found ${hits} unsupported buzzword claim(s).`] : [],
    suggestions: ["Replace buzzwords with evidence-based accomplishments."],
  };
}

function ruleGrammarConsistency(bullets: string[], summary: string): RuleResult {
  const corpus = [...bullets, summary];
  let deductions = 0;
  const issues: string[] = [];
  if (corpus.some((t) => /\b(i|me|my|we|our)\b/i.test(t))) {
    deductions += 2;
    issues.push("First-person pronouns detected.");
  }
  if (corpus.some((t) => /\*\*|__|`/.test(t))) {
    deductions += 1;
    issues.push("Markdown artifacts detected.");
  }
  if (corpus.some((t) => /\b(was responsible for|were completed|tasks were)\b/i.test(t))) {
    deductions += 1;
    issues.push("Passive voice patterns detected.");
  }
  const score = clamp(6 - deductions, 0, 6);
  return {
    rule: "Grammar and Consistency",
    score,
    max_score: 6,
    issues,
    suggestions:
      score < 6
        ? ["Remove pronouns, passive voice, and markdown; keep tense consistent."]
        : [],
  };
}

function ruleSections(resume: TailoredResume): RuleResult {
  let score = 0;
  const issues: string[] = [];
  if (resume.summary?.trim()) score += 1;
  else issues.push("Missing Summary.");
  if (resume.skills?.length) score += 1;
  else issues.push("Missing Skills.");
  if (resume.experiences?.length) score += 1;
  else issues.push("Missing Experience.");
  // Education presence is soft — many packages include it from profile
  if (resume.education?.length) {
    // already at most 3 from required trio; keep complete structure at 3
  } else {
    issues.push("Education section empty.");
  }
  return {
    rule: "Resume Section Structure",
    score: clamp(score, 0, 3),
    max_score: 3,
    issues,
    suggestions: ["Include Summary, Skills, Experience, and Education."],
  };
}

function ruleContact(personal?: PersonalInfo): RuleResult {
  if (!personal) {
    return {
      rule: "Contact Information",
      score: 1,
      max_score: 2,
      issues: ["Contact info not provided to scorer."],
      suggestions: ["Ensure name, email, phone, location, LinkedIn are present."],
    };
  }
  const fields = [
    personal.name,
    personal.email,
    personal.phone,
    personal.location,
    personal.linkedin,
  ].filter((v) => String(v || "").trim() && !/^n\/?a$/i.test(String(v)));
  let score = 0;
  if (fields.length >= 5) score = 2;
  else if (fields.length >= 3) score = 1;
  return {
    rule: "Contact Information",
    score,
    max_score: 2,
    issues: score < 2 ? ["Contact information is incomplete."] : [],
    suggestions: ["Include name, email, phone, location, and LinkedIn."],
  };
}

function ruleAtsFormatting(resume: TailoredResume): RuleResult {
  // Structured JSON packages are ATS-friendly by construction; penalize markdown leftovers only.
  const corpus = resumeCorpus(resume) + " " + allBullets(resume).join(" ");
  let score = 5;
  const issues: string[] = [];
  if (/\*\*|__|```|│|┃|■|●●/.test(corpus)) {
    score -= 2;
    issues.push("Unusual symbols/markdown may hurt ATS parsing.");
  }
  if (/\|.+\|/.test(corpus)) {
    score -= 1;
    issues.push("Table-like pipe formatting detected in text.");
  }
  score = clamp(score, 0, 5);
  return {
    rule: "ATS Formatting",
    score,
    max_score: 5,
    issues,
    suggestions:
      score < 5
        ? ["Keep single-column plain text; avoid tables, images, and decorative symbols."]
        : [],
  };
}

/**
 * Deterministic Resume Worded-style scorer (0-100).
 * Modular rules with independent scores/issues/suggestions.
 */
export function scoreResumePackage(options: {
  package: TailoredPackage;
  extracted: ExtractedJD;
  profile?: CandidateProfile;
  personal?: PersonalInfo;
}): ResumeScoreReport {
  const resume = options.package.resume;
  const bullets = allBullets(resume);
  const summary = resume.summary || "";

  const r1 = ruleQuantified(bullets);
  const r2 = ruleAchievementStructure(bullets);
  const r3 = ruleActionVerbs(bullets);
  const r4 = ruleAchievementDensity(bullets);
  const kw = ruleKeywordMatch(resume, options.extracted);
  const r5 = kw.result;
  const r6 = ruleSkillEvidence(resume, options.extracted);
  const r7 = ruleContextualKeywords(resume);
  const r8 = ruleOwnership(bullets);
  const r9 = ruleComplexity(bullets);
  const r10 = ruleCareerGrowth(resume);
  const r11 = ruleRelevance(resume, options.extracted);
  const r12 = ruleBulletLength(bullets);
  const r13 = ruleFiller(bullets, summary);
  const r14 = ruleBuzzwords(bullets, summary);
  const r15 = ruleGrammarConsistency(bullets, summary);
  const r16 = ruleSections(resume);
  const r17 = ruleContact(options.personal || options.profile?.personal);
  const r18 = ruleAtsFormatting(resume);

  const rule_results = [
    r1,
    r2,
    r3,
    r4,
    r5,
    r6,
    r7,
    r8,
    r9,
    r10,
    r11,
    r12,
    r13,
    r14,
    r15,
    r16,
    r17,
    r18,
  ];

  const impact = r1.score + r2.score + r3.score + r4.score; // 35
  const keyword_alignment = r5.score + r6.score + r7.score; // 20
  const experience_quality = r8.score + r9.score + r10.score + r11.score; // 20
  const writing_quality = r12.score + r13.score + r14.score + r15.score; // 15
  const ats_compatibility = r16.score + r17.score + r18.score; // 10

  const overall_score = clamp(
    impact + keyword_alignment + experience_quality + writing_quality + ats_compatibility,
    0,
    100,
  );

  const weak_sections: string[] = [];
  if (impact < 28) weak_sections.push("Impact and Achievements");
  if (keyword_alignment < 15) weak_sections.push("Skills and Keyword Alignment");
  if (experience_quality < 15) weak_sections.push("Experience Quality");
  if (writing_quality < 11) weak_sections.push("Writing Quality");
  if (ats_compatibility < 8) weak_sections.push("ATS Compatibility and Formatting");

  const improvement_suggestions = [
    ...new Set(rule_results.flatMap((r) => r.suggestions)),
  ].slice(0, 12);

  return {
    overall_score,
    category_scores: {
      impact,
      keyword_alignment,
      experience_quality,
      writing_quality,
      ats_compatibility,
    },
    rule_results,
    missing_keywords: kw.missing,
    weak_sections,
    improvement_suggestions,
  };
}
