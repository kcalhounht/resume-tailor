from .impact_rules import IMPACT_RULES
from .keyword_rules import KEYWORD_RULES
from .experience_rules import EXPERIENCE_RULES
from .writing_rules import WRITING_RULES
from .ats_rules import ATS_RULES

ALL_RULES = (
    IMPACT_RULES
    + KEYWORD_RULES
    + EXPERIENCE_RULES
    + WRITING_RULES
    + ATS_RULES
)

CATEGORY_RULE_NAMES = {
    "impact": [r.name for r in IMPACT_RULES],
    "keyword_alignment": [r.name for r in KEYWORD_RULES],
    "experience_quality": [r.name for r in EXPERIENCE_RULES],
    "writing_quality": [r.name for r in WRITING_RULES],
    "ats_compatibility": [r.name for r in ATS_RULES],
}

__all__ = [
    "ALL_RULES",
    "CATEGORY_RULE_NAMES",
    "IMPACT_RULES",
    "KEYWORD_RULES",
    "EXPERIENCE_RULES",
    "WRITING_RULES",
    "ATS_RULES",
]
