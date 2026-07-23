import type {
  CandidateProfile,
  ExtractedJD,
  SkillGroup,
  TailoredPackage,
  TailoredResume,
} from "./types";
import { getLlmClient, getLlmModel, LLM_MAX_TOKENS, formatOpenRouterError } from "./llm";
import { parseModelJson } from "./parse-json";
import {
  buildExperienceOverview,
  buildVariedExperienceBullets,
} from "./resume-fallbacks";
import { sanitizePlainText } from "./validate-resume";
import { sanitizeKeywords } from "./keywords";

const SYSTEM_PROMPT = `You are an expert ATS resume writer and career coach.
Create a tailored resume and cover letter that maximize ATS keyword match for the target role.

Hard rules:
1. Resume sections: Summary, Skills, Experience, Education.
2. Skills MUST be classified into compact groups (not one skill per line). Use 4-6 groups such as:
   Languages, Frameworks/Libraries, Cloud/DevOps, Data/AI, Databases, Tools/Practices.
   Each group has a short category name and 4-10 comma-ready item strings.
3. Each experience MUST include:
   - overview: 1-2 sentences (about 25-45 words) describing what the company does and the candidate's core responsibility in that role, tailored toward the target JD.
   - exactly 7 bullet points of accomplishments.
4. Each bullet must be professional and specific (~25-40 words). Describe concrete work done.
5. Include hard numbers (counts, scale, volume, latency, users, datasets, dollars) but NEVER invent unrealistic percentages.
6. Include slightly MORE relevant experience breadth than the JD strictly requires.
7. Mirror JD terminology and hard skills heavily for ATS scoring.
8. keywords: array of important JD keywords/phrases that should be bolded.
9. Cover letter: 3-4 short paragraphs in ONE string, use \\n\\n between paragraphs. No icons/emojis.
10. Keep the candidate's company names, periods, locations, and education exactly as given. You may refine job titles slightly if plausible.
11. Do not invent employers or schools. Invent realistic overviews and accomplishment bullets grounded in the companies and JD.
12. Return ONLY valid compact JSON. Escape all double quotes inside strings. Do not wrap in markdown.
13. NEVER use markdown in any string (**bold**, *italic*, backticks, headings). Plain text only. Keyword bolding is applied later by the document formatter.

Strength coach rules (make the resume MUCH stronger):
14. Increase impact with numbers and metrics in nearly every bullet (scale, volume, latency, users, datasets, dollars, tickets, services). Never invent unrealistic percentages.
15. Compare against what hiring managers expect for THIS target role — prioritize the JD's must-haves, seniority, and stack.
16. Fix weak experience: rewrite thin/responsibility-only bullets into strong accomplishment bullets that show ownership and results.
17. Summary is REQUIRED and must be effective: open with the target role title, name distinct JD hard skills, state domain impact; no fluff. Keep it tight (about 55-90 words).
18. Remove vague buzzwords that add little value (passionate, results-driven, team player, synergy, go-getter, self-motivated, detail-oriented as empty claims).
19. Remove superfluous words; keep bullets crisp and high-signal (~25-40 words each).
20. Eliminate careless errors: no typos, broken grammar, duplicated skills ("Python, Python"), or leftover markdown.
21. Show ownership: project ownership, responsibility, and (when plausible) mentoring/leading — not just task lists.
22. Show initiative: proactivity, self-starting delivery, persistence solving hard problems.
23. Show communication: clear collaboration with stakeholders, teammates, or clients when relevant to the JD.
24. Show analytical skill: break down complex problems, evaluate options, deliver appropriate solutions.
25. Show teamwork: effective collaboration to achieve shared goals when relevant.
26. Swap weak language for strong action verbs (Built, Led, Designed, Owned, Shipped, Automated, Optimized, Diagnosed, Migrated, Fine-tuned). Avoid repeating the same verb/phrase across bullets.
27. Focus on accomplishments, not bare responsibilities.
28. Remove personal pronouns (I, me, my, we, our) from the resume body.
29. Keep bullet length consistent and scannable; use bullets only — never paragraphs in Experience.
30. Keep periods/dates exactly as given; do not invent or reformat into inconsistent styles.
31. Do NOT add outdated sections (References, Objective, Hobbies, Soft-skills essay, "Responsible for" blocks).
32. Skills section must be effective: compact grouped skills, JD-first, no one-skill-per-line dumps, no duplicates across groups.
33. Avoid unnecessary personal details — only name/contact from the profile, plus role content. No age, photo, marital status, etc.
34. Avoid passive voice ("was responsible for", "tasks were completed"); write active voice.
35. Keep punctuation and formatting consistent across bullets (same style, no trailing clutter).
36. Provide enough detail for a strong 1-page technical resume — dense, not sparse; do not cram filler.
37. Use correct tense: past roles in past tense; current role can use present/past mix for ongoing vs completed work.
38. Show growth across roles (increasing scope, ownership, complexity) when the profile supports it.
39. Keep the whole resume tightly focused on the target role and JD language for ATS screeners — key sections must be easy to scan (Summary, Skills, Experience, Education).

JSON shape:
{
  "resume": {
    "summary": string,
    "skills": [{ "category": string, "items": string[] }],
    "experiences": [{ "company": string, "title": string, "period": string, "location": string, "overview": string, "bullets": string[] }],
    "education": [{ "school": string, "degree": string, "discipline": string, "period": string, "location": string }],
    "keywords": string[]
  },
  "coverLetter": string
}`;

