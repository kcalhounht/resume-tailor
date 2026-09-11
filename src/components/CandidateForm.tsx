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
  type ProfileFieldIssue,
} from "@/lib/profile";

type CandidateFormProps = {
  profile: CandidateProfile;
  disabled?: boolean;
  issues?: ProfileFieldIssue[];
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
  required = true,
  issue,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
  issue?: ProfileFieldIssue;
}) {
  const errorId = `${id}-error`;
  return (
    <div
      className={`${className ? `field ${className}` : "field"}${issue ? " field-invalid" : ""}`}
    >
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        required={required}
        aria-required={required}
        aria-invalid={issue ? true : undefined}
        aria-describedby={issue ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      {issue ? (
        <p className="field-error" id={errorId}>
          {issue.message}
        </p>
      ) : null}
    </div>
  );
}

export default function CandidateForm({
  profile,
  disabled,
  issues = [],
  onChange,
}: CandidateFormProps) {
  const issueById = new Map(issues.map((issue) => [issue.id, issue]));
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
          issue={issueById.get("candidate-name")}
        />
        <Field
          id="candidate-email"
          label="Email"
          type="email"
          value={profile.personal.email}
          onChange={(value) => setPersonal("email", value)}
          placeholder="you@email.com"
          disabled={disabled}
          issue={issueById.get("candidate-email")}
        />
        <Field
          id="candidate-location"
          label="Location"
          value={profile.personal.location}
          onChange={(value) => setPersonal("location", value)}
          placeholder="City, Country"
          disabled={disabled}
          issue={issueById.get("candidate-location")}
        />
        <Field
          id="candidate-phone"
          label="Phone"
          value={profile.personal.phone}
          onChange={(value) => setPersonal("phone", value)}
          placeholder="+1 555 123 4567"
          disabled={disabled}
          issue={issueById.get("candidate-phone")}
        />
        <Field
          id="candidate-linkedin"
          label="LinkedIn"
          value={profile.personal.linkedin}
          onChange={(value) => setPersonal("linkedin", value)}
          placeholder="https://www.linkedin.com/in/…"
          disabled={disabled}
          issue={issueById.get("candidate-linkedin")}
        />
        <Field
          id="candidate-portfolio"
          label="Portfolio"
          value={profile.personal.portfolio}
          onChange={(value) => setPersonal("portfolio", value)}
          placeholder="https://your-site.com"
          disabled={disabled}
          required={false}
        />
      </div>

      <div className="profile-block">
        <div className="jd-item-head">
          <label>Experience</label>
        </div>
        <div className="profile-list">
          {profile.experiences.map((exp, index) => (
            <div key={exp.id || `experience-${index}`} className="profile-card">
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
                  issue={issueById.get(`exp-company-${index}`)}
                />
                <Field
                  id={`exp-title-${index}`}
                  label="Title"
                  value={exp.title}
                  onChange={(value) => setExperience(index, { title: value })}
                  placeholder="Software Engineer"
                  disabled={disabled}
                  issue={issueById.get(`exp-title-${index}`)}
                />
                <Field
                  id={`exp-period-${index}`}
                  label="Period"
                  value={exp.period}
                  onChange={(value) => setExperience(index, { period: value })}
                  placeholder="Jan 2020 – Present"
                  disabled={disabled}
                  issue={issueById.get(`exp-period-${index}`)}
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
                  issue={issueById.get(`exp-location-${index}`)}
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
              experiences: [
                ...(profile.experiences ?? []),
                emptyExperience(),
              ],
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
            <div key={edu.id || `education-${index}`} className="profile-card">
              <div className="jd-item-head">
                <label htmlFor={`edu-school-${index}`}>
                  School {index + 1}
                </label>
                {profile.education.length > 1 && (
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
                  issue={issueById.get(`edu-school-${index}`)}
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
                  issue={issueById.get(`edu-discipline-${index}`)}
                />
                <Field
                  id={`edu-degree-${index}`}
                  label="Degree"
                  value={edu.degree}
                  onChange={(value) => setEducation(index, { degree: value })}
                  placeholder="B.S."
                  disabled={disabled}
                  issue={issueById.get(`edu-degree-${index}`)}
                />
                <Field
                  id={`edu-period-${index}`}
                  label="Period"
                  value={edu.period}
                  onChange={(value) => setEducation(index, { period: value })}
                  placeholder="2016 – 2020"
                  disabled={disabled}
                  issue={issueById.get(`edu-period-${index}`)}
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
              education: [...(profile.education ?? []), emptyEducation()],
            })
          }
        >
          Add education
        </button>
      </div>
    </div>
  );
}
