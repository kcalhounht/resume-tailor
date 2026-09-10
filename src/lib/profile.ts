import type {
  CandidateProfile,
  EducationInput,
  ExperienceInput,
  PersonalInfo,
} from "./types";

export function emptyPersonal(): PersonalInfo {
  return {
    name: "",
    phone: "",
    linkedin: "",
    email: "",
    location: "",
  };
}

export function emptyExperience(): ExperienceInput {
  return {
    company: "",
    title: "",
    period: "",
    location: "",
  };
}

export function emptyEducation(): EducationInput {
  return {
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

export function parseProfileDraft(value: unknown): CandidateProfile | null {
  if (!isRecord(value) || !isRecord(value.personal)) return null;

  const experiences = Array.isArray(value.experiences)
    ? value.experiences.map((item) => {
        if (!isRecord(item)) return emptyExperience();
        return {
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
    email: profile.personal.email.trim(),
    location: profile.personal.location.trim(),
  };

  const experiences = profile.experiences
    .map((exp) => ({
      company: exp.company.trim(),
      title: exp.title.trim(),
      period: exp.period.trim(),
      location: exp.location.trim(),
    }))
    .filter(isExperienceComplete);

  const education = profile.education
    .map((edu) => ({
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
    edu.school.trim() && edu.degree.trim() && edu.period.trim(),
  );
}

export function isProfileReady(profile: CandidateProfile): boolean {
  const normalized = normalizeProfile(profile);
  return (
    normalized.personal.name.length >= 2 && normalized.experiences.length > 0
  );
}

export function profileBlockReason(profile: CandidateProfile): string | null {
  const normalized = normalizeProfile(profile);
  const missing: string[] = [];
  if (normalized.personal.name.length < 2) missing.push("your name");
  if (normalized.experiences.length === 0) {
    missing.push(
      "one complete experience (company, title, period, and location)",
    );
  }
  if (!missing.length) return null;
  return `Fill ${missing.join(" and ")} in Your background, then generate.`;
}
