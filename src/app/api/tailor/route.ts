import { ZodError } from "zod";
import { processOneJob } from "@/lib/process-job";
import { JOB_STEPS, type JobStep, type ProgressEvent } from "@/lib/progress";
import { parseTailorRequest } from "@/lib/validate";
import type { CandidateProfile } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Keep OpenRouter load sane — unbounded Promise.all often hangs one job on Generate. */
const JOB_CONCURRENCY = 2;
const JOB_TIMEOUT_MS = 150_000;

function encodeSse(event: ProgressEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function runWorker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const poolSize = Math.min(Math.max(1, concurrency), items.length || 1);
  await Promise.all(
    Array.from({ length: poolSize }, () => runWorker()),
  );
  return results;
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  let payload;
  try {
    const body = await request.json();
    payload = parseTailorRequest(body);
  } catch (err) {
    const message =
      err instanceof ZodError
        ? err.issues[0]?.message || "Invalid request"
        : err instanceof Error
          ? err.message
          : "Invalid request";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ProgressEvent) => {
        controller.enqueue(encoder.encode(encodeSse(event)));
      };

      try {
        let profile: CandidateProfile;
        let sourceResumeText: string | undefined;

        if (payload.mode === "resume_pdf") {
          // Lazy-load PDF tools so Profile+JD mode is not blocked by pdf-parse
          const { decodePdfBase64, extractTextFromPdf } = await import(
            "@/lib/parse-resume-pdf"
          );
          const { extractProfileFromResumeText } = await import(
            "@/lib/extract-resume"
          );

          send({
            type: "step",
            index: payload.indices?.[0] ?? 1,
            jobUrl: payload.jobUrls[0],
            step: "scraping",
            message: "Reading uploaded resume PDF…",
          });

          const pdfBuffer = decodePdfBase64(payload.resumePdfBase64 || "");
          sourceResumeText = await extractTextFromPdf(pdfBuffer);

          send({
            type: "step",
            index: payload.indices?.[0] ?? 1,
            jobUrl: payload.jobUrls[0],
            step: "fetch_jd",
            message: `Parsed resume (${sourceResumeText.length.toLocaleString()} chars)…`,
          });

          const parsed = await extractProfileFromResumeText(sourceResumeText);
          profile = {
            personal: parsed.personal,
            experiences: parsed.experiences,
            education: parsed.education,
          };
        } else {
          if (!payload.profile) {
            throw new Error("Profile is required for JD-only mode");
          }
          profile = payload.profile;
        }

        const outcomes = await mapPool(
          payload.jobUrls,
          JOB_CONCURRENCY,
          async (jobUrl, i) => {
            const index = payload.indices?.[i] ?? i + 1;
            let currentStep: JobStep = JOB_STEPS[0];

            try {
              const result = await withTimeout(
                processOneJob({
                  index,
                  jobUrl,
                  profile,
                  personal: profile.personal,
                  manualJd: payload.manualJds?.[i],
                  sourceResumeText,
                  onStep: (step, message) => {
                    currentStep = step;
                    send({
                      type: "step",
                      index,
                      jobUrl,
                      step,
                      message,
                    });
                  },
                }),
                JOB_TIMEOUT_MS,
                `Job ${index}`,
              );

              send({
                type: "job_done",
                index,
                jobUrl,
                company: result.company,
                zipName: result.zipName,
                folderName: result.folderName,
                resumeDocxName: result.resumeDocxName,
                resumePdfName: result.resumePdfName,
                coverLetterDocxName: result.coverLetterDocxName,
                atsScore: result.atsScore,
                atsSummary: result.atsSummary,
                extracted: result.extracted,
                resume: result.resume,
                coverLetter: result.coverLetter,
                personal: result.personal,
                downloads: result.downloads,
              });

              return { ok: true as const };
            } catch (err) {
              const message =
                err instanceof Error
                  ? err.message
                  : "Unknown error for this job.";
              send({
                type: "job_error",
                index,
                jobUrl,
                step: currentStep,
                error: message,
              });
              return { ok: false as const };
            }
          },
        );

        const succeeded = outcomes.filter((o) => o.ok).length;
        send({
          type: "done",
          succeeded,
          failed: outcomes.length - succeeded,
        });
      } catch (err) {
        send({
          type: "fatal",
          error: err instanceof Error ? err.message : "Unexpected error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
