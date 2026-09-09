/** Vercel/Lambda only allow writes under /tmp — cwd (/var/task) is read-only. */
export function isEphemeralFilesystem() {
  return Boolean(
    process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME,
  );
}
