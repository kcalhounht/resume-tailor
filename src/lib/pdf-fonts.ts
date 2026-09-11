import { existsSync } from "fs";
import path from "path";
import type { ResumeFont } from "./resume-format";

// OFL substitutes embedded in PDFs: Carlito (Calibri), Source Sans 3 (Aptos),
// Tinos (Times), Gelasio (Georgia), Arimo (Arial).

const FONT_FILES: Record<
  ResumeFont,
  { regular: string; bold: string; italic: string }
> = {
  calibri: {
    regular: "carlito-regular.ttf",
    bold: "carlito-bold.ttf",
    italic: "carlito-italic.ttf",
  },
  aptos: {
    regular: "source-sans-3-regular.ttf",
    bold: "source-sans-3-bold.ttf",
    italic: "source-sans-3-italic.ttf",
  },
  arial: {
    regular: "arimo-regular.ttf",
    bold: "arimo-bold.ttf",
    italic: "arimo-italic.ttf",
  },
  times: {
    regular: "tinos-regular.ttf",
    bold: "tinos-bold.ttf",
    italic: "tinos-italic.ttf",
  },
  georgia: {
    regular: "gelasio-regular.ttf",
    bold: "gelasio-bold.ttf",
    italic: "gelasio-italic.ttf",
  },
};

const BUILTIN: Record<
  ResumeFont,
  { regular: string; bold: string; italic: string }
> = {
  calibri: {
    regular: "Helvetica",
    bold: "Helvetica-Bold",
    italic: "Helvetica-Oblique",
  },
  aptos: {
    regular: "Helvetica",
    bold: "Helvetica-Bold",
    italic: "Helvetica-Oblique",
  },
  arial: {
    regular: "Helvetica",
    bold: "Helvetica-Bold",
    italic: "Helvetica-Oblique",
  },
  times: {
    regular: "Times-Roman",
    bold: "Times-Bold",
    italic: "Times-Italic",
  },
  georgia: {
    regular: "Times-Roman",
    bold: "Times-Bold",
    italic: "Times-Italic",
  },
};

function fontsDir() {
  const candidates = [
    path.join(process.cwd(), "src/lib/fonts"),
    path.join(process.cwd(), "lib/fonts"),
    path.join(__dirname, "fonts"),
  ];
  return candidates.find((dir) =>
    existsSync(path.join(dir, "carlito-regular.ttf")),
  );
}

export function registerResumePdfFonts(
  doc: PDFKit.PDFDocument,
  font: ResumeFont,
): { regular: string; bold: string; italic: string } {
  const dir = fontsDir();
  const files = FONT_FILES[font];
  if (!dir) return BUILTIN[font];

  const regular = path.join(dir, files.regular);
  const bold = path.join(dir, files.bold);
  const italic = path.join(dir, files.italic);
  if (!existsSync(regular) || !existsSync(bold) || !existsSync(italic)) {
    return BUILTIN[font];
  }

  doc.registerFont("Resume-Regular", regular);
  doc.registerFont("Resume-Bold", bold);
  doc.registerFont("Resume-Italic", italic);
  return {
    regular: "Resume-Regular",
    bold: "Resume-Bold",
    italic: "Resume-Italic",
  };
}
