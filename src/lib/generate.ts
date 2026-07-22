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
} from "./resume-fallbacks";
import { sanitizePlainText } from "./validate-resume";

const SYSTEM_PROMPT = `You are an elite technical recruiter + ATS resume ghostwriter. Output resumes that look hand-crafted by a senior hiring manager — dense, specific, metric-heavy, and tightly mirrored to the JD.

Accuracy: never invent employers or schools. Prefer real achievements from the profile/source resume. When adding plausible metrics, ground them in that company's domain and the JD stack (realistic numbers only; avoid 90%+ claims).

Hard rules:
1. Sections: Summary, Skills, Experience, Education.
2. SUMMARY (critical): 60-95 words. First words = target job title/seniority from the JD. Embed 5-10 hard skills from the JD. Mention domain + impact (systems, data, users, products). Senior voice. Ban: "passionate", "team player", "results-driven", "leveraging synergies".
3. SKILLS (critical): exactly 5-6 groups with clear names (Languages; Frameworks/Libraries; Cloud/DevOps; Data/AI/ML; Databases; Tools/Practices — pick what fits). Each group 6-10 items. Mirror JD hardTechnicalSkills / requiredSkills first, then add adjacent high-signal tools. No 2-3 item groups.
4. Each experience MUST include:
   - overview: 35-55 words — company/product context + candidate ownership, JD-aligned.
   - exactly 7 UNIQUE accomplishment bullets (never clone the same bullet across roles).
5. QUANTIFIED IMPACT: ≥6 of 7 bullets per role include a concrete metric (users, QPS/RPS, latency ms, uptime, $ cost/revenue, dataset size, model accuracy/F1 only if ML role, services count, PRs, tickets, team size, % under 40, time saved). Strong verbs: Built, Led, Designed, Reduced, Scaled, Automated, Migrated, Fine-tuned, Shipped, Optimized.
6. Each bullet 28-45 words: stack + action + outcome. Ban empty filler as the whole point: "partnered with stakeholders", "cross-functional collaboration", "improved reliability" with no number.
7. keywords: 15-25 JD phrases for ATS.
8. Keep company names, periods, locations, education exact. Slight title refinement OK if plausible.
9. If sourceResumeText exists: prefer its real achievements/skills; do not invent major claims absent from source/profile.
10. Return ONLY valid compact JSON for the RESUME. Do NOT include a cover letter in this response. Escape quotes. No markdown.

Good bullet example: "Fine-tuned LLM inference pipelines with PyTorch and vLLM on GPU clusters, cutting p95 latency from 1.8s to 420ms while serving 50k+ daily requests for production NLP features."
Bad bullet example: "Collaborated with cross-functional teams to improve AI systems and deliver value."

JSON shape:
{
  "resume": {
    "summary": string,
    "skills": [{ "category": string, "items": string[] }],
    "experiences": [{ "company": string, "title": string, "period": string, "location": string, "overview": string, "bullets": string[] }],
    "education": [{ "school": string, "degree": string, "discipline": string, "period": string, "location": string }],
    "keywords": string[]
  }
}`;

