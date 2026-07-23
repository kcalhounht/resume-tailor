from __future__ import annotations

import pytest

from resume_scoring_engine.rules.base import ScoringContext
from resume_scoring_engine.rules.impact_rules import (
    AchievementDensityRule,
    AchievementStructureRule,
    ActionVerbStrengthRule,
    QuantifiedAchievementRule,
)
from resume_scoring_engine.rules.keyword_rules import (
    ContextualKeywordUsageRule,
    KeywordMatchingRule,
    SkillEvidenceRule,
)
from resume_scoring_engine.rules.experience_rules import (
    CareerGrowthRule,
    ExperienceRelevanceRule,
    OwnershipLeadershipRule,
    TechnicalComplexityRule,
)
from resume_scoring_engine.rules.writing_rules import (
    BulletLengthRule,
    BuzzwordRule,
    FillerWordRule,
    GrammarConsistencyRule,
)
from resume_scoring_engine.rules.ats_rules import (
    AtsFormattingRule,
    ContactInformationRule,
    SectionStructureRule,
)
from resume_scoring_engine.analyzers.resume_parser import parse_resume
from resume_scoring_engine.analyzers.jd_parser import parse_job_description
from resume_scoring_engine.analyzers.keyword_extractor import compare_keywords
from resume_scoring_engine.samples.fixtures import SAMPLE_JD, STRONG_RESUME, WEAK_RESUME


def _ctx(resume, jd=SAMPLE_JD) -> ScoringContext:
    parsed = parse_resume(resume)
    parsed_jd = parse_job_description(jd)
    kw = compare_keywords(parsed.corpus(), parsed_jd.raw)
    return ScoringContext(resume=parsed, jd=parsed_jd, keywords=kw)


@pytest.mark.parametrize(
    "rule_cls",
    [
        QuantifiedAchievementRule,
        AchievementStructureRule,
        ActionVerbStrengthRule,
        AchievementDensityRule,
        KeywordMatchingRule,
        SkillEvidenceRule,
        ContextualKeywordUsageRule,
        OwnershipLeadershipRule,
        TechnicalComplexityRule,
        CareerGrowthRule,
        ExperienceRelevanceRule,
        BulletLengthRule,
        FillerWordRule,
        BuzzwordRule,
        GrammarConsistencyRule,
        SectionStructureRule,
        ContactInformationRule,
        AtsFormattingRule,
    ],
)
def test_every_rule_returns_expected_shape(rule_cls):
    rule = rule_cls()
    result = rule.evaluate(_ctx(STRONG_RESUME))
    assert result.rule_name
    assert 0 <= result.score <= result.maximum_score
    assert 0 <= result.confidence_score <= 1
    assert isinstance(result.detected_issues, list)
    assert isinstance(result.improvement_suggestions, list)


def test_quantified_achievement_strong_vs_weak():
    strong = QuantifiedAchievementRule().evaluate(_ctx(STRONG_RESUME))
    weak = QuantifiedAchievementRule().evaluate(_ctx(WEAK_RESUME))
    assert strong.score >= 8
    assert weak.score <= 3


def test_action_verbs_penalize_weak_language():
    weak = ActionVerbStrengthRule().evaluate(_ctx(WEAK_RESUME))
    strong = ActionVerbStrengthRule().evaluate(_ctx(STRONG_RESUME))
    assert strong.score > weak.score
    assert weak.score <= 2


def test_filler_and_buzzwords_on_weak_resume():
    filler = FillerWordRule().evaluate(_ctx(WEAK_RESUME))
    buzz = BuzzwordRule().evaluate(_ctx(WEAK_RESUME))
    assert filler.score <= 1
    assert buzz.score <= 1.5


def test_keyword_matching_finds_missing():
    result = KeywordMatchingRule().evaluate(_ctx(WEAK_RESUME))
    assert result.extras["match_percentage"] < 50
    assert len(result.extras["missing_keywords"]) >= 1


def test_ats_formatting_penalties():
    resume = dict(STRONG_RESUME)
    resume["formatting_flags"] = {"tables": True, "images": True}
    result = AtsFormattingRule().evaluate(_ctx(resume))
    assert result.score <= 5 - 2 - 3 + 0.1  # 0
    assert result.score == 0


def test_section_structure_complete():
    result = SectionStructureRule().evaluate(_ctx(STRONG_RESUME))
    assert result.score == 3


def test_empty_resume_edge_case():
    ctx = _ctx({"summary": "", "skills": [], "experiences": [], "education": []})
    for rule_cls in (QuantifiedAchievementRule, BulletLengthRule, SectionStructureRule):
        result = rule_cls().evaluate(ctx)
        assert result.score >= 0
        assert result.score <= result.maximum_score
