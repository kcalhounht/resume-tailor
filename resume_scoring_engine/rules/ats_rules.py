from __future__ import annotations

import re

from ..models import RuleResult
from .base import ScoringContext


class SectionStructureRule:
    name = "resume_section_structure"
    maximum_score = 3.0

    EXPECTED = ("summary", "skills", "experience", "education")

    def evaluate(self, ctx: ScoringContext) -> RuleResult:
        present = ctx.resume.sections_present or {}
        # Infer from content if flags incomplete
        inferred = {
            "summary": bool(ctx.resume.summary.strip()) or present.get("summary", False),
            "skills": bool(ctx.resume.skills) or present.get("skills", False),
            "experience": bool(ctx.resume.experiences) or present.get("experience", False),
            "education": bool(ctx.resume.education) or present.get("education", False),
        }
        missing = [s for s in self.EXPECTED if not inferred.get(s)]
        found = 4 - len(missing)

        if found == 4:
            score = 3.0
        elif found >= 3:
            score = 2.0
        elif found >= 2:
            score = 1.0
        else:
            score = 0.0

        issues = []
        suggestions = []
        if missing:
            issues.append(f"Missing sections: {', '.join(missing)}")
            suggestions.append(
                "Include Summary, Skills, Experience, and Education for ATS parsing"
            )

        return RuleResult(
            rule_name=self.name,
            score=round(score, 1),
            maximum_score=self.maximum_score,
            detected_issues=issues,
            improvement_suggestions=suggestions,
            confidence_score=0.9,
            extras={"missing_sections": missing, "sections_found": inferred},
        )


class ContactInformationRule:
    name = "contact_information"
    maximum_score = 2.0

    def evaluate(self, ctx: ScoringContext) -> RuleResult:
        p = ctx.resume.personal
        raw = ctx.resume.raw_text or ""
        checks = {
            "name": bool(p and p.name) or bool(re.match(r"^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+", raw)),
            "email": bool(p and p.email) or bool(re.search(r"\S+@\S+\.\S+", raw)),
            "phone": bool(p and p.phone) or bool(re.search(r"\d{3}[\s.-]?\d{4}", raw)),
            "location": bool(p and p.location),
            "linkedin": bool(p and p.linkedin) or "linkedin.com" in raw.lower(),
            "portfolio_or_github": bool(
                (p and (p.github or p.portfolio))
                or "github.com" in raw.lower()
                or "portfolio" in raw.lower()
            ),
        }
        # Core 4 matter most: name, email, phone, one link/location
        core = ["name", "email", "phone"]
        core_ok = sum(1 for k in core if checks[k])
        extras_ok = sum(
            1 for k in ("location", "linkedin", "portfolio_or_github") if checks[k]
        )
        missing = [k for k, v in checks.items() if not v]

        if core_ok == 3 and extras_ok >= 2:
            score = 2.0
        elif core_ok >= 2 and extras_ok >= 1:
            score = 1.0
        elif core_ok >= 1:
            score = 0.5
        else:
            score = 0.0

        issues = []
        suggestions = []
        if missing:
            issues.append(f"Missing contact fields: {', '.join(missing)}")
            suggestions.append(
                "Add name, email, phone, location, LinkedIn, and GitHub/portfolio"
            )

        return RuleResult(
            rule_name=self.name,
            score=round(score, 1),
            maximum_score=self.maximum_score,
            detected_issues=issues,
            improvement_suggestions=suggestions,
            confidence_score=0.85,
            extras={"missing_information": missing, "checks": checks},
        )


class AtsFormattingRule:
    name = "ats_formatting"
    maximum_score = 5.0

    PENALTIES = {
        "tables": 2,
        "images": 3,
        "multi_column": 2,
        "headers_footers": 1,
        "unusual_symbols": 1,
        "complex_graphics": 2,
    }

    def evaluate(self, ctx: ScoringContext) -> RuleResult:
        flags = dict(ctx.resume.formatting_flags or {})
        raw = ctx.resume.raw_text or ""

        # Heuristic detection from raw text when flags absent
        if "tables" not in flags and re.search(r"\|.+\|", raw):
            flags["tables"] = True
        if "unusual_symbols" not in flags and re.search(
            r"[★☆✓✔➔➤◆❖☎✉]", raw
        ):
            flags["unusual_symbols"] = True
        if "images" not in flags and re.search(r"\[image\]|<img|base64", raw, re.I):
            flags["images"] = True

        penalties = []
        total_penalty = 0
        for key, cost in self.PENALTIES.items():
            if flags.get(key):
                penalties.append({"issue": key, "penalty": cost})
                total_penalty += cost

        score = max(0.0, 5.0 - total_penalty)

        issues = [p["issue"] for p in penalties]
        suggestions = []
        if penalties:
            suggestions.append(
                "Use a single-column plain-text layout without tables, images, or graphics"
            )

        return RuleResult(
            rule_name=self.name,
            score=round(score, 1),
            maximum_score=self.maximum_score,
            detected_issues=issues,
            improvement_suggestions=suggestions,
            confidence_score=0.8 if flags else 0.65,
            extras={"formatting_issues": issues, "penalties": penalties},
        )


ATS_RULES = [
    SectionStructureRule(),
    ContactInformationRule(),
    AtsFormattingRule(),
]
