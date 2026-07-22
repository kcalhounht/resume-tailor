import type {
  CandidateProfile,
  ExtractedJD,
  SkillGroup,
  TailoredPackage,
  TailoredResume,
} from "./types";
import { getLlmClient, getLlmModel } from "./llm";
import { parseModelJson } from "./parse-json";
import {
  buildExperienceOverview,
  buildVariedExperienceBullets,
} from "./resume-fallbacks";
import { sanitizePlainText } from "./validate-resume";

const SYSTEM_PROMPT = `You are an elite ATS resume writer who produces HIGH-IMPACT, job-winning resumes.
Create a tailored resume and cover letter that beat average AI resumes on specificity, metrics, and JD keyword density.

Accuracy first — never invent employers or schools. Prefer real achievements from the profile/source resume; when inventing plausible metrics for a role, keep them realistic and grounded in that company's domain and the JD.

Hard rules:
1. Resume sections: Summary, Skills, Experience, Education.
2. SUMMARY (critical): 55-90 words. Open with the target job title / seniority from the JD. Name 4-8 hard skills from the JD. State domain impact (scale, systems, products). Sound senior and concrete — no vague soft filler like "passionate team player".
3. SKILLS (critical): 5-6 groups (e.g. Languages, Frameworks/Libraries, Cloud/DevOps, Data/AI, Databases, Tools/Practices). Each group MUST have 5-10 items. Heavily mirror JD hardTechnicalSkills / requiredSkills. Include adjacent high-signal tools the candidate would plausibly know. No tiny 2-item groups.
4. Each experience MUST include:
   - overview: 1-2 sentences (30-50 words) — what the company/product does + the candidate's ownership, tailored to the JD.
   - exactly 7 UNIQUE accomplishment bullets.
5. QUANTIFIED IMPACT (critical): At least 6 of 7 bullets per role MUST include a concrete metric (users, requests/QPS, latency ms, uptime, revenue/cost, dataset size, services, PRs, tickets, team size, % only if realistic <40, time saved, etc.). Start bullets with strong verbs (Built, Led, Designed, Reduced, Scaled, Automated, Migrated, Shipped).
6. Each bullet ~28-42 words, specific stack + outcome. Ban vague filler: "partnered with stakeholders", "cross-functional collaboration" as the whole point, "improved reliability" without a number.
7. Mirror JD terminology heavily for ATS. keywords: 12-25 important JD phrases to bold later.
8. Cover letter: 3-4 short paragraphs in ONE string, use \\n\\n between paragraphs. No icons/emojis. Tie 2-3 quantified achievements to the target company/role.
9. Keep company names, periods, locations, and education exactly as given. Slight title refinement allowed if plausible.
10. When sourceResumeText is provided: prefer true achievements/skills from it; do not invent major claims absent from source/profile.
11. Return ONLY valid compact JSON. Escape quotes inside strings. No markdown. NEVER use **bold**, *italic*, backticks, or headings in any string.

JSON shape:
{
  "resume": {
    "summary": string,
    "skills": [{ "category": string, "items": string[] }],
    "experiences": [{ "company": string, "title": string, "period": string, "location": string, "overview": string, "bullets": string[] }],
    "education": [{ "school": string, "degree": string, "discipline": string, "period": string, "location": string }],
    "keywords": string[]
  },
  "coverLetter": string
}`;

/** Abort hung calls, but allow enough time for a real quality completion. */
const GENERATE_TIMEOUT_MS = 75_000;

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
  return /\d/.test(text) ||
    /\$|€|£|%|\bms\b|\bqps\b|\brps\b|\bk\b|\bm\b|\busers?\b|\brequests?\b|\blatency\b|\buptime\b|\brevenue\b|\bcost\b|\bteam of\b|\bservices?\b/i.test(
      text,
    );
}

function countSkillItems(skills: unknown): { groups: number; items: number } {
  if (!Array.isArray(skills) || !skills.length) return { groups: 0, items: 0 };
  let items = 0;
  for (const group of skills) {
    if (group && typeof group === "object" && Array.isArray((group as { items?: unknown }).items)) {
      items += (group as { items: unknown[] }).items.filter(Boolean).length;
    } else if (typeof group === "string" && group.trim()) {
      items += 1;
    }
  }
  const groups =
    typeof skills[0] === "object" && skills[0] !== null ? skills.length : items > 0 ? 1 : 0;
  return { groups, items };
}

