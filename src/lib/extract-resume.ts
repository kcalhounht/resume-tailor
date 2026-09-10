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

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function looksLikeHeader(line: string) {
  return /^(work experience|professional experience|experience|education|academic background|academics|skills|projects|summary|profile|certifications|awards|objective)\b/i.test(
    line.trim(),
  );
}

function looksLikePeriod(line: string) {
  return /\b(19|20)\d{2}\b/.test(line) || /\bpresent\b/i.test(line);
}

function firstEmail(text: string) {
  return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
}

function firstPhone(text: string) {
  const match = text.match(
    /(?:\+\d{1,3}[\s.-]*)?(?:\(?\d{3}\)?[\s.-]*)\d{3}[\s.-]*\d{4}/,
  );
  return match?.[0]?.trim() ?? "";
}

function firstLinkedIn(text: string) {
  const match = text.match(
    /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9._%/-]+/i,
  );
  if (!match) return "";
  const value = match[0].replace(/[.,;]+$/, "");
  return value.startsWith("http") ? value : `https://${value}`;
}

function firstPortfolio(text: string) {
  const matches = text.match(/https?:\/\/[^\s)]+/gi) ?? [];
  const found = matches.find(
    (url) => !/linkedin\.com/i.test(url) && !/mailto:/i.test(url),
  );
  return found?.replace(/[.,;]+$/, "") ?? "";
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
    return {
      id: "",
      company: rest[0] ?? "",
      title: rest[1] ?? rest[0] ?? "",
      period,
      location,
    };
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
    return {
      id: "",
      school: rest[0] ?? "",
      discipline,
      degree,
      period,
    };
  });
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

async function extractProfileWithLlm(text: string): Promise<CandidateProfile> {
  const client = await getLlmClient();
  const completion = await client.chat.completions.create({
    model: await getLlmModel(),
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You extract a candidate profile from resume text.
Return ONLY valid JSON (no markdown) with keys:
- personal: { name, phone, linkedin, portfolio, email, location }
- experiences: array of { company, title, period, location }
- education: array of { school, discipline, degree, period }

Rules:
- Copy facts from the resume. Do not invent employers, schools, dates, or contact details.
- Use empty strings when a field is missing.
- Keep experience newest first.
- period should stay close to the resume wording (example: "Jan 2020 – Present").
- location is the job or school city/remote line, not the company description.
- discipline is the field of study (example: "Computer Science").
- Ignore skills, summaries, and bullet accomplishments except to understand titles.
Escape quotes inside strings.`,
      },
      {
        role: "user",
        content: `Resume text:\n${text.slice(0, 20000)}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response while reading the resume.");
  }

  const parsed = parseModelJson<RawResume>(content);
  const profile = parseProfileDraft({
    personal: {
      name: asString(parsed.personal?.name),
      phone: asString(parsed.personal?.phone),
      linkedin: asString(parsed.personal?.linkedin),
      portfolio: asString(parsed.personal?.portfolio),
      email: asString(parsed.personal?.email),
      location: asString(parsed.personal?.location),
    },
    experiences: Array.isArray(parsed.experiences) ? parsed.experiences : [],
    education: Array.isArray(parsed.education) ? parsed.education : [],
  });
  if (!profile) {
    throw new Error("Could not read a profile from that resume.");
  }
  return profile;
}

export async function extractProfileFromResume(
  text: string,
): Promise<{ profile: CandidateProfile; source: "llm" | "text" }> {
  const fallback = extractProfileFromResumeText(text);
  if (await getLlmApiKey()) {
    try {
      const profile = await extractProfileWithLlm(text);
      const hasIdentity = profile.personal.name.length >= 2;
      const hasWork = profile.experiences.some(
        (exp) => exp.company.trim() || exp.title.trim(),
      );
      if (hasIdentity || hasWork) {
        return { profile, source: "llm" };
      }
    } catch {
      // Use the local parse when the model is unavailable or returns junk.
    }
  }
  return { profile: fallback, source: "text" };
}
