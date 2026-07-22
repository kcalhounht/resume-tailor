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

const SYSTEM_PROMPT = `You are an expert ATS resume writer and career coach.
Create a tailored resume that maximize ATS keyword match for the target role.

Hard rules:
1. Resume sections: Summary, Skills, Experience, Education.
2. Skills MUST be classified into compact groups (not one skill per line). Use 4-6 groups such as:
   Languages, Frameworks/Libraries, Cloud/DevOps, Data/AI, Databases, Tools/Practices.
   Each group has a short category name and 4-10 comma-ready item strings.
3. Each experience MUST include:
   - overview: 1-2 sentences (about 25-45 words) describing what the company does and the candidate's core responsibility in that role, tailored toward the target JD.
   - exactly 7 bullet points of accomplishments.
4. Each bullet must be professional and specific (~25-40 words). Describe concrete work done.
5. Include hard numbers (counts, scale, volume, latency, users, datasets, dollars) but NEVER invent unrealistic percentages.
6. Include slightly MORE relevant experience breadth than the JD strictly requires.
7. Mirror JD terminology and hard skills heavily for ATS scoring.
8. keywords: array of important JD keywords/phrases that should be bolded.
9. Keep the candidate's company names, periods, locations, and education exactly as given. You may refine job titles slightly if plausible.
10. Do not invent employers or schools. Invent realistic overviews and accomplishment bullets grounded in the companies and JD.
11. When sourceResumeText is provided, prefer real achievements and skills from it; do not invent major claims absent from source/profile.
12. SUMMARY: 55-90 words. Open with the target job title / seniority from the JD. Name 5-10 hard skills from the JD. State domain impact. Senior, concrete voice — no vague soft filler.
13. Return ONLY valid compact JSON for the RESUME (no cover letter in this response). Escape all double quotes inside strings. Do not wrap in markdown.
14. NEVER use markdown in any string (**bold**, *italic*, backticks, headings). Plain text only. Keyword bolding is applied later by the document formatter.

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

const COVER_LETTER_PROMPT = `You are an expert ATS resume writer and career coach.
Create a tailored cover letter that maximizes fit for the target role.

Hard rules:
1. Cover letter: 3-4 short paragraphs in ONE string, use \\n\\n between paragraphs. No icons/emojis.
2. Mirror JD terminology and hard skills. Tie 2-3 concrete achievements to the target company/role.
3. Do not invent employers or schools. Ground claims in the candidate profile / resume summary / bullets provided.
4. Return ONLY valid compact JSON: { "coverLetter": string }
5. Escape all double quotes inside strings. NEVER use markdown (**bold**, *italic*, backticks, headings). Plain text only.`;

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
  if (groups < 4 || items < 20) return true;

  const jdSkills = [
    ...extracted.hardTechnicalSkills,
    ...extracted.requiredSkills,
  ]
    .map((s) => s.toLowerCase().trim())
    .filter((s) => s.length >= 2);
  const uniqueJd = [...new Set(jdSkills)].slice(0, 16);
  if (uniqueJd.length >= 3) {
    const hay = `${summary} ${JSON.stringify(draft.resume?.skills || [])}`.toLowerCase();
    const hits = uniqueJd.filter((s) => hay.includes(s)).length;
    // Strong ATS: require most JD hard skills to appear in summary/skills.
    if (hits < Math.min(5, uniqueJd.length)) return true;
  }

  for (let i = 0; i < profile.experiences.length; i++) {
    const exp = draft.resume?.experiences?.[i];
    const bullets = Array.isArray(exp?.bullets)
      ? exp!.bullets.map((b) => String(b || "").trim()).filter(Boolean)
      : [];
    const unique = countUniqueBullets(bullets);
    if (unique < 7) return true;
    const withMetrics = bullets.filter(bulletHasMetric).length;
    if (withMetrics < 5) return true;
    const shortOrVague = bullets.filter(
      (b) => b.split(/\s+/).length < 22 || isVagueBullet(b),
    ).length;
    if (shortOrVague >= 3) return true;
    const overview = String(exp?.overview || "").trim();
    if (overview.split(/\s+/).filter(Boolean).length < 22) return true;
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
      "Maximize ATS keyword match: mirror JD terms heavily, 4-6 dense skill groups, 7 specific bullets/role with realistic hard numbers (no unrealistic %), slightly MORE breadth than the JD requires.",
    instructions: options?.sourceResumeText
      ? "STRONG ATS TAILOR from uploaded resume: resume JSON only (no cover letter). 4-6 skill groups × 4-10 items. Summary 55-90 words opening with target title + JD hard skills. Exactly 7 UNIQUE specific bullets/role (~25-40 words) with hard numbers; never invent unrealistic percentages. Mirror JD terminology heavily."
      : "STRONG ATS TAILOR: resume JSON only (no cover letter). 4-6 skill groups × 4-10 items. Summary 55-90 words opening with target title + JD hard skills. Exactly 7 UNIQUE specific bullets/role (~25-40 words) with hard numbers; never invent unrealistic percentages. Mirror JD terminology heavily; include slightly more relevant breadth than the JD requires.",
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
                "Your previous reply was invalid or truncated JSON. Return ONLY complete repaired valid resume JSON (no coverLetter). Requirements: 55-90 word summary opening with target title + JD skills, 4-6 skill groups with 4-10 items each, exactly 7 DISTINCT specific bullets per role (~25-40 words) with realistic hard numbers (no unrealistic %), dense JD keyword mirror. No markdown.",
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
                ...extracted.hardTechnicalSkills,
                ...extracted.requiredSkills,
              ].slice(0, 12),
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

  const rewritePrompt = `REWRITE the FULL resume JSON (no coverLetter). Previous draft was NOT strong enough for ATS keyword match for ${extracted.jobTitle || extracted.type} at ${extracted.company || "the employer"}.
Mandatory upgrades:
- Summary: 55-90 words, START with "${extracted.jobTitle || extracted.type}", weave in: ${[...extracted.hardTechnicalSkills, ...extracted.requiredSkills].slice(0, 12).join(", ") || "JD hard skills"}.
- Skills: 4-6 compact groups (Languages, Frameworks/Libraries, Cloud/DevOps, Data/AI, Databases, Tools/Practices), 4-10 items EACH; maximize overlap with JD hard/required skills; add slightly MORE adjacent relevant tools than the JD lists.
- Experience: overview 25-45 words (company + ownership, JD-tailored). Exactly 7 UNIQUE bullets per role (~25-40 words each); include hard numbers (counts, scale, latency, users, datasets, dollars) but NEVER invent unrealistic percentages.
- Mirror JD terminology heavily throughout for ATS.
- keywords: important JD phrases for later bolding.
Return complete resume JSON only. No markdown.`;

  try {
    let draft = await runOnce(baseMessages, 0.5);

    // Up to two strong ATS rewrites when keyword/skill/bullet quality is weak.
    for (let pass = 0; pass < 2; pass++) {
      if (draft && !isWeakModelPackage(draft, profile, extracted)) break;
      draft =
        (await runOnce(
          [
            ...baseMessages,
            {
              role: "user",
              content: rewritePrompt,
            },
          ],
          0.55 + pass * 0.05,
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
