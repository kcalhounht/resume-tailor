import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Packer,
  Paragraph,
  TextRun,
  UnderlineType,
} from "docx";
import path from "path";
import PDFDocument from "pdfkit";
import type { PersonalInfo, TailoredResume } from "./types";
import { segmentWithKeywords } from "./keywords";

const LINK_COLOR = "1F4E79";
const MUTED_COLOR = "555555";

/** Unicode-capable fonts — Helvetica cannot render Polish ł/ż/ń etc. */
const PDF_FONT = "ResumeSans";
const PDF_FONT_BOLD = "ResumeSans-Bold";
const PDF_FONT_ITALIC = "ResumeSans-Italic";

function fontPath(fileName: string): string {
  return path.join(process.cwd(), "assets", "fonts", fileName);
}

function registerPdfFonts(doc: PDFKit.PDFDocument) {
  doc.registerFont(PDF_FONT, fontPath("NotoSans-Regular.ttf"));
  doc.registerFont(PDF_FONT_BOLD, fontPath("NotoSans-Bold.ttf"));
  doc.registerFont(PDF_FONT_ITALIC, fontPath("NotoSans-Italic.ttf"));
}

function safeDecodeUri(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function linkedInDisplay(url: string): string {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    // Decode %C5%82 → ł so the contact line stays readable and shorter.
    const pathName = safeDecodeUri(parsed.pathname).replace(/\/+$/, "");
    return `linkedin.com${pathName}`;
  } catch {
    return safeDecodeUri(url)
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/+$/, "");
  }
}

