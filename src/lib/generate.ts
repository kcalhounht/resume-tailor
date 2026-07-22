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

const SYSTEM_PROMPT = `You are an expert ATS resume writer and career coach.
Create a tailored resume and cover letter that maximize ATS keyword match for the target role.

Accuracy is the top priority — every bullet must be specific and distinct.

Hard rules:
1. Resume sections: Summary, Skills, Experience, Education.
2. Skills MUST be classified into compact groups (not one skill per line). Use 4-6 groups such as:
   Languages, Frameworks/Libraries, Cloud/DevOps, Data/AI, Databases, Tools/Practices.
   Each group has a short category name and 4-10 comma-ready item strings.
3. Each experience MUST include:
   - overview: 1-2 sentences (about 25-45 words) describing what the company does and the candidate's core responsibility in that role, tailored toward the target JD.
   - exactly 7 bullet points of accomplishments.
4. Each bullet must be professional, specific (~25-40 words), and UNIQUE. Never repeat the same sentence or near-duplicate wording across bullets.
5. Include hard numbers (counts, scale, volume, latency, users, datasets, dollars) but NEVER invent unrealistic percentages.
6. Ground bullets in the candidate's real employers/titles and the JD. Prefer concrete stack, systems, and responsibilities over vague "partnered with stakeholders" filler.
7. Mirror JD terminology and hard skills heavily for ATS scoring.
8. keywords: array of important JD keywords/phrases that should be bolded.
9. Cover letter: 3-4 short paragraphs in ONE string, use \\n\\n between paragraphs. No icons/emojis.
10. Keep the candidate's company names, periods, locations, and education (school, degree, discipline, period, location) exactly as given. You may refine job titles slightly if plausible.
11. Do not invent employers or schools. When sourceResumeText is provided, prefer true achievements from it; do not invent major claims absent from the source or profile.
12. Return ONLY valid compact JSON. Escape all double quotes inside strings. Do not wrap in markdown.
13. NEVER use markdown in any string (**bold**, *italic*, backticks, headings). Plain text only. Keyword bolding is applied later by the document formatter.

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
const GENERATE_TIMEOUT_MS = 60_000;

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

/** True when the model returned thin/duplicate experience content. */
function isWeakModelPackage(
  draft: TailoredPackage,
  profile: CandidateProfile,
): boolean {
  const summary = String(draft.resume?.summary || "").trim();
  if (summary.length < 80) return true;
  if (!String(draft.coverLetter || "").trim()) return true;

  for (let i = 0; i < profile.experiences.length; i++) {
    const exp = draft.resume?.experiences?.[i];
    const unique = countUniqueBullets(exp?.bullets);
    if (unique < 5) return true;
    const overview = String(exp?.overview || "").trim();
    if (overview.length < 40) return true;
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

  if (!resume.summary) {
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
    rawJobDescription: rawJd.slice(0, 12000),
    sourceResumeText: options?.sourceResumeText
      ? options.sourceResumeText.slice(0, 20000)
      : undefined,
    instructions: options?.sourceResumeText
      ? "ACCURACY FIRST: Tailor the uploaded resume to this JD. Keep factual employment history. Rewrite bullets/summary/skills for ATS fit with DISTINCT, specific bullets (no repeated filler). summary and coverLetter MUST be non-empty."
      : "ACCURACY FIRST: Generate a tailored resume from the candidate profile and JD. Each experience needs 7 UNIQUE specific bullets grounded in that company/role and the JD. No repeated sentences. summary and coverLetter MUST be non-empty.",
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
              "Your previous reply was invalid JSON. Return ONLY repaired valid JSON for the same request. Each experience needs exactly 7 DISTINCT bullets. Include non-empty resume.summary and coverLetter. No markdown, no commentary.",
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

    // Quality retry when the first pass is thin or repetitive.
    if (!draft || isWeakModelPackage(draft, profile)) {
      draft =
        (await runOnce([
          ...baseMessages,
          {
            role: "user",
            content:
              "Previous output was too generic or had too few unique bullets. Rewrite the FULL JSON with higher specificity: distinct accomplishment bullets per role (no near-duplicates), JD-aligned skills, strong summary, and a real cover letter.",
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
  const skills = extracted.hardTechnicalSkills.slice(0, 5).join(", ");
  const latest = profile.experiences[0];
  const roleBit = latest
    ? `${latest.title} at ${latest.company}`
    : "professional experience across product and engineering teams";
  const skillBit = skills
    ? ` Core strengths include ${skills}.`
    : " Strong delivery focus across modern software stacks.";
  return `${profile.personal.name || "Candidate"} is a ${title} with ${roleBit}.${skillBit} Proven ability to ship reliable solutions, collaborate cross-functionally, and align technical work to business outcomes for ${extracted.company || "target employers"}.`;
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
            temperature: 0.35,
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
  if (Array.isArray(skills) && skills.length) {
    // New grouped format
    if (
      typeof skills[0] === "object" &&
      skills[0] !== null &&
      "category" in (skills[0] as object)
    ) {
      return (skills as Array<{ category?: unknown; items?: unknown }>)
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
    }

    // Legacy flat string list -> one compact Technical Skills group
    const items = skills
      .map(String)
      .map((s) => sanitizePlainText(s))
      .filter(Boolean);
    if (items.length) {
      return [{ category: "Technical Skills", items }];
    }
  }

  const fallback = extracted.hardTechnicalSkills.filter(Boolean);
  if (!fallback.length) {
    return [
      {
        category: "Core",
        items: ["Software Engineering", "System Design", "Agile Delivery"],
      },
    ];
  }

  return [
    {
      category: "Technical Skills",
      items: fallback,
    },
  ];
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
