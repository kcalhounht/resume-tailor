import type { CandidateProfile, EducationInput, ExperienceInput } from "./types";
import { getLlmApiKey, getLlmClient, getLlmModel } from "./llm";
import { parseModelJson } from "./parse-json";
import { emptyProfile, parseProfileDraft } from "./profile";

type RawResume = {
  personal?: {
    name?: unknown;
    phone?: unknown;
    linkedin?: unknown;
    portfolio?: unknown;
    email?: unknown;
    location?: unknown;
  };
  experiences?: unknown;
  education?: unknown;
};

const SYSTEM_PROMPT = `You extract a candidate profile from resume text, including messy PDF text where columns or line breaks may be wrong.
Return ONLY valid JSON (no markdown) with this exact shape:
{
  "personal": {
    "name": "",
    "phone": "",
    "linkedin": "",
    "portfolio": "",
    "email": "",
    "location": ""
  },
  "experiences": [
    { "company": "", "title": "", "period": "", "location": "" }
  ],
  "education": [
    { "school": "", "discipline": "", "degree": "", "period": "" }
  ]
}

Rules:
- Copy facts from the resume. Do not invent employers, schools, dates, or contact details.
- Use empty strings when a field is missing. Omit jobs or schools that are not actually on the resume.
- Keep experience newest first. Include every distinct role, even multiple roles at the same company.
- company is the employer name only. title is the job title only. Never put both in one field.
- period should stay close to the resume wording (example: "Jan 2020 – Present").
- location is the job or school city/remote line, not a company description or bullet.
- personal.location is the candidate's city/region, not a job location.
- If a personal or job location is not stated, use "Remote".
- discipline is the field of study (example: "Computer Science"). degree is the credential (example: "B.S." or "Bachelor of Science").
- If a line is "B.S. in Computer Science", degree is "B.S." and discipline is "Computer Science".
- linkedin should be a full URL when possible (https://linkedin.com/in/...).
- portfolio is a personal site or GitHub, never the LinkedIn URL.
- Ignore skills, summaries, and bullet accomplishments except to understand titles.
Escape quotes inside strings.`;

function asString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value).trim();
  return "";
}

function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function looksLikeHeader(line: string) {
  return /^(work experience|professional experience|experience|education|academic background|academics|skills|projects|summary|profile|certifications|awards|objective)\b/i.test(
    line.trim(),
  );
}

function looksLikePeriod(line: string) {
  return /\b(19|20)\d{2}\b/.test(line) || /\bpresent\b/i.test(line);
}

export function firstEmail(text: string) {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
}

export function firstPhone(text: string) {
  const match = text.match(
    /(?:\+\d{1,3}[\s.-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}/,
  );
  return match?.[0]?.trim() ?? "";
}

export function normalizeLinkedIn(value: string) {
  const match = value.match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9._%/-]+/i,
  );
  if (!match) return "";
  const trimmed = match[0].replace(/[.,;]+$/, "");
  return trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
}

export function firstLinkedIn(text: string, links: string[] = []) {
  for (const link of links) {
    const normalized = normalizeLinkedIn(link);
    if (normalized) return normalized;
  }
  return normalizeLinkedIn(text);
}

export function firstPortfolio(text: string, links: string[] = []) {
  const urls = [
    ...links,
    ...(text.match(/https?:\/\/[^\s)]+/gi) ?? []),
  ];
  const found = urls.find((url) => {
    const clean = url.replace(/[.,;]+$/, "");
    return (
      !/linkedin\.com/i.test(clean) &&
      !/mailto:/i.test(clean) &&
      !/openrouter\.ai/i.test(clean)
    );
  });
  return found?.replace(/[.,;]+$/, "") ?? "";
}

