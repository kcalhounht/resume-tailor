from __future__ import annotations

from ..analyzers.text_analyzer import (
    bullet_structure_score,
    extract_metrics,
    has_outcome,
    is_achievement_bullet,
    opening_verb,
    strong_weak_verb_stats,
    STRONG_VERBS,
    WEAK_VERBS,
)
from ..models import RuleResult
from .base import ScoringContext


def _band_from_ratio(ratio: float, bands: list[tuple[float, float, float]]) -> float:
    """bands: list of (min_ratio, low_score, high_score) descending."""
    for min_r, lo, hi in bands:
        if ratio >= min_r:
            # interpolate within band
            return round(lo + (hi - lo) * min(1.0, (ratio - min_r) / max(0.01, 1 - min_r)), 1)
    return 0.0


class QuantifiedAchievementRule:
    name = "quantified_achievement"
    maximum_score = 10.0

    def evaluate(self, ctx: ScoringContext) -> RuleResult:
        bullets = ctx.resume.all_bullets
        metrics_found: list[str] = []
        with_metric = 0
        for b in bullets:
            ms = extract_metrics(b)
            if ms:
                with_metric += 1
                metrics_found.extend(ms[:3])

        n = len(bullets)
        ratio = (with_metric / n) if n else 0.0
        if n == 0:
            score = 0.0
        elif ratio >= 0.7:
            score = 9.0 + min(1.0, (ratio - 0.7) / 0.3)
        elif ratio >= 0.4:
            score = 6.0 + 2.0 * ((ratio - 0.4) / 0.3)
        elif ratio >= 0.15:
            score = 3.0 + 2.0 * ((ratio - 0.15) / 0.25)
        else:
            score = 0.0 if with_metric == 0 else 2.0

        issues = []
        suggestions = []
        if ratio < 0.7:
            issues.append(
                f"Only {with_metric}/{n or 0} bullets contain measurable metrics"
            )
            suggestions.append(
                "Add percentages, revenue/cost, latency, users, or scale numbers to most bullets"
            )

        return RuleResult(
            rule_name=self.name,
            score=round(min(10.0, score), 1),
            maximum_score=self.maximum_score,
            detected_issues=issues,
            improvement_suggestions=suggestions,
            confidence_score=0.92,
            extras={"metrics_found": metrics_found[:25], "metric_ratio": round(ratio, 3)},
        )


class AchievementStructureRule:
    name = "achievement_oriented_structure"
    maximum_score = 10.0

    def evaluate(self, ctx: ScoringContext) -> RuleResult:
        bullets = ctx.resume.all_bullets
        if not bullets:
            return RuleResult(
                rule_name=self.name,
                score=0.0,
                maximum_score=self.maximum_score,
                detected_issues=["No experience bullets found"],
                improvement_suggestions=["Add achievement-focused experience bullets"],
                confidence_score=0.9,
            )

        structures = [bullet_structure_score(b) for b in bullets]
        avg = sum(structures) / len(structures)
        with_result = sum(1 for b in bullets if has_outcome(b))
        result_ratio = with_result / len(bullets)

        # Map to 0-10
        if avg >= 3.2 and result_ratio >= 0.7:
            score = 9.0 + min(1.0, avg - 3.2)
        elif avg >= 2.5 and result_ratio >= 0.45:
            score = 6.0 + 2.0 * min(1.0, (avg - 2.5) / 0.7)
        elif avg >= 1.5:
            score = 3.0 + 2.0 * min(1.0, (avg - 1.5) / 1.0)
        else:
            score = 0.0 if result_ratio < 0.1 else 2.0

        issues = []
        suggestions = []
        if result_ratio < 0.6:
            issues.append("Many bullets lack clear outcomes/results")
            suggestions.append(
                "Rewrite bullets as Action + Technology/method + Problem + Result"
            )

        return RuleResult(
            rule_name=self.name,
            score=round(min(10.0, score), 1),
            maximum_score=self.maximum_score,
            detected_issues=issues,
            improvement_suggestions=suggestions,
            confidence_score=0.8,
            extras={
                "avg_structure_components": round(avg, 2),
                "result_ratio": round(result_ratio, 3),
            },
        )


class ActionVerbStrengthRule:
    name = "action_verb_strength"
    maximum_score = 5.0

    def evaluate(self, ctx: ScoringContext) -> RuleResult:
        bullets = ctx.resume.all_bullets
        stats = strong_weak_verb_stats(bullets)
        strong_ratio = stats["strong"] / stats["total"]
        weak_ratio = stats["weak"] / stats["total"]

        if strong_ratio >= 0.75 and weak_ratio <= 0.1:
            score = 5.0
        elif strong_ratio >= 0.55:
            score = 4.0
        elif strong_ratio >= 0.3 or weak_ratio < 0.4:
            score = 2.0 + (1.0 if strong_ratio >= 0.4 else 0.0)
        else:
            score = 1.0 if strong_ratio > 0 else 0.0

        issues = []
        suggestions = []
        if weak_ratio > 0.2:
            issues.append(f"Weak verbs detected in ~{int(weak_ratio * 100)}% of bullets")
            suggestions.append(
                "Replace Helped/Assisted/Worked on/Responsible for with strong action verbs"
            )
        if strong_ratio < 0.55:
            suggestions.append(
                f"Lead with strong verbs such as: {', '.join(STRONG_VERBS[:8])}"
            )

        return RuleResult(
            rule_name=self.name,
            score=round(score, 1),
            maximum_score=self.maximum_score,
            detected_issues=issues,
            improvement_suggestions=suggestions,
            confidence_score=0.95,
            extras={
                "strong_ratio": round(strong_ratio, 3),
                "weak_ratio": round(weak_ratio, 3),
                "weak_verbs_ban": WEAK_VERBS,
            },
        )


class AchievementDensityRule:
    name = "achievement_density"
    maximum_score = 10.0

    def evaluate(self, ctx: ScoringContext) -> RuleResult:
        bullets = ctx.resume.all_bullets
        n = len(bullets)
        if n == 0:
            return RuleResult(
                rule_name=self.name,
                score=0.0,
                maximum_score=self.maximum_score,
                detected_issues=["No bullets to evaluate"],
                improvement_suggestions=["Add quantified achievement bullets"],
                confidence_score=0.9,
            )

        achievements = sum(1 for b in bullets if is_achievement_bullet(b))
        density = achievements / n

        if density > 0.7:
            score = 9.0 + min(1.0, (density - 0.7) / 0.3)
        elif density >= 0.4:
            score = 6.0 + 2.0 * ((density - 0.4) / 0.3)
        elif density >= 0.2:
            score = 3.0 + 2.0 * ((density - 0.2) / 0.2)
        else:
            score = 2.0 * (density / 0.2) if density > 0 else 0.0

        issues = []
        suggestions = []
        if density < 0.7:
            issues.append(
                f"Achievement density {int(density * 100)}% (target >70%)"
            )
            suggestions.append(
                "Convert duty-style bullets into metric/outcome achievement bullets"
            )

        return RuleResult(
            rule_name=self.name,
            score=round(min(10.0, score), 1),
            maximum_score=self.maximum_score,
            detected_issues=issues,
            improvement_suggestions=suggestions,
            confidence_score=0.9,
            extras={
                "achievement_bullets": achievements,
                "total_experience_bullets": n,
                "density": round(density, 3),
            },
        )


IMPACT_RULES = [
    QuantifiedAchievementRule(),
    AchievementStructureRule(),
    ActionVerbStrengthRule(),
    AchievementDensityRule(),
]
