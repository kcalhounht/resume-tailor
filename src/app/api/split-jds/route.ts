import { NextResponse } from "next/server";
import { getLlmClient, getLlmModel } from "@/lib/llm";
import { parseModelJson } from "@/lib/parse-json";
import {
  MIN_JD_CHARS,
  splitJobDescriptions,
  toDetectedJobs,
  type DetectedJd,
} from "@/lib/split-jds";

export const runtime = "nodejs";
export const maxDuration = 60;

function normalizeDetected(jobs: unknown): DetectedJd[] {
  if (!Array.isArray(jobs)) return [];

  // Legacy: string[]
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
      return {
        text,
        company:
          String(row.company || row.companyName || "").trim() ||
          fallback.company,
        role:
          String(row.role || row.jobTitle || row.title || "").trim() ||
          fallback.role,
      } satisfies DetectedJd;
    })
    .filter((j): j is DetectedJd => Boolean(j));
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

    const heuristic = toDetectedJobs(splitJobDescriptions(text));

    if (heuristic.length >= 2 && text.length < 14000) {
      return NextResponse.json({
        ok: true,
        jobs: heuristic,
        source: "heuristic",
      });
    }

    const client = getLlmClient();
    const model = getLlmModel();
    const completion = await client.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You split pasted hiring text into separate job descriptions and label each one.
Return ONLY JSON:
{
  "jobs": [
    { "company": string, "role": string, "text": string }
  ]
}
Rules:
1. text is the full original posting text for that job (do not invent wording).
2. company is the employer name. role is the job title.
3. If unknown, use "Unknown company" / "Unknown role".
4. If only one job exists, return one item.
5. Ignore tiny fragments under ~80 characters.
6. Do NOT over-split. Footers like websites, emails, or "Apply!" are part of the previous job, not a new job.
7. If the paste has N clear "About the job" sections, return about N jobs (not N+1).`,
        },
        {
          role: "user",
          content: JSON.stringify({
            pastedText: text.slice(0, 50000),
            hint: `Heuristic split found ${heuristic.length} block(s). Correct/improve the split and labels.`,
          }),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content || "";
    const parsed = parseModelJson<{ jobs?: unknown }>(content);
    const jobs = normalizeDetected(parsed.jobs);

    if (jobs.length >= 2) {
      return NextResponse.json({ ok: true, jobs, source: "llm" });
    }

    if (heuristic.length >= 2) {
      return NextResponse.json({
        ok: true,
        jobs: heuristic,
        source: "heuristic",
      });
    }

    return NextResponse.json({
      ok: true,
      jobs: jobs.length ? jobs : heuristic,
      source: jobs.length ? "llm" : "heuristic",
    });
  } catch (error) {
    console.error("split-jds error:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to split job descriptions",
      },
      { status: 500 },
    );
  }
}
