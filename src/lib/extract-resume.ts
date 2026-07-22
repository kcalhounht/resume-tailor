import type { CandidateProfile } from "./types";
import {
  formatOpenRouterError,
  getLlmClient,
  getLlmModel,
  LLM_MAX_TOKENS,
} from "./llm";
import { parseModelJson } from "./parse-json";
import { EMPTY_PROFILE } from "./profile";

const SYSTEM_PROMPT = `You extract structured candidate profile data from a raw resume text.

Return ONLY valid JSON with this shape:
{
  "personal": {
    "name": string,
    "phone": string,
    "linkedin": string,
    "email": string,
    "location": string
  },
  "experiences": [
    { "company": string, "title": string, "period": string, "location": string }
  ],
  "education": [
    {
      "school": string,
      "degree": string,
      "discipline": string,
      "period": string,
      "location": string
    }
  ],
  "skills": string[],
  "summary": string
}

Rules:
1. Use only facts present in the resume. Do not invent employers or schools.
2. If a field is missing, use "" (empty string) or [] as appropriate.
3. Keep company names, dates/periods, and school names faithful to the source.
4. Prefer 1-8 experiences, most recent first.
5. LinkedIn may be a full URL or handle; keep as found when possible.
6. personal.name must be the candidate's real full name from the header (never "Candidate").
7. personal.email / phone / location must be exact contact fields — never mix in job titles.
8. No markdown. Plain text only. Keep the JSON compact.`;

export type ParsedResumeProfile = CandidateProfile & {
  skills: string[];
  summary: string;
};

function isPlaceholderCompany(company: string): boolean {
  return /^(company|previous employer|employer|unknown)$/i.test(company.trim());
}

