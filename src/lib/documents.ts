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
import PDFDocument from "pdfkit";
import type { EducationInput, PersonalInfo, TailoredResume } from "./types";
import { segmentWithKeywords } from "./keywords";
import {
  resumeLook,
  type ResumeFormat,
  type ResumeLook,
} from "./resume-format";

function docxFont(look: ResumeLook) {
  return {
    ascii: look.docxFont,
    hAnsi: look.docxFont,
    eastAsia: look.docxFont,
    cs: look.docxFont,
  };
}

function linkedInDisplay(url: string): string {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    const path = parsed.pathname.replace(/\/+$/, "");
    return `linkedin.com${path}`;
  } catch {
    return url
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/+$/, "");
  }
}

function linkedInHref(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url.replace(/^\/+/, "")}`;
}

function websiteDisplay(url: string): string {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    const host = parsed.hostname.replace(/^www\./i, "");
    const path = parsed.pathname.replace(/\/+$/, "");
    return path && path !== "/" ? `${host}${path}` : host;
  } catch {
    return url
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/+$/, "");
  }
}

function phoneHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  return `tel:${digits}`;
}

function educationSubline(edu: EducationInput): string {
  return [edu.school, edu.discipline, edu.period].filter(Boolean).join("  |  ");
}

function emailHref(email: string): string {
  return `mailto:${email}`;
}

function contactSeparator(look: ResumeLook) {
  return new TextRun({
    text: "  ·  ",
    size: look.contactSize,
    font: docxFont(look),
    color: look.muted,
  });
}

function hyperlinkRun(label: string, href: string, look: ResumeLook) {
  return new ExternalHyperlink({
    link: href,
    children: [
      new TextRun({
        text: label,
        color: look.accent,
        size: look.contactSize,
        font: docxFont(look),
        underline: {
          type: UnderlineType.NONE,
        },
      }),
    ],
  });
}

function plainContactRun(text: string, look: ResumeLook) {
  return new TextRun({
    text,
    size: look.contactSize,
    font: docxFont(look),
    color: look.muted,
  });
}

function displayName(name: string, look: ResumeLook) {
  return look.nameAllCaps ? name.toUpperCase() : name;
}

function headingLabel(text: string, look: ResumeLook) {
  return look.headingAllCaps ? text.toUpperCase() : text;
}

function buildResumeHeader(
  personal: PersonalInfo,
  headline: string | undefined,
  look: ResumeLook,
): Paragraph[] {
  const contactChildren: Array<TextRun | ExternalHyperlink> = [];

  const pushSep = () => {
    if (contactChildren.length) contactChildren.push(contactSeparator(look));
  };

  if (personal.phone) {
    pushSep();
    contactChildren.push(
      hyperlinkRun(personal.phone, phoneHref(personal.phone), look),
    );
  }
  if (personal.email) {
    pushSep();
    contactChildren.push(
      hyperlinkRun(personal.email, emailHref(personal.email), look),
    );
  }
  if (personal.linkedin) {
    pushSep();
    contactChildren.push(
      hyperlinkRun(
        linkedInDisplay(personal.linkedin),
        linkedInHref(personal.linkedin),
        look,
      ),
    );
  }
  if (personal.portfolio) {
    pushSep();
    contactChildren.push(
      hyperlinkRun(
        websiteDisplay(personal.portfolio),
        linkedInHref(personal.portfolio),
        look,
      ),
    );
  }
  if (personal.location) {
    pushSep();
    contactChildren.push(plainContactRun(personal.location, look));
  }

  return [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: headline ? 40 : 100 },
      children: [
        new TextRun({
          text: displayName(personal.name, look),
          bold: true,
          size: look.nameSize,
          font: docxFont(look),
          color: look.ink,
        }),
      ],
    }),
    ...(headline
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: headline,
                italics: true,
                size: look.headingSize,
                font: docxFont(look),
                color: look.accent,
              }),
            ],
          }),
        ]
      : []),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 160 },
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          size: 12,
          color: look.accent,
          space: 10,
        },
      },
      children: contactChildren,
    }),
  ];
}

function runsFromText(
  text: string,
  keywords: string[],
  size: number,
  look: ResumeLook,
) {
  return segmentWithKeywords(text, keywords).map(
    (seg) =>
      new TextRun({
        text: seg.text,
        bold: seg.bold,
        size,
        font: docxFont(look),
      }),
  );
}

function sectionHeading(text: string, look: ResumeLook) {
  return new Paragraph({
    spacing: { before: 280, after: 120 },
    border: {
      bottom: {
        style: BorderStyle.SINGLE,
        size: 12,
        color: look.headingRule,
        space: 6,
      },
    },
    children: [
      new TextRun({
        text: headingLabel(text, look),
        bold: true,
        size: look.headingSize,
        font: docxFont(look),
        allCaps: look.headingAllCaps,
        color: look.accent,
      }),
    ],
  });
}

function skillGroupParagraph(
  category: string,
  items: string[],
  keywords: string[],
  look: ResumeLook,
) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({
        text: `${category}: `,
        bold: true,
        size: look.bodySize,
        font: docxFont(look),
      }),
      ...runsFromText(items.join(", "), keywords, look.bodySize, look),
    ],
  });
}

export async function buildResumeDocx(
  personal: PersonalInfo,
  resume: TailoredResume,
  format?: ResumeFormat | null,
): Promise<Buffer> {
  const look = resumeLook(format);
  const kw = resume.keywords;

  const children: Paragraph[] = [
    ...buildResumeHeader(personal, resume.headline, look),
    sectionHeading("Summary", look),
    new Paragraph({
      spacing: { after: 140, line: 276 },
      children: runsFromText(resume.summary, kw, look.bodySize, look),
    }),
    sectionHeading("Skills", look),
    ...resume.skills.map((group) =>
      skillGroupParagraph(group.category, group.items, kw, look),
    ),
    sectionHeading("Experience", look),
  ];

  for (const [expIndex, exp] of resume.experiences.entries()) {
    children.push(
      new Paragraph({
        spacing: { before: expIndex === 0 ? 120 : 220, after: 40 },
        children: [
          new TextRun({
            text: exp.title,
            bold: true,
            size: look.headingSize,
            font: docxFont(look),
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 140 },
        children: [
          new TextRun({
            text: `${exp.company}  |  ${exp.location}  |  ${exp.period}`,
            italics: true,
            size: look.bodySize,
            font: docxFont(look),
          }),
        ],
      }),
      ...(exp.overview
        ? [
            new Paragraph({
              spacing: { after: 140, line: 276 },
              children: [
                new TextRun({
                  text: exp.overview,
                  size: look.bodySize,
                  font: docxFont(look),
                  italics: true,
                  color: "444444",
                }),
              ],
            }),
          ]
        : []),
      ...exp.bullets.map(
        (bullet) =>
          new Paragraph({
            spacing: { after: 90, line: 276 },
            bullet: { level: 0 },
            children: runsFromText(bullet, kw, look.bodySize, look),
          }),
      ),
    );
  }

  children.push(sectionHeading("Education", look));
  for (const [eduIndex, edu] of resume.education.entries()) {
    children.push(
      new Paragraph({
        spacing: { before: eduIndex === 0 ? 100 : 160, after: 40 },
        children: [
          new TextRun({
            text: edu.degree,
            bold: true,
            size: look.headingSize,
            font: docxFont(look),
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: educationSubline(edu),
            italics: true,
            size: look.bodySize,
            font: docxFont(look),
          }),
        ],
      }),
    );
  }

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: look.docxFont,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: look.marginTwip,
              bottom: look.marginTwip,
              left: look.marginTwip,
              right: look.marginTwip,
            },
          },
        },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

export async function buildCoverLetterDocx(
  personal: PersonalInfo,
  company: string,
  jobTitle: string,
  coverLetter: string,
  keywords: string[],
  format?: ResumeFormat | null,
): Promise<Buffer> {
  const look = resumeLook(format);
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
    styles: {
      default: {
        document: {
          run: {
            font: look.docxFont,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: look.marginTwip,
              bottom: look.marginTwip,
              left: look.marginTwip,
              right: look.marginTwip,
            },
          },
        },
        children: [
          ...buildResumeHeader(personal, undefined, look),
          new Paragraph({
            spacing: { before: 160, after: 200 },
            children: [
              new TextRun({
                text: today,
                size: look.bodySize,
                font: docxFont(look),
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: `Hiring Manager`,
                size: look.bodySize,
                font: docxFont(look),
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({
                text: company,
                size: look.bodySize,
                font: docxFont(look),
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `Re: ${jobTitle}`,
                bold: true,
                size: look.bodySize,
                font: docxFont(look),
              }),
            ],
          }),
          ...paragraphs.map(
            (p) =>
              new Paragraph({
                spacing: { after: 160 },
                children: runsFromText(p, keywords, look.bodySize, look),
              }),
          ),
          new Paragraph({
            spacing: { before: 120 },
            children: [
              new TextRun({
                text: "Sincerely,",
                size: look.bodySize,
                font: docxFont(look),
              }),
            ],
          }),
          new Paragraph({
            spacing: { before: 200 },
            children: [
              new TextRun({
                text: personal.name,
                bold: true,
                size: look.bodySize,
                font: docxFont(look),
              }),
            ],
          }),
        ],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
}

function drawSegmentedLine(
  doc: PDFKit.PDFDocument,
  text: string,
  keywords: string[],
  look: ResumeLook,
  options: { fontSize?: number; continued?: boolean } = {},
) {
  const fontSize = options.fontSize ?? look.pdfBodySize;
  const segments = segmentWithKeywords(text, keywords);
  if (!segments.length) {
    doc.font(look.pdfRegular).fontSize(fontSize).text(" ");
    return;
  }

  if (!Number.isFinite(doc.x)) doc.x = doc.page.margins.left;
  if (!Number.isFinite(doc.y)) doc.y = doc.page.margins.top;

  segments.forEach((seg, i) => {
    doc
      .fillColor("#000000")
      .font(seg.bold ? look.pdfBold : look.pdfRegular)
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
  look: ResumeLook,
) {
  const left = doc.page.margins.left;
  const usableWidth =
    doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const y = Number.isFinite(doc.y) ? doc.y : doc.page.margins.top + 40;
  const sep = " | ";
  const accent = `#${look.accent}`;

  doc.font(look.pdfRegular).fontSize(look.pdfMetaSize);
  const full = parts.map((p) => p.label).join(sep);
  let fullWidth = 0;
  try {
    fullWidth = doc.widthOfString(full);
  } catch {
    fullWidth = 0;
  }
  if (!Number.isFinite(fullWidth)) fullWidth = 0;

  let x = left + Math.max(0, (usableWidth - fullWidth) / 2);

  if (!Number.isFinite(x) || !Number.isFinite(y) || !parts.length) {
    doc.x = left;
    doc.y = Number.isFinite(y) ? y : 80;
    doc.fillColor(`#${look.muted}`).text(full || " ", {
      width: usableWidth,
      align: "center",
    });
    return;
  }

  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      const sepWidth = doc.widthOfString(sep);
      doc.fillColor(`#${look.muted}`).text(sep, x, y, { lineBreak: false });
      x += sepWidth;
    }

    const part = parts[i];
    const width = doc.widthOfString(part.label);
    doc
      .fillColor(part.href ? accent : `#${look.muted}`)
      .text(part.label, x, y, { lineBreak: false });

    if (part.href && Number.isFinite(x) && Number.isFinite(width)) {
      doc.link(x, y - 1, width, 12, part.href);
    }

    x += width;
  }

  doc.x = left;
  doc.y = y + 14;
}

