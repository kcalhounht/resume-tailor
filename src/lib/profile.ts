import type { CandidateProfile } from "./types";

/** Empty profile for new signups — filled in by the user and saved to DB. */
export const EMPTY_PROFILE: CandidateProfile = {
  personal: {
    name: "",
    phone: "",
    linkedin: "",
    email: "",
    location: "",
  },
  experiences: [
    {
      company: "",
      title: "",
      period: "",
      location: "",
    },
  ],
  education: [
    {
      school: "",
      degree: "",
      discipline: "",
      period: "",
      location: "",
    },
  ],
};

/** @deprecated Use EMPTY_PROFILE or load from database */
export const CANDIDATE_PROFILE = EMPTY_PROFILE;

export const CANDIDATE_HEADLINE = "Software Engineer";
