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

/** Keep each split request small so Vercel does not 504. */
const MAX_CHUNK_CHARS = 14000;

const SPLIT_PROMPT = `You are an expert job-posting parser.
Split this pasted hiring text into exact individual job descriptions and label each one.

Return ONLY valid JSON:
{
  "jobs": [
    { "company": string, "role": string, "text": string }
  ]
}

Hard rules:
1. Count EXACTLY the real job postings. Do not invent, merge, or over-split.
2. "text" must be the original wording for that posting only (no paraphrasing).
3. "company" = employer name. "role" = job title / position.
4. If unclear: "Unknown company" / "Unknown role".
5. Ignore LinkedIn chrome. Footers belong to the same job.
6. One "About the job" section = one job.
7. "Who are X" usually means company X.
8. Keep original order.`;

const LABEL_PROMPT = `You label already-split job postings from short previews.

Return ONLY valid JSON:
{
  "labels": [
    { "index": number, "company": string, "role": string }
  ]
}

Rules:
1. One label per preview index. Never skip an index.
2. company = employer / company name. role = job title / position.
3. Prefer names clearly stated in the preview (e.g. "Who are Tyk" → Tyk).
4. If hintCompany / hintRole are provided and match the preview, you may use them.
5. If unclear: "Unknown company" / "Unknown role".
6. Do NOT drop or merge jobs — labeling only.`;

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

function requireApiKey() {
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    throw new Error(
      "OPENROUTER_API_KEY is not set on the server. Add it in Vercel → Environment Variables, then Redeploy.",
    );
  }
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
  requireApiKey();
  const client = getLlmClient();
  const model = getLlmModel();

  const completion = await client.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      { role: "system", content: SPLIT_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          pastedText: chunk,
          task: "Split into exact jobs with company, role, and full original text. JSON only.",
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

type LabelResult = {
  index: number;
  company: string;
  role: string;
};

async function labelPreviewsWithOpenRouter(
  previews: Array<{ index: number; preview: string }>,
): Promise<LabelResult[]> {
  requireApiKey();
  const client = getLlmClient();
  const model = getLlmModel();

  const completion = await client.chat.completions.create({
    model,
    temperature: 0,
    messages: [
      { role: "system", content: LABEL_PROMPT },
      {
        role: "user",
        content: JSON.stringify({ previews }),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content || "";
  if (!content.trim()) {
    throw new Error("OpenRouter returned an empty label response.");
  }

  const parsed = parseModelJson<{ labels?: unknown }>(content);
  if (!Array.isArray(parsed.labels)) return [];

  return parsed.labels
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const index = Number(row.index);
      if (!Number.isInteger(index)) return null;
      return {
        index,
        company: String(row.company || "").trim() || "Unknown company",
        role:
          String(row.role || row.position || row.title || "").trim() ||
          "Unknown role",
      } satisfies LabelResult;
    })
    .filter((x): x is LabelResult => Boolean(x));
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const mode = String(body?.mode || "split");

    // Fast path: label pre-split jobs (short previews only)
    if (mode === "label") {
      const previews = Array.isArray(body?.previews) ? body.previews : [];
      const normalized = previews
        .map((p: unknown, i: number) => {
          if (!p || typeof p !== "object") return null;
          const row = p as Record<string, unknown>;
          const preview = String(row.preview || "").trim();
          if (preview.length < 40) return null;
          const index = Number.isInteger(Number(row.index))
            ? Number(row.index)
            : i;
          return {
            index,
            preview: preview.slice(0, 700),
            hintCompany: String(row.hintCompany || "").trim() || undefined,
            hintRole: String(row.hintRole || "").trim() || undefined,
          };
        })
        .filter(Boolean) as Array<{
        index: number;
        preview: string;
        hintCompany?: string;
        hintRole?: string;
      }>;

      if (!normalized.length) {
        return NextResponse.json({ ok: true, labels: [], source: "empty" });
      }
      if (normalized.length > 20) {
        return NextResponse.json(
          { ok: false, error: "Too many previews in one label request (max 20)." },
          { status: 413 },
        );
      }

      const labels = await labelPreviewsWithOpenRouter(normalized);
      return NextResponse.json({
        ok: true,
        labels,
        source: "openrouter_labels",
        count: labels.length,
      });
    }

    // Exact path: full OpenRouter split of a small chunk
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
          error: `Chunk too large (${text.length} chars). Max ${MAX_CHUNK_CHARS}.`,
        },
        { status: 413 },
      );
    }

    const jobs = await splitChunkWithOpenRouter(text);
    return NextResponse.json({
      ok: true,
      jobs,
      source: "openrouter_split",
      count: jobs.length,
    });
  } catch (error) {
    console.error("split-jds error:", error);
    return NextResponse.json(
      { ok: false, error: formatLlmError(error) },
      { status: 500 },
    );
  }
}
