import type {
  CandidateProfile,
  ExtractedJD,
  SkillGroup,
  TailoredPackage,
  TailoredResume,
} from "./types";
import { getLlmClient, getLlmModel, LLM_MAX_TOKENS, formatOpenRouterError } from "./llm";
import { parseModelJson } from "./parse-json";
import {
  buildExperienceOverview,
  buildVariedExperienceBullets,
  isCannedFillerText,
  sanitizeExperienceBullet,
} from "./resume-fallbacks";
import { sanitizePlainText } from "./validate-resume";
import { sanitizeKeywords } from "./keywords";
import { scoreResumePackage } from "./resume-score";
import {
  COVER_LETTER_ARCHITECT_PROMPT,
  IMPROVE_RESUME_PROMPT,
  PRINCIPAL_RESUME_ARCHITECT_PROMPT,
} from "./prompts/principal-resume-architect";

const SYSTEM_PROMPT = PRINCIPAL_RESUME_ARCHITECT_PROMPT;
const COVER_LETTER_PROMPT = COVER_LETTER_ARCHITECT_PROMPT;

/** Abort hung calls, but allow enough time for a real quality completion. */
const GENERATE_TIMEOUT_MS = 90_000;

function buildFallbackPackage(
  profile: CandidateProfile,
  extracted: ExtractedJD,
): TailoredPackage {
  return {
    resume: normalizeResume(undefined, profile, extracted),
    coverLetter: buildFallbackCoverLetter(profile, extracted),
  };
}

