"use client";

import type {
  CandidateProfile,
  EducationInput,
  ExperienceInput,
  PersonalInfo,
} from "@/lib/types";
import {
  emptyEducation,
  emptyExperience,
} from "@/lib/profile";

type CandidateFormProps = {
  profile: CandidateProfile;
  disabled?: boolean;
  onChange: (profile: CandidateProfile) => void;
};

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={className ? `field ${className}` : "field"}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
    </div>
  );
}

export default function CandidateForm({
  profile,
  disabled,
  onChange,
}: CandidateFormProps) {
  function setPersonal<K extends keyof PersonalInfo>(
    key: K,
    value: PersonalInfo[K],
  ) {
    onChange({
      ...profile,
      personal: { ...profile.personal, [key]: value },
    });
  }

  function setExperience(index: number, patch: Partial<ExperienceInput>) {
    onChange({
      ...profile,
      experiences: profile.experiences.map((exp, i) =>
        i === index ? { ...exp, ...patch } : exp,
      ),
    });
  }

  function setEducation(index: number, patch: Partial<EducationInput>) {
    onChange({
      ...profile,
      education: profile.education.map((edu, i) =>
        i === index ? { ...edu, ...patch } : edu,
      ),
    });
  }

  return (
    <div className="profile-form">
      <div className="field-grid">
        <Field
          id="candidate-name"
          label="Full name"
          value={profile.personal.name}
          onChange={(value) => setPersonal("name", value)}
          placeholder="Jane Doe"
          disabled={disabled}
        />
        <Field
          id="candidate-email"
          label="Email"
          type="email"
          value={profile.personal.email}
          onChange={(value) => setPersonal("email", value)}
          placeholder="you@email.com"
          disabled={disabled}
        />
        <Field
          id="candidate-location"
          label="Location"
          value={profile.personal.location}
          onChange={(value) => setPersonal("location", value)}
          placeholder="City, Country"
          disabled={disabled}
        />
        <Field
          id="candidate-phone"
          label="Phone"
          value={profile.personal.phone}
          onChange={(value) => setPersonal("phone", value)}
          placeholder="+1 555 123 4567"
          disabled={disabled}
        />
        <Field
          id="candidate-linkedin"
          label="LinkedIn"
          value={profile.personal.linkedin}
          onChange={(value) => setPersonal("linkedin", value)}
          placeholder="https://www.linkedin.com/in/…"
          disabled={disabled}
        />
        <Field
          id="candidate-portfolio"
          label="Portfolio"
          value={profile.personal.portfolio}
          onChange={(value) => setPersonal("portfolio", value)}
          placeholder="https://your-site.com (optional)"
          disabled={disabled}
        />
      </div>

      <div className="profile-block">
        <div className="jd-item-head">
          <label>Experience</label>
        </div>
        <div className="profile-list">
          {profile.experiences.map((exp, index) => (
            <div key={index} className="profile-card">
              <div className="jd-item-head">
                <label htmlFor={`exp-company-${index}`}>Role {index + 1}</label>
                {profile.experiences.length > 1 && (
                  <button
                    type="button"
                    className="text-btn section-remove"
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        ...profile,
                        experiences: profile.experiences.filter(
                          (_, i) => i !== index,
                        ),
                      })
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="field-grid">
                <Field
                  id={`exp-company-${index}`}
                  label="Company"
                  value={exp.company}
                  onChange={(value) => setExperience(index, { company: value })}
                  placeholder="Acme"
                  disabled={disabled}
                />
                <Field
                  id={`exp-title-${index}`}
                  label="Title"
                  value={exp.title}
                  onChange={(value) => setExperience(index, { title: value })}
                  placeholder="Software Engineer"
                  disabled={disabled}
                />
                <Field
                  id={`exp-period-${index}`}
                  label="Period"
                  value={exp.period}
                  onChange={(value) => setExperience(index, { period: value })}
                  placeholder="Jan 2020 – Present"
                  disabled={disabled}
                />
                <Field
                  id={`exp-location-${index}`}
                  label="Location"
                  value={exp.location}
                  onChange={(value) =>
                    setExperience(index, { location: value })
                  }
                  placeholder="Remote"
                  disabled={disabled}
                />
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="text-btn add-job"
          disabled={disabled}
          onClick={() =>
            onChange({
              ...profile,
              experiences: [...profile.experiences, emptyExperience()],
            })
          }
        >
          Add experience
        </button>
      </div>

      <div className="profile-block">
        <div className="jd-item-head">
          <label>Education</label>
        </div>
        <div className="profile-list">
          {profile.education.map((edu, index) => (
            <div key={index} className="profile-card">
              <div className="jd-item-head">
                <label htmlFor={`edu-school-${index}`}>
                  School {index + 1}
                </label>
                {profile.education.length > 0 && (
                  <button
                    type="button"
                    className="text-btn section-remove"
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        ...profile,
                        education: profile.education.filter((_, i) => i !== index),
                      })
                    }
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="field-grid">
                <Field
                  id={`edu-school-${index}`}
                  label="School"
                  value={edu.school}
                  onChange={(value) => setEducation(index, { school: value })}
                  placeholder="University"
                  disabled={disabled}
                />
                <Field
                  id={`edu-discipline-${index}`}
                  label="Discipline"
                  value={edu.discipline}
                  onChange={(value) =>
                    setEducation(index, { discipline: value })
                  }
                  placeholder="Computer Science"
                  disabled={disabled}
                />
                <Field
                  id={`edu-degree-${index}`}
                  label="Degree"
                  value={edu.degree}
                  onChange={(value) => setEducation(index, { degree: value })}
                  placeholder="B.S."
                  disabled={disabled}
                />
                <Field
                  id={`edu-period-${index}`}
                  label="Period"
                  value={edu.period}
                  onChange={(value) => setEducation(index, { period: value })}
                  placeholder="2016 – 2020"
                  disabled={disabled}
                />
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="text-btn add-job"
          disabled={disabled}
          onClick={() =>
            onChange({
              ...profile,
              education: [...profile.education, emptyEducation()],
            })
          }
        >
          Add education
        </button>
      </div>
    </div>
  );
}
