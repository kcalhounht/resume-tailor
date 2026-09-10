import { getSession } from "@/app/actions/auth";
import { extractProfileFromResume } from "@/lib/extract-resume";
import { MAX_RESUME_PDF_BYTES } from "@/lib/limits";
import { extractPdfText } from "@/lib/pdf-text";
import { findUserById, isUserAble, PRIORITY_DISABLED_MESSAGE } from "@/lib/users";

export const runtime = "nodejs";
export const maxDuration = 60;

function errorResponse(message: string, status = 400) {
  return Response.json({ ok: false, error: message }, { status });
}

export async function POST(request: Request) {
  const session = await getSession();
  const user = session ? await findUserById(session.userId) : null;
  if (!session || !user) {
    return errorResponse("Sign in required", 401);
  }
  if (!isUserAble(user)) {
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

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { text } = await extractPdfText(bytes);
    const { profile, source } = await extractProfileFromResume(text);
    return Response.json({ ok: true, profile, source });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not read that resume.";
    return errorResponse(message);
  }
}
