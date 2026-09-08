import { ZodError } from "zod";
import { processOneJob } from "@/lib/process-job";
import { JOB_STEPS, type JobStep, type ProgressEvent } from "@/lib/progress";
import { parseTailorRequest } from "@/lib/validate";
import { getSession } from "@/app/actions/auth";
import { findUserById, isUserAble, saveUserProfile } from "@/lib/users";
import { normalizeProfile } from "@/lib/profile";
import {
  addTailorRecord,
  newTailorRecordId,
  recordOutputSuffix,
} from "@/lib/tailor-records";

export const runtime = "nodejs";
export const maxDuration = 300;

function encodeSse(event: ProgressEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: Request) {
  const session = await getSession();
  const user = session ? await findUserById(session.userId) : null;
  if (!session || !user || !isUserAble(user)) {
    return new Response(JSON.stringify({ ok: false, error: "Sign in required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

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

  try {
    await saveUserProfile(session.userId, normalizeProfile(payload.profile));
  } catch {
    // Generation can still proceed if the profile write fails.
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ProgressEvent) => {
        controller.enqueue(encoder.encode(encodeSse(event)));
      };

      try {
        const outcomes = await Promise.all(
          payload.jobDescriptions.map(async (jobDescription, i) => {
            const index = payload.indices?.[i] ?? i + 1;
            let currentStep: JobStep = JOB_STEPS[0];

            try {
              const recordId = newTailorRecordId();
              const result = await processOneJob({
                index,
                jobDescription,
                profile: payload.profile,
                personal: payload.profile.personal,
                outputSuffix: recordOutputSuffix(recordId),
                onStep: (step, message) => {
                  currentStep = step;
                  send({
                    type: "step",
                    index,
                    step,
                    message,
                  });
                },
              });

              try {
                await addTailorRecord({
                  id: recordId,
                  userId: session.userId,
                  status: "done",
                  jobDescription,
                  company: result.company,
                  jobTitle: result.extracted.jobTitle,
                  extracted: result.extracted,
                  atsScore: result.atsScore,
                  zipName: result.zipName,
                  folderName: result.folderName,
                  resumeDocxName: result.resumeDocxName,
                  resumePdfName: result.resumePdfName,
                  coverLetterDocxName: result.coverLetterDocxName,
                });
              } catch {
                // Keep generation successful even if the admin ledger fails.
              }

              send({
                type: "job_done",
                index,
                company: result.company,
                zipName: result.zipName,
                folderName: result.folderName,
                resumeDocxName: result.resumeDocxName,
                resumePdfName: result.resumePdfName,
                coverLetterDocxName: result.coverLetterDocxName,
                atsScore: result.atsScore,
                atsSummary: result.atsSummary,
                extracted: result.extracted,
                downloads: result.downloads,
              });

              return { ok: true as const };
            } catch (err) {
              const message =
                err instanceof Error
                  ? err.message
                  : "Unknown error for this job.";
              try {
                await addTailorRecord({
                  id: newTailorRecordId(),
                  userId: session.userId,
                  status: "error",
                  jobDescription,
                  company: "",
                  jobTitle: "",
                  error: message,
                });
              } catch {
                // Keep the job error visible even if the admin ledger fails.
              }
              send({
                type: "job_error",
                index,
                step: currentStep,
                error: message,
              });
              return { ok: false as const };
            }
          }),
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
