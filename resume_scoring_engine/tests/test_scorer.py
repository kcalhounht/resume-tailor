from __future__ import annotations

from fastapi.testclient import TestClient

from resume_scoring_engine.main import app
from resume_scoring_engine.scorer import ResumeScoringEngine
from resume_scoring_engine.samples.fixtures import SAMPLE_JD, STRONG_RESUME, WEAK_RESUME


client = TestClient(app)


def test_engine_strong_scores_high():
    report = ResumeScoringEngine().score(STRONG_RESUME, SAMPLE_JD)
    assert report.overall_score >= 70
    assert report.category_scores.impact >= 20
    assert len(report.rule_results) == 18
    assert isinstance(report.missing_keywords, list)
    assert isinstance(report.recommendations, list)


def test_engine_weak_scores_lower():
    strong = ResumeScoringEngine().score(STRONG_RESUME, SAMPLE_JD)
    weak = ResumeScoringEngine().score(WEAK_RESUME, SAMPLE_JD)
    assert weak.overall_score < strong.overall_score
    assert weak.overall_score < 55


def test_category_weights_sum_to_overall():
    report = ResumeScoringEngine().score(STRONG_RESUME, SAMPLE_JD)
    c = report.category_scores
    summed = (
        c.impact
        + c.keyword_alignment
        + c.experience_quality
        + c.writing_quality
        + c.ats_compatibility
    )
    assert abs(summed - report.overall_score) < 0.2


def test_api_resume_score_endpoint():
    res = client.post(
        "/api/resume-score",
        json={"resume": STRONG_RESUME, "job_description": SAMPLE_JD},
    )
    assert res.status_code == 200
    data = res.json()
    assert "overall_score" in data
    assert "category_scores" in data
    assert "rule_results" in data
    assert len(data["rule_results"]) == 18


def test_api_accepts_raw_text_resume():
    res = client.post(
        "/api/resume-score",
        json={
            "resume": {
                "raw_text": "Jane Doe\njane@email.com\n555-111-2222\n\nSummary\nEngineer\n\nSkills\nPython, AWS\n\nExperience\n- Built APIs serving 1M users\n\nEducation\nBS CS"
            },
            "job_description": "Python AWS engineer",
        },
    )
    assert res.status_code == 200
    assert res.json()["overall_score"] >= 0


def test_health():
    assert client.get("/health").json()["status"] == "ok"
