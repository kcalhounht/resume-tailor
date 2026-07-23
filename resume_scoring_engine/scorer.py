from __future__ import annotations

from .analyzers.jd_parser import parse_job_description
from .analyzers.keyword_extractor import compare_keywords
from .analyzers.resume_parser import parse_resume
from .models import CategoryScores, ResumeInput, RuleResult, ScoreReport
from .rules import ALL_RULES, CATEGORY_RULE_NAMES
from .rules.base import ScoringContext


class ResumeScoringEngine:
    """Orchestrates modular rules and returns a normalized 0–100 score report."""

    def __init__(self, rules: list | None = None) -> None:
        self.rules = list(rules) if rules is not None else list(ALL_RULES)

    def score(
        self,
        resume: ResumeInput | dict | str,
        job_description: str = "",
    ) -> ScoreReport:
        parsed_resume = parse_resume(resume)
        parsed_jd = parse_job_description(job_description or "")
        keywords = compare_keywords(parsed_resume.corpus(), parsed_jd.raw)
        parsed_jd.important_keywords = keywords.important_keywords

        ctx = ScoringContext(
            resume=parsed_resume,
            jd=parsed_jd,
            keywords=keywords,
        )

        rule_results: list[RuleResult] = []
        for rule in self.rules:
            rule_results.append(rule.evaluate(ctx))

        by_name = {r.rule_name: r for r in rule_results}

        def cat_score(key: str) -> float:
            names = CATEGORY_RULE_NAMES[key]
            return round(sum(by_name[n].score for n in names if n in by_name), 1)

        category_scores = CategoryScores(
            impact=cat_score("impact"),
            keyword_alignment=cat_score("keyword_alignment"),
            experience_quality=cat_score("experience_quality"),
            writing_quality=cat_score("writing_quality"),
            ats_compatibility=cat_score("ats_compatibility"),
        )

        overall = round(
            category_scores.impact
            + category_scores.keyword_alignment
            + category_scores.experience_quality
            + category_scores.writing_quality
            + category_scores.ats_compatibility,
            1,
        )
        overall = max(0.0, min(100.0, overall))

        missing_keywords = list(keywords.missing)[:30]

        critical_issues: list[str] = []
        recommendations: list[str] = []
        for r in rule_results:
            # Critical: low score relative to max (<40%)
            if r.maximum_score > 0 and (r.score / r.maximum_score) < 0.4:
                critical_issues.extend(r.detected_issues[:2])
            recommendations.extend(r.improvement_suggestions[:2])

        # Deduplicate preserving order
        critical_issues = _unique(critical_issues)[:15]
        recommendations = _unique(recommendations)[:20]

        if missing_keywords:
            recommendations.insert(
                0,
                "Add missing JD keywords: " + ", ".join(missing_keywords[:8]),
            )
            recommendations = _unique(recommendations)[:20]

        return ScoreReport(
            overall_score=overall,
            category_scores=category_scores,
            rule_results=rule_results,
            missing_keywords=missing_keywords,
            critical_issues=critical_issues,
            recommendations=recommendations,
        )


def _unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        key = item.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out
