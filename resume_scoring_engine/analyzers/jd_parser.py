from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class ParsedJD:
    raw: str = ""
    title: str = ""
    important_keywords: list[str] = field(default_factory=list)
    responsibilities: list[str] = field(default_factory=list)


TITLE_RE = re.compile(
    r"(?:job title|role|position)\s*[:\-]\s*(.+)",
    re.I,
)


def parse_job_description(text: str) -> ParsedJD:
    raw = text or ""
    title = ""
    m = TITLE_RE.search(raw)
    if m:
        title = m.group(1).strip().split("\n")[0][:120]
    else:
        # First non-empty line often is title-ish
        for ln in raw.splitlines():
            s = ln.strip()
            if 3 < len(s) < 80 and not s.lower().startswith("http"):
                title = s
                break

    bullets = re.findall(r"^\s*[-•*]\s+(.+)$", raw, re.M)
    return ParsedJD(
        raw=raw,
        title=title,
        responsibilities=bullets[:30],
        important_keywords=[],  # filled by keyword_extractor
    )
