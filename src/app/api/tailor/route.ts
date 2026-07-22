import { ZodError } from "zod";
import { formatOpenRouterError } from "@/lib/llm";
import { processOneJob } from "@/lib/process-job";
import { JOB_STEPS, type JobStep, type ProgressEvent } from "@/lib/progress";
import { parseTailorRequest } from "@/lib/validate";
import type { CandidateProfile } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

/** One job at a time keeps each package inside Vercel/proxy limits. */
const KEEPALIVE_MS = 10_000;

function encodeSse(event: ProgressEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
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

      // Keep proxies from closing idle SSE while OpenRouter is thinking.
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          // stream already closed
        }
      }, KEEPALIVE_MS);

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

          send({
            type: "step",
            index: payload.indices?.[0] ?? 1,
            jobUrl: payload.jobUrls[0],
            step: "extracting",
            message: "Extracting profile from resume…",
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

        const outcomes: Array<{ ok: boolean }> = [];

        // Always sequential — parallel multi-job streams get killed mid-Generate.
        for (let i = 0; i < payload.jobUrls.length; i++) {
          const jobUrl = payload.jobUrls[i];
          const index = payload.indices?.[i] ?? i + 1;
          let currentStep: JobStep = JOB_STEPS[0];

          try {
            const result = await processOneJob({
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
            });

            // Mark success first without file bytes — large base64 used to kill
            // the stream at Zip and leave the card as "Connection closed".
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
              coverLetterTxtName: result.coverLetterTxtName,
              atsScore: result.atsScore,
              atsSummary: result.atsSummary,
              extracted: {
                ...result.extracted,
                summary: result.extracted.summary.slice(0, 400),
                mustHave: result.extracted.mustHave.slice(0, 12),
                niceToHave: result.extracted.niceToHave.slice(0, 12),
                qualifications: result.extracted.qualifications.slice(0, 12),
                responsibilities: result.extracted.responsibilities.slice(0, 12),
                requiredSkills: result.extracted.requiredSkills.slice(0, 20),
                hardTechnicalSkills:
                  result.extracted.hardTechnicalSkills.slice(0, 20),
                softSkills: result.extracted.softSkills.slice(0, 12),
                benefits: result.extracted.benefits.slice(0, 12),
              },
              resume: result.resume,
              coverLetter: result.coverLetter,
              personal: result.personal,
            });

            if (result.downloads) {
              send({
                type: "job_files",
                index,
                jobUrl,
                zipName: result.zipName,
                resumeDocxName: result.resumeDocxName,
                resumePdfName: result.resumePdfName,
                coverLetterDocxName: result.coverLetterDocxName,
                coverLetterTxtName: result.coverLetterTxtName,
                downloads: result.downloads,
              });
            }

            outcomes.push({ ok: true });
          } catch (err) {
            const message = formatOpenRouterError(err);
            send({
              type: "job_error",
              index,
              jobUrl,
              step: currentStep,
              error: message || "Unknown error for this job.",
            });
            outcomes.push({ ok: false });
          }
        }

        const succeeded = outcomes.filter((o) => o.ok).length;
        send({
          type: "done",
          succeeded,
          failed: outcomes.length - succeeded,
        });
      } catch (err) {
        send({
          type: "fatal",
          error: formatOpenRouterError(err) || "Unexpected error",
        });
      } finally {
        clearInterval(keepalive);
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