/** True when the model returned thin summary/skills or low-impact bullets. */
function isWeakModelPackage(
  draft: TailoredPackage,
  profile: CandidateProfile,
  extracted: ExtractedJD,
): boolean {
  const summary = String(draft.resume?.summary || "").trim();
  if (summary.length < 220) return true;
  if (!String(draft.coverLetter || "").trim()) return true;

  const { groups, items } = countSkillItems(draft.resume?.skills);
  if (groups < 4 || items < 18) return true;

  // Prefer resumes that actually mention JD hard skills in summary or skills.
  const jdSkills = extracted.hardTechnicalSkills
    .map((s) => s.toLowerCase())
    .filter((s) => s.length >= 2)
    .slice(0, 12);
  if (jdSkills.length >= 3) {
    const hay = `${summary} ${JSON.stringify(draft.resume?.skills || [])}`.toLowerCase();
    const hits = jdSkills.filter((s) => hay.includes(s)).length;
    if (hits < Math.min(3, jdSkills.length)) return true;
  }

  for (let i = 0; i < profile.experiences.length; i++) {
    const exp = draft.resume?.experiences?.[i];
    const bullets = Array.isArray(exp?.bullets)
      ? exp!.bullets.map((b) => String(b || "").trim()).filter(Boolean)
      : [];
    const unique = countUniqueBullets(bullets);
    if (unique < 6) return true;
    const withMetrics = bullets.filter(bulletHasMetric).length;
    if (withMetrics < 5) return true;
    const overview = String(exp?.overview || "").trim();
    if (overview.length < 60) return true;
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

  if (!resume.summary || resume.summary.length < 120) {
    resume = {
      ...resume,
      summary: buildFallbackSummary(profile, extracted),
    };
  }
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
    candidate: profile,
    extractedJd: extracted,
    rawJobDescription: rawJd.slice(0, 14000),
    sourceResumeText: options?.sourceResumeText
      ? options.sourceResumeText.slice(0, 22000)
      : undefined,
    mustIncludeSkills: extracted.hardTechnicalSkills.slice(0, 20),
    targetRole: extracted.jobTitle || extracted.type,
    targetCompany: extracted.company,
    instructions: options?.sourceResumeText
      ? "STRENGTH FIRST: Tailor the uploaded resume into a HIGH-IMPACT package for this JD. Dense JD-aligned skills (5-6 groups). Summary 55-90 words naming the target role + key stack. 7 UNIQUE bullets per role with quantified impact in at least 6 bullets. No vague filler."
      : "STRENGTH FIRST: Build a HIGH-IMPACT tailored resume for this JD. Dense JD-aligned skills (5-6 groups, 5-10 items each). Summary 55-90 words with target title + stack + impact. Exactly 7 UNIQUE bullets per role; at least 6 with concrete metrics. No vague stakeholder filler.",
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
  ): Promise<TailoredPackage | null> {
    try {
      let content = await requestJson(client, model, messages);
      let parsedRaw: unknown;
      try {
        parsedRaw = parseModelJson(content);
      } catch {
        content = await requestJson(client, model, [
          ...messages,
          { role: "assistant", content },
          {
            role: "user",
            content:
              "Your previous reply was invalid JSON. Return ONLY repaired valid JSON. Requirements: strong 55-90 word summary, 5-6 skill groups with 5-10 items each, 7 DISTINCT bullets per role with metrics in most bullets, non-empty coverLetter. No markdown.",
          },
        ]);
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

  try {
    let draft = await runOnce(baseMessages);

    // Quality retry when summary/skills/metrics are weak.
    if (!draft || isWeakModelPackage(draft, profile, extracted)) {
      draft =
        (await runOnce([
          ...baseMessages,
          {
            role: "user",
            content: `REWRITE the FULL JSON. Previous draft was too weak.
Mandatory upgrades:
- Summary: 55-90 words, start with "${extracted.jobTitle || extracted.type}", weave in these skills: ${extracted.hardTechnicalSkills.slice(0, 8).join(", ") || "JD hard skills"}.
- Skills: 5-6 categories, 5-10 items each, maximize overlap with JD hard skills.
- Experience: exactly 7 UNIQUE bullets per role; at least 6 bullets MUST include concrete numbers (users, latency, cost, services, team size, throughput, etc.).
- No vague "partnered with stakeholders" filler without an outcome metric.
- Strong cover letter tied to ${extracted.company || "the employer"}.`,
          },
        ])) || draft;
    }

    if (!draft) {
      console.warn("Generate exhausted LLM attempts; using local fallback package.");
      return buildFallbackPackage(profile, extracted);
    }

    return finalizePackage(draft, profile, extracted);
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
  const skills = extracted.hardTechnicalSkills.slice(0, 8);
  const skillBit = skills.length
    ? skills.join(", ")
    : "modern cloud-native software stacks";
  const latest = profile.experiences[0];
  const roleBit = latest
    ? `${latest.title} at ${latest.company}`
    : "shipping production systems across product engineering teams";
  const mode = extracted.workMode ? ` ${extracted.workMode}` : "";
  return `${profile.personal.name || "Candidate"} is a ${title} with experience as ${roleBit}. Strengths include ${skillBit}. Delivers measurable outcomes across reliability, performance, and product velocity for${mode} teams at ${extracted.company || "high-growth employers"}, with a track record of owning end-to-end features from design through production.`;
}

function buildFallbackCoverLetter(
  profile: CandidateProfile,
  extracted: ExtractedJD,
): string {
  const name = profile.personal.name || "Candidate";
  const company = extracted.company || "your team";
  const title = extracted.jobTitle || "the open role";
  const skills = extracted.hardTechnicalSkills.slice(0, 4).join(", ");
  return [
    `Dear Hiring Manager,\n\nI am writing to apply for the ${title} role at ${company}. My background aligns closely with the position and I am excited about the opportunity to contribute.`,
    `In recent roles I have delivered production systems and collaborated with cross-functional partners${skills ? `, including work involving ${skills}` : ""}. I focus on clear communication, reliable delivery, and measurable impact.`,
    `I would welcome the chance to discuss how my experience can support ${company}. Thank you for your time and consideration.\n\nSincerely,\n${name}`,
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
            temperature: 0.45,
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
      if (!content?.trim()) {
        throw new Error(
          `Empty response while generating tailored resume (${attempt.label}).`,
        );
      }
      return content;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error("Generate attempt failed:", attempt.label, lastError);
    }
  }

  throw (
    lastError || new Error("Empty response while generating tailored resume.")
  );
}

function normalizeSkills(
  skills: unknown,
  extracted: ExtractedJD,
): SkillGroup[] {
  const jdSkills = extracted.hardTechnicalSkills
    .map((s) => sanitizePlainText(String(s)))
    .filter(Boolean);

  const mergeJd = (groups: SkillGroup[]): SkillGroup[] => {
    if (!jdSkills.length) return groups;
    const existing = new Set(
      groups.flatMap((g) => g.items.map((i) => i.toLowerCase())),
    );
    const missing = jdSkills.filter((s) => !existing.has(s.toLowerCase()));
    if (!missing.length) return groups;
    if (!groups.length) {
      return [{ category: "Technical Skills", items: missing.slice(0, 12) }];
    }
    // Fold missing JD skills into the first group so ATS coverage stays dense.
    return groups.map((group, index) =>
      index === 0
        ? {
            ...group,
            items: [...group.items, ...missing].slice(0, 14),
          }
        : group,
    );
  };

  if (Array.isArray(skills) && skills.length) {
    // New grouped format
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
                .filter(Boolean)
            : [],
        }))
        .filter((group) => group.items.length > 0);
      return mergeJd(grouped);
    }

    // Legacy flat string list -> one compact Technical Skills group
    const items = skills
      .map(String)
      .map((s) => sanitizePlainText(s))
      .filter(Boolean);
    if (items.length) {
      return mergeJd([{ category: "Technical Skills", items }]);
    }
  }

  const fallback = jdSkills;
  if (!fallback.length) {
    return [
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
    ];
  }

  // Spread JD skills into denser groups when the model returned nothing useful.
  const languages = fallback.filter((s) =>
    /python|java|typescript|javascript|go|rust|c\+\+|c#|kotlin|swift|scala/i.test(
      s,
    ),
  );
  const cloud = fallback.filter((s) =>
    /aws|gcp|azure|docker|kubernetes|terraform|ci\/?cd|devops/i.test(s),
  );
  const data = fallback.filter((s) =>
    /sql|postgres|mysql|mongo|redis|kafka|spark|snowflake|airflow|etl/i.test(s),
  );
  const frameworks = fallback.filter(
    (s) =>
      !languages.includes(s) &&
      !cloud.includes(s) &&
      !data.includes(s),
  );

  const groups: SkillGroup[] = [];
  if (languages.length) groups.push({ category: "Languages", items: languages });
  if (frameworks.length)
    groups.push({ category: "Frameworks/Libraries", items: frameworks });
  if (cloud.length) groups.push({ category: "Cloud/DevOps", items: cloud });
  if (data.length) groups.push({ category: "Data/Platform", items: data });
  if (!groups.length) {
    groups.push({ category: "Technical Skills", items: fallback });
  }
  return groups;
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

  const keywords = Array.from(
    new Set(
      [
        ...(safe.keywords || []),
        ...skillGroups.flatMap((g) => g.items),
        ...extracted.hardTechnicalSkills,
        ...extracted.softSkills,
        extracted.jobTitle,
        extracted.type,
        extracted.workMode,
      ]
        .map((k) => String(k).trim())
        .filter(Boolean),
    ),
  );

  const experiences = profile.experiences.map((exp, index) => {
    const generated = safe.experiences?.[index];
    const incoming = (generated?.bullets || [])
      .map(String)
      .map((b) => sanitizePlainText(b))
      .filter(Boolean);

    const bullets = buildVariedExperienceBullets(
      exp,
      extracted,
      incoming,
      7,
    );

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
      overview:
        overview || buildExperienceOverview(exp, extracted, index),
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
