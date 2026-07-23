from __future__ import annotations

import re

from ..analyzers.text_analyzer import (
    COMPLEXITY_TERMS,
    OWNERSHIP_TERMS,
    seniority_rank,
)
from ..models import RuleResult
from .base import ScoringContext


class OwnershipLeadershipRule:
    name = "ownership_and_leadership"
    maximum_score = 5.0

    def evaluate(self, ctx: ScoringContext) -> RuleResult:
        corpus = ctx.resume.corpus()
        hits = [t for t in OWNERSHIP_TERMS if re.search(rf"\b{t}\b", corpus, re.I)]
        count = len(hits)
        bullets = ctx.resume.all_bullets
        owned_bullets = sum(
            1
            for b in bullets
            if any(re.search(rf"\b{t}\b", b, re.I) for t in OWNERSHIP_TERMS)
        )
        ratio = owned_bullets / max(len(bullets), 1)

        if count >= 4 and ratio >= 0.25:
            score = 5.0
        elif count >= 3 or ratio >= 0.2:
            score = 4.0
        elif count >= 1:
            score = 2.5
        else:
            score = 0.5 if bullets else 0.0

        issues = []
        suggestions = []
        if score < 4:
            issues.append("Limited ownership/leadership language")
            suggestions.append(
                "Use Owned/Led/Architected/Managed/Drove with decision-making outcomes"
            )

        return RuleResult(
            rule_name=self.name,
            score=round(score, 1),
            maximum_score=self.maximum_score,
            detected_issues=issues,
            improvement_suggestions=suggestions,
            confidence_score=0.9,
            extras={"ownership_terms_found": hits, "ownership_bullet_ratio": round(ratio, 3)},
        )


class TechnicalComplexityRule:
    name = "technical_complexity_and_scale"
    maximum_score = 5.0

    def evaluate(self, ctx: ScoringContext) -> RuleResult:
        corpus = ctx.resume.corpus()
        hits = [t for t in COMPLEXITY_TERMS if t in corpus]
        # Scale numbers boost
        scale_nums = len(
            re.findall(
                r"\b\d+\s*(?:k|m|million|billion|tb|gb|qps|rps)\b",
                corpus,
                re.I,
            )
        )
        strength = len(hits) + min(3, scale_nums)

        if strength >= 6:
            score = 5.0
        elif strength >= 4:
            score = 4.0
        elif strength >= 2:
            score = 2.5
        else:
            score = 1.0 if strength else 0.0

        issues = []
        suggestions = []
        if score < 4:
            issues.append("Limited evidence of production/scale complexity")
            suggestions.append(
                "Mention production systems, cloud infra, distributed systems, datasets, or HA"
            )

        return RuleResult(
            rule_name=self.name,
            score=round(score, 1),
            maximum_score=self.maximum_score,
            detected_issues=issues,
            improvement_suggestions=suggestions,
            confidence_score=0.86,
            extras={"complexity_signals": hits[:15], "scale_number_hits": scale_nums},
        )


class CareerGrowthRule:
    name = "career_growth"
    maximum_score = 5.0

    def evaluate(self, ctx: ScoringContext) -> RuleResult:
        exps = ctx.resume.experiences
        signals: list[str] = []
        if len(exps) < 2:
            score = 2.0 if exps else 0.0
            if exps:
                signals.append("Single role — limited progression signal")
            return RuleResult(
                rule_name=self.name,
                score=score,
                maximum_score=self.maximum_score,
                detected_issues=[] if score >= 2 else ["No experience history"],
                improvement_suggestions=[
                    "Show title progression or expanding scope across roles"
                ],
                confidence_score=0.7,
                extras={"growth_score": score, "growth_signals": signals},
            )

        ranks = [seniority_rank(e.title) for e in exps]
        # Experiences often newest-first
        growth = ranks[0] - ranks[-1] if ranks else 0
        if growth > 0:
            signals.append("Seniority titles increase toward recent roles")

        # Bullet volume / leadership language growth
        recent_own = sum(
            1
            for t in OWNERSHIP_TERMS
            if any(re.search(rf"\b{t}\b", b, re.I) for b in (exps[0].bullets or []))
        )
        older_own = sum(
            1
            for t in OWNERSHIP_TERMS
            if any(re.search(rf"\b{t}\b", b, re.I) for b in (exps[-1].bullets or []))
        )
        if recent_own > older_own:
            signals.append("More ownership language in recent role")
            growth += 1

        recent_n = len(exps[0].bullets or [])
        older_n = len(exps[-1].bullets or [])
        if recent_n >= older_n and recent_n >= 5:
            signals.append("Sustained or expanded project scope")

        if growth >= 3 and len(signals) >= 2:
            score = 5.0
        elif growth >= 2 or len(signals) >= 2:
            score = 4.0
        elif growth >= 1 or signals:
            score = 2.5
        else:
            score = 1.0

        issues = []
        suggestions = []
        if score < 4:
            issues.append("Career growth signals are limited")
            suggestions.append(
                "Highlight increasing responsibility, seniority, and larger project scope"
            )

        return RuleResult(
            rule_name=self.name,
            score=round(score, 1),
            maximum_score=self.maximum_score,
            detected_issues=issues,
            improvement_suggestions=suggestions,
            confidence_score=0.75,
            extras={"growth_score": score, "growth_signals": signals, "title_ranks": ranks},
        )


class ExperienceRelevanceRule:
    name = "experience_relevance"
    maximum_score = 5.0

    def evaluate(self, ctx: ScoringContext) -> RuleResult:
        jd_title = (ctx.jd.title or "").lower()
        resume_titles = " ".join(e.title for e in ctx.resume.experiences).lower()
        skill_overlap = ctx.keywords.match_ratio

        title_hit = False
        if jd_title:
            tokens = [t for t in re.split(r"\W+", jd_title) if len(t) > 2]
            title_hit = any(t in resume_titles for t in tokens[:6])

        matching = []
        missing = []
        if title_hit:
            matching.append("title_similarity")
        else:
            missing.append("title_alignment")
        if skill_overlap >= 0.5:
            matching.append("skill_overlap")
        else:
            missing.append("skill_overlap")
        if ctx.keywords.matched:
            matching.append("responsibility_keywords")
        else:
            missing.append("responsibility_keywords")

        score = 0.0
        if title_hit:
            score += 1.5
        score += min(2.5, skill_overlap * 3.0)
        if len(ctx.resume.experiences) >= 1 and skill_overlap >= 0.3:
            score += 1.0
        score = min(5.0, score)

        if skill_overlap > 0.75 and title_hit:
            score = 5.0
        elif skill_overlap > 0.55:
            score = max(score, 4.0)
        elif skill_overlap > 0.3:
            score = max(score, 2.5)
        else:
            score = min(score, 1.5)

        issues = []
        suggestions = []
        if score < 4:
            issues.append("Experience only partially matches the target role")
            suggestions.append(
                "Align titles, responsibilities, and skills more closely with the JD"
            )

        return RuleResult(
            rule_name=self.name,
            score=round(score, 1),
            maximum_score=self.maximum_score,
            detected_issues=issues,
            improvement_suggestions=suggestions,
            confidence_score=0.8,
            extras={
                "relevance_score": round(score, 1),
                "matching_experience": matching,
                "missing_experience": missing,
            },
        )


EXPERIENCE_RULES = [
    OwnershipLeadershipRule(),
    TechnicalComplexityRule(),
    CareerGrowthRule(),
    ExperienceRelevanceRule(),
]