function countUniqueBullets(bullets: unknown): number {
  if (!Array.isArray(bullets)) return 0;
  const seen = new Set<string>();
  for (const raw of bullets) {
    const key = String(raw || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (key.length >= 24) seen.add(key);
  }
  return seen.size;
}

function bulletHasMetric(text: string): boolean {
  return (
    /\d/.test(text) ||
    /\$|€|£|%|\bms\b|\bqps\b|\brps\b|\btps\b|\bk\b|\bm\b|\busers?\b|\brequests?\b|\blatency\b|\buptime\b|\brevenue\b|\bcost\b|\bteam of\b|\bservices?\b|\bGPU\b|\btokens?\b/i.test(
      text,
    )
  );
}

function isVagueBullet(text: string): boolean {
  const t = text.toLowerCase();
  const vagueOnly =
    /partnered with stakeholders|cross-functional collaboration|improved reliability|drove initiatives|helped the team|worked closely with|contributed to various|responsible for supporting/;
  if (!vagueOnly.test(t)) return false;
  return !bulletHasMetric(text) || text.trim().split(/\s+/).length < 22;
}

function countSkillItems(skills: unknown): {
  groups: number;
  items: number;
  minGroupSize: number;
  duplicateItems: number;
} {
  if (!Array.isArray(skills) || !skills.length) {
    return { groups: 0, items: 0, minGroupSize: 0, duplicateItems: 0 };
  }
  let items = 0;
  let minGroupSize = Infinity;
  const seen = new Set<string>();
  let duplicateItems = 0;
  for (const group of skills) {
    if (group && typeof group === "object" && Array.isArray((group as { items?: unknown }).items)) {
      const list = (group as { items: unknown[] }).items
        .map((i) => String(i || "").trim())
        .filter(Boolean);
      items += list.length;
      minGroupSize = Math.min(minGroupSize, list.length);
      for (const item of list) {
        const key = item.toLowerCase();
        if (seen.has(key)) duplicateItems += 1;
        else seen.add(key);
      }
    } else if (typeof group === "string" && group.trim()) {
      items += 1;
    }
  }
  const groups =
    typeof skills[0] === "object" && skills[0] !== null ? skills.length : items > 0 ? 1 : 0;
  return {
    groups,
    items,
    minGroupSize: Number.isFinite(minGroupSize) ? minGroupSize : 0,
    duplicateItems,
  };
}

function collectJdSkillTokens(extracted: ExtractedJD): string[] {
  const buckets = [
    ...(extracted.mustHave || []),
    ...(extracted.hardTechnicalSkills || []),
    ...(extracted.requiredSkills || []),
    ...(extracted.niceToHave || []),
  ];
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (raw: string) => {
    const clean = sanitizePlainText(String(raw || ""))
      .replace(/^[-•*\d.)\s]+/, "")
      .trim();
    if (!clean) return;
    if (clean.length < 2 || clean.length > 40) return;
    if (
      /^(experience|knowledge|ability|strong|excellent|proven|familiar|understanding|years?|bachelor|master|degree|must|should|preferred)\b/i.test(
        clean,
      )
    ) {
      return;
    }
    if (/\b(years? of|experience with|ability to|knowledge of)\b/i.test(clean)) {
      return;
    }
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(clean);
  };

  for (const raw of buckets) {
    const text = sanitizePlainText(String(raw || ""));
    if (!text) continue;
    const longOrSoft =
      text.length > 40 ||
      /\b(years?|experience|ability|knowledge|strong|excellent|proven)\b/i.test(
        text,
      );
    if (longOrSoft) {
      for (const part of text.split(/[,;/|]|(?:\sand\s)|(?:\swith\s)|(?:\susing\s)|\//i)) {
        push(part);
      }
    } else {
      push(text);
    }
  }
  return out;
}

function summaryLooksWeak(summary: string, extracted: ExtractedJD): boolean {
  const words = summary.trim().split(/\s+/).filter(Boolean);
  if (words.length < 70 || summary.length < 380) return true;
  if (
    /passionate|results-driven|team player|leveraging|proven track record|highly motivated|dedicated professional|as engineer at company|seeking opportunities|hands-on ownership of cloud-native/i.test(
      summary,
    )
  ) {
    return true;
  }
  // Detect immediate word repeats: "Python, Python"
  if (/\b([A-Za-z][A-Za-z0-9+.#-]{1,24})\b(?:\s*[,/|]\s*|\s+)\1\b/i.test(summary)) {
    return true;
  }
  const title = (extracted.jobTitle || extracted.type || "").trim().toLowerCase();
  if (title.length >= 4 && !summary.toLowerCase().startsWith(title.slice(0, Math.min(12, title.length)))) {
    // Allow near-start if title appears in first 8 words
    const head = words.slice(0, 8).join(" ").toLowerCase();
    if (!head.includes(title.split(/\s+/)[0] || title)) return true;
  }

  // Summary must carry real JD skill density — otherwise treat as weak.
  const jdSkills = collectJdSkillTokens(extracted).slice(0, 12);
  if (jdSkills.length >= 4) {
    const hay = summary.toLowerCase();
    const hits = jdSkills.filter((s) => hay.includes(s.toLowerCase())).length;
    if (hits < Math.min(4, jdSkills.length)) return true;
  }
  return false;
}

function hasCrossRoleRepetition(experiences: TailoredResume["experiences"] | undefined): boolean {
  if (!Array.isArray(experiences) || experiences.length < 2) return false;
  const prefixes: string[] = [];
  for (const exp of experiences) {
    for (const raw of exp?.bullets || []) {
      const key = String(raw || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
      if (key.length < 28) continue;
      const prefix = key.slice(0, 56);
      // Exact/near-exact clones only — do not flag distinct bullets with similar shape.
      if (prefixes.some((p) => p === prefix || p.slice(0, 48) === prefix.slice(0, 48))) {
        return true;
      }
      prefixes.push(prefix);
    }
  }
  return false;
}

function looksTemplatedExperience(
  experiences: TailoredResume["experiences"] | undefined,
): boolean {
  if (!Array.isArray(experiences) || !experiences.length) return true;
  const bullets = experiences.flatMap((e) => e.bullets || []).map(String);
  if (bullets.length < 4) return true;

  const cannedHits = bullets.filter(
    (b) =>
      isCannedFillerText(b) ||
      /built and shipped production features as |led design and delivery of services with |scaled platform components around |delivered work at |owned a slice of |partnered on .+ at |improved operational readiness for |built tooling\/process for |translated .+ requirements into concrete |supporting .+ outcomes through |about the job|who are we\??|progressive delivery controls|pairing architecture decisions|unified fragmented|weekly reliability reviews|blast radius of risky changes/i.test(
        b,
      ),
  ).length;
  if (cannedHits >= 1) return true;

  const verbs = bullets
    .map((b) => (b.trim().split(/\s+/)[0] || "").toLowerCase())
    .filter(Boolean);
  const verbCounts = new Map<string, number>();
  for (const v of verbs) verbCounts.set(v, (verbCounts.get(v) || 0) + 1);
  const maxVerb = Math.max(...verbCounts.values(), 0);
  if (maxVerb >= 3) return true;

  // Cross-role skeleton clones (same first 5 words ignoring company/tech)
  const skeletons = bullets.map((b) =>
    b
      .toLowerCase()
      .replace(/\b(python|aws|kubernetes|react|typescript|java|visa|hp|plutora)\b/gi, "X")
      .replace(/\b\d+(\.\d+)?%?\b/g, "#")
      .split(/\s+/)
      .slice(0, 6)
      .join(" "),
  );
  const skCounts = new Map<string, number>();
  for (const s of skeletons) skCounts.set(s, (skCounts.get(s) || 0) + 1);
  if (Math.max(...skCounts.values(), 0) >= 2) return true;

  return false;
}

function failsResumeWordedChecks(
  draft: TailoredPackage,
  profile: CandidateProfile,
): boolean {
  const weakVerb =
    /^(helped|assisted|worked|responsible|tasked|participated|supported|involved)\b/i;
  const buzz =
    /\b(passionate|results-driven|team player|synergy|go-getter|self-motivated|detail-oriented|proven track record|seeking opportunities|various|several)\b/i;
  const pronoun = /\b(i|me|my|we|our|i'm|i’ve|i've)\b/i;
  const dutyOnly =
    /\b(responsible for|duties included|tasked with|participated in)\b/i;

  const allBullets: string[] = [];
  for (let i = 0; i < profile.experiences.length; i++) {
    const exp = draft.resume?.experiences?.[i];
    const bullets = Array.isArray(exp?.bullets)
      ? exp!.bullets.map((b) => String(b || "").trim()).filter(Boolean)
      : [];
    allBullets.push(...bullets);
  }
  if (allBullets.length < Math.max(4, profile.experiences.length * 4)) {
    return true;
  }

  let weakHits = 0;
  let badLength = 0;
  for (const b of allBullets) {
    const words = b.split(/\s+/).filter(Boolean).length;
    if (words < 12 || words > 45) badLength += 1;
    // Do NOT require metrics — inventing numbers is forbidden.
    if (weakVerb.test(b) || buzz.test(b) || pronoun.test(b) || dutyOnly.test(b)) {
      weakHits += 1;
    }
  }

  if (weakHits >= 2) return true;
  if (badLength > Math.max(2, Math.floor(allBullets.length * 0.4))) {
    return true;
  }

  const verbs = allBullets
    .map((b) => (b.trim().split(/\s+/)[0] || "").toLowerCase())
    .filter(Boolean);
  const verbCounts = new Map<string, number>();
  for (const v of verbs) verbCounts.set(v, (verbCounts.get(v) || 0) + 1);
  const maxVerb = Math.max(...verbCounts.values(), 0);
  if (maxVerb >= 3) return true;

  const summary = String(draft.resume?.summary || "");
  if (buzz.test(summary) || pronoun.test(summary)) return true;

  return false;
}

/** True when the model returned thin summary/skills or low JD alignment. */
function isWeakModelPackage(
  draft: TailoredPackage,
  profile: CandidateProfile,
  extracted: ExtractedJD,
): boolean {
  const summary = String(draft.resume?.summary || "").trim();
  if (summaryLooksWeak(summary, extracted)) return true;
  if (isCannedFillerText(summary)) return true;

  const { groups, items, duplicateItems } = countSkillItems(
    draft.resume?.skills,
  );
  // Dense JD-facing skills: thin sections force another improve pass.
  if (groups < 3 || items < 12 || duplicateItems >= 4) {
    return true;
  }

  const jdSkills = collectJdSkillTokens(extracted).slice(0, 16);
  if (jdSkills.length >= 3) {
    const hay = `${summary} ${JSON.stringify(draft.resume?.skills || [])} ${JSON.stringify(draft.resume?.experiences || [])}`.toLowerCase();
    const hits = jdSkills.filter((s) => hay.includes(s.toLowerCase())).length;
    if (hits < Math.min(5, jdSkills.length)) return true;

    const skillsHay = JSON.stringify(draft.resume?.skills || []).toLowerCase();
    const skillHits = jdSkills.filter((s) =>
      skillsHay.includes(s.toLowerCase()),
    ).length;
    if (skillHits < Math.min(4, jdSkills.length)) return true;
  }

  // Must-have coverage across the whole resume package
  const corpus = [
    summary,
    JSON.stringify(draft.resume?.skills || []),
    JSON.stringify(draft.resume?.experiences || []),
  ]
    .join(" ")
    .toLowerCase();
  const criticalTerms = [
    ...(extracted.mustHave || []),
    ...(extracted.hardTechnicalSkills || []),
  ]
    .map((s) => String(s || "").toLowerCase().trim())
    .filter((s) => s.length >= 3 && s.length <= 40);
  const uniqueCritical = [...new Set(criticalTerms)].slice(0, 12);
  if (uniqueCritical.length >= 3) {
    const covered = uniqueCritical.filter((t) => corpus.includes(t)).length;
    if (covered < Math.ceil(uniqueCritical.length * 0.45)) return true;
  }

  if (hasCrossRoleRepetition(draft.resume?.experiences)) return true;
  if (looksTemplatedExperience(draft.resume?.experiences)) return true;
  if (failsResumeWordedChecks(draft, profile)) return true;

  // Do NOT hard-fail on score < 90 (metric-heavy scorer conflicts with no-invent).
  // Improve loop still receives score feedback separately.

  for (let i = 0; i < profile.experiences.length; i++) {
    const exp = draft.resume?.experiences?.[i];
    const bullets = Array.isArray(exp?.bullets)
      ? exp!.bullets.map((b) => String(b || "").trim()).filter(Boolean)
      : [];
    const unique = countUniqueBullets(bullets);
    if (unique < 3) return true;
  }
  return false;
}

function finalizePackage(
  draft: TailoredPackage,
  profile: CandidateProfile,
  extracted: ExtractedJD,
): TailoredPackage {
  let resume = normalizeResume(draft.resume, profile, extracted);
  let coverLetter = sanitizePlainText(draft.coverLetter || "");

  resume = {
    ...resume,
    summary: collapseRepeatedTokens(sanitizePlainText(resume.summary)),
    experiences: dedupeExperienceBullets(resume.experiences, profile, extracted),
  };

  // Always force a strong JD-anchored summary when the model output is thin.
  if (!resume.summary || summaryLooksWeak(resume.summary, extracted)) {
    resume = {
      ...resume,
      summary: buildFallbackSummary(profile, extracted),
    };
  }

  // Skills are always re-densified JD-first in normalizeSkills; re-run after summary fix.
  resume = {
    ...resume,
    skills: normalizeSkills(resume.skills, extracted),
  };

  if (!coverLetter) {
    coverLetter = buildFallbackCoverLetter(profile, extracted);
  }
  return { resume, coverLetter };
}

export async function generateTailoredPackage(
  profile: CandidateProfile,
  extracted: ExtractedJD,
  rawJd: string,
  options?: { sourceResumeText?: string },
): Promise<TailoredPackage> {
  const client = getLlmClient();
  const model = getLlmModel();
  const userPayload = JSON.stringify({
    INPUT_1_JOB_DESCRIPTION: {
      raw: rawJd.slice(0, 10_000),
      extracted,
      targetRole: extracted.jobTitle || extracted.type,
      targetCompany: extracted.company,
    },
    INPUT_2_CANDIDATE_RESUME: {
      candidate: profile,
      employment_periods: profile.experiences.map((e) => ({
        company: e.company,
        title: e.title,
        period: e.period,
        location: e.location,
      })),
      sourceResumeText: options?.sourceResumeText
        ? options.sourceResumeText.slice(0, 12_000)
        : undefined,
    },
    JD_FIT_CHECKLIST: {
      priority_order: [
        "mustHave",
        "hardTechnicalSkills",
        "requiredSkills",
        "responsibilities",
        "yearsOfExperience",
        "qualifications",
        "educationRequirements",
        "niceToHave",
        "softSkills",
        "workMode",
        "locationRequirement",
      ],
      mustHave: extracted.mustHave || [],
      hardTechnicalSkills: extracted.hardTechnicalSkills || [],
      requiredSkills: extracted.requiredSkills || [],
      responsibilities: (extracted.responsibilities || []).slice(0, 16),
      yearsOfExperience: extracted.yearsOfExperience || "",
      qualifications: extracted.qualifications || [],
      educationRequirements: extracted.educationRequirements || "",
      niceToHave: extracted.niceToHave || [],
      softSkills: extracted.softSkills || [],
      workMode: extracted.workMode || "",
      locationRequirement: extracted.locationRequirement || "",
    },
    instructions:
      "Follow Principal Resume Strategist steps 1–11. SUMMARY and SKILLS are the top priority: make them dense and JD-specific (exact title, must-have tech, responsibilities). Use ONLY INPUT_1_JOB_DESCRIPTION + INPUT_2_CANDIDATE_RESUME. No invention. Return complete JSON.",
  });

  const baseMessages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPayload },
  ];

  async function runOnce(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    temperature = 0.5,
    maxTokens = LLM_MAX_TOKENS.generate,
  ): Promise<TailoredPackage | null> {
    try {
      let content = await requestJson(
        client,
        model,
        messages,
        temperature,
        maxTokens,
      );
      let parsedRaw: unknown;
      try {
        parsedRaw = parseModelJson(content);
      } catch {
        content = await requestJson(
          client,
          model,
          [
            ...messages,
            { role: "assistant", content },
            {
              role: "user",
              content: '{"error":"invalid_json","require":"complete_architect_resume_json"}',
            },
          ],
          Math.min(temperature, 0.35),
          maxTokens,
        );
        parsedRaw = parseModelJson(content);
      }
      return coerceTailoredPackage(parsedRaw);
    } catch (err) {
      console.warn(
        "Generate attempt failed:",
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  }

  async function generateCoverLetter(
    resume: TailoredResume,
  ): Promise<string> {
    try {
      const content = await requestJson(
        client,
        model,
        [
          { role: "system", content: COVER_LETTER_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              candidateName: profile.personal.name,
              targetCompany: extracted.company,
              targetRole: extracted.jobTitle || extracted.type,
              mustIncludeSkills: [
                ...extracted.mustHave,
                ...extracted.hardTechnicalSkills,
                ...extracted.requiredSkills,
              ].slice(0, 14),
              niceToHave: (extracted.niceToHave || []).slice(0, 6),
              yearsOfExperience: extracted.yearsOfExperience || "",
              responsibilities: (extracted.responsibilities || []).slice(0, 6),
              jdSummary: extracted.summary,
              resumeSummary: resume.summary,
              topSkills: resume.skills.flatMap((g) => g.items).slice(0, 12),
              recentBullets: resume.experiences[0]?.bullets?.slice(0, 3) || [],
            }),
          },
        ],
        0.45,
        LLM_MAX_TOKENS.coverLetter,
      );
      const parsed = parseModelJson<{ coverLetter?: string }>(content);
      return String(parsed.coverLetter || "").trim();
    } catch (err) {
      console.warn(
        "Cover letter generation failed:",
        err instanceof Error ? err.message : err,
      );
      return "";
    }
  }

  try {
    let draft = await runOnce(baseMessages, 0.35);

    // Up to 5 score-driven improvement iterations until >= 90.
    for (let pass = 0; pass < 5; pass++) {
      if (draft && !isWeakModelPackage(draft, profile, extracted)) break;
      const scored = draft
        ? scoreResumePackage({ package: draft, extracted, profile })
        : null;
      const lowest = scored
        ? Object.entries(scored.category_scores).sort((a, b) => a[1] - b[1])[0]
        : null;
      const corpus = draft
        ? [
            draft.resume?.summary,
            JSON.stringify(draft.resume?.skills || []),
            JSON.stringify(draft.resume?.experiences || []),
          ]
            .join(" ")
            .toLowerCase()
        : "";
      const uncoveredMust = [
        ...(extracted.mustHave || []),
        ...(extracted.hardTechnicalSkills || []),
        ...(extracted.requiredSkills || []),
      ]
        .map((s) => String(s || "").trim())
        .filter((s) => s.length >= 2 && !corpus.includes(s.toLowerCase()))
        .slice(0, 16);
      const improvePayload = JSON.stringify({
        action: "improve",
        prompt: IMPROVE_RESUME_PROMPT,
        critical:
          "PRIORITY: rewrite SUMMARY and SKILLS to be strongly JD-driven. Summary must start with exact JD title, pack 6–10 must-have/tech skills, and mirror JD responsibilities in two dense paragraphs. Skills must be JD-first short tokens across 4+ categories. Then fix lowest scoring category. Unique bullets per company; no filler shells; no invented metrics.",
        focus_sections: ["summary", "skills"],
        current_score: scored?.overall_score ?? 0,
        category_scores: scored?.category_scores ?? {},
        lowest_category: lowest?.[0] ?? null,
        missing_keywords: scored?.missing_keywords?.slice(0, 16) ?? [],
        uncovered_must_have_or_required: uncoveredMust,
        jd_skill_tokens: collectJdSkillTokens(extracted).slice(0, 20),
        suggestions: scored?.improvement_suggestions?.slice(0, 10) ?? [],
        weak_sections: scored?.weak_sections?.slice(0, 8) ?? [],
        jd_fit_priority: [
          "mustHave",
          "hardTechnicalSkills",
          "requiredSkills",
          "responsibilities",
          "yearsOfExperience",
          "niceToHave",
        ],
        iteration: pass + 1,
        max_iterations: 5,
      });

      draft =
        (await runOnce(
          [
            ...baseMessages,
            {
              role: "assistant",
              content: JSON.stringify(draft),
            },
            {
              role: "user",
              content: improvePayload,
            },
          ],
          0.35 + pass * 0.03,
        )) || draft;
    }

    if (!draft) {
      console.warn("Generate exhausted LLM attempts; using local fallback package.");
      return buildFallbackPackage(profile, extracted);
    }

    const coverLetter =
      String(draft.coverLetter || "").trim() ||
      (await generateCoverLetter(draft.resume)) ||
      buildFallbackCoverLetter(profile, extracted);

    return finalizePackage(
      { resume: draft.resume, coverLetter },
      profile,
      extracted,
    );
  } catch (err) {
    console.warn(
      "Generate falling back to deterministic package:",
      err instanceof Error ? err.message : err,
    );
    return buildFallbackPackage(profile, extracted);
  }
}

function coerceTailoredPackage(raw: unknown): TailoredPackage {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;

  // Some models nest under data / result / output
  const root =
    (obj.resume && typeof obj.resume === "object"
      ? obj
      : (obj.data as Record<string, unknown>) ||
        (obj.result as Record<string, unknown>) ||
        (obj.output as Record<string, unknown>) ||
        obj) || {};

  const resumeObj = (root.resume && typeof root.resume === "object"
    ? root.resume
    : root) as Record<string, unknown>;

  const summary = pickString(
    resumeObj.summary,
    resumeObj.professionalSummary,
    resumeObj.professional_summary,
    resumeObj.profileSummary,
    resumeObj.about,
    obj.summary,
  );

  const coverLetter = pickString(
    root.coverLetter,
    root.cover_letter,
    root.coverletter,
    obj.coverLetter,
    obj.cover_letter,
  );

  return {
    resume: {
      summary,
      skills: (resumeObj.skills as TailoredResume["skills"]) || [],
      experiences:
        (resumeObj.experiences as TailoredResume["experiences"]) || [],
      education: (resumeObj.education as TailoredResume["education"]) || [],
      keywords: (resumeObj.keywords as string[]) || [],
    },
    coverLetter,
  };
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const joined = value.map(String).join(" ").trim();
      if (joined) return joined;
    }
  }
  return "";
}

