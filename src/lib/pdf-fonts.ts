import { existsSync, readFileSync } from "fs";
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

/** Literal paths so Next.js file tracing always ships the TTF files. */
const TRACED_FONT_PATHS = [
  path.join(process.cwd(), "src/lib/fonts/arimo-bold.ttf"),
  path.join(process.cwd(), "src/lib/fonts/arimo-italic.ttf"),
  path.join(process.cwd(), "src/lib/fonts/arimo-regular.ttf"),
  path.join(process.cwd(), "src/lib/fonts/carlito-bold.ttf"),
  path.join(process.cwd(), "src/lib/fonts/carlito-italic.ttf"),
  path.join(process.cwd(), "src/lib/fonts/carlito-regular.ttf"),
  path.join(process.cwd(), "src/lib/fonts/gelasio-bold.ttf"),
  path.join(process.cwd(), "src/lib/fonts/gelasio-italic.ttf"),
  path.join(process.cwd(), "src/lib/fonts/gelasio-regular.ttf"),
  path.join(process.cwd(), "src/lib/fonts/source-sans-3-bold.ttf"),
  path.join(process.cwd(), "src/lib/fonts/source-sans-3-italic.ttf"),
  path.join(process.cwd(), "src/lib/fonts/source-sans-3-regular.ttf"),
  path.join(process.cwd(), "src/lib/fonts/tinos-bold.ttf"),
  path.join(process.cwd(), "src/lib/fonts/tinos-italic.ttf"),
  path.join(process.cwd(), "src/lib/fonts/tinos-regular.ttf"),
];

function addFontDir(dirs: string[], seen: Set<string>, dir: string) {
  const next = path.normalize(dir);
  if (!next || seen.has(next)) return;
  seen.add(next);
  dirs.push(next);
}

export function resolveResumePdfFontsDir() {
  const dirs: string[] = [];
  const seen = new Set<string>();

  addFontDir(dirs, seen, path.join(process.cwd(), "src/lib/fonts"));
  addFontDir(dirs, seen, path.join(process.cwd(), "lib/fonts"));
  addFontDir(dirs, seen, path.join(__dirname, "fonts"));
  addFontDir(dirs, seen, "/var/task/src/lib/fonts");

  let current = __dirname;
  for (let i = 0; i < 12; i++) {
    addFontDir(dirs, seen, path.join(current, "src/lib/fonts"));
    addFontDir(dirs, seen, path.join(current, "lib/fonts"));
    addFontDir(dirs, seen, path.join(current, "fonts"));
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  for (const traced of TRACED_FONT_PATHS) {
    addFontDir(dirs, seen, path.dirname(traced));
  }

  return dirs.find((dir) => existsSync(path.join(dir, "arimo-regular.ttf")));
}

function readFont(filePath: string) {
  try {
    if (!existsSync(filePath)) return null;
    return readFileSync(filePath);
  } catch {
    return null;
  }
}

export function registerResumePdfFonts(
  doc: PDFKit.PDFDocument,
  font: ResumeFont,
): { regular: string; bold: string; italic: string } {
  const files = FONT_FILES[font];
  const dir = resolveResumePdfFontsDir();
  if (!dir || !files) return BUILTIN[font];

  const regular = readFont(path.join(dir, files.regular));
  const bold = readFont(path.join(dir, files.bold));
  const italic = readFont(path.join(dir, files.italic));
  if (!regular || !bold || !italic) return BUILTIN[font];

  const regularName = `Resume-${font}-Regular`;
  const boldName = `Resume-${font}-Bold`;
  const italicName = `Resume-${font}-Italic`;
  try {
    doc.registerFont(regularName, regular);
    doc.registerFont(boldName, bold);
    doc.registerFont(italicName, italic);
    doc.font(regularName);
  } catch {
    return BUILTIN[font];
  }

  return {
    regular: regularName,
    bold: boldName,
    italic: italicName,
  };
}
