export function sanitizeCompanyFolderName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
  return cleaned || "Unknown_Company";
}

/** Safe zip filename segment: keeps readability, strips path-hostile chars. */
export function sanitizeZipSegment(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, " ")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 80);
  return cleaned || "Unknown";
}

export function profileFirstName(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] || "Candidate";
  return sanitizeZipSegment(first).replace(/\s+/g, "") || "Candidate";
}

export function buildDocumentFileNames(fullName: string) {
  const first = profileFirstName(fullName);
  return {
    resumeDocx: `Resume-${first}.docx`,
    resumePdf: `Resume-${first}.pdf`,
    coverLetterDocx: `Coverletter-${first}.docx`,
    coverLetterTxt: `Coverletter-${first}.txt`,
  };
}

export function buildZipFileName(
  company: string,
  role: string,
  suffix?: string,
): string {
  const companyPart = sanitizeZipSegment(company);
  const rolePart = sanitizeZipSegment(role);
  const suffixPart = suffix
    ? `-${sanitizeZipSegment(suffix).replace(/\s+/g, "")}`
    : "";
  return `${companyPart}-${rolePart}${suffixPart}.zip`;
}