function buildFallbackSummary(
  profile: CandidateProfile,
  extracted: ExtractedJD,
): string {
  const title = extracted.jobTitle || extracted.type || "Software Engineer";
  const skills = collectJdSkillTokens(extracted).slice(0, 10);
  const primary = skills.slice(0, 6).join(", ") || "modern full-stack platforms";
  const secondary =
    skills.slice(6, 10).join(", ") ||
    skills.slice(0, 3).join(", ") ||
    "scalable production systems";

  const responsibilities = (extracted.responsibilities || [])
    .map((r) => sanitizePlainText(String(r || "")))
    .filter((r) => r.length >= 18 && r.length <= 110)
    .slice(0, 3);
  const respBit =
    responsibilities.length > 0
      ? responsibilities
          .map((r) => r.replace(/\.$/, "").trim())
          .join("; ")
      : "end-to-end feature delivery, API design, and production operations";

  const yearsRaw = String(extracted.yearsOfExperience || "").trim();
  const yearsBit =
    yearsRaw &&
    !/^not specified$/i.test(yearsRaw) &&
    /\d/.test(yearsRaw)
      ? ` with ${yearsRaw.replace(/\s+/g, " ").trim()} of relevant experience`
      : "";

  const latest = profile.experiences[0];
  const roleBit =
    latest?.company &&
    !/^(company|previous employer|employer|unknown)$/i.test(latest.company)
      ? `${latest.title} at ${latest.company}`
      : "recent production engineering roles";

  const mode = extracted.workMode || "Hybrid";
  const domain =
    /full.?stack/i.test(title)
      ? "frontend and backend product systems"
      : /data|ml|ai/i.test(`${title} ${extracted.type}`)
        ? "data and intelligent platforms"
        : "scalable software platforms";

  return `${title}${yearsBit} building ${domain} with ${primary}. Owns ${respBit}, with emphasis on architecture, reliability, and delivery quality demanded by the role.\n\nRecent work as ${roleBit} maps directly to this posting through ${secondary}, supporting ${mode} delivery with clear technical ownership from design through production.`;
}

