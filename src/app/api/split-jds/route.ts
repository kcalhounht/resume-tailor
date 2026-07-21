import { NextResponse } from "next/server";
import { getLlmClient, getLlmModel } from "@/lib/llm";
import { parseModelJson } from "@/lib/parse-json";
import {
  MIN_JD_CHARS,
  toDetectedJobs,
  type DetectedJd,
} from "@/lib/split-jds";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Keep each request small so Vercel does not 504. Client sends chunks. */
const MAX_CHUNK_CHARS = 14000;

const SYSTEM_PROMPT = `You are an expert job-posting parser.
Split this pasted hiring text into exact individual job descriptions and label each one.

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
2. "text" must be the original wording for that posting only (no paraphrasing). Keep each posting complete.
3. "company" = employer/organization name. "role" = job title / position.
4. If a field is unclear, use "Unknown company" or "Unknown role".
5. Ignore LinkedIn chrome (People also viewed, Easy Apply buttons alone, ads).
6. Footers (website, email, Apply!) belong to the same job, not a new job.
7. Typical LinkedIn dumps start sections with "About the job". One such section = one job.
8. "Who are X" / "X is the leading…" usually means company X.
9. Return jobs in the same order as in the paste.`;

function formatLlmError(err: unknown): string {
  if (!(err instanceof Error)) return "OpenRouter request failed";
  const anyErr = err as Error & {
    error?: { message?: string };
    message?: string;
  };
  const detail =
    anyErr.error?.message || anyErr.message || "OpenRouter request failed";
  if (/api key|unauthorized|401|403|not set/i.test(detail)) {
    return `OpenRouter auth failed: ${detail}. Check OPENROUTER_API_KEY in Vercel and redeploy.`;
  }
  if (/model|404|not found/i.test(detail)) {
    return `OpenRouter model error: ${detail}. Check OPENROUTER_MODEL (expected deepseek/deepseek-v4-flash).`;
  }
  return detail;
}

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

async function splitChunkWithOpenRouter(chunk: string): Promise<DetectedJd[]> {
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    throw new Error(
      "OPENROUTER_API_KEY is not set on the server. Add it in Vercel → Environment Variables, then Redeploy.",
    );
  }

  const client = getLlmClient();
  const model = getLlmModel();

  const completion = await client.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          pastedText: chunk,
          task: "Split into exact jobs. For each job return company, role/position, and full original text. JSON only.",
        }),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content || "";
  if (!content.trim()) {
    throw new Error("OpenRouter returned an empty JD split response.");
  }

  return normalizeDetected(parseModelJson<{ jobs?: unknown }>(content).jobs);
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

    if (text.length > MAX_CHUNK_CHARS) {
      return NextResponse.json(
        {
          ok: false,
          error: `Chunk too large (${text.length} chars). Client must send smaller OpenRouter chunks (max ${MAX_CHUNK_CHARS}).`,
        },
        { status: 413 },
      );
    }

    const jobs = await splitChunkWithOpenRouter(text);
    return NextResponse.json({
      ok: true,
      jobs,
      source: "openrouter",
      count: jobs.length,
    });
  } catch (error) {
    console.error("split-jds error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: formatLlmError(error),
      },
      { status: 500 },
    );
  }
}