const COVER_LETTER_PROMPT = `You are an expert ATS resume writer and career coach.
Create a tailored cover letter that maximize ATS keyword match for the target role.

Hard rules:
1. Cover letter: 3-4 short paragraphs in ONE string, use \\n\\n between paragraphs. No icons/emojis.
2. Mirror JD terminology and hard skills heavily for ATS scoring.
3. Keep claims grounded in the candidate profile / resume summary / bullets provided. Do not invent employers or schools.
4. Emphasize ownership, initiative, communication, analytical problem-solving, and collaboration with concrete examples — not vague buzzwords.
5. Return ONLY valid compact JSON. Escape all double quotes inside strings. Do not wrap in markdown.
6. NEVER use markdown in any string (**bold**, *italic*, backticks, headings). Plain text only.

JSON shape:
{ "coverLetter": string }`;

/** Abort hung calls, but allow enough time for a real quality completion. */
const GENERATE_TIMEOUT_MS = 90_000;

function buildFallbackPackage(
  profile: CandidateProfile,
  extracted: ExtractedJD,
): TailoredPackage {
  return {
    resume: normalizeResume(undefined, profile, extracted),
    coverLetter: buildFallbackCoverLetter(profile, extracted),
  };
}

function countUniqueBullets(bullets: unknown): number {
  if (!Array.isArray(bullets)) return 0;
  const seen = new Set<string>();
  for (const raw of bullets) {
    const key = String(raw || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (key.length >= 24) seen.add(key);
  }
  return seen.size;
}

function bulletHasMetric(text: string): boolean {
  return (
    /\d/.test(text) ||
    /\$|€|£|%|\bms\b|\bqps\b|\brps\b|\btps\b|\bk\b|\bm\b|\busers?\b|\brequests?\b|\blatency\b|\buptime\b|\brevenue\b|\bcost\b|\bteam of\b|\bservices?\b|\bGPU\b|\btokens?\b/i.test(
      text,
    )
  );
}

function isVagueBullet(text: string): boolean {
  const t = text.toLowerCase();
  const vagueOnly =
    /partnered with stakeholders|cross-functional collaboration|improved reliability|drove initiatives|helped the team|worked closely with|contributed to various|responsible for supporting/;
  if (!vagueOnly.test(t)) return false;
  return !bulletHasMetric(text) || text.trim().split(/\s+/).length < 22;
}

function countSkillItems(skills: unknown): {
  groups: number;
  items: number;
  minGroupSize: number;
  duplicateItems: number;
} {
  if (!Array.isArray(skills) || !skills.length) {
    return { groups: 0, items: 0, minGroupSize: 0, duplicateItems: 0 };
  }
  let items = 0;
  let minGroupSize = Infinity;
  const seen = new Set<string>();
  let duplicateItems = 0;
  for (const group of skills) {
    if (group && typeof group === "object" && Array.isArray((group as { items?: unknown }).items)) {
      const list = (group as { items: unknown[] }).items
        .map((i) => String(i || "").trim())
        .filter(Boolean);
      items += list.length;
      minGroupSize = Math.min(minGroupSize, list.length);
      for (const item of list) {
        const key = item.toLowerCase();
        if (seen.has(key)) duplicateItems += 1;
        else seen.add(key);
      }
    } else if (typeof group === "string" && group.trim()) {
      items += 1;
    }
  }
  const groups =
    typeof skills[0] === "object" && skills[0] !== null ? skills.length : items > 0 ? 1 : 0;
  return {
    groups,
    items,
    minGroupSize: Number.isFinite(minGroupSize) ? minGroupSize : 0,
    duplicateItems,
  };
}

function summaryLooksWeak(summary: string, extracted: ExtractedJD): boolean {
  const words = summary.trim().split(/\s+/).filter(Boolean);
  if (words.length < 60 || summary.length < 320) return true;
  if (
    /passionate|results-driven|team player|leveraging|proven track record|highly motivated|dedicated professional|as engineer at company/i.test(
      summary,
    )
  ) {
    return true;
  }
  // Detect immediate word repeats: "Python, Python"
  if (/\b([A-Za-z][A-Za-z0-9+.#-]{1,24})\b(?:\s*[,/|]\s*|\s+)\1\b/i.test(summary)) {
    return true;
  }
  const title = (extracted.jobTitle || extracted.type || "").trim().toLowerCase();
  if (title.length >= 4 && !summary.toLowerCase().startsWith(title.slice(0, Math.min(12, title.length)))) {
    // Allow near-start if title appears in first 8 words
    const head = words.slice(0, 8).join(" ").toLowerCase();
    if (!head.includes(title.split(/\s+/)[0] || title)) return true;
  }
  return false;
}

function hasCrossRoleRepetition(experiences: TailoredResume["experiences"] | undefined): boolean {
  if (!Array.isArray(experiences) || experiences.length < 2) return false;
  const prefixes: string[] = [];
  for (const exp of experiences) {
    for (const raw of exp?.bullets || []) {
      const key = String(raw || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 56);
      if (key.length < 28) continue;
      if (prefixes.some((p) => p === key || p.slice(0, 40) === key.slice(0, 40))) {
        return true;
      }
      prefixes.push(key);
    }
  }
  return false;
}

function looksTemplatedExperience(
  experiences: TailoredResume["experiences"] | undefined,
): boolean {
  if (!Array.isArray(experiences) || !experiences.length) return true;
  const bullets = experiences.flatMap((e) => e.bullets || []).map(String);
  if (bullets.length < 4) return true;

  const cannedHits = bullets.filter((b) =>
    /built and shipped production features as |led design and delivery of services with |scaled platform components around |cutting critical-path p95 latency by ~28%|8\+ production increments per quarter|supporting ~10x peak request volume/i.test(
      b,
    ),
  ).length;
  if (cannedHits >= 2) return true;

  const verbs = bullets
    .map((b) => (b.trim().split(/\s+/)[0] || "").toLowerCase())
    .filter(Boolean);
  const verbCounts = new Map<string, number>();
  for (const v of verbs) verbCounts.set(v, (verbCounts.get(v) || 0) + 1);
  const maxVerb = Math.max(...verbCounts.values(), 0);
  if (maxVerb >= Math.ceil(bullets.length * 0.45)) return true;

  const metricShape = bullets.filter((b) =>
    /~?\d+%\b|p95|10x|8\+|mid-teens/i.test(b),
  ).length;
  if (metricShape >= Math.ceil(bullets.length * 0.55)) return true;

  return false;
}

/** True when the model returned thin summary/skills or low-impact / repetitive bullets. */
function isWeakModelPackage(
  draft: TailoredPackage,
  profile: CandidateProfile,
  extracted: ExtractedJD,
): boolean {
  const summary = String(draft.resume?.summary || "").trim();
  if (summaryLooksWeak(summary, extracted)) return true;

  const { groups, items, minGroupSize, duplicateItems } = countSkillItems(
    draft.resume?.skills,
  );
  if (groups < 5 || items < 30 || minGroupSize < 5 || duplicateItems >= 2) {
    return true;
  }

  const jdSkills = [
    ...extracted.hardTechnicalSkills,
    ...extracted.requiredSkills,
  ]
    .map((s) => s.toLowerCase().trim())
    .filter((s) => s.length >= 2);
  const uniqueJd = [...new Set(jdSkills)].slice(0, 16);
  if (uniqueJd.length >= 3) {
    const hay = `${summary} ${JSON.stringify(draft.resume?.skills || [])}`.toLowerCase();
    const hits = uniqueJd.filter((s) => hay.includes(s)).length;
    if (hits < Math.min(6, uniqueJd.length)) return true;
  }

  if (hasCrossRoleRepetition(draft.resume?.experiences)) return true;
  if (looksTemplatedExperience(draft.resume?.experiences)) return true;

  for (let i = 0; i < profile.experiences.length; i++) {
    const exp = draft.resume?.experiences?.[i];
    const bullets = Array.isArray(exp?.bullets)
      ? exp!.bullets.map((b) => String(b || "").trim()).filter(Boolean)
      : [];
    const unique = countUniqueBullets(bullets);
    if (unique < 7) return true;
    const withMetrics = bullets.filter(bulletHasMetric).length;
    if (withMetrics < 5) return true;
    const shortOrVague = bullets.filter(
      (b) => b.split(/\s+/).length < 22 || isVagueBullet(b),
    ).length;
    if (shortOrVague >= 2) return true;
    const overview = String(exp?.overview || "").trim();
    if (overview.split(/\s+/).filter(Boolean).length < 22) return true;
  }
  return false;
}

function finalizePackage(
  draft: TailoredPackage,
  profile: CandidateProfile,
  extracted: ExtractedJD,
): TailoredPackage {
  let resume = normalizeResume(draft.resume, profile, extracted);
  let coverLetter = sanitizePlainText(draft.coverLetter || "");

  resume = {
    ...resume,
    summary: collapseRepeatedTokens(sanitizePlainText(resume.summary)),
    experiences: dedupeExperienceBullets(resume.experiences, profile, extracted),
  };

  if (
    !resume.summary ||
    resume.summary.length < 200 ||
    summaryLooksWeak(resume.summary, extracted)
  ) {
    resume = {
      ...resume,
      summary: buildFallbackSummary(profile, extracted),
    };
  }
  if (!coverLetter) {
    coverLetter = buildFallbackCoverLetter(profile, extracted);
  }
  return { resume, coverLetter };
}

export async function generateTailoredPackage(
  profile: CandidateProfile,
  extracted: ExtractedJD,
  rawJd: string,
  options?: { sourceResumeText?: string },
): Promise<TailoredPackage> {
  const client = getLlmClient();
  const model = getLlmModel();
  const userPayload = JSON.stringify({
    candidate: profile,
    extractedJd: extracted,
    rawJobDescription: rawJd.slice(0, 10_000),
    sourceResumeText: options?.sourceResumeText
      ? options.sourceResumeText.slice(0, 12_000)
      : undefined,
    mustIncludeSkills: [
      ...extracted.hardTechnicalSkills,
      ...extracted.requiredSkills,
    ].slice(0, 28),
    jdExperienceThemes: [
      ...extracted.responsibilities,
      ...extracted.mustHave,
    ].slice(0, 12),
    targetRole: extracted.jobTitle || extracted.type,
    targetCompany: extracted.company,
    qualityBar:
      "Follow system hard rules + strength coach rules: metrics in bullets, strong action verbs, accomplishments not duties, no buzzwords/pronouns/passive voice, effective summary + grouped skills, JD-focused.",
    instructions:
      "Follow the system prompt hard rules AND strength coach rules exactly. Maximize ATS keyword match and hiring-manager impact. Return valid compact JSON only (resume + coverLetter). No markdown.",
  });

  const baseMessages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPayload },
  ];

  async function runOnce(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    temperature = 0.5,
    maxTokens = LLM_MAX_TOKENS.generate,
  ): Promise<TailoredPackage | null> {
    try {
      let content = await requestJson(
        client,
        model,
        messages,
        temperature,
        maxTokens,
      );
      let parsedRaw: unknown;
      try {
        parsedRaw = parseModelJson(content);
      } catch {
        content = await requestJson(
          client,
          model,
          [
            ...messages,
            { role: "assistant", content },
            {
              role: "user",
              content:
                "Your previous reply was invalid or truncated JSON. Return ONLY complete repaired valid JSON matching the system prompt hard rules: Summary/Skills/Experience/Education, 4-6 skill groups with 4-10 items each, exactly 7 specific bullets per role (~25-40 words) with hard numbers (never unrealistic %), keywords array, coverLetter as 3-4 paragraphs with \\n\\n. No markdown.",
            },
          ],
          Math.min(temperature, 0.35),
          maxTokens,
        );
        parsedRaw = parseModelJson(content);
      }
      return coerceTailoredPackage(parsedRaw);
    } catch (err) {
      console.warn(
        "Generate attempt failed:",
        err instanceof Error ? err.message : err,
      );
      return null;
    }
  }

  async function generateCoverLetter(
    resume: TailoredResume,
  ): Promise<string> {
    try {
      const content = await requestJson(
        client,
        model,
        [
          { role: "system", content: COVER_LETTER_PROMPT },
          {
            role: "user",
            content: JSON.stringify({
              candidateName: profile.personal.name,
              targetCompany: extracted.company,
              targetRole: extracted.jobTitle || extracted.type,
              mustIncludeSkills: [
                ...extracted.hardTechnicalSkills,
                ...extracted.requiredSkills,
              ].slice(0, 12),
              jdSummary: extracted.summary,
              resumeSummary: resume.summary,
              topSkills: resume.skills.flatMap((g) => g.items).slice(0, 12),
              recentBullets: resume.experiences[0]?.bullets?.slice(0, 3) || [],
              instructions:
                "Follow hard rule: 3-4 short paragraphs in ONE string with \\n\\n between paragraphs. Mirror JD terminology. No markdown.",
            }),
          },
        ],
        0.45,
        LLM_MAX_TOKENS.coverLetter,
      );
      const parsed = parseModelJson<{ coverLetter?: string }>(content);
      return String(parsed.coverLetter || "").trim();
    } catch (err) {
      console.warn(
        "Cover letter generation failed:",
        err instanceof Error ? err.message : err,
      );
      return "";
    }
  }

  const rewritePrompt = `REWRITE the FULL JSON to better follow the system hard rules AND strength coach rules for ${extracted.jobTitle || extracted.type} at ${extracted.company || "the employer"}.
Mandatory:
1. Skills: 4-6 compact groups, 4-10 items each; JD-first; no duplicates; effective for ATS screeners.
2. Experience: overview 25-45 words + exactly 7 accomplishment bullets (~25-40 words) with metrics; strong varied action verbs; active voice; no pronouns; no buzzwords; ownership/initiative/collaboration/analytical impact where relevant.
3. Summary: effective, target-role focused, distinct JD skills, no fluff.
4. keywords: important JD phrases for bolding.
5. coverLetter: 3-4 short paragraphs with \\n\\n; concrete fit, not vague praise.
6. Keep company names, periods, locations, education exact. No markdown. No outdated sections.
Return complete valid JSON only.`;

  try {
    let draft = await runOnce(baseMessages, 0.5);

    // Up to two rewrites when the package is still weak vs the hard rules.
    for (let pass = 0; pass < 2; pass++) {
      if (draft && !isWeakModelPackage(draft, profile, extracted)) break;
      draft =
        (await runOnce(
          [
            ...baseMessages,
            {
              role: "user",
              content: rewritePrompt,
            },
          ],
          0.55 + pass * 0.05,
        )) || draft;
    }

    if (!draft) {
      console.warn("Generate exhausted LLM attempts; using local fallback package.");
      return buildFallbackPackage(profile, extracted);
    }

    const coverLetter =
      String(draft.coverLetter || "").trim() ||
      (await generateCoverLetter(draft.resume)) ||
      buildFallbackCoverLetter(profile, extracted);

    return finalizePackage(
      { resume: draft.resume, coverLetter },
      profile,
      extracted,
    );
  } catch (err) {
    console.warn(
      "Generate falling back to deterministic package:",
      err instanceof Error ? err.message : err,
    );
    return buildFallbackPackage(profile, extracted);
  }
}

function coerceTailoredPackage(raw: unknown): TailoredPackage {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;

  // Some models nest under data / result / output
  const root =
    (obj.resume && typeof obj.resume === "object"
      ? obj
      : (obj.data as Record<string, unknown>) ||
        (obj.result as Record<string, unknown>) ||
        (obj.output as Record<string, unknown>) ||
        obj) || {};

  const resumeObj = (root.resume && typeof root.resume === "object"
    ? root.resume
    : root) as Record<string, unknown>;

  const summary = pickString(
    resumeObj.summary,
    resumeObj.professionalSummary,
    resumeObj.professional_summary,
    resumeObj.profileSummary,
    resumeObj.about,
    obj.summary,
  );

  const coverLetter = pickString(
    root.coverLetter,
    root.cover_letter,
    root.coverletter,
    obj.coverLetter,
    obj.cover_letter,
  );

  return {
    resume: {
      summary,
      skills: (resumeObj.skills as TailoredResume["skills"]) || [],
      experiences:
        (resumeObj.experiences as TailoredResume["experiences"]) || [],
      education: (resumeObj.education as TailoredResume["education"]) || [],
      keywords: (resumeObj.keywords as string[]) || [],
    },
    coverLetter,
  };
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const joined = value.map(String).join(" ").trim();
      if (joined) return joined;
    }
  }
  return "";
}

