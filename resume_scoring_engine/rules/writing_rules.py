from __future__ import annotations

from ..analyzers.grammar_analyzer import analyze_grammar
from ..analyzers.text_analyzer import find_buzzwords, find_filler, word_count
from ..models import RuleResult
from .base import ScoringContext

BUZZWORD_REPLACEMENTS = {
    "hard-working": "Show concrete delivery metrics instead",
    "passionate": "Describe domain impact with outcomes",
    "innovative": "Name the system/technique and measured result",
    "team player": "Cite cross-functional delivery with a metric",
    "results-driven": "Lead with quantified achievements",
    "self-motivated": "Show ownership of initiatives delivered",
}


class BulletLengthRule:
    name = "bullet_length"
    maximum_score = 3.0

    def evaluate(self, ctx: ScoringContext) -> RuleResult:
        bullets = ctx.resume.all_bullets
        if not bullets:
            return RuleResult(
                rule_name=self.name,
                score=0.0,
                maximum_score=self.maximum_score,
                detected_issues=["No bullets"],
                improvement_suggestions=["Add 15–30 word achievement bullets"],
                confidence_score=0.9,
                extras={"average_length": 0, "problematic_bullets": []},
            )

        lengths = [word_count(b) for b in bullets]
        avg = sum(lengths) / len(lengths)
        problematic = []
        for b, n in zip(bullets, lengths):
            if n < 8 or n > 40:
                problematic.append({"text": b[:120], "words": n})

        good = sum(1 for n in lengths if 15 <= n <= 30)
        ok = sum(1 for n in lengths if 12 <= n <= 38)
        good_ratio = good / len(lengths)
        ok_ratio = ok / len(lengths)

        if good_ratio >= 0.7:
            score = 3.0
        elif ok_ratio >= 0.55:
            score = 2.0
        elif ok_ratio >= 0.3:
            score = 1.0
        else:
            score = 0.0

        issues = []
        suggestions = []
        if problematic:
            issues.append(f"{len(problematic)} bullets outside preferred length")
            suggestions.append("Keep most bullets between 15 and 30 words")

        return RuleResult(
            rule_name=self.name,
            score=round(score, 1),
            maximum_score=self.maximum_score,
            detected_issues=issues,
            improvement_suggestions=suggestions,
            confidence_score=0.95,
            extras={
                "average_length": round(avg, 1),
                "problematic_bullets": problematic[:10],
            },
        )


class FillerWordRule:
    name = "filler_word_detection"
    maximum_score = 3.0

    def evaluate(self, ctx: ScoringContext) -> RuleResult:
        bullets = ctx.resume.all_bullets
        detected: list[str] = []
        affected: list[str] = []
        for b in bullets:
            found = find_filler(b)
            if found:
                detected.extend(found)
                affected.append(b[:120])

        unique = sorted(set(detected))
        n = len(affected)
        if n == 0:
            score = 3.0
        elif n <= 2:
            score = 2.0
        elif n <= 4:
            score = 1.0
        else:
            score = 0.0

        issues = []
        suggestions = []
        if unique:
            issues.append(f"Filler phrases found: {', '.join(unique)}")
            suggestions.append(
                "Remove Responsible for / Worked on / Various — use strong verbs + metrics"
            )

        return RuleResult(
            rule_name=self.name,
            score=round(score, 1),
            maximum_score=self.maximum_score,
            detected_issues=issues,
            improvement_suggestions=suggestions,
            confidence_score=0.95,
            extras={"detected_words": unique, "affected_bullets": affected[:10]},
        )


class BuzzwordRule:
    name = "buzzword_detection"
    maximum_score = 3.0

    def evaluate(self, ctx: ScoringContext) -> RuleResult:
        text = ctx.resume.corpus() + " " + (ctx.resume.summary or "")
        found = find_buzzwords(text)
        # Also scan summary/bullets explicitly
        for b in [ctx.resume.summary] + ctx.resume.all_bullets:
            found.extend(find_buzzwords(b or ""))
        found = sorted(set(found))

        if not found:
            score = 3.0
        elif len(found) <= 2:
            score = 1.5
        else:
            score = 0.0

        replacements = {
            w: BUZZWORD_REPLACEMENTS.get(w, "Replace with evidence-based wording")
            for w in found
        }

        issues = []
        suggestions = []
        if found:
            issues.append(f"Unsupported buzzwords: {', '.join(found)}")
            suggestions.extend([f"{k}: {v}" for k, v in list(replacements.items())[:5]])

        return RuleResult(
            rule_name=self.name,
            score=round(score, 1),
            maximum_score=self.maximum_score,
            detected_issues=issues,
            improvement_suggestions=suggestions,
            confidence_score=0.93,
            extras={"buzzwords_found": found, "replacement_suggestions": replacements},
        )


class GrammarConsistencyRule:
    name = "grammar_and_consistency"
    maximum_score = 6.0

    def evaluate(self, ctx: ScoringContext) -> RuleResult:
        report = analyze_grammar(ctx.resume.all_bullets, ctx.resume.summary)
        score = float(report.score_hint)

        issues = report.grammar_errors + report.style_issues
        suggestions = []
        if issues:
            suggestions.append(
                "Fix grammar/spelling, keep past tense for past roles, avoid first person"
            )
            suggestions.append("Ensure consistent capitalization and punctuation")

        return RuleResult(
            rule_name=self.name,
            score=round(min(6.0, score), 1),
            maximum_score=self.maximum_score,
            detected_issues=issues[:12],
            improvement_suggestions=suggestions,
            confidence_score=0.7,
            extras={
                "grammar_errors": report.grammar_errors,
                "style_issues": report.style_issues,
            },
        )


WRITING_RULES = [
    BulletLengthRule(),
    FillerWordRule(),
    BuzzwordRule(),
    GrammarConsistencyRule(),
]
