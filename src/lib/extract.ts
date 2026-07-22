import type { ExtractedJD, JobType, WorkMode } from "./types";
import { getLlmClient, getLlmModel, LLM_MAX_TOKENS } from "./llm";
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

function fieldMatch(text: string, labels: string[]): string {
  for (const label of labels) {
    const re = new RegExp(
      `(?:^|\\n)\\s*${label}\\s*[:\\-]\\s*(.+)`,
      "i",
    );
    const m = text.match(re);
    if (m?.[1]?.trim()) return m[1].trim().split(/\n/)[0].trim();
  }
  return "";
}

function extractSkillsHeuristic(text: string): string[] {
  const known = [
    "Python",
    "JavaScript",
    "TypeScript",
    "Java",
    "Go",
    "Rust",
    "C#",
    "C\\+\\+",
    "React",
    "Node\\.js",
    "Node",
    "Next\\.js",
    "AWS",
    "GCP",
    "Azure",
    "Docker",
    "Kubernetes",
    "SQL",
    "PostgreSQL",
    "MongoDB",
    "Redis",
    "Kafka",
    "Spark",
    "TensorFlow",
    "PyTorch",
    "LLM",
    "GraphQL",
    "REST",
    "CI/CD",
    "Terraform",
  ];
  const found: string[] = [];
  for (const skill of known) {
    const re = new RegExp(`\\b${skill}\\b`, "i");
    if (re.test(text)) {
      found.push(skill.replace(/\\/g, ""));
    }
  }
  return found;
}

