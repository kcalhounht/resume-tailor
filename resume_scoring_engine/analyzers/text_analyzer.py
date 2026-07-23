from __future__ import annotations

import re

STRONG_VERBS = [
    "built",
    "developed",
    "designed",
    "architected",
    "implemented",
    "optimized",
    "automated",
    "scaled",
    "delivered",
    "improved",
    "reduced",
    "increased",
    "led",
    "created",
    "deployed",
    "integrated",
    "owned",
    "drove",
    "established",
    "migrated",
    "streamlined",
    "accelerated",
    "spearheaded",
]

WEAK_VERBS = [
    "helped",
    "assisted",
    "worked on",
    "responsible for",
    "supported",
    "participated",
    "handled",
    "tasked with",
]

OWNERSHIP_TERMS = [
    "owned",
    "led",
    "architected",
    "managed",
    "designed",
    "drove",
    "established",
    "delivered",
    "spearheaded",
]

COMPLEXITY_TERMS = [
    "production",
    "enterprise",
    "distributed",
    "cloud",
    "kubernetes",
    "microservices",
    "large-scale",
    "large scale",
    "real-time",
    "realtime",
    "ml pipeline",
    "machine learning pipeline",
    "high availability",
    "dataset",
    "petabyte",
    "terabyte",
    "throughput",
    "latency",
    "gpu",
]

OUTCOME_TERMS = re.compile(
    r"\b(improv(?:ed|ing)|reduc(?:ed|ing)|increas(?:ed|ing)|"
    r"decreas(?:ed|ing)|boost(?:ed|ing)|accelerat(?:ed|ing)|"
    r"resulting in|leading to|achieved|delivered|saved|cut)\b",
    re.I,
)

METRIC_RE = re.compile(
    r"("
    r"\d+(?:[.,]\d+)?\s*%|"
    r"\$\s?\d[\d,]*(?:\.\d+)?\s*[kmb]?|"
    r"\d+(?:[.,]\d+)?\s*(?:ms|s|sec|seconds?|min|minutes?|hours?|x|×)|"
    r"\b(?:users?|customers?|clients?|requests?|transactions?|"
    r"services?|datasets?|records?|tickets?|nodes?|clusters?)\b|"
    r"\b(?:revenue|cost|savings?|latency|throughput|accuracy|"
    r"efficiency|uptime|availability)\b|"
    r"\b\d+(?:\.\d+)?\s*(?:TB|GB|MB|PB|K|M|B)\b"
    r")",
    re.I,
)

FILLER_RE = re.compile(
    r"\b(responsible for|worked on|helped with|various|several|"
    r"different|tasks included|duties included)\b",
    re.I,
)

BUZZWORD_RE = re.compile(
    r"\b(hard-working|passionate|innovative|team player|"
    r"results-driven|self-motivated|strategic thinker|"
    r"go-getter|detail-oriented|proven track record)\b",
    re.I,
)

FIRST_PERSON_RE = re.compile(r"\b(i|me|my|we|our|us)\b", re.I)

SENIORITY_RE = re.compile(
    r"\b(intern|junior|associate|mid|senior|staff|principal|"
    r"lead|manager|director|head of)\b",
    re.I,
)


def word_count(text: str) -> int:
    return len([w for w in (text or "").strip().split() if w])


def opening_verb(bullet: str) -> str:
    tokens = (bullet or "").strip().split()
    if not tokens:
        return ""
    return re.sub(r"[^a-zA-Z]", "", tokens[0]).lower()


def has_metric(text: str) -> bool:
    return bool(METRIC_RE.search(text or ""))


def extract_metrics(text: str) -> list[str]:
    return [m.group(0) for m in METRIC_RE.finditer(text or "")]


def has_outcome(text: str) -> bool:
    return bool(OUTCOME_TERMS.search(text or "")) or has_metric(text or "")


def is_achievement_bullet(text: str) -> bool:
    t = text or ""
    return has_metric(t) or (has_outcome(t) and bool(opening_verb(t)))


def has_tech_signal(text: str) -> bool:
    return bool(
        re.search(
            r"\b(python|java|react|aws|sql|api|docker|kubernetes|"
            r"tensorflow|pytorch|spark|kafka|postgres|mongodb|"
            r"fastapi|django|node\.?js|typescript|golang|rust)\b",
            text or "",
            re.I,
        )
    )


def bullet_structure_score(text: str) -> int:
    """Return 0-4 component hits: action, tech, problem, result."""
    t = text or ""
    hits = 0
    verb = opening_verb(t)
    if verb and verb in STRONG_VERBS:
        hits += 1
    elif verb and verb not in WEAK_VERBS and verb[0:1].isalpha():
        hits += 1
    if has_tech_signal(t) or re.search(
        r"\b(using|with|via|through)\b", t, re.I
    ):
        hits += 1
    if re.search(
        r"\b(to|for|enabling|supporting|addressing|solving)\b", t, re.I
    ):
        hits += 1
    if has_outcome(t):
        hits += 1
    return hits


def strong_weak_verb_stats(bullets: list[str]) -> dict:
    strong = 0
    weak = 0
    total = 0
    for b in bullets:
        verb = opening_verb(b)
        if not verb:
            continue
        total += 1
        joined = b.lower()
        if any(w in joined for w in WEAK_VERBS):
            weak += 1
        elif verb in STRONG_VERBS:
            strong += 1
    return {"strong": strong, "weak": weak, "total": max(total, 1)}


def find_filler(text: str) -> list[str]:
    return list({m.group(0).lower() for m in FILLER_RE.finditer(text or "")})


def find_buzzwords(text: str) -> list[str]:
    return list({m.group(0).lower() for m in BUZZWORD_RE.finditer(text or "")})


def has_first_person(text: str) -> bool:
    return bool(FIRST_PERSON_RE.search(text or ""))


def seniority_rank(title: str) -> int:
    t = (title or "").lower()
    ranks = [
        ("intern", 0),
        ("junior", 1),
        ("associate", 2),
        ("mid", 3),
        ("senior", 4),
        ("staff", 5),
        ("principal", 6),
        ("lead", 5),
        ("manager", 6),
        ("director", 7),
        ("head of", 8),
    ]
    best = 2  # default mid
    for key, val in ranks:
        if key in t:
            best = max(best, val)
    return best