function isPlaceholderName(name: string): boolean {
  return !name.trim() || /^(candidate|name|your name)$/i.test(name.trim());
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] || "";
  const parts = local
    .replace(/[0-9._-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((p) => p.length >= 2);
  if (parts.length < 2) return "";
  return parts
    .slice(0, 3)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

function normalizeParsed(parsed: {
  personal?: Partial<CandidateProfile["personal"]>;
  experiences?: CandidateProfile["experiences"];
  education?: CandidateProfile["education"];
  skills?: unknown;
  summary?: unknown;
}): ParsedResumeProfile {
  const personal = {
    name: String(parsed.personal?.name || "").trim(),
    phone: String(parsed.personal?.phone || "").trim(),
    linkedin: String(parsed.personal?.linkedin || "").trim(),
    email: String(parsed.personal?.email || "").trim(),
    location: String(parsed.personal?.location || "").trim(),
  };

  if (isPlaceholderName(personal.name) && personal.email) {
    personal.name = nameFromEmail(personal.email) || personal.name;
  }

  const experiences = Array.isArray(parsed.experiences)
    ? parsed.experiences
        .map((exp) => ({
          company: String(exp?.company || "").trim(),
          title: String(exp?.title || "").trim(),
          period: String(exp?.period || "").trim(),
          location: String(exp?.location || "").trim() || "Remote",
        }))
        .filter(
          (exp) =>
            exp.company &&
            exp.title &&
            !isPlaceholderCompany(exp.company) &&
            !/^(title|role|position)$/i.test(exp.title),
        )
    : [];

  // Keep weaker rows only if we have nothing better
  const looseExperiences =
    experiences.length > 0
      ? experiences
      : Array.isArray(parsed.experiences)
        ? parsed.experiences
            .map((exp) => ({
              company: String(exp?.company || "").trim(),
              title: String(exp?.title || "").trim(),
              period: String(exp?.period || "").trim(),
              location: String(exp?.location || "").trim() || "Remote",
            }))
            .filter(
              (exp) =>
                exp.company &&
                exp.title &&
                !isPlaceholderCompany(exp.company),
            )
        : [];

  const education = Array.isArray(parsed.education)
    ? parsed.education
        .map((edu) => ({
          school: String(edu?.school || "").trim(),
          degree: String(edu?.degree || "").trim(),
          discipline: String(edu?.discipline || "").trim(),
          period: String(edu?.period || "").trim(),
          location: String(edu?.location || "").trim() || "Remote",
        }))
        .filter((edu) => edu.school)
    : [];

  if (isPlaceholderName(personal.name)) {
    throw new Error(
      "Could not find a name on the uploaded resume. Check the PDF and try again.",
    );
  }
  if (!looseExperiences.length) {
    throw new Error(
      "Could not find work experience on the uploaded resume. Check the PDF and try again.",
    );
  }

  if (!personal.email) personal.email = "candidate@example.com";
  if (!personal.phone) personal.phone = "N/A";
  if (!personal.linkedin) personal.linkedin = "linkedin.com";
  if (!personal.location) personal.location = "Remote";

  const skills = Array.isArray(parsed.skills)
    ? Array.from(
        new Set(
          parsed.skills
            .map(String)
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      )
    : [];

  return {
    personal,
    experiences: looseExperiences,
    education: education.length
      ? education
      : structuredClone(EMPTY_PROFILE.education),
    skills,
    summary: String(parsed.summary || "").trim(),
  };
}

/** Cheap local parse when OpenRouter credits are too low for LLM extract. */
export function extractProfileFromResumeTextHeuristic(
  resumeText: string,
): ParsedResumeProfile {
  const text = String(resumeText || "").replace(/\r/g, "\n");
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const emailMatch = text.match(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  );
  const phoneMatch = text.match(
    /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3}[\s.-]?\d{2,4}[\s.-]?\d{2,4}/,
  );
  const linkedinMatch = text.match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+\/?/i,
  );

  const nameCandidate = lines.find(
    (l) =>
      l.length >= 3 &&
      l.length <= 70 &&
      !/@/.test(l) &&
      !/\d{3}/.test(l) &&
      !/linkedin|experience|education|skills|summary|phone|email|http/i.test(
        l,
      ) &&
      /^[\p{L}][\p{L}\s.'’-]+$/u.test(l) &&
      l.split(/\s+/).length >= 2 &&
      l.split(/\s+/).length <= 5,
  );

  const email = emailMatch?.[0] || "";
  const name =
    nameCandidate ||
    nameFromEmail(email) ||
    lines.find(
      (l) =>
        l.length >= 3 &&
        l.length <= 50 &&
        !/@/.test(l) &&
        /^[\p{L}][\p{L}\s.'’-]+$/u.test(l),
    ) ||
    "";

  const locationLine =
    lines.find((l) =>
      /\b(remote|warsaw|krakow|kraków|poland|germany|berlin|london|new york|usa|uk|mexico|méxico|zumpango|cdmx|ciudad de méxico|guadalajara|monterrey)\b/i.test(
        l,
      ),
    ) || "";

  const experiences: CandidateProfile["experiences"] = [];
  const periodRe =
    /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4})\s*[-–—to]+\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}|\d{4}|Present|Now|Current)/i;

  for (let i = 0; i < lines.length && experiences.length < 6; i++) {
    const line = lines[i];
    const period = line.match(periodRe);
    if (!period) continue;

    const nearby = [lines[i - 1], lines[i - 2], lines[i + 1], line]
      .filter(Boolean)
      .join(" | ");

    let titleGuess = "";
    let companyGuess = "";

    // Common patterns: "Title — Company" or Company on prior line, title above period
    const titled = (lines[i - 1] || "").match(
      /^(.{3,60}?)\s+[|–—-]\s+(.{2,60})$/,
    );
    if (titled) {
      titleGuess = titled[1].trim();
      companyGuess = titled[2].trim();
    } else {
      titleGuess =
        lines[i - 1] && !periodRe.test(lines[i - 1]) ? lines[i - 1] : "";
      companyGuess =
        lines[i - 2] && lines[i - 2] !== titleGuess
          ? lines[i - 2]
          : lines[i + 1] && !periodRe.test(lines[i + 1])
            ? lines[i + 1]
            : "";
    }

    if (
      !companyGuess ||
      isPlaceholderCompany(companyGuess) ||
      /^(engineer|software engineer)$/i.test(companyGuess)
    ) {
      continue;
    }
    if (!titleGuess) titleGuess = "Software Engineer";

    experiences.push({
      company: companyGuess.slice(0, 80),
      title: titleGuess.slice(0, 80),
      period: period[0].replace(/\s+/g, " ").trim(),
      location: /remote/i.test(nearby)
        ? "Remote"
        : locationLine.slice(0, 60) || "Remote",
    });
  }

  return normalizeParsed({
    personal: {
      name,
      email,
      phone: phoneMatch?.[0] || "",
      linkedin: linkedinMatch?.[0] || "",
      location: locationLine.slice(0, 80),
    },
    experiences,
    education: [],
    skills: [],
    summary: "",
  });
}

export async function extractProfileFromResumeText(
  resumeText: string,
): Promise<ParsedResumeProfile> {
  const sliced = resumeText.slice(0, 14_000);

  try {
    const client = getLlmClient();
    const model = getLlmModel();

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.1,
      max_tokens: LLM_MAX_TOKENS.extractResume,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({
            resumeText: sliced,
            task: "Extract ONLY the candidate profile fields. Do not write a tailored resume.",
          }),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content?.trim()) {
      throw new Error("Failed to parse uploaded resume.");
    }

    const parsed = parseModelJson<{
      personal?: Partial<CandidateProfile["personal"]>;
      experiences?: CandidateProfile["experiences"];
      education?: CandidateProfile["education"];
      skills?: unknown;
      summary?: unknown;
    }>(content);

    // If the model wrongly returned a tailored resume shape, reject and use heuristic.
    const asAny = parsed as Record<string, unknown>;
    if (asAny.resume && typeof asAny.resume === "object" && !parsed.personal) {
      throw new Error("Model returned tailored resume instead of profile.");
    }

    return normalizeParsed(parsed);
  } catch (err) {
    console.warn(
      "Resume LLM extract failed; using local heuristic:",
      formatOpenRouterError(err),
    );
    try {
      return extractProfileFromResumeTextHeuristic(resumeText);
    } catch (fallbackErr) {
      throw fallbackErr instanceof Error
        ? fallbackErr
        : new Error("Failed to parse uploaded resume.");
    }
  }
}
