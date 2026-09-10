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
    edu.school.trim() && edu.degree.trim() && edu.period.trim(),
  );
}

export function isProfileReady(profile: CandidateProfile): boolean {
  const normalized = normalizeProfile(profile);
  return (
    normalized.personal.name.length >= 2 && normalized.experiences.length > 0
  );
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
    location: next.personal.location || current.personal.location,
  };
  const experiences = next.experiences.filter(
    (exp) => exp.company.trim() || exp.title.trim(),
  );
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
