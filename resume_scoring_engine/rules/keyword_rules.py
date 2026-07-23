from __future__ import annotations

from ..analyzers.text_analyzer import has_metric, has_outcome, has_tech_signal
from ..models import RuleResult
from .base import ScoringContext


class KeywordMatchingRule:
    name = "job_description_keyword_matching"
    maximum_score = 10.0

    def evaluate(self, ctx: ScoringContext) -> RuleResult:
        kw = ctx.keywords
        ratio = kw.match_ratio
        if not kw.important_keywords:
            score = 5.0  # neutral when JD has no extractable keywords
            issues = ["Few extractable keywords in job description"]
            suggestions = ["Provide a richer job description for better matching"]
        elif ratio > 0.75:
            score = 9.0 + min(1.0, (ratio - 0.75) / 0.25)
        elif ratio >= 0.5:
            score = 6.0 + 2.0 * ((ratio - 0.5) / 0.25)
        elif ratio >= 0.3:
            score = 3.0 + 2.0 * ((ratio - 0.3) / 0.2)
        else:
            score = 2.0 * (ratio / 0.3) if ratio > 0 else 0.0

        issues = []
        suggestions = []
        if ratio < 0.75 and kw.missing:
            issues.append(
                f"Missing {len(kw.missing)} important JD keywords "
                f"({int(ratio * 100)}% match)"
            )
            suggestions.append(
                "Mirror missing JD keywords in Summary, Skills, and Experience bullets"
            )

        return RuleResult(
            rule_name=self.name,
            score=round(min(10.0, score), 1),
            maximum_score=self.maximum_score,
            detected_issues=issues,
            improvement_suggestions=suggestions,
            confidence_score=0.88,
            extras={
                "matched_keywords": kw.matched,
                "missing_keywords": kw.missing,
                "match_percentage": round(ratio * 100, 1),
            },
        )


class SkillEvidenceRule:
    name = "skill_evidence"
    maximum_score = 5.0

    def evaluate(self, ctx: ScoringContext) -> RuleResult:
        skills = ctx.resume.skill_items
        if not skills:
            # Fall back to important JD keywords as expected skills
            skills = ctx.keywords.important_keywords[:12]

        experience_text = " ".join(
            [
                " ".join(e.bullets) + " " + e.overview
                for e in ctx.resume.experiences
            ]
        ).lower()
        summary = (ctx.resume.summary or "").lower()
        skills_blob = " ".join(skills).lower()

        evidence = []
        only_list = 0
        in_exp = 0
        with_achievement = 0

        for skill in skills[:20]:
            s = skill.lower()
            in_skills = s in skills_blob
            in_experience = s in experience_text
            # achievement: appears in a bullet that has metric/outcome
            ach = False
            locs = []
            if in_skills:
                locs.append("skills")
            for e in ctx.resume.experiences:
                for b in e.bullets:
                    if s in b.lower():
                        locs.append("experience")
                        if has_metric(b) or has_outcome(b):
                            ach = True
                        break
            if s in summary:
                locs.append("summary")

            if ach:
                quality = "achievement"
                with_achievement += 1
            elif in_experience:
                quality = "experience"
                in_exp += 1
            elif in_skills or s in summary:
                quality = "listed_only"
                only_list += 1
            else:
                quality = "missing"
                only_list += 1

            evidence.append(
                {
                    "skill": skill,
                    "evidence_locations": sorted(set(locs)),
                    "evidence_quality": quality,
                }
            )

        n = max(len(evidence), 1)
        ach_ratio = with_achievement / n
        exp_ratio = (with_achievement + in_exp) / n

        if ach_ratio >= 0.7:
            score = 5.0
        elif exp_ratio >= 0.55:
            score = 4.0
        elif exp_ratio >= 0.3:
            score = 2.5
        else:
            score = 1.0 if skills else 0.0

        issues = []
        suggestions = []
        if only_list > with_achievement:
            issues.append("Many skills appear only in the Skills section")
            suggestions.append(
                "Demonstrate key skills inside experience bullets with outcomes"
            )

        return RuleResult(
            rule_name=self.name,
            score=round(score, 1),
            maximum_score=self.maximum_score,
            detected_issues=issues,
            improvement_suggestions=suggestions,
            confidence_score=0.85,
            extras={"skill_evidence": evidence[:20]},
        )


class ContextualKeywordUsageRule:
    name = "contextual_keyword_usage"
    maximum_score = 5.0

    def evaluate(self, ctx: ScoringContext) -> RuleResult:
        bullets = ctx.resume.all_bullets
        important = ctx.keywords.important_keywords or ctx.resume.skill_items
        if not important:
            return RuleResult(
                rule_name=self.name,
                score=2.0,
                maximum_score=self.maximum_score,
                detected_issues=["No keywords available for context analysis"],
                improvement_suggestions=[],
                confidence_score=0.6,
                extras={"keyword_context_score": 2.0, "keyword_stuffing_detected": False},
            )

        contextual = 0
        stuffed = 0
        checked = 0
        for kw in important[:15]:
            checked += 1
            hits = [b for b in bullets if kw.lower() in b.lower()]
            if not hits:
                continue
            good = any(
                (has_tech_signal(b) or kw.lower() in b.lower())
                and (has_outcome(b) or has_metric(b))
                for b in hits
            )
            if good:
                contextual += 1
            else:
                # keyword appears without outcome → stuffing-ish
                stuffed += 1

        # Also detect skills-only dumping
        skill_count = len(ctx.resume.skill_items)
        if skill_count > 35 and contextual < 3:
            stuffed += 1

        if checked == 0:
            ratio = 0.0
        else:
            ratio = contextual / checked

        stuffing = stuffed >= max(2, checked // 3)
        if ratio >= 0.55 and not stuffing:
            score = 4.5 if ratio >= 0.7 else 4.0
        elif ratio >= 0.3:
            score = 2.5
        else:
            score = 1.0 if contextual else 0.5

        if stuffing:
            score = min(score, 1.5)

        issues = []
        suggestions = []
        if stuffing:
            issues.append("Possible keyword stuffing / list-only usage")
            suggestions.append(
                "Use keywords in Action + Technology + Result sentences, not lists alone"
            )
        if ratio < 0.5:
            suggestions.append(
                "Place important JD technologies inside achievement bullets with outcomes"
            )

        return RuleResult(
            rule_name=self.name,
            score=round(min(5.0, score), 1),
            maximum_score=self.maximum_score,
            detected_issues=issues,
            improvement_suggestions=suggestions,
            confidence_score=0.78,
            extras={
                "keyword_context_score": round(score, 1),
                "keyword_stuffing_detected": stuffing,
                "contextual_hits": contextual,
            },
        )


KEYWORD_RULES = [
    KeywordMatchingRule(),
    SkillEvidenceRule(),
    ContextualKeywordUsageRule(),
]
