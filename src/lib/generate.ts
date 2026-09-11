import type {
  CandidateProfile,
  ExtractedJD,
  SkillGroup,
  TailoredPackage,
  TailoredResume,
} from "./types";
import type OpenAI from "openai";
import { getLlmClient, getLlmModel } from "./llm";
import { parseModelJson } from "./parse-json";
import { buildResumeHeadline } from "./headline";
import { yearsOfExperienceFromProfile } from "./experience-years";
import { sanitizePlainText } from "./validate-resume";

const SYSTEM_PROMPT = `You are an expert ATS resume writer and career coach.
Create a tailored resume and cover letter that maximize ATS keyword match for the target role.

Hard rules:
1. Resume sections: Headline (one line under the name, not a heading), Summary, Skills, Experience, Education.
   headline format: "Target Role | Skill, Skill, Skill" or four skills. Use the JD job title as the target role and 3-4 concrete hard skills from the JD. No markdown.
2. Summary length MUST be more than 90 words (91+ words required; aim for 95-130). Write one dense professional paragraph. No markdown.
   Years of experience in the Summary MUST match the candidate's work history periods (use yearsOfExperience from the user payload). Do not invent a larger or smaller number.
3. Skills MUST be classified into compact groups (not one skill per line). Use 6-8 groups such as:
   Languages, Frameworks/Libraries, Cloud/DevOps, Data/AI, Databases, Tools/Practices, Methodologies, Platforms.
   The skill set MUST contain MORE THAN 40 distinct skill items in total across all groups (not 40 groups; 41+ items required, aim for 45-60).
   Each group has a short category name and 6-10 comma-ready item strings.
4. Each experience MUST include:
   - overview: 1-2 sentences (about 25-45 words) describing what the company does and the candidate's core responsibility in that role, tailored toward the target JD.
   - exactly 7 bullet points of accomplishments.
5. Each bullet must be professional and specific (~25-40 words). Describe concrete work done.
6. Include hard numbers (counts, scale, volume, latency, users, datasets, dollars) but NEVER invent unrealistic percentages.
7. Include slightly MORE relevant experience breadth than the JD strictly requires.
8. Mirror JD terminology and hard skills heavily for ATS scoring.
9. keywords: array of important JD keywords/phrases that should be bolded.
10. Cover letter: 3-4 short paragraphs in ONE string, use \\n\\n between paragraphs. No icons/emojis.
11. Keep the candidate's company names, periods, job locations, schools, disciplines, degrees, and education periods exactly as given. You may refine job titles slightly if plausible.
12. Do not invent employers or schools. Invent realistic overviews and accomplishment bullets grounded in the companies and JD.
13. Return ONLY valid compact JSON. Escape all double quotes inside strings. Do not wrap in markdown.
14. NEVER use markdown in any string (**bold**, *italic*, backticks, headings). Plain text only. Keyword bolding is applied later by the document formatter.

JSON shape:
{
  "resume": {
    "headline": string,
    "summary": string,
    "skills": [{ "category": string, "items": string[] }],
    "experiences": [{ "company": string, "title": string, "period": string, "location": string, "overview": string, "bullets": string[] }],
    "education": [{ "school": string, "discipline": string, "degree": string, "period": string }],
    "keywords": string[]
  },
  "coverLetter": string
}
summary must be more than 90 words and must use yearsOfExperience from the candidate profile. skills.items across all groups must contain more than 40 distinct items.`;

