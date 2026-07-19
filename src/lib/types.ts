export type JobType =
  | "AI Engineer"
  | "Data Engineer"
  | "Software Engineer"
  | "Data Analyst"
  | "Data Scientist";

export type WorkMode = "Remote" | "Hybrid" | "Onsite";

export interface PersonalInfo {
  name: string;
  phone: string;
  linkedin: string;
  email: string;
  location: string;
}

export interface ExperienceInput {
  company: string;
  title: string;
  period: string;
  location: string;
}

export interface EducationInput {
  school: string;
  degree: string;
  discipline: string;
  period: string;
  location: string;
}

export interface CandidateProfile {
  personal: PersonalInfo;
  experiences: ExperienceInput[];
  education: EducationInput[];
}

export interface ExtractedJD {
  company: string;
  jobTitle: string;
  summary: string;
  type: JobType;
  /** Salary / compensation range from the posting */
  salaryExpectation: string;
  workMode: WorkMode;
  /** Required technical skills (also used for ATS / resume mirroring) */
  hardTechnicalSkills: string[];
  softSkills: string[];
  /** Explicit must-have requirements from the JD */
  mustHave: string[];
  /** Nice-to-have / preferred / bonus requirements */
  niceToHave: string[];
  /** Degrees, certifications, licenses, experience thresholds */
  qualifications: string[];
  /** Core responsibilities / what you'll do */
  responsibilities: string[];
  /** All required skills listed in the JD (tech + domain) */
  requiredSkills: string[];
  /** e.g. "5+ years" or "Not specified" */
  yearsOfExperience: string;
  /** Education requirement text */
  educationRequirements: string;
  /** Benefits / perks if mentioned */
  benefits: string[];
  /** Location constraint beyond workMode */
  locationRequirement: string;
}

export interface TailoredExperience {
  company: string;
  title: string;
  period: string;
  location: string;
  /** Short blurb: what the company does + the candidate's responsibility */
  overview: string;
  bullets: string[];
}

export interface SkillGroup {
  category: string;
  items: string[];
}

export interface TailoredResume {
  summary: string;
  skills: SkillGroup[];
  experiences: TailoredExperience[];
  education: EducationInput[];
  keywords: string[];
}

export interface TailoredPackage {
  resume: TailoredResume;
  coverLetter: string;
}

export interface JobResult {
  index: number;
  jobUrl: string;
  company: string;
  folderPath: string;
  zipPath: string;
  zipName: string;
  extracted: ExtractedJD;
  error?: string;
}

export interface TailorRequest {
  jobUrls: string[];
  profile: CandidateProfile;
  indices?: number[];
  manualJds?: string[];
}
