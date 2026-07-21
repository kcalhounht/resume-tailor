import { NextResponse } from "next/server";
import { getLlmClient, getLlmModel } from "@/lib/llm";
import { parseModelJson } from "@/lib/parse-json";
import {
  MIN_JD_CHARS,
  chunkPasteForLlm,
  splitJobDescriptions,
  toDetectedJobs,
  type DetectedJd,
} from "@/lib/split-jds";

export const runtime = "nodejs";
export const maxDuration = 300;

const SYSTEM_PROMPT = `You are an expert job-posting parser.
Split pasted hiring text into exact individual job descriptions and label each one.

Return ONLY valid JSON:
{
  "jobs": [
    {
      "company": string,
      "role": string,
      "text": string
    }
  ]
}

Hard rules:
1. Count EXACTLY the real job postings. Do not invent jobs. Do not merge two jobs. Do not split one job into two.
2. "text" must be the original wording for that posting only (no paraphrasing).
3. "company" = employer/organization name. "role" = job title / position.
4. If a field is unclear, use "Unknown company" or "Unknown role".
5. Ignore LinkedIn chrome (People also viewed, Easy Apply buttons alone, ads).
6. Footers (website, email, Apply!) belong to the same job, not a new job.
7. Typical LinkedIn dumps start sections with "About the job". One such section = one job.
8. Return jobs in the same order as in the paste.`;

function normalizeDetected(jobs: unknown): DetectedJd[] {
  if (!Array.isArray(jobs)) return [];

  if (jobs.every((j) => typeof j === "string")) {
    return toDetectedJobs(
      jobs.map((j) => String(j).trim()).filter((j) => j.length >= MIN_JD_CHARS),
    );
  }

  return jobs
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const text = String(row.text || row.jd || row.content || "").trim();
      if (text.length < MIN_JD_CHARS) return null;
      const fallback = toDetectedJobs([text])[0];
      const company =
        String(row.company || row.companyName || "").trim() || fallback.company;
      const role =
        String(row.role || row.jobTitle || row.title || row.position || "").trim() ||
        fallback.role;
      return { text, company, role } satisfies DetectedJd;
    })
    .filter((j): j is DetectedJd => Boolean(j));
}

async function extractJobsWithOpenRouter(chunk: string): Promise<DetectedJd[]> {
  const client = getLlmClient();
  const model = getLlmModel();

  const completion = await client.chat.completions.create({
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          pastedText: chunk,
          task: "Split into exact jobs. For each job return company, role/position, and full original text.",
        }),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content || "";
  if (!content.trim()) {
    throw new Error("OpenRouter returned an empty JD split response.");
  }

  const parsed = parseModelJson<{ jobs?: unknown }>(content);
  return normalizeDetected(parsed.jobs);
}

function dedupeJobs(jobs: DetectedJd[]): DetectedJd[] {
  const seen = new Set<string>();
  const out: DetectedJd[] = [];
  for (const job of jobs) {
    const key = `${job.company.toLowerCase()}|${job.role.toLowerCase()}|${job.text.slice(0, 120).toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(job);
  }
  return out;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const text = String(body?.text || "").trim();
    if (text.length < MIN_JD_CHARS) {
      return NextResponse.json({
        ok: true,
        jobs: [] as DetectedJd[],
        source: "empty",
      });
    }

    const heuristicFallback = toDetectedJobs(splitJobDescriptions(text));
    const chunks = chunkPasteForLlm(text);

    const collected: DetectedJd[] = [];
    const errors: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      try {
        const part = await extractJobsWithOpenRouter(chunks[i]);
        collected.push(...part);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "OpenRouter chunk failed";
        errors.push(`chunk ${i + 1}/${chunks.length}: ${message}`);
        console.error("split-jds OpenRouter chunk error:", err);
      }
    }

    const jobs = dedupeJobs(collected);

    if (jobs.length >= 1) {
      return NextResponse.json({
        ok: true,
        jobs,
        source: "openrouter",
        chunks: chunks.length,
        ...(errors.length ? { warnings: errors } : {}),
      });
    }

    // Fallback only if OpenRouter failed entirely
    return NextResponse.json({
      ok: true,
      jobs: heuristicFallback,
      source: "heuristic_fallback",
      chunks: chunks.length,
      ...(errors.length ? { warnings: errors } : {}),
    });
  } catch (error) {
    console.error("split-jds error:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to split job descriptions with OpenRouter",
      },
      { status: 500 },
    );
  }
}
