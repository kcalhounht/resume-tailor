import { loadCurrentUser } from "@/lib/dal";
import { extractProfileFromResume } from "@/lib/extract-resume";
import { MAX_RESUME_PDF_BYTES } from "@/lib/limits";
import { toOpenRouterError } from "@/lib/openrouter-errors";
import { extractPdfText } from "@/lib/pdf-text";
import {
  IMPORT_STEP_LABELS,
  IMPORT_STEP_PERCENT,
  type ImportProgressEvent,
  type ImportStep,
} from "@/lib/progress";
import { isUserAble, PRIORITY_DISABLED_MESSAGE } from "@/lib/users";

export const runtime = "nodejs";
export const maxDuration = 60;

function errorResponse(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

function encodeSse(event: ImportProgressEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: Request) {
  const current = await loadCurrentUser();
  if (!current) {
    return errorResponse("Sign in required", 401);
  }
  if (!isUserAble(current.user)) {
    return errorResponse(PRIORITY_DISABLED_MESSAGE, 403);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("Could not read that upload.");
  }

  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return errorResponse("Choose a resume PDF.");
  }
  if (file.size <= 0) {
    return errorResponse("That PDF is empty.");
  }
  if (file.size > MAX_RESUME_PDF_BYTES) {
    return errorResponse("Use a PDF smaller than 4 MB.");
  }

  const name = file instanceof File ? file.name.trim().toLowerCase() : "";
  if (name && !name.endsWith(".pdf")) {
    return errorResponse("Upload a .pdf resume.");
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ImportProgressEvent) => {
        controller.enqueue(encoder.encode(encodeSse(event)));
      };
      const sendStep = (step: ImportStep, message?: string) => {
        send({
          type: "step",
          step,
          percent: IMPORT_STEP_PERCENT[step],
          message: message || IMPORT_STEP_LABELS[step],
        });
      };

      try {
        sendStep("read", "Reading PDF…");
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { text, links } = await extractPdfText(bytes);
        sendStep("extract", "Extracting profile…");
        const { profile, source, warning } = await extractProfileFromResume(
          text,
          links,
          (message) => sendStep("extract", message),
        );
        sendStep("fill", "Filling fields…");
        send({ type: "done", percent: 100, profile, source, warning });
      } catch (err) {
        send({
          type: "error",
          error: toOpenRouterError(
            err,
            "Could not read that resume.",
          ).message,
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
    },
  });
}