function collapseRepeatedTokens(text: string): string {
  return text
    .replace(/\b([A-Za-z][A-Za-z0-9+.#-]{1,24})\b(?:\s*[,/|]\s*|\s+)\1\b/gi, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function dedupeExperienceBullets(
  experiences: TailoredResume["experiences"],
  profile: CandidateProfile,
  extracted: ExtractedJD,
): TailoredResume["experiences"] {
  const usedExact = new Set<string>();
  const openerCounts = new Map<string, number>();

  return experiences.map((exp, index) => {
    const kept: string[] = [];
    for (const bullet of exp.bullets || []) {
      const clean =
        sanitizeExperienceBullet(
          collapseRepeatedTokens(sanitizePlainText(bullet)),
        ) || collapseRepeatedTokens(sanitizePlainText(bullet));
      if (!clean || clean.length < 20) continue;

      const key = clean.toLowerCase().replace(/\s+/g, " ").trim();
      // Only drop near-exact duplicates (first 64 chars), not "similar structure"
      const fingerprint = key.slice(0, 64);
      if ([...usedExact].some((p) => p === fingerprint)) continue;

      const opener = (clean.trim().split(/\s+/)[0] || "").toLowerCase();
      if (opener && (openerCounts.get(opener) || 0) >= 2) {
        // Keep bullet but don't count as duplicate wipe — skip only if 3rd+ same opener
        continue;
      }

      usedExact.add(fingerprint);
      if (opener) openerCounts.set(opener, (openerCounts.get(opener) || 0) + 1);
      kept.push(clean);
    }

    // Prefer real bullets; only fill when almost empty (and never keep canned clones).
    const real = kept.filter((b) => !isCannedFillerText(b));
    const bullets =
      real.length >= 1
        ? real.slice(0, 10)
        : buildVariedExperienceBullets(
            {
              company:
                exp.company || profile.experiences[index]?.company || "Company",
              title: exp.title || profile.experiences[index]?.title || "Engineer",
              location:
                exp.location || profile.experiences[index]?.location || "Remote",
            },
            extracted,
            [],
            5,
            undefined,
            undefined,
            undefined,
            openerCounts,
          ).slice(0, 8);

    const overviewRaw = "";
    return {
      ...exp,
      overview: overviewRaw,
      bullets,
    };
  });
}

function buildFallbackCoverLetter(
  profile: CandidateProfile,
  extracted: ExtractedJD,
): string {
  const name = profile.personal.name || "Candidate";
  const company = extracted.company || "your team";
  const title = extracted.jobTitle || "the open role";
  const skills = [
    ...extracted.hardTechnicalSkills,
    ...extracted.requiredSkills,
  ]
    .filter(Boolean)
    .slice(0, 6)
    .join(", ");
  const latest = profile.experiences[0];
  const win = latest
    ? `At ${latest.company} as ${latest.title}, I owned delivery involving ${skills || "core platform technologies"}, shipping production increments with clear latency, reliability, and throughput targets.`
    : `I have delivered production systems involving ${skills || "modern engineering stacks"}, with clear ownership of reliability, performance, and release quality.`;
  return [
    `Dear Hiring Manager,\n\nI am applying for the ${title} role at ${company}. My background maps closely to the stack and outcomes described in the posting, and I am eager to contribute immediately.`,
    win,
    `I care about concrete results — cutting latency, raising throughput, and keeping systems operable — and I communicate tradeoffs clearly with product and engineering partners. I would welcome a conversation about how this experience can support ${company}'s roadmap.\n\nThank you for your time and consideration.\n\nSincerely,\n${name}`,
  ].join("\n\n");
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function requestJson(
  client: ReturnType<typeof getLlmClient>,
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  temperature = 0.5,
  maxTokens = LLM_MAX_TOKENS.generate,
): Promise<string> {
  const attempts: Array<{ useJsonObjectFormat: boolean; label: string }> = [
    { useJsonObjectFormat: true, label: "json_object" },
    { useJsonObjectFormat: false, label: "plain" },
  ];

  let lastError: Error | null = null;
  for (const attempt of attempts) {
    try {
      const completion = await withTimeout(
        client.chat.completions.create(
          {
            model,
            temperature,
            max_tokens: maxTokens,
            ...(attempt.useJsonObjectFormat
              ? { response_format: { type: "json_object" as const } }
              : {}),
            messages,
          },
          { signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS) },
        ),
        GENERATE_TIMEOUT_MS + 2_000,
        `Generate (${attempt.label})`,
      );

      const content = completion.choices[0]?.message?.content;
      const finish = completion.choices[0]?.finish_reason;
      if (!content?.trim()) {
        throw new Error(
          `Empty response while generating tailored resume (${attempt.label}).`,
        );
      }
      if (finish === "length") {
        throw new Error(
          `Generate response truncated at max_tokens (${attempt.label}).`,
        );
      }
      return content;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error("Generate attempt failed:", attempt.label, lastError);
    }
  }

  if (lastError) {
    throw new Error(formatOpenRouterError(lastError));
  }
  throw new Error("Empty response while generating tailored resume.");
}

function normalizeSkills(
  skills: unknown,
  extracted: ExtractedJD,
): SkillGroup[] {
  const jdSkillTokens = collectJdSkillTokens(extracted);

  const jdHay = [
    ...jdSkillTokens,
    extracted.jobTitle,
    extracted.type,
    extracted.summary,
    ...(extracted.responsibilities || []).slice(0, 8),
  ]
    .join(" ")
    .toLowerCase();

  const isMl =
    /ml|ai|llm|nlp|pytorch|tensorflow|machine learning|deep learning|data scientist/i.test(
      jdHay,
    );
  const isData =
    isMl ||
    /data engineer|spark|airflow|etl|warehouse|snowflake|kafka|analytics/i.test(
      jdHay,
    );
  const isFrontend = /react|next\.?js|vue|angular|frontend|front-end|ui\b/i.test(
    jdHay,
  );
  const isBackend =
    /node|nestjs|django|fastapi|spring|backend|back-end|api\b|graphql/i.test(
      jdHay,
    );

  const densify = (groups: SkillGroup[]): SkillGroup[] => {
    const classify = (skill: string): string => {
      const s = skill.toLowerCase();
      if (
        /python|java|typescript|javascript|go\b|rust|c\+\+|c#|kotlin|swift|scala|sql|bash|r\b/.test(
          s,
        )
      ) {
        return "Languages";
      }
      if (
        /react|next|vue|angular|html|css|tailwind|frontend|ui\b/.test(s)
      ) {
        return "Frontend";
      }
      if (
        /node|nestjs|express|django|flask|fastapi|spring|backend|\.net|graphql|rest\b/.test(
          s,
        )
      ) {
        return "Backend";
      }
      if (
        /aws|gcp|azure|docker|kubernetes|terraform|ci\/?cd|devops|github actions|gitlab/.test(
          s,
        )
      ) {
        return "Cloud/DevOps";
      }
      if (
        /postgres|mysql|mongo|redis|dynamo|cassandra|snowflake|s3|kafka|elasticsearch/.test(
          s,
        )
      ) {
        return "Databases";
      }
      if (
        /ml|ai|llm|nlp|pytorch|tensor|spark|etl|rag|vector|pandas|sklearn|scikit|huggingface|langchain|airflow|feature store/.test(
          s,
        )
      ) {
        return isMl || isData ? "Data/AI" : "Data/Platform";
      }
      if (
        /architecture|system design|microservices|distributed|scalability|observability/.test(
          s,
        )
      ) {
        return "Architecture";
      }
      if (
        /jest|cypress|playwright|pytest|junit|testing|tdd|qa\b/.test(s)
      ) {
        return "Testing";
      }
      if (
        /react|node|fastapi|django|flask|spring|express|graphql|langgraph|vllm|transformers/.test(
          s,
        )
      ) {
        return "Frameworks/Libraries";
      }
      return "Tools/Practices";
    };

    const byCategory = new Map<string, string[]>();
    const used = new Set<string>();

    const push = (category: string, item: string, front = false) => {
      const clean = sanitizePlainText(item);
      const key = clean.toLowerCase();
      if (!clean || used.has(key)) return;
      used.add(key);
      const list = byCategory.get(category) || [];
      if (list.length >= 10) return;
      if (front) list.unshift(clean);
      else list.push(clean);
      byCategory.set(category, list);
    };

    // JD skills first — strongest ATS signal (keep mustHave order).
    for (const skill of jdSkillTokens) {
      push(classify(skill), skill, false);
    }

    // Then preserve useful model/candidate skills that still fit.
    for (const group of groups) {
      for (const item of group.items) {
        const clean = sanitizePlainText(item);
        if (!clean || clean.length > 40) continue;
        if (
          !jdHay ||
          jdSkillTokens.some((j) =>
            clean.toLowerCase().includes(j.toLowerCase()),
          ) ||
          /python|java|typescript|javascript|react|node|aws|azure|gcp|docker|kubernetes|sql|postgres|mongo|redis|graphql|next/i.test(
            clean,
          )
        ) {
          push(group.category || classify(clean), clean, false);
        }
      }
    }

    // Ensure role-shaped categories exist when JD implies them.
    if (isFrontend && !byCategory.has("Frontend")) {
      for (const skill of jdSkillTokens.filter((s) =>
        /react|next|vue|angular|typescript|javascript/i.test(s),
      )) {
        push("Frontend", skill, false);
      }
    }
    if (isBackend && !byCategory.has("Backend")) {
      for (const skill of jdSkillTokens.filter((s) =>
        /node|nestjs|api|graphql|java|python|go\b/i.test(s),
      )) {
        push("Backend", skill, false);
      }
    }

    const preferredOrder = [
      "Languages",
      "Frontend",
      "Backend",
      "Frameworks/Libraries",
      "Cloud/DevOps",
      "Databases",
      "Data/AI",
      "Data/Platform",
      "Architecture",
      "Testing",
      "Tools/Practices",
      "Technical Skills",
    ];

    return preferredOrder
      .filter((cat) => byCategory.has(cat))
      .concat(
        [...byCategory.keys()].filter((cat) => !preferredOrder.includes(cat)),
      )
      .map((category) => ({
        category,
        items: (byCategory.get(category) || []).slice(0, 10),
      }))
      .filter((g) => g.items.length >= 1)
      .slice(0, 8);
  };

  if (Array.isArray(skills) && skills.length) {
    if (
      typeof skills[0] === "object" &&
      skills[0] !== null &&
      "category" in (skills[0] as object)
    ) {
      const grouped = (skills as Array<{ category?: unknown; items?: unknown }>)
        .map((group) => ({
          category: sanitizePlainText(String(group.category || "Skills")),
          items: Array.isArray(group.items)
            ? group.items
                .map(String)
                .map((s) => sanitizePlainText(s))
                .filter((s) => Boolean(s) && s.length <= 40)
            : [],
        }))
        .filter((group) => group.items.length > 0);
      return densify(grouped);
    }

    const items = skills
      .map(String)
      .map((s) => sanitizePlainText(s))
      .filter((s) => Boolean(s) && s.length <= 40);
    if (items.length) {
      return densify([{ category: "Technical Skills", items }]);
    }
  }

  if (!jdSkillTokens.length) {
    return densify([
      {
        category: "Core",
        items: [
          "Software Engineering",
          "System Design",
          "APIs",
          "Cloud Services",
          "CI/CD",
          "Agile Delivery",
        ],
      },
    ]);
  }

  return densify([
    { category: "Technical Skills", items: jdSkillTokens.slice(0, 16) },
  ]);
}

function normalizeResume(
  resume: TailoredResume | undefined,
  profile: CandidateProfile,
  extracted: ExtractedJD,
): TailoredResume {
  const safe = resume || {
    summary: "",
    skills: [],
    experiences: [],
    education: [],
    keywords: [],
  };

  const skillGroups = normalizeSkills(safe.skills, extracted);

  const keywords = sanitizeKeywords(
    Array.from(
      new Set(
        [
          ...(safe.keywords || []),
          ...skillGroups.flatMap((g) => g.items),
          ...extracted.hardTechnicalSkills,
          ...extracted.requiredSkills,
          extracted.jobTitle,
          extracted.type,
        ]
          .map((k) => String(k).trim())
          .filter(Boolean),
      ),
    ),
  );

  const experiences = profile.experiences.map((exp, index) => {
    const generated = safe.experiences?.[index];
    const incoming = (generated?.bullets || [])
      .map(String)
      .map((b) => sanitizePlainText(b))
      .map((b) => sanitizeExperienceBullet(b) || b)
      .filter((b) => b.length >= 20);

    // Keep ALL usable LLM bullets. Never pad with canned fillers when we already have content.
    const cleaned = incoming.filter((b) => !isCannedFillerText(b));
    const bullets =
      cleaned.length >= 1
        ? cleaned.slice(0, 10)
        : buildVariedExperienceBullets(exp, extracted, [], 5);

    const overview = sanitizePlainText(
      String(
        generated && "overview" in generated
          ? (generated as { overview?: string }).overview || ""
          : "",
      ),
    );

    return {
      company: exp.company,
      title: sanitizePlainText(generated?.title?.trim() || exp.title),
      period: exp.period,
      location: exp.location,
      // Ivan template has no role overview blurbs
      overview: "",
      bullets,
    };
  });

  return {
    summary:
      sanitizePlainText(String(safe.summary || "")) ||
      buildFallbackSummary(profile, extracted),
    skills: skillGroups,
    experiences,
    education:
      Array.isArray(safe.education) && safe.education.length
        ? safe.education.map((edu) => ({
            school: sanitizePlainText(edu.school),
            degree: sanitizePlainText(edu.degree),
            discipline: sanitizePlainText(
              (edu as { discipline?: string }).discipline || "",
            ),
            period: sanitizePlainText(edu.period),
            location: sanitizePlainText(edu.location),
          }))
        : profile.education,
    keywords: keywords.map((k) => sanitizePlainText(k)).filter(Boolean),
  };
}