export async function buildResumePdf(
  personal: PersonalInfo,
  resume: TailoredResume,
  format?: ResumeFormat | null,
): Promise<Buffer> {
  const look = resumeLook(format);
  const kw = resume.keywords;
  const accent = `#${look.accent}`;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: look.pdfMargin,
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

    doc
      .font(look.pdfBold)
      .fontSize(look.pdfNameSize)
      .fillColor(`#${look.ink}`)
      .text(displayName(personal.name, look), {
        align: "center",
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      });
    if (resume.headline) {
      doc.moveDown(0.15);
      doc
        .font(look.pdfItalic)
        .fontSize(look.pdfHeadingSize)
        .fillColor(accent)
        .text(resume.headline, {
          align: "center",
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        });
      doc.fillColor(`#${look.ink}`);
    }
    doc.moveDown(0.3);

    const contactParts: Array<{ label: string; href?: string }> = [];
    if (personal.phone) {
      contactParts.push({
        label: personal.phone,
        href: phoneHref(personal.phone),
      });
    }
    if (personal.email) {
      contactParts.push({
        label: personal.email,
        href: emailHref(personal.email),
      });
    }
    if (personal.linkedin) {
      contactParts.push({
        label: linkedInDisplay(personal.linkedin),
        href: linkedInHref(personal.linkedin),
      });
    }
    if (personal.portfolio) {
      contactParts.push({
        label: websiteDisplay(personal.portfolio),
        href: linkedInHref(personal.portfolio),
      });
    }
    if (personal.location) {
      contactParts.push({ label: personal.location });
    }

    drawPdfContactLine(doc, contactParts, look);

    const lineY = Number.isFinite(doc.y) ? doc.y + 2 : 90;
    doc
      .moveTo(doc.page.margins.left, lineY)
      .lineTo(doc.page.width - doc.page.margins.right, lineY)
      .strokeColor(accent)
      .lineWidth(1.2)
      .stroke();
    doc.x = doc.page.margins.left;
    doc.y = lineY + 16;
    doc.fillColor("#000000");

    const heading = (label: string) => {
      doc.moveDown(0.65);
      const y = Number.isFinite(doc.y) ? doc.y : doc.page.margins.top;
      doc.x = doc.page.margins.left;
      doc.y = y;
      doc
        .font(look.pdfBold)
        .fontSize(look.pdfHeadingSize)
        .fillColor(accent)
        .text(headingLabel(label, look));
      const ruleY = Number.isFinite(doc.y) ? doc.y + 3 : y + 14;
      doc
        .moveTo(doc.page.margins.left, ruleY)
        .lineTo(doc.page.width - doc.page.margins.right, ruleY)
        .strokeColor(`#${look.headingRule}`)
        .lineWidth(1)
        .stroke();
      doc.x = doc.page.margins.left;
      doc.y = ruleY + 12;
      doc.fillColor("#000000");
    };

    heading("Summary");
    drawSegmentedLine(doc, resume.summary, kw, look, {
      fontSize: look.pdfBodySize,
    });
    doc.moveDown(0.7);

    heading("Skills");
    for (const group of resume.skills) {
      doc
        .font(look.pdfBold)
        .fontSize(look.pdfBodySize)
        .text(`${group.category}: `, {
          continued: true,
        });
      drawSegmentedLine(doc, group.items.join(", "), kw, look, {
        fontSize: look.pdfBodySize,
      });
      doc.moveDown(0.35);
    }

    heading("Experience");
    for (const [expIndex, exp] of resume.experiences.entries()) {
      doc.moveDown(expIndex === 0 ? 0.35 : 0.7);
      doc.font(look.pdfBold).fontSize(look.pdfHeadingSize).text(exp.title);
      doc.moveDown(0.08);
      doc
        .font(look.pdfItalic)
        .fontSize(look.pdfMetaSize)
        .text(`${exp.company}  |  ${exp.location}  |  ${exp.period}`);
      if (exp.overview) {
        doc.moveDown(0.45);
        doc
          .font(look.pdfItalic)
          .fontSize(look.pdfMetaSize)
          .fillColor("#444444")
          .text(exp.overview, { lineGap: 2 });
        doc.fillColor("#000000");
      }
      doc.moveDown(0.5);
      for (const bullet of exp.bullets) {
        doc.font(look.pdfRegular).fontSize(look.pdfBodySize).text("•  ", {
          continued: true,
        });
        drawSegmentedLine(doc, bullet, kw, look, { fontSize: look.pdfBodySize });
        doc.moveDown(0.35);
      }
    }

    heading("Education");
    for (const [eduIndex, edu] of resume.education.entries()) {
      doc.moveDown(eduIndex === 0 ? 0.3 : 0.55);
      doc.font(look.pdfBold).fontSize(look.pdfHeadingSize).text(edu.degree);
      doc.moveDown(0.08);
      doc.font(look.pdfItalic).fontSize(look.pdfMetaSize).text(educationSubline(edu));
    }

    doc.end();
  });
}
