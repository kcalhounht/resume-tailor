import type { ExtractedJD, JobType, WorkMode } from "./types";
import { getLlmClient, getLlmModel } from "./llm";
import { parseModelJson } from "./parse-json";

const JOB_TYPES: JobType[] = [
  "AI Engineer",
  "Data Engineer",
  "Software Engineer",
  "Data Analyst",
  "Data Scientist",
];

function normalizeType(value: string): JobType {
  const match = JOB_TYPES.find(
    (t) => t.toLowerCase() === value.toLowerCase().trim(),
  );
  if (match) return match;

  const lower = value.toLowerCase();
  if (lower.includes("ai") || lower.includes("ml") || lower.includes("llm")) {
    return "AI Engineer";
  }
  if (lower.includes("data engineer") || lower.includes("etl")) {
    return "Data Engineer";
  }
  if (lower.includes("analyst")) return "Data Analyst";
  if (lower.includes("scientist")) return "Data Scientist";
  return "Software Engineer";
}

function normalizeWorkMode(value: string): WorkMode {
  const lower = value.toLowerCase();
  if (lower.includes("remote")) return "Remote";
  if (lower.includes("hybrid")) return "Hybrid";
  return "Onsite";
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function uniqueList(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const item of list) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

export async function extractJobDescription(
  rawJd: string,
  pageTitle: string,
  jobUrl: string,
): Promise<ExtractedJD> {
  const client = getLlmClient();

  const completion = await client.chat.completions.create({
    model: getLlmModel(),
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You extract structured hiring information from job postings.
Return ONLY valid JSON (no markdown) with keys:
- company (string)
- jobTitle (string)
- summary (2-4 sentence overview of the role and responsibilities)
- type (exactly one of: "AI Engineer", "Data Engineer", "Software Engineer", "Data Analyst", "Data Scientist")
- salaryExpectation (string salary/compensation range; use "Not specified" if unknown)
- workMode (exactly one of: "Remote", "Hybrid", "Onsite")
- hardTechnicalSkills (string array of concrete required technologies/tools)
- softSkills (string array)
- mustHave (string array: mandatory requirements — skills, experience, certifications labeled as required/must have)
- niceToHave (string array: preferred / bonus / nice-to-have items)
- qualifications (string array: degrees, certifications, licenses, formal qualifications)
- responsibilities (string array: key duties / what you will do)
- requiredSkills (string array: all required skills mentioned, technical + domain)
- yearsOfExperience (string; e.g. "5+ years" or "Not specified")
- educationRequirements (string; e.g. "Bachelor's in CS or equivalent" or "Not specified")
- benefits (string array; empty if none listed)
- locationRequirement (string; city/country/relocation notes, or "Not specified")

Be thorough: pull requirements from sections like Requirements, Qualifications, Must Have, Nice to Have, Preferred, Responsibilities, Benefits, and Compensation.
Infer company from the page title or URL when missing. Prefer specific skill names.
Use empty arrays when a section is absent. Escape quotes inside strings.`,
      },
      {
        role: "user",
        content: `Job URL: ${jobUrl}
Page title: ${pageTitle}

Job posting text:
${rawJd.slice(0, 20000)}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response while extracting job description.");
  }

  const parsed = parseModelJson<Record<string, unknown>>(content);

  const mustHave = asStringList(parsed.mustHave);
  const niceToHave = asStringList(parsed.niceToHave);
  const qualifications = asStringList(parsed.qualifications);
  const responsibilities = asStringList(parsed.responsibilities);
  const requiredSkills = asStringList(parsed.requiredSkills);
  const hardTechnicalSkills = asStringList(parsed.hardTechnicalSkills);
  const softSkills = asStringList(parsed.softSkills);

  return {
    company: String(parsed.company || "Unknown Company").trim(),
    jobTitle: String(parsed.jobTitle || "Software Engineer").trim(),
    summary: String(parsed.summary || "").trim(),
    type: normalizeType(String(parsed.type || "Software Engineer")),
    salaryExpectation: String(
      parsed.salaryExpectation || "Not specified",
    ).trim(),
    workMode: normalizeWorkMode(String(parsed.workMode || "Onsite")),
    hardTechnicalSkills: uniqueList(hardTechnicalSkills, requiredSkills),
    softSkills,
    mustHave: uniqueList(mustHave),
    niceToHave: uniqueList(niceToHave),
    qualifications: uniqueList(qualifications),
    responsibilities: uniqueList(responsibilities),
    requiredSkills: uniqueList(requiredSkills, hardTechnicalSkills),
    yearsOfExperience: String(
      parsed.yearsOfExperience || "Not specified",
    ).trim(),
    educationRequirements: String(
      parsed.educationRequirements || "Not specified",
    ).trim(),
    benefits: asStringList(parsed.benefits),
    locationRequirement: String(
      parsed.locationRequirement || "Not specified",
    ).trim(),
  };
}
