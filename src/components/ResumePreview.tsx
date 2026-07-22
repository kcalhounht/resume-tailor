"use client";

import type {
  EducationInput,
  PersonalInfo,
  SkillGroup,
  TailoredExperience,
  TailoredResume,
} from "@/lib/types";

type Props = {
  personal: PersonalInfo;
  resume: TailoredResume;
  coverLetter: string;
  title?: string;
  onPersonalChange: (personal: PersonalInfo) => void;
  onResumeChange: (resume: TailoredResume) => void;
  onCoverLetterChange: (coverLetter: string) => void;
};

function updateSkill(
  skills: SkillGroup[],
  index: number,
  patch: Partial<SkillGroup>,
): SkillGroup[] {
  return skills.map((skill, i) => (i === index ? { ...skill, ...patch } : skill));
}

function updateExperience(
  experiences: TailoredExperience[],
  index: number,
  patch: Partial<TailoredExperience>,
): TailoredExperience[] {
  return experiences.map((exp, i) =>
    i === index ? { ...exp, ...patch } : exp,
  );
}

function updateEducation(
  education: EducationInput[],
  index: number,
  patch: Partial<EducationInput>,
): EducationInput[] {
  return education.map((edu, i) => (i === index ? { ...edu, ...patch } : edu));
}

