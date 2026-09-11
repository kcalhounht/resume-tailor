import { Buffer } from "node:buffer";
import { extractLinks, extractText, extractTextItems, getDocumentProxy } from "unpdf";
import { MAX_RESUME_PDF_PAGES } from "./limits";
import { normalizeResumeText, reconstructPdfText } from "./pdf-layout";

function isPdfMagic(bytes: Uint8Array) {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

function cleanupText(text: string) {
  return normalizeResumeText(text);
}

export async function extractPdfText(bytes: Uint8Array): Promise<{
  text: string;
  totalPages: number;
  links: string[];
}> {
  if (!isPdfMagic(bytes)) {
    throw new Error("That file is not a PDF.");
  }

  const pdf = await getDocumentProxy(
    Buffer.isBuffer(bytes) ? new Uint8Array(bytes) : bytes,
  );
  try {
    if (pdf.numPages > MAX_RESUME_PDF_PAGES) {
      throw new Error(
        `Use a resume of ${MAX_RESUME_PDF_PAGES} pages or fewer.`,
      );
    }

    const [{ items, totalPages }, { links }] = await Promise.all([
      extractTextItems(pdf),
      extractLinks(pdf),
    ]);
    let text = cleanupText(reconstructPdfText(items));

    if (text.replace(/\s+/g, "").length < 40) {
      const fallback = await extractText(pdf, { mergePages: true });
      text = cleanupText(String(fallback.text || ""));
    }

    if (text.replace(/\s+/g, "").length < 40) {
      throw new Error(
        "No readable text in that PDF. Try a text resume, not a scan.",
      );
    }

    const uniqueLinks = Array.from(
      new Set(links.map((link) => link.trim()).filter(Boolean)),
    );
    return { text, totalPages, links: uniqueLinks };
  } finally {
    await pdf.cleanup();
  }
}
