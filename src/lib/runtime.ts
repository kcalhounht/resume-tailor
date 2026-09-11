import os from "os";
import path from "path";

/** Vercel/Lambda only allow writes under /tmp — cwd (/var/task) is read-only. */
export function isEphemeralFilesystem() {
  return Boolean(
    process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME,
  );
}

/** JSON account/record/settings store. Same files as local `data/`, writable on serverless. */
export function getDataRoot() {
  if (isEphemeralFilesystem()) {
    return path.join(os.tmpdir(), "resume-tailor-data");
  }
  return path.join(process.cwd(), "data");
}