export default function ResumePreview({
  personal,
  resume,
  coverLetter,
  title,
  onPersonalChange,
  onResumeChange,
  onCoverLetterChange,
}: Props) {
  return (
    <article className="resume-preview resume-preview-editable">
      {title ? <p className="resume-preview-label">{title}</p> : null}
      <p className="resume-preview-edit-hint">
        Click any field to edit. Changes stay in Preview until you update
        downloads.
      </p>

      <header className="resume-preview-header">
        <input
          className="resume-preview-name-input"
          value={personal.name}
          onChange={(e) =>
            onPersonalChange({ ...personal, name: e.target.value })
          }
          placeholder="Full name"
          aria-label="Full name"
        />
        <div className="resume-preview-contact-grid">
          <input
            value={personal.phone}
            onChange={(e) =>
              onPersonalChange({ ...personal, phone: e.target.value })
            }
            placeholder="Phone"
            aria-label="Phone"
          />
          <input
            value={personal.email}
            onChange={(e) =>
              onPersonalChange({ ...personal, email: e.target.value })
            }
            placeholder="Email"
            aria-label="Email"
          />
          <input
            value={personal.linkedin}
            onChange={(e) =>
              onPersonalChange({ ...personal, linkedin: e.target.value })
            }
            placeholder="LinkedIn URL"
            aria-label="LinkedIn URL"
          />
          <input
            value={personal.location}
            onChange={(e) =>
              onPersonalChange({ ...personal, location: e.target.value })
            }
            placeholder="Location"
            aria-label="Location"
          />
        </div>
      </header>

      <section className="resume-preview-section">
        <h4>Summary</h4>
        <textarea
          className="resume-edit-area"
          rows={4}
          value={resume.summary}
          onChange={(e) =>
            onResumeChange({ ...resume, summary: e.target.value })
          }
          placeholder="Professional summary"
        />
      </section>

      <section className="resume-preview-section">
        <div className="resume-section-tools">
          <h4>Skills</h4>
          <button
            type="button"
            className="ghost-btn resume-add-btn"
            onClick={() =>
              onResumeChange({
                ...resume,
                skills: [...resume.skills, { category: "New group", items: [] }],
              })
            }
          >
            + Add group
          </button>
        </div>
        <div className="resume-preview-skills-edit">
          {resume.skills.map((group, index) => (
            <div key={index} className="resume-skill-row">
              <input
                className="resume-skill-category"
                value={group.category}
                onChange={(e) =>
                  onResumeChange({
                    ...resume,
                    skills: updateSkill(resume.skills, index, {
                      category: e.target.value,
                    }),
                  })
                }
                placeholder="Category"
                aria-label={`Skill category ${index + 1}`}
              />
              <input
                className="resume-skill-items"
                value={group.items.join(", ")}
                onChange={(e) =>
                  onResumeChange({
                    ...resume,
                    skills: updateSkill(resume.skills, index, {
                      items: e.target.value
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    }),
                  })
                }
                placeholder="Skill1, Skill2, Skill3"
                aria-label={`Skills in ${group.category || `group ${index + 1}`}`}
              />
              <button
                type="button"
                className="ghost-btn danger-text"
                onClick={() =>
                  onResumeChange({
                    ...resume,
                    skills: resume.skills.filter((_, i) => i !== index),
                  })
                }
                disabled={resume.skills.length <= 1}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="resume-preview-section">
        <div className="resume-section-tools">
          <h4>Experience</h4>
          <button
            type="button"
            className="ghost-btn resume-add-btn"
            onClick={() =>
              onResumeChange({
                ...resume,
                experiences: [
                  ...resume.experiences,
                  {
                    company: "",
                    title: "",
                    period: "",
                    location: "",
                    overview: "",
                    bullets: [""],
                  },
                ],
              })
            }
          >
            + Add experience
          </button>
        </div>

        {resume.experiences.map((exp, index) => (
          <div key={index} className="resume-preview-exp resume-edit-card">
            <div className="resume-edit-grid">
              <label>
                <span>Title</span>
                <input
                  value={exp.title}
                  onChange={(e) =>
                    onResumeChange({
                      ...resume,
                      experiences: updateExperience(resume.experiences, index, {
                        title: e.target.value,
                      }),
                    })
                  }
                />
              </label>
              <label>
                <span>Company</span>
                <input
                  value={exp.company}
                  onChange={(e) =>
                    onResumeChange({
                      ...resume,
                      experiences: updateExperience(resume.experiences, index, {
                        company: e.target.value,
                      }),
                    })
                  }
                />
              </label>
              <label>
                <span>Location</span>
                <input
                  value={exp.location}
                  onChange={(e) =>
                    onResumeChange({
                      ...resume,
                      experiences: updateExperience(resume.experiences, index, {
                        location: e.target.value,
                      }),
                    })
                  }
                />
              </label>
              <label>
                <span>Period</span>
                <input
                  value={exp.period}
                  onChange={(e) =>
                    onResumeChange({
                      ...resume,
                      experiences: updateExperience(resume.experiences, index, {
                        period: e.target.value,
                      }),
                    })
                  }
                />
              </label>
            </div>
            <label className="resume-edit-block">
              <span>Overview</span>
              <textarea
                className="resume-edit-area"
                rows={2}
                value={exp.overview}
                onChange={(e) =>
                  onResumeChange({
                    ...resume,
                    experiences: updateExperience(resume.experiences, index, {
                      overview: e.target.value,
                    }),
                  })
                }
              />
            </label>
            <label className="resume-edit-block">
              <span>Bullets (one per line)</span>
              <textarea
                className="resume-edit-area"
                rows={Math.max(4, exp.bullets.length + 1)}
                value={exp.bullets.join("\n")}
                onChange={(e) =>
                  onResumeChange({
                    ...resume,
                    experiences: updateExperience(resume.experiences, index, {
                      bullets: e.target.value.split("\n"),
                    }),
                  })
                }
              />
            </label>
            {resume.experiences.length > 1 && (
              <button
                type="button"
                className="ghost-btn danger-text"
                onClick={() =>
                  onResumeChange({
                    ...resume,
                    experiences: resume.experiences.filter((_, i) => i !== index),
                  })
                }
              >
                Remove experience
              </button>
            )}
          </div>
        ))}
      </section>

      <section className="resume-preview-section">
        <div className="resume-section-tools">
          <h4>Education</h4>
          <button
            type="button"
            className="ghost-btn resume-add-btn"
            onClick={() =>
              onResumeChange({
                ...resume,
                education: [
                  ...resume.education,
                  {
                    school: "",
                    degree: "",
                    discipline: "",
                    period: "",
                    location: "",
                  },
                ],
              })
            }
          >
            + Add education
          </button>
        </div>

        {resume.education.map((edu, index) => (
          <div key={index} className="resume-preview-edu resume-edit-card">
            <div className="resume-edit-grid">
              <label>
                <span>Degree</span>
                <input
                  value={edu.degree}
                  onChange={(e) =>
                    onResumeChange({
                      ...resume,
                      education: updateEducation(resume.education, index, {
                        degree: e.target.value,
                      }),
                    })
                  }
                />
              </label>
              <label>
                <span>Discipline</span>
                <input
                  value={edu.discipline}
                  onChange={(e) =>
                    onResumeChange({
                      ...resume,
                      education: updateEducation(resume.education, index, {
                        discipline: e.target.value,
                      }),
                    })
                  }
                />
              </label>
              <label>
                <span>School</span>
                <input
                  value={edu.school}
                  onChange={(e) =>
                    onResumeChange({
                      ...resume,
                      education: updateEducation(resume.education, index, {
                        school: e.target.value,
                      }),
                    })
                  }
                />
              </label>
              <label>
                <span>Location (optional)</span>
                <input
                  value={edu.location}
                  onChange={(e) =>
                    onResumeChange({
                      ...resume,
                      education: updateEducation(resume.education, index, {
                        location: e.target.value,
                      }),
                    })
                  }
                  placeholder="City, Country"
                />
              </label>
              <label>
                <span>Period</span>
                <input
                  value={edu.period}
                  onChange={(e) =>
                    onResumeChange({
                      ...resume,
                      education: updateEducation(resume.education, index, {
                        period: e.target.value,
                      }),
                    })
                  }
                />
              </label>
            </div>
            {resume.education.length > 1 && (
              <button
                type="button"
                className="ghost-btn danger-text"
                onClick={() =>
                  onResumeChange({
                    ...resume,
                    education: resume.education.filter((_, i) => i !== index),
                  })
                }
              >
                Remove education
              </button>
            )}
          </div>
        ))}
      </section>

      <section className="resume-preview-section">
        <h4>Cover letter</h4>
        <textarea
          className="resume-edit-area"
          rows={8}
          value={coverLetter}
          onChange={(e) => onCoverLetterChange(e.target.value)}
          placeholder="Cover letter paragraphs…"
        />
      </section>
    </article>
  );
}
