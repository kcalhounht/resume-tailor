import { NextResponse } from "next/server";
import { getLlmClient, getLlmModel } from "@/lib/llm";
import { parseModelJson } from "@/lib/parse-json";
import {
  MIN_JD_CHARS,
  splitJobDescriptions,
} from "@/lib/split-jds";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const text = String(body?.text || "").trim();
    if (text.length < MIN_JD_CHARS) {
      return NextResponse.json({
        ok: true,
        jobs: [],
        source: "empty",
      });
    }

    const heuristic = splitJobDescriptions(text);

    // If heuristics already found several clean jobs and paste isn't huge, skip LLM
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
          content: `You split pasted hiring text into separate job descriptions.
Return ONLY JSON: { "jobs": string[] }
Rules:
1. Each item in jobs is one full job posting's text (keep original wording).
2. If there is only one job, return a one-element array.
3. Do not invent text. Only split.
4. Typical signals: "About the job", different companies, different apply emails/websites, new role titles.
5. Ignore tiny fragments under ~80 characters.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            pastedText: text.slice(0, 50000),
            hint: `Heuristic split found ${heuristic.length} block(s). Correct/improve the split.`,
          }),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content || "";
    const parsed = parseModelJson<{ jobs?: unknown }>(content);
    const jobs = Array.isArray(parsed.jobs)
      ? parsed.jobs
          .map((j) => String(j || "").trim())
          .filter((j) => j.length >= MIN_JD_CHARS)
      : [];

    if (jobs.length >= 2) {
      return NextResponse.json({ ok: true, jobs, source: "llm" });
    }

    // Prefer heuristic multi over LLM single when heuristic was better
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
          error instanceof Error ? error.message : "Failed to split job descriptions",
      },
      { status: 500 },
    );
  }
}
