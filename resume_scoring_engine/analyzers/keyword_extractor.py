from __future__ import annotations

import re
from dataclasses import dataclass


# Curated tech / domain lexicon for deterministic extraction.
KNOWN_KEYWORDS: list[str] = [
    # Languages
    "python",
    "javascript",
    "typescript",
    "java",
    "c++",
    "c#",
    "go",
    "golang",
    "rust",
    "ruby",
    "php",
    "swift",
    "kotlin",
    "scala",
    "r",
    "sql",
    # Frameworks / libraries
    "react",
    "next.js",
    "nextjs",
    "vue",
    "angular",
    "node.js",
    "nodejs",
    "express",
    "fastapi",
    "django",
    "flask",
    "spring",
    "rails",
    ".net",
    "dotnet",
    "pytorch",
    "tensorflow",
    "keras",
    "scikit-learn",
    "sklearn",
    "pandas",
    "numpy",
    "spark",
    "hadoop",
    "langchain",
    "huggingface",
    "transformers",
    # Cloud / infra
    "aws",
    "azure",
    "gcp",
    "google cloud",
    "kubernetes",
    "k8s",
    "docker",
    "terraform",
    "ansible",
    "ci/cd",
    "jenkins",
    "github actions",
    "linux",
    "nginx",
    # Databases
    "postgresql",
    "postgres",
    "mysql",
    "mongodb",
    "redis",
    "elasticsearch",
    "dynamodb",
    "cassandra",
    "snowflake",
    "bigquery",
    # AI/ML
    "machine learning",
    "deep learning",
    "nlp",
    "computer vision",
    "llm",
    "generative ai",
    "rag",
    "mlops",
    "feature engineering",
    # Tools / methods
    "git",
    "jira",
    "agile",
    "scrum",
    "rest",
    "graphql",
    "microservices",
    "api",
    "etl",
    "data pipeline",
    "observability",
    "prometheus",
    "grafana",
    "kafka",
    "airflow",
]


@dataclass
class KeywordExtraction:
    important_keywords: list[str]
    matched: list[str]
    missing: list[str]
    match_ratio: float


def extract_keywords_from_text(text: str) -> list[str]:
    hay = (text or "").lower()
    found: list[str] = []
    for kw in sorted(KNOWN_KEYWORDS, key=len, reverse=True):
        pattern = re.compile(rf"(?<![a-z0-9]){re.escape(kw)}(?![a-z0-9])", re.I)
        if pattern.search(hay):
            # Normalize aliases
            norm = {
                "nodejs": "node.js",
                "nextjs": "next.js",
                "golang": "go",
                "postgres": "postgresql",
                "k8s": "kubernetes",
                "sklearn": "scikit-learn",
                "dotnet": ".net",
            }.get(kw, kw)
            if norm not in found:
                found.append(norm)
    # Also capture Capitalized Multi-Word Terms from JD requirements lines
    for m in re.finditer(
        r"\b([A-Z][a-zA-Z0-9+#.]{1,}(?:\s+[A-Z][a-zA-Z0-9+#.]{1,}){0,2})\b",
        text or "",
    ):
        term = m.group(1).strip()
        if term.lower() in {"the", "and", "with", "for", "job", "role"}:
            continue
        if 2 <= len(term) <= 40 and term.lower() not in {f.lower() for f in found}:
            # keep only if looks technical-ish
            if any(c.isupper() for c in term[1:]) or any(
                ch in term for ch in "+#.:"
            ):
                found.append(term)
    return found


def compare_keywords(resume_text: str, jd_text: str) -> KeywordExtraction:
    important = extract_keywords_from_text(jd_text)
    # Prefer JD-derived; if sparse, fall back to known lexicon hits only
    if len(important) < 5:
        important = extract_keywords_from_text(jd_text) or important

    resume_l = (resume_text or "").lower()
    matched: list[str] = []
    missing: list[str] = []
    for kw in important:
        if kw.lower() in resume_l:
            matched.append(kw)
        else:
            missing.append(kw)

    ratio = (len(matched) / len(important)) if important else 0.0
    return KeywordExtraction(
        important_keywords=important,
        matched=matched,
        missing=missing,
        match_ratio=ratio,
    )