const COVER_LETTER_PROMPT = `Write a professional cover letter for the candidate and job.
Return ONLY JSON: { "coverLetter": string }
Rules: 3-4 short paragraphs in ONE string with \\n\\n between paragraphs. No markdown. Tie 2-3 concrete achievements to the target company/role. No icons/emojis.`;

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
  const summaryWords = summary.split(/\s+/).filter(Boolean).length;
  if (summaryWords < 55 || summary.length < 280) return true;

  const { groups, items } = countSkillItems(draft.resume?.skills);
  if (groups < 5 || items < 28) return true;

  const jdSkills = [
    ...extracted.hardTechnicalSkills,
    ...extracted.requiredSkills,
  ]
    .map((s) => s.toLowerCase().trim())
    .filter((s) => s.length >= 2);
  const uniqueJd = [...new Set(jdSkills)].slice(0, 14);
  if (uniqueJd.length >= 3) {
    const hay = `${summary} ${JSON.stringify(draft.resume?.skills || [])}`.toLowerCase();
    const hits = uniqueJd.filter((s) => hay.includes(s)).length;
    if (hits < Math.min(4, uniqueJd.length)) return true;
  }

  for (let i = 0; i < profile.experiences.length; i++) {
    const exp = draft.resume?.experiences?.[i];
    const bullets = Array.isArray(exp?.bullets)
      ? exp!.bullets.map((b) => String(b || "").trim()).filter(Boolean)
      : [];
    const unique = countUniqueBullets(bullets);
    if (unique < 7) return true;
    const withMetrics = bullets.filter(bulletHasMetric).length;
    if (withMetrics < 6) return true;
    const shortOrVague = bullets.filter(
      (b) => b.split(/\s+/).length < 24 || isVagueBullet(b),
    ).length;
    if (shortOrVague >= 3) return true;
    const overview = String(exp?.overview || "").trim();
    if (overview.split(/\s+/).filter(Boolean).length < 28) return true;
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
    rawJobDescription: rawJd.slice(0, 10_000),
    sourceResumeText: options?.sourceResumeText
      ? options.sourceResumeText.slice(0, 12_000)
      : undefined,
    mustIncludeSkills: [
      ...extracted.hardTechnicalSkills,
      ...extracted.requiredSkills,
    ].slice(0, 28),
    targetRole: extracted.jobTitle || extracted.type,
    targetCompany: extracted.company,
    qualityBar:
      "Beat generic AI resumes: denser skills, JD-aligned summary, 7 metric-heavy UNIQUE bullets per role.",
    instructions: options?.sourceResumeText
      ? "STRENGTH FIRST from uploaded resume: HIGH-IMPACT resume JSON only (no cover letter). 5-6 skill groups × 6-10 items. Summary 60-95 words. Exactly 7 UNIQUE bullets/role with metrics in ≥6."
      : "STRENGTH FIRST: HIGH-IMPACT resume JSON only (no cover letter). 5-6 skill groups × 6-10 items. Summary 60-95 words. Exactly 7 UNIQUE bullets/role; ≥6 with concrete metrics.",
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
              content:
                "Your previous reply was invalid or truncated JSON. Return ONLY complete repaired valid JSON for the resume (no coverLetter). Requirements: 60-95 word summary opening with target title, 5-6 skill groups with 6-10 items each, 7 DISTINCT metric-heavy bullets per role. No markdown.",
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

  const rewritePrompt = `REWRITE the FULL resume JSON (no coverLetter). Previous draft failed the quality bar for a competitive ${extracted.jobTitle || extracted.type} application at ${extracted.company || "the employer"}.
Mandatory upgrades:
- Summary: 60-95 words, START with "${extracted.jobTitle || extracted.type}", weave in: ${[...extracted.hardTechnicalSkills, ...extracted.requiredSkills].slice(0, 10).join(", ") || "JD hard skills"}.
- Skills: 5-6 categories, 6-10 items EACH, maximize overlap with JD hard/required skills.
- Experience: exactly 7 UNIQUE bullets per role; ≥6 bullets MUST include concrete numbers.
- Overviews: 35-55 words, company + ownership + JD stack.
- Ban vague filler without an outcome metric.
Return complete resume JSON only.`;

  try {
    let draft = await runOnce(baseMessages, 0.5);

    // One quality rewrite when summary/skills/metrics are weak (keeps credit use low).
    if (!draft || isWeakModelPackage(draft, profile, extracted)) {
      draft =
        (await runOnce(
          [
            ...baseMessages,
            {
              role: "user",
              content: rewritePrompt,
            },
          ],
          0.55,
        )) || draft;
    }

    if (!draft) {
      console.warn("Generate exhausted LLM attempts; using local fallback package.");
      return buildFallbackPackage(profile, extracted);
    }

    const coverLetter =
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
  const skills = [
    ...extracted.hardTechnicalSkills,
    ...extracted.requiredSkills,
  ]
    .filter(Boolean)
    .slice(0, 8);
  const skillBit = skills.length
    ? skills.join(", ")
    : "modern cloud-native software and data stacks";
  const latest = profile.experiences[0];
  const roleBit = latest
    ? `${latest.title} at ${latest.company}`
    : "shipping production systems across product engineering teams";
  const company = extracted.company || "high-growth employers";
  return `${title} with hands-on depth across ${skillBit}. Recent work as ${roleBit} focused on measurable delivery — reliability, performance, and product velocity. Brings end-to-end ownership from design through production for ${extracted.workMode || "hybrid"} teams, with a track record of shipping systems that scale for ${company}.`;
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
  const jdSkills = [
    ...extracted.hardTechnicalSkills,
    ...extracted.requiredSkills,
  ]
    .map((s) => sanitizePlainText(String(s)))
    .filter(Boolean);

  const jdHay = [
    ...jdSkills,
    extracted.jobTitle,
    extracted.type,
    extracted.summary,
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

  const adjacentRows: Array<{ category: string; seeds: string[] }> = [
    {
      category: "Languages",
      seeds: ["Python", "TypeScript", "SQL", "Bash"],
    },
    {
      category: "Frameworks/Libraries",
      seeds: isMl
        ? [
            "PyTorch",
            "Hugging Face",
            "FastAPI",
            "LangChain",
            "scikit-learn",
            "NumPy",
            "Pandas",
          ]
        : ["React", "Node.js", "FastAPI", "REST APIs", "GraphQL", "Express"],
    },
    {
      category: "Cloud/DevOps",
      seeds: [
        "AWS",
        "Docker",
        "Kubernetes",
        "CI/CD",
        "Terraform",
        "GitHub Actions",
      ],
    },
    {
      category: isMl || isData ? "Data/AI/ML" : "Data/Platform",
      seeds: isMl
        ? [
            "LLMs",
            "NLP",
            "RAG",
            "feature stores",
            "model evaluation",
            "vector search",
            "ETL",
          ]
        : isData
          ? [
              "ETL",
              "data pipelines",
              "Spark",
              "Kafka",
              "warehousing",
              "SQL analytics",
            ]
          : [
              "PostgreSQL",
              "Redis",
              "caching",
              "event-driven design",
              "API design",
            ],
    },
    {
      category: "Databases",
      seeds: ["PostgreSQL", "Redis", "MongoDB", "S3", "Kafka"],
    },
    {
      category: "Tools/Practices",
      seeds: [
        "system design",
        "observability",
        "A/B testing",
        "code review",
        "Agile",
        "on-call",
      ],
    },
  ];

  const densify = (groups: SkillGroup[]): SkillGroup[] => {
    const merged = groups.map((g) => ({
      category: g.category,
      items: [...g.items],
    }));

    const ensure = (category: string, seeds: string[]) => {
      const idx = merged.findIndex(
        (g) => g.category.toLowerCase() === category.toLowerCase(),
      );
      const existing =
        idx >= 0 ? merged[idx].items.map((i) => i.toLowerCase()) : [];
      const fromJd = jdSkills.filter(
        (s) => s && !existing.includes(s.toLowerCase()),
      );
      const add = [...fromJd.slice(0, 4), ...seeds].filter(
        (s) => s && !existing.includes(s.toLowerCase()),
      );
      if (idx >= 0) {
        merged[idx] = {
          ...merged[idx],
          items: [...merged[idx].items, ...add].slice(0, 10),
        };
      } else if (merged.length < 6) {
        merged.push({
          category,
          items: Array.from(new Set([...fromJd.slice(0, 3), ...seeds])).slice(
            0,
            10,
          ),
        });
      }
    };

    for (const row of adjacentRows) {
      ensure(row.category, row.seeds.slice(0, isMl ? 5 : 4));
    }

    const all = new Set(
      merged.flatMap((g) => g.items.map((i) => i.toLowerCase())),
    );
    const missing = jdSkills.filter((s) => !all.has(s.toLowerCase()));
    if (missing.length && merged.length) {
      merged[0] = {
        ...merged[0],
        items: [...merged[0].items, ...missing].slice(0, 10),
      };
    }

    return merged
      .map((g) => ({
        ...g,
        items: Array.from(
          new Set(g.items.map((i) => i.trim()).filter(Boolean)),
        ).slice(0, 10),
      }))
      .filter((g) => g.items.length >= 4)
      .slice(0, 6);
  };

  const mergeJd = (groups: SkillGroup[]): SkillGroup[] => {
    if (!jdSkills.length) return densify(groups);
    const existing = new Set(
      groups.flatMap((g) => g.items.map((i) => i.toLowerCase())),
    );
    const missing = jdSkills.filter((s) => !existing.has(s.toLowerCase()));
    if (!missing.length) return densify(groups);
    if (!groups.length) {
      return densify([
        { category: "Technical Skills", items: missing.slice(0, 12) },
      ]);
    }
    const next = groups.map((group, index) =>
      index === 0
        ? {
            ...group,
            items: [...group.items, ...missing].slice(0, 12),
          }
        : group,
    );
    return densify(next);
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

  const languages = fallback.filter((s) =>
    /python|java|typescript|javascript|go|rust|c\+\+|c#|kotlin|swift|scala|sql|bash/i.test(
      s,
    ),
  );
  const cloud = fallback.filter((s) =>
    /aws|gcp|azure|docker|kubernetes|terraform|ci\/?cd|devops/i.test(s),
  );
  const data = fallback.filter((s) =>
    /sql|postgres|mysql|mongo|redis|kafka|spark|snowflake|airflow|etl|llm|nlp|ml|pytorch|tensorflow|rag|vector/i.test(
      s,
    ),
  );
  const frameworks = fallback.filter(
    (s) =>
      !languages.includes(s) && !cloud.includes(s) && !data.includes(s),
  );

  const groups: SkillGroup[] = [];
  if (languages.length) groups.push({ category: "Languages", items: languages });
  if (frameworks.length)
    groups.push({ category: "Frameworks/Libraries", items: frameworks });
  if (cloud.length) groups.push({ category: "Cloud/DevOps", items: cloud });
  if (data.length)
    groups.push({
      category: isMl || isData ? "Data/AI/ML" : "Data/Platform",
      items: data,
    });
  if (!groups.length) {
    groups.push({ category: "Technical Skills", items: fallback });
  }
  return densify(groups);
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
