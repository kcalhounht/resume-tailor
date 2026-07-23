"""
Resume Scoring Engine (ResumeWorded-style)

Install:
  pip install -r requirements.txt

Run API:
  # from repository root
  uvicorn resume_scoring_engine.main:app --reload --port 8090

  POST /api/resume-score
  { "resume": { ... }, "job_description": "..." }

Tests:
  # from repository root
  pytest resume_scoring_engine/tests -q
"""
