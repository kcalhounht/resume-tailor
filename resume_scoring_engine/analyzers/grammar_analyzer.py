from __future__ import annotations

import re
from dataclasses import dataclass, field


COMMON_MISSPELLINGS = {
    "acheived": "achieved",
    "recieved": "received",
    "seperate": "separate",
    "definately": "definitely",
    "occured": "occurred",
    "sucess": "success",
    "sucessful": "successful",
    "managment": "management",
    "enviroment": "environment",
    "teh": "the",
    "langauge": "language",
}


@dataclass
class GrammarReport:
    grammar_errors: list[str] = field(default_factory=list)
    style_issues: list[str] = field(default_factory=list)
    score_hint: float = 6.0  # out of 6


def analyze_grammar(bullets: list[str], summary: str = "") -> GrammarReport:
    """Lightweight deterministic grammar/style checks (no external NLP deps)."""
    errors: list[str] = []
    styles: list[str] = []
    texts = [summary] + list(bullets)

    for i, text in enumerate(texts):
        t = (text or "").strip()
        if not t:
            continue
        label = "summary" if i == 0 else f"bullet {i}"

        if re.search(r"\b(i|me|my|we|our)\b", t, re.I):
            styles.append(f"{label}: first-person pronouns")

        if t and t[0].islower():
            styles.append(f"{label}: starts with lowercase")

        # Double spaces / missing space after punctuation
        if "  " in t:
            styles.append(f"{label}: double spaces")
        if re.search(r"[,:;][A-Za-z]", t):
            styles.append(f"{label}: missing space after punctuation")

        for bad, good in COMMON_MISSPELLINGS.items():
            if re.search(rf"\b{bad}\b", t, re.I):
                errors.append(f"{label}: '{bad}' → '{good}'")

        # Mixed tense heuristic within bullet: past + present continuous clash
        if re.search(r"\b\w+ed\b", t) and re.search(r"\b\w+ing\b", t):
            # common and OK often; only flag if both "is" and past
            if re.search(r"\b(is|are|am)\b", t, re.I) and re.search(
                r"\b\w+ed\b", t
            ):
                styles.append(f"{label}: possible tense inconsistency")

    # Verb tense consistency across bullets: prefer past for experience
    openings = []
    for b in bullets:
        tok = (b or "").strip().split()
        if tok:
            openings.append(tok[0])
    pastish = sum(1 for v in openings if v.lower().endswith("ed"))
    if openings and pastish / len(openings) < 0.4 and len(openings) >= 4:
        styles.append("Inconsistent verb tense across experience bullets")

    # Score: start at 6, subtract
    penalty = min(6, len(errors) * 1.0 + len(styles) * 0.4)
    score = max(0.0, 6.0 - penalty)
    if not errors and not styles:
        score = 6.0
    elif len(errors) + len(styles) <= 3:
        score = max(score, 3.0)

    return GrammarReport(
        grammar_errors=errors[:20],
        style_issues=styles[:20],
        score_hint=round(score, 1),
    )
