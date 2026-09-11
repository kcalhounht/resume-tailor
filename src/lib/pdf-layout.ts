export type PdfLayoutItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  hasEOL?: boolean;
};

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function groupIntoLines(items: PdfLayoutItem[]): PdfLayoutItem[][] {
  const usable = items
    .filter((item) => item.str.trim())
    .sort((a, b) => b.y - a.y || a.x - b.x);
  if (!usable.length) return [];

  const tolerance = Math.max(2.4, median(usable.map((item) => item.height || item.fontSize || 10)) * 0.55);
  const lines: PdfLayoutItem[][] = [];
  for (const item of usable) {
    const current = lines[lines.length - 1];
    const lineY = current ? median(current.map((entry) => entry.y)) : item.y;
    if (current && Math.abs(item.y - lineY) <= tolerance) {
      current.push(item);
    } else {
      lines.push([item]);
    }
  }
  return lines.map((line) => line.sort((a, b) => a.x - b.x));
}

function joinLine(items: PdfLayoutItem[]): string {
  let line = "";
  let prevEnd = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const piece = item.str.replace(/\s+/g, " ");
    if (!piece) continue;
    const gap = item.x - prevEnd;
    if (!line) {
      line = piece.trimStart();
    } else if (gap < 1.2) {
      line += piece;
    } else {
      line += ` ${piece.trim()}`;
    }
    prevEnd = item.x + Math.max(item.width, 0);
  }
  return line.replace(/[ \t]{2,}/g, " ").trim();
}

export function linesFromItems(items: PdfLayoutItem[]): string {
  return groupIntoLines(items)
    .map(joinLine)
    .filter(Boolean)
    .join("\n");
}

function splitIfBalanced(items: PdfLayoutItem[], split: number) {
  const left = items.filter((item) => item.x + item.width / 2 < split);
  const right = items.filter((item) => item.x + item.width / 2 >= split);
  if (left.length < 3 || right.length < 3) return null;
  return split;
}

export function findColumnSplit(items: PdfLayoutItem[]): number | null {
  const lines = groupIntoLines(items);
  const midpoints: number[] = [];
  for (const line of lines) {
    if (line.length < 2) continue;
    let bestGap = 0;
    let midpoint = 0;
    for (let i = 1; i < line.length; i++) {
      const prevEnd = line[i - 1].x + Math.max(line[i - 1].width, 0);
      const gap = line[i].x - prevEnd;
      if (gap > bestGap) {
        bestGap = gap;
        midpoint = prevEnd + gap / 2;
      }
    }
    if (bestGap >= 36) midpoints.push(midpoint);
  }
  if (midpoints.length) {
    const fromLines = splitIfBalanced(items, median(midpoints));
    if (fromLines != null) return fromLines;
  }

  const starts = items.map((item) => item.x).sort((a, b) => a - b);
  let bestGap = 0;
  let midpoint = 0;
  for (let i = 1; i < starts.length; i++) {
    const gap = starts[i] - starts[i - 1];
    if (gap > bestGap) {
      bestGap = gap;
      midpoint = (starts[i] + starts[i - 1]) / 2;
    }
  }
  if (bestGap < 50) return null;
  return splitIfBalanced(items, midpoint);
}

export function reconstructPageText(items: PdfLayoutItem[]): string {
  const usable = items.filter((item) => item.str.trim());
  if (!usable.length) return "";

  const typicalSize = median(usable.map((item) => item.fontSize || 10));
  const headerItems = usable.filter(
    (item) => item.fontSize >= Math.max(13, typicalSize * 1.35),
  );
  const body = usable.filter((item) => !headerItems.includes(item));
  const split = findColumnSplit(body.length ? body : usable);
  const parts: string[] = [];
  const headerText = linesFromItems(headerItems);
  if (headerText) parts.push(headerText);

  if (split == null) {
    parts.push(linesFromItems(body.length ? body : usable));
  } else {
    const left = body.filter((item) => item.x + item.width / 2 < split);
    const right = body.filter((item) => item.x + item.width / 2 >= split);
    const leftText = linesFromItems(left);
    const rightText = linesFromItems(right);
    if (leftText) parts.push(leftText);
    if (rightText) parts.push(rightText);
  }

  return parts.filter(Boolean).join("\n\n");
}

export function reconstructPdfText(pages: PdfLayoutItem[][]): string {
  return pages
    .map((page, index) => {
      const text = reconstructPageText(page);
      if (!text) return "";
      return pages.length > 1 ? `--- Page ${index + 1} ---\n${text}` : text;
    })
    .filter(Boolean)
    .join("\n\n");
}

const SECTION_HEADING =
  /(^|\n)\s*(work experience|professional experience|experience|education|academic background|academics|skills|projects|summary|profile|certifications|awards|objective)\b/gi;

export function normalizeResumeText(text: string): string {
  return text
    .replace(/\u0000/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/(\w)-\n(\w)/g, "$1$2")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(SECTION_HEADING, (_match, prefix: string, heading: string) =>
      `${prefix}\n${heading.toUpperCase()}\n`,
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