function linkedInHref(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url.replace(/^\/+/, "")}`;
}

function phoneHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  return `tel:${digits}`;
}

function emailHref(email: string): string {
  return `mailto:${email}`;
}

function educationMetaLine(edu: {
  school: string;
  location?: string;
  period: string;
}): string {
  return [edu.school, edu.location?.trim(), edu.period]
    .filter(Boolean)
    .join("  |  ");
}

function contactSeparator() {
  return new TextRun({
    text: "  ·  ",
    size: 18,
    font: "Calibri",
    color: MUTED_COLOR,
  });
}

function hyperlinkRun(label: string, href: string) {
  return new ExternalHyperlink({
    link: href,
    children: [
      new TextRun({
        text: label,
        color: LINK_COLOR,
        size: 18,
        font: "Calibri",
        underline: {
          type: UnderlineType.NONE,
        },
      }),
    ],
  });
}

function plainContactRun(text: string) {
  return new TextRun({
    text,
    size: 18,
    font: "Calibri",
    color: MUTED_COLOR,
  });
}

function buildResumeHeader(
  personal: PersonalInfo,
  targetTitle?: string,
): Paragraph[] {
  const location = personal.location?.trim() || "";
  const email = personal.email && !/candidate@example\.com/i.test(personal.email)
    ? personal.email
    : "";
  const phone =
    personal.phone && !/^n\/?a$/i.test(personal.phone) ? personal.phone : "";
  const linkedin =
    personal.linkedin &&
    !/^linkedin\.com\/?$/i.test(personal.linkedin.trim())
      ? personal.linkedin
      : "";

  const contactBits: Array<{ label: string; href?: string }> = [];
  if (location) contactBits.push({ label: location });
  if (email) contactBits.push({ label: email, href: emailHref(email) });
  if (phone) contactBits.push({ label: phone, href: phoneHref(phone) });

  const contactChildren: Array<TextRun | ExternalHyperlink> = [];
  for (const item of contactBits) {
    if (contactChildren.length) {
      contactChildren.push(
        new TextRun({
          text: " | ",
          size: 18,
          font: "Calibri",
          color: MUTED_COLOR,
        }),
      );
    }
    if (item.href) contactChildren.push(hyperlinkRun(item.label, item.href));
    else contactChildren.push(plainContactRun(item.label));
  }

  const paragraphs: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: personal.name,
          bold: true,
          size: 36,
          font: "Calibri",
          color: "1A1A1A",
        }),
      ],
    }),
  ];

  if (targetTitle?.trim()) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [
          new TextRun({
            text: targetTitle.trim(),
            bold: true,
            size: 22,
            font: "Calibri",
            color: "1F4E79",
          }),
        ],
      }),
    );
  }

  if (contactChildren.length) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: linkedin ? 40 : 120 },
        border: linkedin
          ? undefined
          : {
              bottom: {
                style: BorderStyle.SINGLE,
                size: 12,
                color: "1F4E79",
                space: 8,
              },
            },
        children: contactChildren,
      }),
    );
  }

  if (linkedin) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        border: {
          bottom: {
            style: BorderStyle.SINGLE,
            size: 12,
            color: "1F4E79",
            space: 8,
          },
        },
        children: [
          hyperlinkRun(linkedInDisplay(linkedin), linkedInHref(linkedin)),
        ],
      }),
    );
  }

  return paragraphs;
}

function runsFromText(text: string, keywords: string[], size = 20) {
  return segmentWithKeywords(text, keywords).map(
    (seg) =>
      new TextRun({
        text: seg.text,
        bold: seg.bold,
        size,
        font: "Calibri",
      }),
  );
}

function sectionHeading(text: string) {
  return new Paragraph({
    spacing: { before: 280, after: 120 },
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 12, color: "222222", space: 6 },
    },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 22,
        font: "Calibri",
        allCaps: true,
        color: "1F4E79",
      }),
    ],
  });
}

function skillGroupParagraph(
  category: string,
  items: string[],
  keywords: string[],
) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({
        text: `• ${category}: `,
        bold: true,
        size: 20,
        font: "Calibri",
      }),
      ...runsFromText(items.join(", "), keywords, 20),
    ],
  });
}

export type ResumeDocOptions = {
  /** JD target title shown under the candidate name (Ivan template). */
  targetTitle?: string;
};

export async function buildResumeDocx(
  personal: PersonalInfo,
  resume: TailoredResume,
  options?: ResumeDocOptions,
): Promise<Buffer> {
  const kw = resume.keywords;
  const targetTitle = options?.targetTitle?.trim() || "";

  const children: Paragraph[] = [
    ...buildResumeHeader(personal, targetTitle),
    sectionHeading("Profile"),
    ...String(resume.summary || "")
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map(
        (para) =>
          new Paragraph({
            spacing: { after: 120, line: 276 },
            children: runsFromText(para, kw, 20),
          }),
      ),
    sectionHeading("Skills & Abilities"),
    ...resume.skills.map((group) =>
      skillGroupParagraph(group.category, group.items, kw),
    ),
    sectionHeading("Experience"),
  ];

  for (const [expIndex, exp] of resume.experiences.entries()) {
    const header = [exp.title, exp.company, exp.period]
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .join(" | ")
      .toUpperCase();
    children.push(
      new Paragraph({
        spacing: { before: expIndex === 0 ? 120 : 200, after: 80 },
        children: [
          new TextRun({
            text: header,
            bold: true,
            size: 20,
            font: "Calibri",
          }),
        ],
      }),
      ...exp.bullets.map(
        (bullet) =>
          new Paragraph({
            spacing: { after: 80, line: 276 },
            bullet: { level: 0 },
            children: runsFromText(bullet, kw, 20),
          }),
      ),
    );
  }

  children.push(sectionHeading("Education"));
  for (const [eduIndex, edu] of resume.education.entries()) {
    const degreeLine = [
      edu.discipline ? `${edu.degree} in ${edu.discipline}` : edu.degree,
      edu.period,
      edu.school,
    ]
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .join(" | ");
    children.push(
      new Paragraph({
        spacing: { before: eduIndex === 0 ? 100 : 140, after: 80 },
        children: [
          new TextRun({
            text: degreeLine,
            size: 20,
            font: "Calibri",
          }),
        ],
      }),
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

function drawSegmentedLine(
  doc: PDFKit.PDFDocument,
  text: string,
  keywords: string[],
  options: { fontSize?: number; continued?: boolean } = {},
) {
  const fontSize = options.fontSize ?? 10.5;
  const segments = segmentWithKeywords(text, keywords);
  if (!segments.length) {
    doc.font(PDF_FONT).fontSize(fontSize).text(" ");
    return;
  }

  // Keep PDFKit cursor valid after long continued runs
  if (!Number.isFinite(doc.x)) doc.x = doc.page.margins.left;
  if (!Number.isFinite(doc.y)) doc.y = doc.page.margins.top;

  segments.forEach((seg, i) => {
    doc
      .fillColor("#000000")
      .font(seg.bold ? PDF_FONT_BOLD : PDF_FONT)
      .fontSize(fontSize)
      .text(seg.text, {
        continued: i < segments.length - 1,
        lineGap: 2,
      });
  });
}

function drawPdfContactLine(
  doc: PDFKit.PDFDocument,
  parts: Array<{ label: string; href?: string }>,
) {
  const left = doc.page.margins.left;
  const usableWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  let y = Number.isFinite(doc.y) ? doc.y : doc.page.margins.top + 40;
  const sep = "  ·  ";
  const lineHeight = 13;

  doc.font(PDF_FONT).fontSize(9);

  if (!parts.length) {
    doc.x = left;
    doc.y = y;
    return;
  }

  // Never truncate emails/phones — wrap to the next line instead of overlapping.
  const sepWidth = doc.widthOfString(sep);
  const measured = parts.map((part) => ({
    ...part,
    width: doc.widthOfString(part.label),
  }));

  const lines: Array<typeof measured> = [[]];
  const lineWidths = [0];

  for (const part of measured) {
    const lineIndex = lines.length - 1;
    const current = lines[lineIndex];
    const used = lineWidths[lineIndex];
    const extra = (current.length ? sepWidth : 0) + part.width;

    // Prefer at most 2 contact items per line for readability.
    if (
      current.length &&
      (current.length >= 2 || used + extra > usableWidth)
    ) {
      lines.push([part]);
      lineWidths.push(part.width);
    } else {
      current.push(part);
      lineWidths[lineIndex] = used + extra;
    }
  }

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const totalWidth = lineWidths[li];
    let x = left + Math.max(0, (usableWidth - totalWidth) / 2);

    for (let i = 0; i < line.length; i++) {
      if (i > 0) {
        doc.fillColor("#555555").text(sep, x, y, { lineBreak: false });
        x += sepWidth;
      }

      const part = line[i];
      const width = part.width;

      doc
        .fillColor(part.href ? "#1F4E79" : "#555555")
        .text(part.label, x, y, { lineBreak: false, width });

      if (part.href && Number.isFinite(x) && Number.isFinite(width)) {
        doc.link(x, y - 1, width, 12, part.href);
      }

      x += width;
    }

    y += lineHeight;
  }

  doc.x = left;
  doc.y = y + 4;
}

export async function buildResumePdf(
  personal: PersonalInfo,
  resume: TailoredResume,
  options?: ResumeDocOptions,
): Promise<Buffer> {
  const kw = resume.keywords;
  const targetTitle = options?.targetTitle?.trim() || "";

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 50,
      size: "LETTER",
      info: {
        Title: `${personal.name} - Resume`,
        Author: personal.name,
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    registerPdfFonts(doc);

    doc
      .font(PDF_FONT_BOLD)
      .fontSize(18)
      .fillColor("#1A1A1A")
      .text(personal.name, {
        align: "center",
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      });

    if (targetTitle) {
      doc.moveDown(0.2);
      doc
        .font(PDF_FONT_BOLD)
        .fontSize(11)
        .fillColor("#1F4E79")
        .text(targetTitle, { align: "center" });
    }
    doc.moveDown(0.25);

    const contactParts: Array<{ label: string; href?: string }> = [];
    if (personal.location) contactParts.push({ label: personal.location });
    if (personal.email && !/candidate@example\.com/i.test(personal.email)) {
      contactParts.push({
        label: personal.email,
        href: emailHref(personal.email),
      });
    }
    if (personal.phone && !/^n\/?a$/i.test(personal.phone)) {
      contactParts.push({
        label: personal.phone,
        href: phoneHref(personal.phone),
      });
    }

    // Ivan style: Location | email | phone on one line
    if (contactParts.length) {
      const left = doc.page.margins.left;
      const right = doc.page.width - doc.page.margins.right;
      const y = doc.y;
      const labels = contactParts.map((p) => p.label);
      const joined = labels.join(" | ");
      doc
        .font(PDF_FONT)
        .fontSize(9)
        .fillColor("#555555")
        .text(joined, left, y, { width: right - left, align: "center" });
      // Approximate link regions for email/phone if present
      doc.y = y + 12;
    }

    if (
      personal.linkedin &&
      !/^linkedin\.com\/?$/i.test(personal.linkedin.trim())
    ) {
      const li = linkedInDisplay(personal.linkedin);
      const href = linkedInHref(personal.linkedin);
      const y = doc.y;
      doc
        .font(PDF_FONT)
        .fontSize(9)
        .fillColor("#1F4E79")
        .text(li, { align: "center", link: href });
      doc.y = Math.max(doc.y, y + 12);
    }

    const lineY = Number.isFinite(doc.y) ? doc.y + 2 : 90;
    doc
      .moveTo(doc.page.margins.left, lineY)
      .lineTo(doc.page.width - doc.page.margins.right, lineY)
      .strokeColor("#1F4E79")
      .lineWidth(1.2)
      .stroke();
    doc.x = doc.page.margins.left;
    doc.y = lineY + 16;
    doc.fillColor("#000000");

    const heading = (label: string) => {
      doc.moveDown(0.55);
      const y = Number.isFinite(doc.y) ? doc.y : doc.page.margins.top;
      doc.x = doc.page.margins.left;
      doc.y = y;
      doc
        .font(PDF_FONT_BOLD)
        .fontSize(11)
        .fillColor("#1F4E79")
        .text(label.toUpperCase());
      const ruleY = Number.isFinite(doc.y) ? doc.y + 3 : y + 14;
      doc
        .moveTo(doc.page.margins.left, ruleY)
        .lineTo(doc.page.width - doc.page.margins.right, ruleY)
        .strokeColor("#222222")
        .lineWidth(1)
        .stroke();
      doc.x = doc.page.margins.left;
      doc.y = ruleY + 12;
      doc.fillColor("#000000");
    };

    heading("Profile");
    for (const para of String(resume.summary || "")
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter(Boolean)) {
      drawSegmentedLine(doc, para, kw, { fontSize: 10.5 });
      doc.moveDown(0.35);
    }
    doc.moveDown(0.25);

    heading("Skills & Abilities");
    for (const group of resume.skills) {
      doc.font(PDF_FONT_BOLD).fontSize(10.5).text(`• ${group.category}: `, {
        continued: true,
      });
      drawSegmentedLine(doc, group.items.join(", "), kw, { fontSize: 10.5 });
      doc.moveDown(0.3);
    }

    heading("Experience");
    for (const [expIndex, exp] of resume.experiences.entries()) {
      doc.moveDown(expIndex === 0 ? 0.25 : 0.55);
      const header = [exp.title, exp.company, exp.period]
        .map((s) => String(s || "").trim())
        .filter(Boolean)
        .join(" | ")
        .toUpperCase();
      doc.font(PDF_FONT_BOLD).fontSize(10.5).text(header);
      doc.moveDown(0.2);
      for (const bullet of exp.bullets) {
        doc.font(PDF_FONT).fontSize(10.5).text("•  ", {
          continued: true,
        });
        drawSegmentedLine(doc, bullet, kw, { fontSize: 10.5 });
        doc.moveDown(0.28);
      }
    }

    heading("Education");
    for (const [eduIndex, edu] of resume.education.entries()) {
      doc.moveDown(eduIndex === 0 ? 0.25 : 0.45);
      const degreeLine = [
        edu.discipline ? `${edu.degree} in ${edu.discipline}` : edu.degree,
        edu.period,
        edu.school,
      ]
        .map((s) => String(s || "").trim())
        .filter(Boolean)
        .join(" | ");
      doc.font(PDF_FONT).fontSize(10.5).text(degreeLine);
    }

    doc.end();
  });
}

export async function buildCoverLetterDocx(
  personal: PersonalInfo,
  company: string,
  jobTitle: string,
  coverLetter: string,
  keywords: string[],
): Promise<Buffer> {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const paragraphs = coverLetter
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 720, right: 720 },
          },
        },
        children: [
          ...buildResumeHeader(personal),
          new Paragraph({
            spacing: { before: 160, after: 200 },
            children: [
              new TextRun({ text: today, size: 20, font: "Calibri" }),
            ],
          }),
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: "Hiring Manager",
                size: 20,
                font: "Calibri",
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({ text: company, size: 20, font: "Calibri" }),
            ],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `Re: ${jobTitle}`,
                bold: true,
                size: 20,
                font: "Calibri",
              }),
            ],
          }),
          ...paragraphs.map(
            (p) =>
              new Paragraph({
                spacing: { after: 160 },
                children: runsFromText(p, keywords, 20),
              }),
          ),
          new Paragraph({
            spacing: { before: 120 },
            children: [
              new TextRun({
                text: "Sincerely,",
                size: 20,
                font: "Calibri",
              }),
            ],
          }),
          new Paragraph({
            spacing: { before: 200 },
            children: [
              new TextRun({
                text: personal.name,
                bold: true,
                size: 20,
                font: "Calibri",
              }),
            ],
          }),
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}
