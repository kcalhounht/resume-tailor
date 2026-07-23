from __future__ import annotations

from typing import Protocol

from ..analyzers.jd_parser import ParsedJD
from ..analyzers.keyword_extractor import KeywordExtraction
from ..analyzers.resume_parser import ParsedResume
from ..models import RuleResult


class ScoringContext:
    def __init__(
        self,
        resume: ParsedResume,
        jd: ParsedJD,
        keywords: KeywordExtraction,
    ) -> None:
        self.resume = resume
        self.jd = jd
        self.keywords = keywords


class Rule(Protocol):
    name: str
    maximum_score: float

    def evaluate(self, ctx: ScoringContext) -> RuleResult: ...
