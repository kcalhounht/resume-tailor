"use client";

import { FormEvent, useEffect, useState } from "react";
import { EMPTY_PROFILE } from "@/lib/profile";
import type {
  CandidateProfile,
  EducationInput,
  ExperienceInput,
  PersonalInfo,
} from "@/lib/types";

const EMPTY_EXPERIENCE: ExperienceInput = {
  company: "",
  title: "",
  period: "",
  location: "",
};

const EMPTY_EDUCATION: EducationInput = {
  school: "",
  degree: "",
  discipline: "",
  period: "",
  location: "",
};

function cloneProfile(profile: CandidateProfile): CandidateProfile {
  return {
    personal: { ...profile.personal },
    experiences: profile.experiences.map((exp) => ({ ...exp })),
    education: profile.education.map((edu) => ({ ...edu })),
  };
}

export default function ProfileForm() {
  const [profile, setProfile] = useState<CandidateProfile>(() =>
    cloneProfile(EMPTY_PROFILE),
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/profile", { cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (!cancelled && response.ok && data?.profile) {
          setProfile(cloneProfile(data.profile));
        } else if (!cancelled && !response.ok) {
          setError(data?.error || "Failed to load profile");
        }
      } catch {
        if (!cancelled) setError("Failed to load profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function updatePersonal<K extends keyof PersonalInfo>(
    key: K,
    value: PersonalInfo[K],
  ) {
    setProfile((prev) => ({
      ...prev,
      personal: { ...prev.personal, [key]: value },
    }));
    setMessage(null);
  }

  function updateExperience(
    index: number,
    key: keyof ExperienceInput,
    value: string,
  ) {
    setProfile((prev) => ({
      ...prev,
      experiences: prev.experiences.map((exp, i) =>
        i === index ? { ...exp, [key]: value } : exp,
      ),
    }));
    setMessage(null);
  }

  function updateEducation(
    index: number,
    key: keyof EducationInput,
    value: string,
  ) {
    setProfile((prev) => ({
      ...prev,
      education: prev.education.map((edu, i) =>
        i === index ? { ...edu, [key]: value } : edu,
      ),
    }));
    setMessage(null);
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to save profile");
      }
      if (data.profile) setProfile(cloneProfile(data.profile));
      setMessage("Your information was saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  const { personal, experiences, education } = profile;

  if (loading) {
    return (
      <div className="profile-page-panel">
        <p className="hint">Loading your information…</p>
      </div>
    );
  }

  return (
    <form className="profile-page-panel composer" onSubmit={(e) => void onSave(e)}>
      <section className="profile-section">
        <div className="section-head">
          <div>
            <h2>Personal information</h2>
            <p className="hint">
              Update your contact details. Changes are saved to your account and
              used on generated resumes.
            </p>
          </div>
        </div>

        <div className="field-grid">
          <label className="field">
            <span>Full name</span>
            <input
              type="text"
              value={personal.name}
              onChange={(e) => updatePersonal("name", e.target.value)}
              placeholder="Jane Doe"
              autoComplete="name"
            />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={personal.email}
              onChange={(e) => updatePersonal("email", e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>
          <label className="field">
            <span>Phone</span>
            <input
              type="tel"
              value={personal.phone}
              onChange={(e) => updatePersonal("phone", e.target.value)}
              placeholder="+1 555 000 0000"
              autoComplete="tel"
            />
          </label>
          <label className="field">
            <span>Location</span>
            <input
              type="text"
              value={personal.location}
              onChange={(e) => updatePersonal("location", e.target.value)}
              placeholder="City, Country"
            />
          </label>
          <label className="field field-span">
            <span>LinkedIn URL</span>
            <input
              type="url"
              value={personal.linkedin}
              onChange={(e) => updatePersonal("linkedin", e.target.value)}
              placeholder="https://www.linkedin.com/in/…"
            />
          </label>
        </div>
      </section>

      <section className="profile-section">
        <div className="section-head">
          <div>
            <h2>Experience</h2>
            <p className="hint">Companies, titles, periods, and locations.</p>
          </div>
          <button
            type="button"
            className="ghost-btn"
            onClick={() =>
              setProfile((prev) => ({
                ...prev,
                experiences: [...prev.experiences, { ...EMPTY_EXPERIENCE }],
              }))
            }
          >
            + Add experience
          </button>
        </div>

        <div className="entry-list">
          {experiences.map((exp, index) => (
            <div key={`exp-${index}`} className="entry-card">
              <div className="entry-card-head">
                <span className="entry-label">Experience {index + 1}</span>
                {experiences.length > 1 && (
                  <button
                    type="button"
                    className="ghost-btn danger-text"
                    onClick={() =>
                      setProfile((prev) => ({
                        ...prev,
                        experiences: prev.experiences.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="field-grid">
                <label className="field">
                  <span>Company</span>
                  <input
                    type="text"
                    value={exp.company}
                    onChange={(e) =>
                      updateExperience(index, "company", e.target.value)
                    }
                  />
                </label>
                <label className="field">
                  <span>Title</span>
                  <input
                    type="text"
                    value={exp.title}
                    onChange={(e) =>
                      updateExperience(index, "title", e.target.value)
                    }
                  />
                </label>
                <label className="field">
                  <span>Period</span>
                  <input
                    type="text"
                    value={exp.period}
                    onChange={(e) =>
                      updateExperience(index, "period", e.target.value)
                    }
                    placeholder="Jan 2020 – Present"
                  />
                </label>
                <label className="field">
                  <span>Location</span>
                  <input
                    type="text"
                    value={exp.location}
                    onChange={(e) =>
                      updateExperience(index, "location", e.target.value)
                    }
                    placeholder="Remote"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="profile-section">
        <div className="section-head">
          <div>
            <h2>Education</h2>
            <p className="hint">School, degree, discipline, period, and location.</p>
          </div>
          <button
            type="button"
            className="ghost-btn"
            onClick={() =>
              setProfile((prev) => ({
                ...prev,
                education: [...prev.education, { ...EMPTY_EDUCATION }],
              }))
            }
          >
            + Add education
          </button>
        </div>

        <div className="entry-list">
          {education.map((edu, index) => (
            <div key={`edu-${index}`} className="entry-card">
              <div className="entry-card-head">
                <span className="entry-label">Education {index + 1}</span>
                {education.length > 1 && (
                  <button
                    type="button"
                    className="ghost-btn danger-text"
                    onClick={() =>
                      setProfile((prev) => ({
                        ...prev,
                        education: prev.education.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="field-grid">
                <label className="field">
                  <span>School</span>
                  <input
                    type="text"
                    value={edu.school}
                    onChange={(e) =>
                      updateEducation(index, "school", e.target.value)
                    }
                  />
                </label>
                <label className="field">
                  <span>Degree</span>
                  <input
                    type="text"
                    value={edu.degree}
                    onChange={(e) =>
                      updateEducation(index, "degree", e.target.value)
                    }
                  />
                </label>
                <label className="field">
                  <span>Discipline</span>
                  <input
                    type="text"
                    value={edu.discipline}
                    onChange={(e) =>
                      updateEducation(index, "discipline", e.target.value)
                    }
                    placeholder="Computer Science"
                  />
                </label>
                <label className="field">
                  <span>Period</span>
                  <input
                    type="text"
                    value={edu.period}
                    onChange={(e) =>
                      updateEducation(index, "period", e.target.value)
                    }
                    placeholder="2019 – 2023"
                  />
                </label>
                <label className="field">
                  <span>Location</span>
                  <input
                    type="text"
                    value={edu.location}
                    onChange={(e) =>
                      updateEducation(index, "location", e.target.value)
                    }
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>

      {error && <p className="error">{error}</p>}
      {message && <p className="profile-save-msg">{message}</p>}

      <div className="composer-footer profile-page-actions">
        <button type="submit" className="primary" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