function buildFallbackSummary(
  profile: CandidateProfile,
  extracted: ExtractedJD,
): string {
  const title = extracted.jobTitle || extracted.type || "Software Engineer";
  const skills = Array.from(
    new Set(
      [...extracted.hardTechnicalSkills, ...extracted.requiredSkills]
        .map((s) => String(s).trim())
        .filter(Boolean),
    ),
  ).slice(0, 8);
  const skillBit = skills.length
    ? skills.join(", ")
    : "modern cloud-native software and data stacks";
  const latest = profile.experiences[0];
  const badCompany =
    !latest?.company ||
    /^(company|previous employer|employer|unknown)$/i.test(latest.company);
  const roleBit =
    latest && !badCompany
      ? `${latest.title} at ${latest.company}`
      : "shipping production ML and platform systems";
  const company =
    extracted.company &&
    !/^(unknown company|company|unknown)$/i.test(extracted.company)
      ? extracted.company
      : "product and platform engineering teams";
  return `${title} specializing in ${skillBit}. Recent work as ${roleBit} focused on production delivery — model/system quality, latency, and reliable rollout. Combines hands-on implementation with clear ownership from design through monitoring for ${extracted.workMode || "hybrid"} environments supporting ${company}.`;
}

function collapseRepeatedTokens(text: string): string {
  return text
    .replace(/\b([A-Za-z][A-Za-z0-9+.#-]{1,24})\b(?:\s*[,/|]\s*|\s+)\1\b/gi, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function dedupeExperienceBullets(
  experiences: TailoredResume["experiences"],
  profile: CandidateProfile,
  extracted: ExtractedJD,
): TailoredResume["experiences"] {
  const usedPrefixes = new Set<string>();

  return experiences.map((exp, index) => {
    const kept: string[] = [];
    for (const bullet of exp.bullets || []) {
      const clean = collapseRepeatedTokens(sanitizePlainText(bullet));
      const prefix = clean.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 56);
      if (!clean || prefix.length < 24) continue;
      if ([...usedPrefixes].some((p) => p.slice(0, 40) === prefix.slice(0, 40))) {
        continue;
      }
      usedPrefixes.add(prefix);
      kept.push(clean);
    }

    const filled = buildVariedExperienceBullets(
      {
        company: exp.company || profile.experiences[index]?.company || "Company",
        title: exp.title || profile.experiences[index]?.title || "Engineer",
        location: exp.location || profile.experiences[index]?.location || "Remote",
      },
      extracted,
      kept,
      7,
    ).filter((b) => {
      const prefix = b.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 56);
      if ([...usedPrefixes].some((p) => p.slice(0, 40) === prefix.slice(0, 40))) {
        return false;
      }
      usedPrefixes.add(prefix);
      return true;
    });

    // If filters removed too many, keep role-local unique fills
    const bullets =
      filled.length >= 7
        ? filled.slice(0, 7)
        : buildVariedExperienceBullets(
            {
              company: exp.company,
              title: exp.title,
              location: exp.location,
            },
            extracted,
            kept,
            7,
          );

    return {
      ...exp,
      overview: collapseRepeatedTokens(sanitizePlainText(exp.overview || "")),
      bullets,
    };
  });
}

function buildFallbackCoverLetter(
  profile: CandidateProfile,
  extracted: ExtractedJD,
): string {
  const name = profile.personal.name || "Candidate";
  const company = extracted.company || "your team";
  const title = extracted.jobTitle || "the open role";
  const skills = [
    ...extracted.hardTechnicalSkills,
    ...extracted.requiredSkills,
  ]
    .filter(Boolean)
    .slice(0, 6)
    .join(", ");
  const latest = profile.experiences[0];
  const win = latest
    ? `At ${latest.company} as ${latest.title}, I owned delivery involving ${skills || "core platform technologies"}, shipping production increments with clear latency, reliability, and throughput targets.`
    : `I have delivered production systems involving ${skills || "modern engineering stacks"}, with clear ownership of reliability, performance, and release quality.`;
  return [
    `Dear Hiring Manager,\n\nI am applying for the ${title} role at ${company}. My background maps closely to the stack and outcomes described in the posting, and I am eager to contribute immediately.`,
    win,
    `I care about concrete results — cutting latency, raising throughput, and keeping systems operable — and I communicate tradeoffs clearly with product and engineering partners. I would welcome a conversation about how this experience can support ${company}'s roadmap.\n\nThank you for your time and consideration.\n\nSincerely,\n${name}`,
  ].join("\n\n");
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function requestJson(
  client: ReturnType<typeof getLlmClient>,
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  temperature = 0.5,
  maxTokens = LLM_MAX_TOKENS.generate,
): Promise<string> {
  const attempts: Array<{ useJsonObjectFormat: boolean; label: string }> = [
    { useJsonObjectFormat: true, label: "json_object" },
    { useJsonObjectFormat: false, label: "plain" },
  ];

  let lastError: Error | null = null;
  for (const attempt of attempts) {
    try {
      const completion = await withTimeout(
        client.chat.completions.create(
          {
            model,
            temperature,
            max_tokens: maxTokens,
            ...(attempt.useJsonObjectFormat
              ? { response_format: { type: "json_object" as const } }
              : {}),
            messages,
          },
          { signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS) },
        ),
        GENERATE_TIMEOUT_MS + 2_000,
        `Generate (${attempt.label})`,
      );

      const content = completion.choices[0]?.message?.content;
      const finish = completion.choices[0]?.finish_reason;
      if (!content?.trim()) {
        throw new Error(
          `Empty response while generating tailored resume (${attempt.label}).`,
        );
      }
      if (finish === "length") {
        throw new Error(
          `Generate response truncated at max_tokens (${attempt.label}).`,
        );
      }
      return content;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error("Generate attempt failed:", attempt.label, lastError);
    }
  }

  if (lastError) {
    throw new Error(formatOpenRouterError(lastError));
  }
  throw new Error("Empty response while generating tailored resume.");
}

function normalizeSkills(
  skills: unknown,
  extracted: ExtractedJD,
): SkillGroup[] {
  const jdSkills = [
    ...extracted.hardTechnicalSkills,
    ...extracted.requiredSkills,
  ]
    .map((s) => sanitizePlainText(String(s)))
    .filter(Boolean);

  const jdHay = [
    ...jdSkills,
    extracted.jobTitle,
    extracted.type,
    extracted.summary,
  ]
    .join(" ")
    .toLowerCase();

  const isMl =
    /ml|ai|llm|nlp|pytorch|tensorflow|machine learning|deep learning|data scientist/i.test(
      jdHay,
    );
  const isData =
    isMl ||
    /data engineer|spark|airflow|etl|warehouse|snowflake|kafka|analytics/i.test(
      jdHay,
    );

  const adjacentRows: Array<{ category: string; seeds: string[] }> = [
    {
      category: "Languages",
      seeds: ["Python", "TypeScript", "SQL", "Bash"],
    },
    {
      category: "Frameworks/Libraries",
      seeds: isMl
        ? [
            "PyTorch",
            "Hugging Face",
            "FastAPI",
            "LangChain",
            "scikit-learn",
            "NumPy",
            "Pandas",
          ]
        : ["React", "Node.js", "FastAPI", "REST APIs", "GraphQL", "Express"],
    },
    {
      category: "Cloud/DevOps",
      seeds: [
        "AWS",
        "Docker",
        "Kubernetes",
        "CI/CD",
        "Terraform",
        "GitHub Actions",
      ],
    },
    {
      category: isMl || isData ? "Data/AI" : "Data/Platform",
      seeds: isMl
        ? [
            "LLMs",
            "NLP",
            "RAG",
            "feature stores",
            "model evaluation",
            "vector search",
            "ETL",
          ]
        : isData
          ? [
              "ETL",
              "data pipelines",
              "Spark",
              "Kafka",
              "warehousing",
              "SQL analytics",
            ]
          : [
              "PostgreSQL",
              "Redis",
              "caching",
              "event-driven design",
              "API design",
            ],
    },
    {
      category: "Databases",
      seeds: ["PostgreSQL", "Redis", "MongoDB", "S3", "Kafka"],
    },
    {
      category: "Tools/Practices",
      seeds: [
        "system design",
        "observability",
        "A/B testing",
        "code review",
        "Agile",
        "on-call",
      ],
    },
  ];

  const densify = (groups: SkillGroup[]): SkillGroup[] => {
    const classify = (skill: string): string => {
      const s = skill.toLowerCase();
      if (
        /python|java|typescript|javascript|go\b|rust|c\+\+|c#|kotlin|swift|scala|sql|bash|r\b/.test(
          s,
        )
      ) {
        return "Languages";
      }
      if (
        /aws|gcp|azure|docker|kubernetes|terraform|ci\/?cd|devops|github actions|gitlab/.test(
          s,
        )
      ) {
        return "Cloud/DevOps";
      }
      if (
        /postgres|mysql|mongo|redis|dynamo|cassandra|snowflake|s3|kafka|elasticsearch/.test(
          s,
        )
      ) {
        return "Databases";
      }
      if (
        /ml|ai|llm|nlp|pytorch|tensor|spark|etl|rag|vector|pandas|sklearn|scikit|huggingface|langchain|airflow|feature store/.test(
          s,
        ) ||
        isMl ||
        isData
      ) {
        return isMl || isData ? "Data/AI" : "Data/Platform";
      }
      if (
        /react|node|fastapi|django|flask|spring|express|graphql|langgraph|vllm|transformers/.test(
          s,
        )
      ) {
        return "Frameworks/Libraries";
      }
      return "Tools/Practices";
    };

    const byCategory = new Map<string, string[]>();
    const used = new Set<string>();

    const push = (category: string, item: string) => {
      const clean = sanitizePlainText(item);
      const key = clean.toLowerCase();
      if (!clean || used.has(key)) return;
      used.add(key);
      const list = byCategory.get(category) || [];
      if (list.length >= 10) return;
      list.push(clean);
      byCategory.set(category, list);
    };

    // Preserve model groups first (deduped globally).
    for (const group of groups) {
      for (const item of group.items) push(group.category, item);
    }

    // Place each JD skill in ONE best category only.
    for (const skill of jdSkills) {
      push(classify(skill), skill);
    }

    // Fill thin groups with adjacent seeds (still globally unique).
    for (const row of adjacentRows) {
      for (const seed of row.seeds) {
        const list = byCategory.get(row.category) || [];
        if (list.length >= 6) break;
        push(row.category, seed);
      }
    }

    // Ensure we have 5-6 named groups.
    for (const row of adjacentRows) {
      if (byCategory.size >= 6) break;
      if (!byCategory.has(row.category)) {
        for (const seed of row.seeds.slice(0, 6)) push(row.category, seed);
      }
    }

    return [...byCategory.entries()]
      .map(([category, items]) => ({ category, items }))
      .filter((g) => g.items.length >= 5)
      .slice(0, 6);
  };

  const mergeJd = (groups: SkillGroup[]): SkillGroup[] => {
    if (!jdSkills.length) return densify(groups);
    const existing = new Set(
      groups.flatMap((g) => g.items.map((i) => i.toLowerCase())),
    );
    const missing = jdSkills.filter((s) => !existing.has(s.toLowerCase()));
    if (!missing.length) return densify(groups);
    if (!groups.length) {
      return densify([
        { category: "Technical Skills", items: missing.slice(0, 12) },
      ]);
    }
    const next = groups.map((group, index) =>
      index === 0
        ? {
            ...group,
            items: [...group.items, ...missing].slice(0, 12),
          }
        : group,
    );
    return densify(next);
  };

  if (Array.isArray(skills) && skills.length) {
    // New grouped format
    if (
      typeof skills[0] === "object" &&
      skills[0] !== null &&
      "category" in (skills[0] as object)
    ) {
      const grouped = (skills as Array<{ category?: unknown; items?: unknown }>)
        .map((group) => ({
          category: sanitizePlainText(String(group.category || "Skills")),
          items: Array.isArray(group.items)
            ? group.items
                .map(String)
                .map((s) => sanitizePlainText(s))
                .filter(Boolean)
            : [],
        }))
        .filter((group) => group.items.length > 0);
      return mergeJd(grouped);
    }

    // Legacy flat string list -> one compact Technical Skills group
    const items = skills
      .map(String)
      .map((s) => sanitizePlainText(s))
      .filter(Boolean);
    if (items.length) {
      return mergeJd([{ category: "Technical Skills", items }]);
    }
  }

  const fallback = jdSkills;
  if (!fallback.length) {
    return densify([
      {
        category: "Core",
        items: [
          "Software Engineering",
          "System Design",
          "APIs",
          "Cloud Services",
          "CI/CD",
          "Agile Delivery",
        ],
      },
    ]);
  }

  const languages = fallback.filter((s) =>
    /python|java|typescript|javascript|go|rust|c\+\+|c#|kotlin|swift|scala|sql|bash/i.test(
      s,
    ),
  );
  const cloud = fallback.filter((s) =>
    /aws|gcp|azure|docker|kubernetes|terraform|ci\/?cd|devops/i.test(s),
  );
  const data = fallback.filter((s) =>
    /sql|postgres|mysql|mongo|redis|kafka|spark|snowflake|airflow|etl|llm|nlp|ml|pytorch|tensorflow|rag|vector/i.test(
      s,
    ),
  );
  const frameworks = fallback.filter(
    (s) =>
      !languages.includes(s) && !cloud.includes(s) && !data.includes(s),
  );

  const groups: SkillGroup[] = [];
  if (languages.length) groups.push({ category: "Languages", items: languages });
  if (frameworks.length)
    groups.push({ category: "Frameworks/Libraries", items: frameworks });
  if (cloud.length) groups.push({ category: "Cloud/DevOps", items: cloud });
  if (data.length)
    groups.push({
      category: isMl || isData ? "Data/AI/ML" : "Data/Platform",
      items: data,
    });
  if (!groups.length) {
    groups.push({ category: "Technical Skills", items: fallback });
  }
  return densify(groups);
}

