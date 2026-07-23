from __future__ import annotations

import re
from dataclasses import dataclass, field

from ..models import Education, Experience, PersonalInfo, ResumeInput, SkillGroup


SECTION_PATTERNS = {
    "summary": re.compile(
        r"\b(summary|profile|professional summary|about)\b", re.I
    ),
    "skills": re.compile(r"\b(skills|technical skills|core competencies)\b", re.I),
    "experience": re.compile(
        r"\b(experience|work experience|professional experience|employment)\b",
        re.I,
    ),
    "education": re.compile(r"\b(education|academic)\b", re.I),
}

EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)
PHONE_RE = re.compile(
    r"(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}"
)
LINKEDIN_RE = re.compile(r"linkedin\.com/\S+", re.I)
GITHUB_RE = re.compile(r"github\.com/\S+", re.I)
BULLET_RE = re.compile(r"^\s*[-•*▪►]\s+(.+)$", re.M)


@dataclass
class ParsedResume:
    personal: PersonalInfo = field(default_factory=PersonalInfo)
    summary: str = ""
    skills: list[SkillGroup] = field(default_factory=list)
    experiences: list[Experience] = field(default_factory=list)
    education: list[Education] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)
    raw_text: str = ""
    sections_present: dict[str, bool] = field(default_factory=dict)
    formatting_flags: dict[str, bool] = field(default_factory=dict)

    @property
    def all_bullets(self) -> list[str]:
        out: list[str] = []
        for exp in self.experiences:
            for b in exp.bullets:
                t = str(b or "").strip()
                if t:
                    out.append(t)
        return out

    @property
    def skill_items(self) -> list[str]:
        items: list[str] = []
        for g in self.skills:
            items.extend([str(i).strip() for i in g.items if str(i).strip()])
        return items

    def corpus(self) -> str:
        parts = [
            self.summary,
            *[g.category for g in self.skills],
            *self.skill_items,
            *[
                " ".join(
                    [
                        e.title,
                        e.company,
                        e.overview,
                        " ".join(e.bullets),
                    ]
                )
                for e in self.experiences
            ],
            self.raw_text,
        ]
        return " ".join(p for p in parts if p).lower()


def parse_resume(data: ResumeInput | dict | str) -> ParsedResume:
    if isinstance(data, str):
        return _parse_raw_text(data)
    if isinstance(data, dict):
        if "raw_text" in data and len(data) == 1:
            return _parse_raw_text(str(data["raw_text"]))
        resume = ResumeInput.model_validate(data)
    else:
        resume = data

    if resume.raw_text and not resume.experiences and not resume.summary:
        parsed = _parse_raw_text(resume.raw_text)
        parsed.formatting_flags = dict(resume.formatting_flags or {})
        if resume.personal:
            parsed.personal = resume.personal
        return parsed

    sections = {
        "summary": bool(resume.summary.strip()),
        "skills": bool(resume.skills),
        "experience": bool(resume.experiences),
        "education": bool(resume.education),
    }
    personal = resume.personal or PersonalInfo()
    return ParsedResume(
        personal=personal,
        summary=resume.summary or "",
        skills=list(resume.skills or []),
        experiences=list(resume.experiences or []),
        education=list(resume.education or []),
        keywords=list(resume.keywords or []),
        raw_text=resume.raw_text or "",
        sections_present=sections,
        formatting_flags=dict(resume.formatting_flags or {}),
    )


def _parse_raw_text(text: str) -> ParsedResume:
    text = text or ""
    personal = PersonalInfo(
        email=_first(EMAIL_RE, text),
        phone=_first(PHONE_RE, text),
        linkedin=_first(LINKEDIN_RE, text),
        github=_first(GITHUB_RE, text),
    )
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    if lines and not personal.name:
        # Heuristic: first non-contact line is name
        for ln in lines[:5]:
            if EMAIL_RE.search(ln) or PHONE_RE.search(ln) or "http" in ln.lower():
                continue
            if len(ln.split()) <= 5 and not SECTION_PATTERNS["summary"].search(ln):
                personal.name = ln
                break

    sections = {k: bool(p.search(text)) for k, p in SECTION_PATTERNS.items()}
    bullets = [m.group(1).strip() for m in BULLET_RE.finditer(text)]
    summary = _extract_section(text, "summary", "skills")
    skills_text = _extract_section(text, "skills", "experience")
    skill_items = [
        s.strip()
        for s in re.split(r"[,|/•\n]", skills_text)
        if 1 < len(s.strip()) < 40
    ][:40]
    skills = [SkillGroup(category="Skills", items=skill_items)] if skill_items else []

    experiences: list[Experience] = []
    if bullets:
        experiences.append(
            Experience(
                company="",
                title="Experience",
                bullets=bullets,
            )
        )

    return ParsedResume(
        personal=personal,
        summary=summary,
        skills=skills,
        experiences=experiences,
        education=[],
        raw_text=text,
        sections_present=sections,
    )


def _first(pattern: re.Pattern[str], text: str) -> str | None:
    m = pattern.search(text or "")
    return m.group(0) if m else None


def _extract_section(text: str, start_key: str, end_key: str) -> str:
    start = SECTION_PATTERNS[start_key].search(text)
    if not start:
        return ""
    end = SECTION_PATTERNS[end_key].search(text, start.end())
    chunk = text[start.end() : end.start() if end else None]
    return chunk.strip()
