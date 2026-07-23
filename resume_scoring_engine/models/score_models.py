from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class RuleResult(BaseModel):
    rule_name: str
    score: float
    maximum_score: float
    detected_issues: list[str] = Field(default_factory=list)
    improvement_suggestions: list[str] = Field(default_factory=list)
    confidence_score: float = Field(ge=0.0, le=1.0, default=0.85)
    extras: dict[str, Any] = Field(default_factory=dict)


class CategoryScores(BaseModel):
    impact: float = 0.0
    keyword_alignment: float = 0.0
    experience_quality: float = 0.0
    writing_quality: float = 0.0
    ats_compatibility: float = 0.0


class ScoreReport(BaseModel):
    overall_score: float
    category_scores: CategoryScores
    rule_results: list[RuleResult]
    missing_keywords: list[str] = Field(default_factory=list)
    critical_issues: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)


class PersonalInfo(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    portfolio: Optional[str] = None


class SkillGroup(BaseModel):
    category: str = ""
    items: list[str] = Field(default_factory=list)


class Experience(BaseModel):
    company: str = ""
    title: str = ""
    period: str = ""
    location: str = ""
    overview: str = ""
    bullets: list[str] = Field(default_factory=list)


class Education(BaseModel):
    school: str = ""
    degree: str = ""
    discipline: str = ""
    period: str = ""
    location: str = ""


class ResumeInput(BaseModel):
    """Structured resume payload (preferred)."""

    personal: Optional[PersonalInfo] = None
    summary: str = ""
    skills: list[SkillGroup] = Field(default_factory=list)
    experiences: list[Experience] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    raw_text: str = ""
    formatting_flags: dict[str, bool] = Field(
        default_factory=dict,
        description=(
            "Optional ATS flags: tables, images, multi_column, "
            "headers_footers, unusual_symbols, complex_graphics"
        ),
    )


class ScoreRequest(BaseModel):
    resume: ResumeInput | dict[str, Any] | str
    job_description: str = ""


class ScoreResponse(ScoreReport):
    pass
