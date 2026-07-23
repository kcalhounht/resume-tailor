/**
 * Style guide derived from the Ivan Gerardo reference resume.
 * All tailored resumes should match this template structure and writing style.
 */
export const IVAN_TEMPLATE_STYLE_PROMPT = `
==================================================
REFERENCE TEMPLATE STYLE (MANDATORY)
==================================================
Match the structure and writing quality of a Principal/Senior AI-ML style resume like this reference:

HEADER
- Full name
- Target job title (exact JD title) directly under the name
- Contact line: Location | email | phone
- LinkedIn URL on its own line

SECTIONS (use these names in content intent; JSON keys stay the same)
1) Profile (JSON: summary)
2) Skills & Abilities (JSON: skills)
3) Experience (JSON: experiences)
4) Education (JSON: education)

PROFILE (summary) — 70–110 words, 2–3 short paragraphs in ONE string separated by \\n\\n:
Paragraph 1: Start with exact JD job title + years/tenure signal (only if true) + domain breadth + production systems ownership.
Paragraph 2–3: 1–2 quantified achievement sentences (Action + Tech + Metric), written as full sentences (not bullets), mirroring the strongest JD themes.
Example tone:
"Senior AI/ML Engineer with 10+ years of experience designing, developing, and deploying production-grade machine learning..."
"Formulated and refined LLM applications using Python, TensorFlow, and Hugging Face, boosting inference speeds by 40%..."

SKILLS & ABILITIES
- 4–6 category groups
- Format intent: "Category: item, item, item"
- Prefer JD-shaped categories such as:
  AI/ML & Deep Learning | Generative AI & LLMs | MLOps & Cloud | Data & Analytics | Software & Deployment
  (adapt category names to the target JD; keep this density/style)
- Put must-have / required JD skills first inside each group
- Only include skills supported by candidate evidence

EXPERIENCE
- Keep company, period, location EXACT from candidate
- Title may be refined toward JD title if plausible
- overview: leave empty string "" (this template has no role overview blurbs)
- 6–10 accomplishment bullets per recent role; 5–8 for older roles when supported
- Each bullet: STRONG ACTION VERB + technology + engineering work + measurable impact
- Prefer real metrics from source; if source lacks numbers, write crisp technical outcomes without inventing fake percentages
- Vary opening verbs across the resume (never same opener >2 times)
- Experience header style intent: "TITLE | COMPANY | PERIOD"

EDUCATION
- Keep school/degree/discipline/period exact
- Style intent: "Degree in DISCIPLINE | period | School"

WRITING VOICE
- Dense, technical, accomplishment-driven
- Name concrete tools in bullets (Python, PyTorch, AWS, FastAPI, Kubernetes, etc.)
- No buzzwords, no first person, no "responsible for / helped / worked on"
- No JD marketing leaks ("About the job", "Who are we")
- No repeated sentence skeletons across companies
`;