function firstLocation(text: string) {
  const match = text.match(
    /\b([A-Z][A-Za-z .'-]+,\s*(?:[A-Z]{2}|[A-Z][A-Za-z]+))\b/,
  );
  return match?.[1]?.trim() ?? "";
}

function splitSections(text: string) {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const sections: { name: string; lines: string[] }[] = [
    { name: "header", lines: [] },
  ];
  for (const line of lines) {
    if (!line) continue;
    if (looksLikeHeader(line)) {
      sections.push({ name: line.toLowerCase(), lines: [] });
      continue;
    }
    sections[sections.length - 1].lines.push(line);
  }
  return sections;
}

function sectionLines(sections: { name: string; lines: string[] }[], needle: string) {
  const found = sections.find((section) => section.name.includes(needle));
  return found?.lines ?? [];
}

function chunkByPeriod(lines: string[]): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    current.push(line);
    if (!looksLikePeriod(line)) continue;
    const next = lines[i + 1];
    if (
      next &&
      !looksLikePeriod(next) &&
      (/remote|hybrid|onsite|,/i.test(next) || next.split(/\s+/).length <= 6)
    ) {
      current.push(next);
      i += 1;
    }
    chunks.push(current);
    current = [];
  }
  if (current.length >= 2) chunks.push(current);
  return chunks.filter((chunk) => chunk.length >= 2);
}

function experiencesFromLines(lines: string[]): ExperienceInput[] {
  return chunkByPeriod(lines).map((chunk) => {
    const periodIndex = chunk.findIndex(looksLikePeriod);
    const period = periodIndex >= 0 ? chunk[periodIndex] : "";
    const before = chunk.filter((_, i) => i !== periodIndex);
    const location =
      before.find((line) => /remote|hybrid|onsite|,/.test(line.toLowerCase())) ??
      "";
    const rest = before.filter((line) => line !== location);
    return normalizeExperience({
      id: "",
      company: rest[0] ?? "",
      title: rest[1] ?? rest[0] ?? "",
      period,
      location,
    });
  });
}

function educationFromLines(lines: string[]): EducationInput[] {
  return chunkByPeriod(lines).map((chunk) => {
    const periodIndex = chunk.findIndex(looksLikePeriod);
    const period = periodIndex >= 0 ? chunk[periodIndex] : "";
    const rest = chunk.filter((_, i) => i !== periodIndex);
    const degree =
      rest.find((line) =>
        /\b(b\.?s\.?|m\.?s\.?|ph\.?d\.?|bachelor|master|associate|diploma|degree)\b/i.test(
          line,
        ),
      ) ?? rest[2] ?? "";
    const discipline =
      rest.find(
        (line) =>
          line !== rest[0] &&
          line !== degree &&
          !looksLikePeriod(line),
      ) ?? "";
    return normalizeEducation({
      id: "",
      school: rest[0] ?? "",
      discipline,
      degree,
      period,
    });
  });
}

function looksLikeJobTitle(value: string) {
  return /\b(engineer|developer|manager|analyst|scientist|designer|director|intern|consultant|lead|specialist|officer|architect|coordinator|administrator|founder|president|head)\b/i.test(
    value,
  );
}

export function normalizeExperience(exp: ExperienceInput): ExperienceInput {
  let company = asString(exp.company);
  let title = asString(exp.title);
  if (
    company &&
    title &&
    looksLikeJobTitle(company) &&
    !looksLikeJobTitle(title)
  ) {
    [company, title] = [title, company];
  }
  const combined = [company, title].filter(Boolean).join(" ");
  const atMatch = combined.match(/^(.*?)\s+(?:at|@|[-–—|])\s+(.*)$/i);
  if ((!company || !title) && atMatch) {
    title = asString(atMatch[1]);
    company = asString(atMatch[2]);
  }
  return {
    id: exp.id,
    company,
    title,
    period: asString(exp.period).replace(/\s*[-–—]\s*/g, " – "),
    location: asString(exp.location),
  };
}