function normalizeResume(
  resume: TailoredResume | undefined,
  profile: CandidateProfile,
  extracted: ExtractedJD,
): TailoredResume {
  const safe = resume || {
    summary: "",
    skills: [],
    experiences: [],
    education: [],
    keywords: [],
  };

  const skillGroups = normalizeSkills(safe.skills, extracted);

  const keywords = sanitizeKeywords(
    Array.from(
      new Set(
        [
          ...(safe.keywords || []),
          ...skillGroups.flatMap((g) => g.items),
          ...extracted.hardTechnicalSkills,
          ...extracted.requiredSkills,
          extracted.jobTitle,
          extracted.type,
        ]
          .map((k) => String(k).trim())
          .filter(Boolean),
      ),
    ),
  );

  const experiences = profile.experiences.map((exp, index) => {
    const generated = safe.experiences?.[index];
    const incoming = (generated?.bullets || [])
      .map(String)
      .map((b) => sanitizePlainText(b))
      .filter(Boolean);

    const bullets = buildVariedExperienceBullets(
      exp,
      extracted,
      incoming,
      7,
    );

    const overview = sanitizePlainText(
      String(
        generated && "overview" in generated
          ? (generated as { overview?: string }).overview || ""
          : "",
      ),
    );

    return {
      company: exp.company,
      title: sanitizePlainText(generated?.title?.trim() || exp.title),
      period: exp.period,
      location: exp.location,
      overview:
        overview || buildExperienceOverview(exp, extracted, index),
      bullets,
    };
  });

  return {
    summary:
      sanitizePlainText(String(safe.summary || "")) ||
      buildFallbackSummary(profile, extracted),
    skills: skillGroups,
    experiences,
    education:
      Array.isArray(safe.education) && safe.education.length
        ? safe.education.map((edu) => ({
            school: sanitizePlainText(edu.school),
            degree: sanitizePlainText(edu.degree),
            discipline: sanitizePlainText(
              (edu as { discipline?: string }).discipline || "",
            ),
            period: sanitizePlainText(edu.period),
            location: sanitizePlainText(edu.location),
          }))
        : profile.education,
    keywords: keywords.map((k) => sanitizePlainText(k)).filter(Boolean),
  };
}
