import { PDFParse } from "pdf-parse";

const MAX_PDF_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Extract plain text from a resume PDF buffer.
 */
export async function extractTextFromPdf(
  data: Buffer | Uint8Array,
): Promise<string> {
  const bytes = data instanceof Buffer ? data : Buffer.from(data);
  if (bytes.byteLength === 0) {
    throw new Error("Uploaded PDF is empty.");
  }
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error("PDF is too large. Please upload a file under 8 MB.");
  }

  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const result = await parser.getText();
    const text = String(result.text || "")
      .replace(/\u0000/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (text.length < 80) {
      throw new Error(
        "Could not read enough text from the PDF. Try a text-based resume (not a scanned image).",
      );
    }
    return text.slice(0, 60000);
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

export function decodePdfBase64(base64: string): Buffer {
  const cleaned = base64.replace(/^data:application\/pdf;base64,/i, "").trim();
  if (!cleaned) {
    throw new Error("Resume PDF data is missing.");
  }
  try {
    return Buffer.from(cleaned, "base64");
  } catch {
    throw new Error("Invalid resume PDF data.");
  }
}
