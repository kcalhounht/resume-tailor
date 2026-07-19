/** Split text into segments, bolding keyword matches (case-insensitive, longer first). */
export function segmentWithKeywords(
  text: string,
  keywords: string[],
): Array<{ text: string; bold: boolean }> {
  // Safety net: never render markdown bold markers in the final document
  const cleaned = String(text || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/__/g, "");

  const unique = Array.from(
    new Set(
      keywords
        .map((k) => k.trim())
        .filter((k) => k.length >= 2)
        .sort((a, b) => b.length - a.length),
    ),
  );

  if (!unique.length || !cleaned) {
    return [{ text: cleaned, bold: false }];
  }

  const escaped = unique.map((k) =>
    k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const pattern = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = cleaned.split(pattern);

  return parts
    .filter((part) => part.length > 0)
    .map((part) => {
      const isKeyword = unique.some(
        (k) => k.toLowerCase() === part.toLowerCase(),
      );
      return { text: part, bold: isKeyword };
    });
}

export function formatExtractedJd(extracted: {
  company: string;
  jobTitle: string;
  summary: string;
  type: string;
  salaryExpectation: string;
  workMode: string;
  hardTechnicalSkills: string[];
  softSkills: string[];
  mustHave?: string[];
  niceToHave?: string[];
  qualifications?: string[];
  responsibilities?: string[];
  requiredSkills?: string[];
  yearsOfExperience?: string;
  educationRequirements?: string;
  benefits?: string[];
  locationRequirement?: string;
}): string {
  const section = (title: string, items?: string[]) => {
    const list = items?.filter(Boolean) || [];
    if (!list.length) return [`${title}:`, "- (none listed)", ""];
    return [title + ":", ...list.map((s) => `- ${s}`), ""];
  };

  return [
    `Company: ${extracted.company}`,
    `Job Title: ${extracted.jobTitle}`,
    `Type: ${extracted.type}`,
    `Work Mode: ${extracted.workMode}`,
    `Location Requirement: ${extracted.locationRequirement || "Not specified"}`,
    `Salary Range: ${extracted.salaryExpectation}`,
    `Years of Experience: ${extracted.yearsOfExperience || "Not specified"}`,
    `Education Requirements: ${extracted.educationRequirements || "Not specified"}`,
    "",
    "Summary:",
    extracted.summary || "(none)",
    "",
    ...section("Must Have", extracted.mustHave),
    ...section("Required Skills", extracted.requiredSkills),
    ...section("Hard Technical Skills", extracted.hardTechnicalSkills),
    ...section("Qualifications", extracted.qualifications),
    ...section("Nice to Have", extracted.niceToHave),
    ...section("Responsibilities", extracted.responsibilities),
    ...section("Soft Skills", extracted.softSkills),
    ...section("Benefits", extracted.benefits),
  ]
    .join("\n")
    .trimEnd();
}
