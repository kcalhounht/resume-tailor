import { extractText, getDocumentProxy } from "unpdf";
import { MAX_RESUME_PDF_PAGES } from "./limits";

function isPdfMagic(bytes: Uint8Array) {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

export async function extractPdfText(bytes: Uint8Array): Promise<{
  text: string;
  totalPages: number;
}> {
  if (!isPdfMagic(bytes)) {
    throw new Error("That file is not a PDF.");
  }

  const pdf = await getDocumentProxy(bytes);
  try {
    if (pdf.numPages > MAX_RESUME_PDF_PAGES) {
      throw new Error(
        `Use a resume of ${MAX_RESUME_PDF_PAGES} pages or fewer.`,
      );
    }
    const { totalPages, text } = await extractText(pdf, { mergePages: true });
    const cleaned = text
      .replace(/\u0000/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (cleaned.replace(/\s+/g, "").length < 40) {
      throw new Error(
        "No readable text in that PDF. Try a text resume, not a scan.",
      );
    }
    return { text: cleaned, totalPages };
  } finally {
    await pdf.cleanup();
  }
}
