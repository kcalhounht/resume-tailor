import type { CandidateProfile } from "./types";
import { getLlmClient, getLlmModel, LLM_MAX_TOKENS } from "./llm";
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
6. No markdown. Plain text only.`;

export type ParsedResumeProfile = CandidateProfile & {
  skills: string[];
  summary: string;
};

export async function extractProfileFromResumeText(
  resumeText: string,
): Promise<ParsedResumeProfile> {
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
          resumeText: resumeText.slice(0, 40000),
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

  const personal = {
    name: String(parsed.personal?.name || "").trim(),
    phone: String(parsed.personal?.phone || "").trim(),
    linkedin: String(parsed.personal?.linkedin || "").trim(),
    email: String(parsed.personal?.email || "").trim(),
    location: String(parsed.personal?.location || "").trim(),
  };

  const experiences = Array.isArray(parsed.experiences)
    ? parsed.experiences
        .map((exp) => ({
          company: String(exp?.company || "").trim(),
          title: String(exp?.title || "").trim(),
          period: String(exp?.period || "").trim(),
          location: String(exp?.location || "").trim() || "Remote",
        }))
        .filter((exp) => exp.company && exp.title)
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

  if (!personal.name) {
    throw new Error(
      "Could not find a name on the uploaded resume. Check the PDF and try again.",
    );
  }
  if (!experiences.length) {
    throw new Error(
      "Could not find work experience on the uploaded resume. Check the PDF and try again.",
    );
  }

  // Fill required contact fields with placeholders if missing so packaging works
  if (!personal.email) personal.email = "candidate@example.com";
  if (!personal.phone) personal.phone = "N/A";
  if (!personal.linkedin) personal.linkedin = "linkedin.com";
  if (!personal.location) personal.location = "Remote";

  const skills = Array.isArray(parsed.skills)
    ? parsed.skills.map(String).map((s) => s.trim()).filter(Boolean)
    : [];

  return {
    personal,
    experiences,
    education: education.length
      ? education
      : structuredClone(EMPTY_PROFILE.education),
    skills,
    summary: String(parsed.summary || "").trim(),
  };
}