export async function generateTailoredPackage(
  profile: CandidateProfile,
  extracted: ExtractedJD,
  rawJd: string,
  repairHints: string[] = [],
): Promise<TailoredPackage> {
  const client = await getLlmClient();
  const model = await getLlmModel();
  const userPayload = buildGenerateUserPrompt(
    profile,
    extracted,
    rawJd,
    repairHints,
  );

  let content = await requestJson(client, model, [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPayload },
  ]);

  let parsed: TailoredPackage;
  try {
    parsed = parseModelJson<TailoredPackage>(content);
  } catch (firstError) {
    content = await requestJson(client, model, [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPayload },
      { role: "assistant", content },
      {
        role: "user",
        content:
          "Your previous reply was invalid JSON. Return ONLY repaired valid JSON for the same request. Summary must be more than 90 words and must use the profile years of experience. Include more than 40 distinct skill items across all groups. No markdown, no commentary.",
      },
    ]);
    try {
      parsed = parseModelJson<TailoredPackage>(content);
    } catch {
      throw firstError instanceof Error
        ? firstError
        : new Error("Failed to parse generated resume JSON.");
    }
  }

  const resume = normalizeResume(parsed.resume, profile, extracted);
  const coverLetter = String(parsed.coverLetter || "").trim();

  if (!resume.summary) {
    throw new Error("Resume summary generation failed.");
  }
  if (!coverLetter) {
    throw new Error("Cover letter generation failed.");
  }

  return { resume, coverLetter };
}

function buildGenerateUserPrompt(
  profile: CandidateProfile,
  extracted: ExtractedJD,
  rawJd: string,
  repairHints: string[],
): string {
  const yearsOfExperience = yearsOfExperienceFromProfile(profile);
  const lines = [
    "Return JSON only.",
    "Summary length MUST be more than 90 words.",
    "The skill set MUST contain more than 40 distinct skill items across all groups.",
  ];
  if (yearsOfExperience) {
    lines.push(
      `The Summary MUST state ${yearsOfExperience} years of experience, calculated from the candidate's work periods. Do not invent a different number.`,
    );
  } else {
    lines.push(
      "Do not invent years of experience in the Summary. Only mention a year count if it is clearly supported by the listed work periods.",
    );
  }
  if (repairHints.length) {
    lines.push("Fix these issues from the previous attempt:");
    for (const hint of repairHints) {
      lines.push(`- ${hint}`);
    }
  }
  lines.push(
    JSON.stringify({
      candidate: profile,
      yearsOfExperience,
      workPeriods: profile.experiences.map((exp) => exp.period).filter(Boolean),
      extractedJd: extracted,
      rawJobDescription: rawJd.slice(0, 12000),
    }),
  );
  return lines.join("\n");
}

async function requestJson(
  client: OpenAI,
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
): Promise<string> {
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content?.trim()) {
    throw new Error("Empty response while generating tailored resume.");
  }
  return content;
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
    headline: "",
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
    let bullets = (generated?.bullets || [])
      .map(String)
      .map((b) => sanitizePlainText(b))
      .filter(Boolean);

    while (bullets.length < 7) {
      bullets.push(
        `Partnered with cross-functional stakeholders to deliver production-ready solutions involving ${extracted.hardTechnicalSkills.slice(0, 3).join(", ") || "core platform technologies"}, improving reliability and delivery speed for business-critical workflows.`,
      );
    }
    bullets = bullets.slice(0, 8);

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
        overview ||
        `${exp.company} team delivering software products in a ${exp.location.toLowerCase()} setting; served as ${exp.title} owning delivery of key features and technical outcomes aligned to business needs.`,
      bullets,
    };
  });

  return {
    headline: buildResumeHeadline(
      extracted,
      skillGroups,
      String(safe.headline || ""),
    ),
    summary: sanitizePlainText(String(safe.summary || "")),
    skills: skillGroups,
    experiences,
    education:
      Array.isArray(safe.education) && safe.education.length
        ? safe.education.map((edu, index) => ({
            id: profile.education[index]?.id || "",
            school: sanitizePlainText(edu.school),
            discipline: sanitizePlainText(edu.discipline),
            degree: sanitizePlainText(edu.degree),
            period: sanitizePlainText(edu.period),
          }))
        : profile.education,
    keywords: keywords.map((k) => sanitizePlainText(k)).filter(Boolean),
  };
}