export function normalizeEducation(edu: EducationInput): EducationInput {
  let school = asString(edu.school);
  let discipline = asString(edu.discipline);
  let degree = asString(edu.degree);
  const inMatch = degree.match(/^(.+?)\s+in\s+(.+)$/i);
  if (inMatch) {
    degree = asString(inMatch[1]);
    discipline = discipline || asString(inMatch[2]);
  }
  if (!degree && /\b(b\.?s\.?|m\.?s\.?|ph\.?d\.?|bachelor|master|associate|diploma)\b/i.test(school)) {
    degree = school;
    school = discipline;
    discipline = "";
  }
  return {
    id: edu.id,
    school,
    discipline,
    degree,
    period: asString(edu.period).replace(/\s*[-–—]\s*/g, " – "),
  };
}

export function extractProfileFromResumeText(text: string): CandidateProfile {
  const sections = splitSections(text);
  const header = sectionLines(sections, "header");
  const headerText = [header.join("\n"), text].join("\n");
  const name =
    header.find(
      (line) =>
        line.split(/\s+/).length >= 2 &&
        line.split(/\s+/).length <= 5 &&
        !/@/.test(line) &&
        !/https?:/i.test(line) &&
        !looksLikePeriod(line),
    ) ?? "";
  const locationLine =
    header.find((line) => /,\s*[A-Z]{2}\b/.test(line.split("|")[0] ?? "")) ?? "";
  const location = (locationLine.split("|")[0] ?? "").trim();

  const draft = {
    personal: {
      name,
      email: firstEmail(headerText),
      phone: firstPhone(headerText),
      linkedin: firstLinkedIn(headerText),
      portfolio: firstPortfolio(headerText),
      location,
    },
    experiences: experiencesFromLines(sectionLines(sections, "experience")),
    education: educationFromLines(sectionLines(sections, "education")),
  };

  return parseProfileDraft(draft) ?? emptyProfile();
}

function profileFromRaw(parsed: RawResume): CandidateProfile | null {
  return parseProfileDraft({
    personal: {
      name: asString(parsed.personal?.name),
      phone: asString(parsed.personal?.phone),
      linkedin: normalizeLinkedIn(asString(parsed.personal?.linkedin)) ||
        asString(parsed.personal?.linkedin),
      portfolio: asString(parsed.personal?.portfolio),
      email: asString(parsed.personal?.email),
      location: asString(parsed.personal?.location),
    },
    experiences: asList(parsed.experiences).map((item) => {
      if (!item || typeof item !== "object") return {};
      const row = item as Record<string, unknown>;
      return normalizeExperience({
        id: "",
        company: asString(row.company),
        title: asString(row.title),
        period: asString(row.period),
        location: asString(row.location),
      });
    }),
    education: asList(parsed.education).map((item) => {
      if (!item || typeof item !== "object") return {};
      const row = item as Record<string, unknown>;
      return normalizeEducation({
        id: "",
        school: asString(row.school),
        discipline: asString(row.discipline),
        degree: asString(row.degree),
        period: asString(row.period),
      });
    }),
  });
}

function usefulProfile(profile: CandidateProfile) {
  const hasIdentity = profile.personal.name.length >= 2;
  const hasWork = profile.experiences.some(
    (exp) => exp.company.trim() && exp.title.trim(),
  );
  const hasSchool = profile.education.some(
    (edu) => edu.school.trim() && (edu.degree.trim() || edu.discipline.trim()),
  );
  return hasIdentity || hasWork || hasSchool;
}

export function mergeResumeHints(
  profile: CandidateProfile,
  fallback: CandidateProfile,
  text: string,
  links: string[] = [],
): CandidateProfile {
  const personal = {
    name: profile.personal.name || fallback.personal.name,
    phone: profile.personal.phone || fallback.personal.phone || firstPhone(text),
    linkedin:
      normalizeLinkedIn(profile.personal.linkedin) ||
      fallback.personal.linkedin ||
      firstLinkedIn(text, links),
    portfolio:
      profile.personal.portfolio ||
      fallback.personal.portfolio ||
      firstPortfolio(text, links),
    email: profile.personal.email || fallback.personal.email || firstEmail(text),
    location:
      profile.personal.location ||
      fallback.personal.location ||
      firstLocation(text),
  };

  const experiences = profile.experiences.filter(
    (exp) => exp.company.trim() || exp.title.trim(),
  );
  const education = profile.education.filter(
    (edu) => edu.school.trim() || edu.degree.trim() || edu.discipline.trim(),
  );
  const fallbackWork = fallback.experiences.filter(
    (exp) => exp.company.trim() || exp.title.trim(),
  );
  const fallbackSchool = fallback.education.filter(
    (edu) => edu.school.trim() || edu.degree.trim() || edu.discipline.trim(),
  );

  return parseProfileDraft({
    personal,
    experiences: experiences.length ? experiences : fallbackWork,
    education: education.length ? education : fallbackSchool,
  }) ?? emptyProfile();
}

