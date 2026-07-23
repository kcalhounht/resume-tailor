from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import ResumeInput, ScoreRequest, ScoreResponse
from .scorer import ResumeScoringEngine

app = FastAPI(
    title="Resume Scoring Engine",
    description="ResumeWorded-style modular resume scoring (0–100)",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = ResumeScoringEngine()


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/resume-score", response_model=ScoreResponse)
def resume_score(payload: ScoreRequest) -> ScoreResponse:
    try:
        resume = payload.resume
        if isinstance(resume, dict):
            # Allow nested {resume: {...}} or flat structured resume
            if "summary" in resume or "experiences" in resume or "raw_text" in resume:
                resume_data: ResumeInput | dict | str = resume
            else:
                resume_data = resume
        else:
            resume_data = resume

        report = engine.score(resume_data, payload.job_description or "")
        return ScoreResponse.model_validate(report.model_dump())
    except Exception as exc:  # noqa: BLE001 — surface clean API error
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def create_app() -> FastAPI:
    return app