/** Local fallback when OpenRouter returns an empty extract response. */
export function extractJobDescriptionHeuristic(
  rawJd: string,
  pageTitle: string,
  jobUrl: string,
): ExtractedJD {
  const text = String(rawJd || "").trim();
  const flat = text.replace(/\s+/g, " ").trim();

  let company =
    fieldMatch(text, ["Company", "Employer", "Organization", "Org"]) ||
    flat.match(/\bAbout the (?:job|role)\s+At\s+([A-Z][A-Za-z0-9&.'’\-]{1,60})/i)?.[1] ||
    flat.match(/\bAt\s+([A-Z][A-Za-z0-9&.'’\-]{1,60})\b/)?.[1] ||
    "";

  if (!company && jobUrl && !jobUrl.startsWith("manual://")) {
    try {
      const host = new URL(jobUrl).hostname.replace(/^www\./, "");
      company = host.split(".")[0] || "";
      if (company) {
        company = company.charAt(0).toUpperCase() + company.slice(1);
      }
    } catch {
      // ignore
    }
  }
  if (!company) company = "Unknown Company";

  const jobTitle =
    fieldMatch(text, [
      "Job Title",
      "Title",
      "Position",
      "Role",
      "Job role",
    ]) ||
    flat.match(
      /\b((?:Senior|Junior|Staff|Principal|Lead)?\s*(?:Software|Full[-\s]?Stack|Backend|Frontend|Data|AI|ML|DevOps|Solutions)?\s*(?:Engineer|Developer|Scientist|Analyst|Architect|Manager)(?:\s+[IVX0-9]+)?)\b/i,
    )?.[1] ||
    pageTitle.replace(/^Pasted JD\s+\d+$/i, "").trim() ||
    "Software Engineer";

  const location =
    fieldMatch(text, ["Location", "Work location", "Based in"]) ||
    "Not specified";
  const workMode = normalizeWorkMode(
    fieldMatch(text, ["Work mode", "Work arrangement", "Job Type"]) ||
      location ||
      flat,
  );

  const skills = extractSkillsHeuristic(text);
  const summary =
    flat.slice(0, 420) ||
    `${jobTitle} role at ${company}.`;

  return {
    company: company.trim(),
    jobTitle: jobTitle.trim(),
    summary,
    type: normalizeType(jobTitle),
    salaryExpectation:
      fieldMatch(text, ["Salary", "Compensation", "Pay"]) || "Not specified",
    workMode,
    hardTechnicalSkills: skills,
    softSkills: [],
    mustHave: skills.slice(0, 8),
    niceToHave: [],
    qualifications: [],
    responsibilities: [],
    requiredSkills: skills,
    yearsOfExperience:
      flat.match(/\b(\d+\+?\s*years?(?:\s+of\s+experience)?)\b/i)?.[1] ||
      "Not specified",
    educationRequirements:
      fieldMatch(text, ["Education", "Degree"]) || "Not specified",
    benefits: [],
    locationRequirement: location,
  };
}

function normalizeExtracted(
  parsed: Record<string, unknown>,
  fallback: ExtractedJD,
): ExtractedJD {
  const mustHave = asStringList(parsed.mustHave);
  const niceToHave = asStringList(parsed.niceToHave);
  const qualifications = asStringList(parsed.qualifications);
  const responsibilities = asStringList(parsed.responsibilities);
  const requiredSkills = asStringList(parsed.requiredSkills);
  const hardTechnicalSkills = asStringList(parsed.hardTechnicalSkills);
  const softSkills = asStringList(parsed.softSkills);

  return {
    company:
      String(parsed.company || fallback.company || "Unknown Company").trim() ||
      fallback.company,
    jobTitle:
      String(parsed.jobTitle || fallback.jobTitle || "Software Engineer").trim() ||
      fallback.jobTitle,
    summary: String(parsed.summary || fallback.summary || "").trim(),
    type: normalizeType(
      String(parsed.type || fallback.type || "Software Engineer"),
    ),
    salaryExpectation: String(
      parsed.salaryExpectation || fallback.salaryExpectation || "Not specified",
    ).trim(),
    workMode: normalizeWorkMode(
      String(parsed.workMode || fallback.workMode || "Onsite"),
    ),
    hardTechnicalSkills: uniqueList(
      hardTechnicalSkills,
      requiredSkills,
      fallback.hardTechnicalSkills,
    ),
    softSkills: uniqueList(softSkills, fallback.softSkills),
    mustHave: uniqueList(mustHave, fallback.mustHave),
    niceToHave: uniqueList(niceToHave, fallback.niceToHave),
    qualifications: uniqueList(qualifications, fallback.qualifications),
    responsibilities: uniqueList(responsibilities, fallback.responsibilities),
    requiredSkills: uniqueList(
      requiredSkills,
      hardTechnicalSkills,
      fallback.requiredSkills,
    ),
    yearsOfExperience: String(
      parsed.yearsOfExperience ||
        fallback.yearsOfExperience ||
        "Not specified",
    ).trim(),
    educationRequirements: String(
      parsed.educationRequirements ||
        fallback.educationRequirements ||
        "Not specified",
    ).trim(),
    benefits: uniqueList(asStringList(parsed.benefits), fallback.benefits),
    locationRequirement: String(
      parsed.locationRequirement ||
        fallback.locationRequirement ||
        "Not specified",
    ).trim(),
  };
}

async function callExtractLlm(
  rawJd: string,
  pageTitle: string,
  jobUrl: string,
  options: { useJsonObjectFormat: boolean },
): Promise<string> {
  const EXTRACT_TIMEOUT_MS = 30_000;
  const client = getLlmClient();
  const completion = await client.chat.completions.create(
    {
      model: getLlmModel(),
      temperature: 0.2,
      max_tokens: LLM_MAX_TOKENS.extract,
      ...(options.useJsonObjectFormat
        ? { response_format: { type: "json_object" as const } }
        : {}),
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
- mustHave (string array: mandatory requirements)
- niceToHave (string array: preferred / bonus items)
- qualifications (string array)
- responsibilities (string array)
- requiredSkills (string array)
- yearsOfExperience (string)
- educationRequirements (string)
- benefits (string array)
- locationRequirement (string)

Be thorough. Infer company from title/URL when missing. Prefer specific skill names.
Use empty arrays when absent. Escape quotes inside strings.`,
        },
        {
          role: "user",
          content: `Job URL: ${jobUrl}
Page title: ${pageTitle}

Job posting text:
${rawJd.slice(0, 20000)}`,
        },
      ],
    },
    { signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS) },
  );

  return String(completion.choices[0]?.message?.content || "").trim();
}

export async function extractJobDescription(
  rawJd: string,
  pageTitle: string,
  jobUrl: string,
): Promise<ExtractedJD> {
  const fallback = extractJobDescriptionHeuristic(rawJd, pageTitle, jobUrl);

  const attempts: Array<{ useJsonObjectFormat: boolean; label: string }> = [
    { useJsonObjectFormat: true, label: "json_object" },
    { useJsonObjectFormat: false, label: "plain" },
  ];

  let lastError: Error | null = null;

  for (const attempt of attempts) {
    try {
      const content = await callExtractLlm(rawJd, pageTitle, jobUrl, attempt);
      if (!content) {
        lastError = new Error(
          `Empty response while extracting job description (${attempt.label}).`,
        );
        continue;
      }
      const parsed = parseModelJson<Record<string, unknown>>(content);
      return normalizeExtracted(parsed, fallback);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error("JD extract attempt failed:", attempt.label, lastError);
    }
  }

  // Never fail the whole job package on empty LLM extract — use local fallback
  console.warn(
    "JD extract falling back to heuristic:",
    lastError?.message || "unknown",
  );
  return fallback;
}