export function applyRemoteLocations(profile: CandidateProfile): CandidateProfile {
  return {
    ...profile,
    personal: {
      ...profile.personal,
      location: profile.personal.location.trim() || "Remote",
    },
    experiences: profile.experiences.map((exp) => ({
      ...exp,
      location: exp.location.trim() || "Remote",
    })),
  };
}

function resumeUserContent(text: string, links: string[]) {
  const linkBlock = links.length
    ? `PDF hyperlinks:\n${links.map((link) => `- ${link}`).join("\n")}\n\n`
    : "";
  return `${linkBlock}Resume text:\n${text.slice(0, 24000)}`;
}

async function completeJson(
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  useJsonObject: boolean,
) {
  const client = await getLlmClient();
  const completion = await client.chat.completions.create({
    model,
    temperature: 0,
    max_tokens: 4000,
    ...(useJsonObject ? { response_format: { type: "json_object" as const } } : {}),
    messages,
  });
  const content = completion.choices[0]?.message?.content;
  if (!content?.trim()) {
    throw new Error("Empty response while reading the resume.");
  }
  return content;
}

async function extractProfileWithLlm(
  text: string,
  links: string[],
): Promise<CandidateProfile> {
  const model = await getLlmModel();
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: resumeUserContent(text, links) },
  ];

  let content: string;
  try {
    content = await completeJson(model, messages, true);
  } catch {
    content = await completeJson(model, messages, false);
  }

  let parsed: RawResume;
  try {
    parsed = parseModelJson<RawResume>(content);
  } catch (firstError) {
    const repaired = await completeJson(
      model,
      [
        ...messages,
        { role: "assistant", content },
        {
          role: "user",
          content:
            "Your previous reply was invalid JSON. Return ONLY repaired valid JSON for the same resume. No markdown, no commentary.",
        },
      ],
      true,
    );
    try {
      parsed = parseModelJson<RawResume>(repaired);
    } catch {
      throw firstError instanceof Error
        ? firstError
        : new Error("Could not read a profile from that resume.");
    }
  }

  const profile = profileFromRaw(parsed);
  if (!profile) {
    throw new Error("Could not read a profile from that resume.");
  }
  return profile;
}

export async function extractProfileFromResume(
  text: string,
  links: string[] = [],
  onProgress?: (message: string) => void,
): Promise<{ profile: CandidateProfile; source: "llm" | "text" }> {
  const fallback = extractProfileFromResumeText(text);
  if (!(await getLlmApiKey())) {
    onProgress?.("Parsing resume text…");
    return {
      profile: applyRemoteLocations(mergeResumeHints(fallback, fallback, text, links)),
      source: "text",
    };
  }

  try {
    onProgress?.("Extracting with OpenRouter…");
    const llmProfile = await extractProfileWithLlm(text, links);
    const profile = applyRemoteLocations(
      mergeResumeHints(llmProfile, fallback, text, links),
    );
    if (usefulProfile(profile)) {
      return { profile, source: "llm" };
    }
    throw new Error("OpenRouter did not find profile fields in that resume.");
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not read that resume.";
    if (usefulProfile(fallback)) {
      return {
        profile: applyRemoteLocations(
          mergeResumeHints(fallback, fallback, text, links),
        ),
        source: "text",
      };
    }
    throw new Error(
      /openrouter|api key|json|empty response|profile/i.test(message)
        ? message
        : `OpenRouter could not read that resume. ${message}`,
    );
  }
}
