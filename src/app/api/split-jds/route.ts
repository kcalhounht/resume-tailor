import { NextResponse } from "next/server";
import { getLlmClient, getLlmModel } from "@/lib/llm";
import { parseModelJson } from "@/lib/parse-json";
import {
  MIN_JD_CHARS,
  countJobHeaders,
  splitJobDescriptions,
  toDetectedJobs,
  type DetectedJd,
} from "@/lib/split-jds";

export const runtime = "nodejs";
export const maxDuration = 60;

const LABEL_PROMPT = `You label job postings. Given short previews of already-split jobs, return company and role/position for each.

Return ONLY valid JSON:
{
  "labels": [
    { "index": number, "company": string, "role": string }
  ]
}

Rules:
1. index matches the input preview index.
2. company = employer name. role = job title / position.
3. If unclear, use "Unknown company" or "Unknown role".
4. Do not invent extra jobs. One label per preview.
5. Prefer names clearly stated in the preview (e.g. "Who are Tyk" → company Tyk).`;

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

function previewForLabel(text: string, maxLen = 700): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= maxLen) return flat;
  return `${flat.slice(0, maxLen - 1)}…`;
}

async function labelJobsWithOpenRouter(
  jobs: DetectedJd[],
): Promise<DetectedJd[]> {
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    throw new Error(
      "OPENROUTER_API_KEY is not set on the server. Add it in Vercel → Environment Variables, then Redeploy.",
    );
  }
  if (!jobs.length) return jobs;

  const client = getLlmClient();
  const model = getLlmModel();

  // Small batches keep latency under Vercel limits
  const BATCH = 12;
  const labeled = jobs.map((j) => ({ ...j }));

  const batches: Array<{ offset: number; slice: DetectedJd[] }> = [];
  for (let i = 0; i < jobs.length; i += BATCH) {
    batches.push({ offset: i, slice: jobs.slice(i, i + BATCH) });
  }

  // Run a few batches in parallel (not all — avoids rate limits / huge fanout)
  const PARALLEL = 3;
  for (let b = 0; b < batches.length; b += PARALLEL) {
    const wave = batches.slice(b, b + PARALLEL);
    await Promise.all(
      wave.map(async ({ offset, slice }) => {
        const completion = await client.chat.completions.create({
          model,
          temperature: 0,
          messages: [
            { role: "system", content: LABEL_PROMPT },
            {
              role: "user",
              content: JSON.stringify({
                previews: slice.map((job, i) => ({
                  index: offset + i,
                  preview: previewForLabel(job.text),
                  heuristicCompany: job.company,
                  heuristicRole: job.role,
                })),
              }),
            },
          ],
        });

        const content = completion.choices[0]?.message?.content || "";
        if (!content.trim()) return;

        const parsed = parseModelJson<{ labels?: unknown }>(content);
        if (!Array.isArray(parsed.labels)) return;

        for (const item of parsed.labels) {
          if (!item || typeof item !== "object") continue;
          const row = item as Record<string, unknown>;
          const index = Number(row.index);
          if (!Number.isInteger(index) || index < 0 || index >= labeled.length) {
            continue;
          }
          const company = String(row.company || "").trim();
          const role = String(
            row.role || row.position || row.title || "",
          ).trim();
          if (company) labeled[index].company = company;
          if (role) labeled[index].role = role;
        }
      }),
    );
  }

  return labeled;
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

    // Fast local split first — avoids 504 on large pastes
    const baseJobs = toDetectedJobs(splitJobDescriptions(text));
    const headers = countJobHeaders(text);

    if (!baseJobs.length) {
      return NextResponse.json(
        {
          ok: false,
          jobs: [] as DetectedJd[],
          error: "No job descriptions detected in the pasted text.",
        },
        { status: 422 },
      );
    }

    // Skip OpenRouter labeling for huge dumps if explicitly requested,
    // or when local split already found many clear headers (still try labels).
    const skipLlm = Boolean(body?.skipLlm);

    if (skipLlm || !process.env.OPENROUTER_API_KEY?.trim()) {
      return NextResponse.json({
        ok: true,
        jobs: baseJobs,
        source: skipLlm ? "heuristic" : "heuristic_no_key",
        headers,
        ...(process.env.OPENROUTER_API_KEY?.trim()
          ? {}
          : {
              notice:
                "OPENROUTER_API_KEY is missing on the server. Used local JD split. Add the key in Vercel and Redeploy.",
            }),
      });
    }

    try {
      const jobs = await labelJobsWithOpenRouter(baseJobs);
      return NextResponse.json({
        ok: true,
        jobs,
        source: "openrouter_labels",
        headers,
        count: jobs.length,
      });
    } catch (err) {
      console.error("split-jds label error:", err);
      return NextResponse.json({
        ok: true,
        jobs: baseJobs,
        source: "heuristic_fallback",
        headers,
        notice: formatLlmError(err),
      });
    }
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
