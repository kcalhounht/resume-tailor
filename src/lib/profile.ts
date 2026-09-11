import type {
  CandidateProfile,
  EducationInput,
  ExperienceInput,
  PersonalInfo,
} from "./types";

function newItemId(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === "function") {
    return webCrypto.randomUUID();
  }
  return `id-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export function emptyPersonal(): PersonalInfo {
  return {
    name: "",
    phone: "",
    linkedin: "",
    portfolio: "",
    email: "",
    location: "",
  };
}

export function emptyExperience(): ExperienceInput {
  return {
    id: newItemId(),
    company: "",
    title: "",
    period: "",
    location: "",
  };
}

export function emptyEducation(): EducationInput {
  return {
    id: newItemId(),
    school: "",
    discipline: "",
    degree: "",
    period: "",
  };
}

export function emptyProfile(): CandidateProfile {
  return {
    personal: emptyPersonal(),
    experiences: [emptyExperience()],
    education: [emptyEducation()],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidProfileEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export const REQUIRED_PROFILE_MESSAGE =
  "You should fill all required profile forms.";

export function parseProfileDraft(value: unknown): CandidateProfile | null {
  if (!isRecord(value) || !isRecord(value.personal)) return null;

  const experiences = Array.isArray(value.experiences)
    ? value.experiences.map((item) => {
        if (!isRecord(item)) return emptyExperience();
        return {
          id: asString(item.id) || newItemId(),
          company: asString(item.company),
          title: asString(item.title),
          period: asString(item.period),
          location: asString(item.location),
        };
      })
    : [];
  const education = Array.isArray(value.education)
    ? value.education.map((item) => {
        if (!isRecord(item)) return emptyEducation();
        return {
          id: asString(item.id) || newItemId(),
          school: asString(item.school),
          discipline: asString(item.discipline),
          degree: asString(item.degree),
          period: asString(item.period),
        };
      })
    : [];

  return {
    personal: {
      name: asString(value.personal.name),
      phone: asString(value.personal.phone),
      linkedin: asString(value.personal.linkedin),
      portfolio: asString(value.personal.portfolio),
      email: asString(value.personal.email),
      location: asString(value.personal.location),
    },
    experiences: experiences.length ? experiences : [emptyExperience()],
    education: education.length ? education : [emptyEducation()],
  };
}

export function normalizeProfile(profile: CandidateProfile): CandidateProfile {
  const personal: PersonalInfo = {
    name: profile.personal.name.trim(),
    phone: profile.personal.phone.trim(),
    linkedin: profile.personal.linkedin.trim(),
    portfolio: profile.personal.portfolio.trim(),
    email: profile.personal.email.trim(),
    location: profile.personal.location.trim(),
  };

  const experiences = profile.experiences
    .map((exp) => ({
      id: exp.id || newItemId(),
      company: exp.company.trim(),
      title: exp.title.trim(),
      period: exp.period.trim(),
      location: exp.location.trim(),
    }))
    .filter(isExperienceComplete);

  const education = profile.education
    .map((edu) => ({
      id: edu.id || newItemId(),
      school: edu.school.trim(),
      discipline: edu.discipline.trim(),
      degree: edu.degree.trim(),
      period: edu.period.trim(),
    }))
    .filter(isEducationComplete);

  return { personal, experiences, education };
}

export function isExperienceComplete(exp: ExperienceInput): boolean {
  return Boolean(
    exp.company.trim() &&
      exp.title.trim() &&
      exp.period.trim() &&
      exp.location.trim(),
  );
}

export function isEducationComplete(edu: EducationInput): boolean {
  return Boolean(
    edu.school.trim() &&
      edu.discipline.trim() &&
      edu.degree.trim() &&
      edu.period.trim(),
  );
}

export function isPersonalComplete(personal: PersonalInfo): boolean {
  return Boolean(
    personal.name.trim().length >= 2 &&
      isValidProfileEmail(personal.email) &&
      personal.location.trim() &&
      personal.phone.trim() &&
      personal.linkedin.trim(),
  );
}

function hasExperienceValues(exp: ExperienceInput): boolean {
  return Boolean(
    exp.company.trim() ||
      exp.title.trim() ||
      exp.period.trim() ||
      exp.location.trim(),
  );
}

function hasEducationValues(edu: EducationInput): boolean {
  return Boolean(
    edu.school.trim() ||
      edu.discipline.trim() ||
      edu.degree.trim() ||
      edu.period.trim(),
  );
}

export type ProfileFieldIssue = {
  id: string;
  label: string;
  message: string;
};

function addIfEmpty(
  issues: ProfileFieldIssue[],
  id: string,
  label: string,
  value: string,
) {
  if (!value.trim()) {
    issues.push({ id, label, message: "Required" });
  }
}

export function listProfileFieldIssues(
  profile: CandidateProfile,
): ProfileFieldIssue[] {
  const issues: ProfileFieldIssue[] = [];
  const personal = profile.personal;
  if (personal.name.trim().length < 2) {
    issues.push({
      id: "candidate-name",
      label: "Full name",
      message: personal.name.trim()
        ? "Enter at least 2 characters."
        : "Required",
    });
  }
  if (!personal.email.trim()) {
    issues.push({
      id: "candidate-email",
      label: "Email",
      message: "Required",
    });
  } else if (!isValidProfileEmail(personal.email)) {
    issues.push({
      id: "candidate-email",
      label: "Email",
      message: "Enter a valid email.",
    });
  }
  addIfEmpty(issues, "candidate-location", "Location", personal.location);
  addIfEmpty(issues, "candidate-phone", "Phone", personal.phone);
  addIfEmpty(issues, "candidate-linkedin", "LinkedIn", personal.linkedin);

  if (!profile.experiences.length) {
    issues.push({
      id: "exp-company-0",
      label: "at least one experience",
      message: "Required",
    });
  }
  profile.experiences.forEach((exp, index) => {
    if (index > 0 && !hasExperienceValues(exp)) return;
    const role = `Role ${index + 1}`;
    addIfEmpty(issues, `exp-company-${index}`, `${role} company`, exp.company);
    addIfEmpty(issues, `exp-title-${index}`, `${role} title`, exp.title);
    addIfEmpty(issues, `exp-period-${index}`, `${role} period`, exp.period);
    addIfEmpty(issues, `exp-location-${index}`, `${role} location`, exp.location);
  });

  if (!profile.education.length) {
    issues.push({
      id: "edu-school-0",
      label: "at least one education",
      message: "Required",
    });
  }
  profile.education.forEach((edu, index) => {
    if (index > 0 && !hasEducationValues(edu)) return;
    const school = `School ${index + 1}`;
    addIfEmpty(issues, `edu-school-${index}`, `${school} school`, edu.school);
    addIfEmpty(
      issues,
      `edu-discipline-${index}`,
      `${school} discipline`,
      edu.discipline,
    );
    addIfEmpty(issues, `edu-degree-${index}`, `${school} degree`, edu.degree);
    addIfEmpty(issues, `edu-period-${index}`, `${school} period`, edu.period);
  });

  return issues;
}

export function isProfileReady(profile: CandidateProfile): boolean {
  return listProfileFieldIssues(profile).length === 0;
}

export function mergeImportedProfile(
  current: CandidateProfile,
  imported: CandidateProfile,
): CandidateProfile {
  const next = parseProfileDraft(imported) ?? emptyProfile();
  const personal: PersonalInfo = {
    name: next.personal.name || current.personal.name,
    phone: next.personal.phone || current.personal.phone,
    linkedin: next.personal.linkedin || current.personal.linkedin,
    portfolio: next.personal.portfolio || current.personal.portfolio,
    email: next.personal.email || current.personal.email,
    location: next.personal.location || current.personal.location || "Remote",
  };
  const experiences = next.experiences
    .filter((exp) => exp.company.trim() || exp.title.trim())
    .map((exp) => ({
      ...exp,
      location: exp.location.trim() || "Remote",
    }));
  const education = next.education.filter(
    (edu) => edu.school.trim() || edu.degree.trim(),
  );
  return {
    personal,
    experiences: experiences.length ? experiences : current.experiences,
    education: education.length ? education : current.education,
  };
}

export function profileBlockReason(profile: CandidateProfile): string | null {
  if (!listProfileFieldIssues(profile).length) return null;
  return REQUIRED_PROFILE_MESSAGE;
}
