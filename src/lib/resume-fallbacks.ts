import type { ExtractedJD } from "./types";

type ExperienceSeed = {
  company: string;
  title: string;
  location: string;
};

const JD_LEAK_RE =
  /\b(about the job|about the role|about this job|who are we\??|job description|what you.?ll do|responsibilities include|we are looking for|the leading .{0,40} company)\b/i;

const BANNED_TEMPLATE_OPENERS = [
  /^delivered work at /i,
  /^owned a slice of /i,
  /^partnered on /i,
  /^improved operational readiness for /i,
  /^built tooling\/process for /i,
  /^translated .+ requirements into concrete /i,
  /^strengthened .+ at /i,
  /^advanced .+ as /i,
  /supporting .+ outcomes through /i,
];

/** Strong verbs — rotate so no opener repeats across the whole resume. */
const VERB_BANK = [
  "Architected",
  "Designed",
  "Implemented",
  "Optimized",
  "Automated",
  "Scaled",
  "Migrated",
  "Refactored",
  "Orchestrated",
  "Engineered",
  "Hardened",
  "Streamlined",
  "Instrumented",
  "Diagnosed",
  "Stabilized",
  "Modernized",
  "Integrated",
  "Deployed",
  "Tuned",
  "Unified",
  "Extended",
    "Prototyped",
  "Spearheaded",
  "Championed",
  "Elevated",
  "Accelerated",
  "Consolidated",
  "Standardized",
  "Provisioned",
  "Secured",
];

function normalizeBulletKey(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function structureSignature(text: string, companies: string[] = []): string {
  let s = normalizeBulletKey(text)
    .replace(/\b\d+(\.\d+)?%?\b/g, "#")
    .replace(/\b[a-z0-9+.#-]{2,24}(?:, [a-z0-9+.#-]{2,24}){1,4}\b/g, "TECH");
  for (const c of companies) {
    const name = String(c || "").trim();
    if (name.length >= 2) {
      s = s.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "CO");
    }
  }
  return s.replace(/\s+/g, " ").slice(0, 90);
}

function skillPool(extracted: ExtractedJD): string[] {
  const fromJd = [
    ...extracted.hardTechnicalSkills,
    ...extracted.requiredSkills,
  ]
    .map(String)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !JD_LEAK_RE.test(s));
  if (fromJd.length >= 3) return [...new Set(fromJd)];
  return [
    ...fromJd,
    "APIs",
    "cloud services",
    "distributed systems",
    "CI/CD",
    "observability",
  ];
}

function skillPhrase(skills: string[], start: number, count = 2): string {
  if (!skills.length) return "core platform technologies";
  const picked: string[] = [];
  for (let i = 0; i < count * 3 && picked.length < count; i++) {
    const item = skills[(start + i) % skills.length];
    if (item && !picked.includes(item)) picked.push(item);
  }
  return picked.join(" and ");
}

function cleanFocus(raw: string): string {
  let s = String(raw || "")
    .replace(/^[-•\s]+/, "")
    .replace(/["“”]/g, "")
    .trim();
  if (JD_LEAK_RE.test(s)) {
    // Keep only a short technical clause if possible
    const cut = s.split(/About the job|Who are we|Job description/i)[0]?.trim();
    s = cut && cut.length >= 12 ? cut : "";
  }
  s = s.replace(/\s+/g, " ").slice(0, 70);
  if (s.length < 12 || JD_LEAK_RE.test(s)) return "";
  return s;
}

function jdFocusLines(extracted: ExtractedJD): string[] {
  const lines = [
    ...extracted.responsibilities,
    ...extracted.mustHave,
    extracted.summary,
  ]
    .map(cleanFocus)
    .filter(Boolean);
  return [...new Set(lines)].slice(0, 8);
}

function hashSeed(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

function isBannedTemplate(text: string): boolean {
  const t = text.trim();
  if (JD_LEAK_RE.test(t)) return true;
  return BANNED_TEMPLATE_OPENERS.some((re) => re.test(t));
}

export function sanitizeExperienceBullet(text: string): string {
  let t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  // Strip leaked JD fragments mid-sentence
  t = t
    .replace(
      /\s*(?:tied to|aligned to|matching)?\s*["']?About the job[\s\S]*$/i,
      "",
    )
    .replace(/\s*Who are we\??[\s\S]*$/i, "")
    .replace(/\s*the leading .{0,60} company\.?/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[,\s]+$/g, "")
    .trim();
  if (t.length < 24 || isBannedTemplate(t) || JD_LEAK_RE.test(t)) return "";
  return t;
}

/** Distinct role overview — never the same skeleton across roles. */
export function buildExperienceOverview(
  exp: ExperienceSeed,
  extracted: ExtractedJD,
  roleIndex: number,
): string {
  const skills = skillPhrase(skillPool(extracted), roleIndex * 3, 2);
  const place = exp.location.trim() || "Remote";
  const target = extracted.jobTitle || extracted.type || "engineering";
  const focuses = jdFocusLines(extracted);
  const focus =
    focuses[roleIndex % Math.max(1, focuses.length)] ||
    `${target} delivery and production reliability`;

  const variants = [
    `${exp.title} at ${exp.company} (${place}). Owned delivery across ${skills} with emphasis on ${focus}.`,
    `Engineering lead work at ${exp.company} as ${exp.title}. Drove ${skills} initiatives supporting ${focus}.`,
    `${exp.company} — ${exp.title}. Hands-on across ${skills}; prioritized ${focus} for production stakeholders.`,
    `Full-stack ownership at ${exp.company} (${exp.title}, ${place}). Applied ${skills} toward ${focus}.`,
    `As ${exp.title} at ${exp.company}, shaped ${skills} solutions that advanced ${focus}.`,
  ];
  return variants[(roleIndex + hashSeed(exp.company)) % variants.length];
}

type BulletBuilder = (ctx: {
  company: string;
  title: string;
  skills: string;
  focus: string;
  roleIndex: number;
  bulletIndex: number;
  seed: number;
}) => string;

/** Completely different sentence shapes — one family per role to avoid clones. */
const ROLE_FAMILIES: BulletBuilder[][] = [
  [
    ({ company, skills, focus }) =>
      `Architected ${skills} services at ${company} to address ${focus}, improving release confidence for downstream teams.`,
    ({ title, skills }) =>
      `Designed API contracts and data flows using ${skills} while serving as ${title} on cross-team launches.`,
    ({ company, skills }) =>
      `Optimized request paths in ${company} production stacks with ${skills}, reducing hot-path latency under peak load.`,
    ({ skills, focus }) =>
      `Automated regression checks around ${skills} workflows so ${focus} changes shipped with fewer manual gates.`,
    ({ company, skills }) =>
      `Hardened observability for ${company} services with ${skills}, cutting noisy alerts during on-call rotations.`,
    ({ title, skills }) =>
      `Migrated legacy modules to ${skills}-backed patterns as ${title}, clarifying ownership boundaries for maintainers.`,
    ({ company, focus }) =>
      `Orchestrated staged rollouts at ${company} for ${focus}, coordinating QA and platform checkpoints before go-live.`,
  ],
  [
    ({ company, skills, focus }) =>
      `Engineered ${skills} features at ${company} that directly supported ${focus} without blocking adjacent squads.`,
    ({ title, skills }) =>
      `Refactored shared libraries using ${skills} in the ${title} role, lowering defect rates in shared UI/API surfaces.`,
    ({ company, skills }) =>
      `Stabilized critical ${company} paths with ${skills}, documenting recovery steps used by rotating on-call engineers.`,
    ({ skills, focus }) =>
      `Integrated ${skills} tooling into CI so ${focus} validations ran on every merge candidate.`,
    ({ company, skills }) =>
      `Tuned capacity and caching for ${company} workloads via ${skills}, keeping SLOs steady through traffic spikes.`,
    ({ title, focus }) =>
      `Championed technical trade-off reviews as ${title}, aligning ${focus} scope with realistic delivery windows.`,
    ({ company, skills }) =>
      `Extended platform primitives at ${company} with ${skills}, unlocking reuse across multiple product surfaces.`,
  ],
  [
    ({ company, skills, focus }) =>
      `Modernized ${company} delivery around ${skills}, focusing engineering effort on ${focus} outcomes.`,
    ({ title, skills }) =>
      `Provisioned environments and pipelines with ${skills} while acting as ${title} for multi-service releases.`,
    ({ company, skills }) =>
      `Diagnosed production incidents at ${company} using ${skills}, then closed permanent fixes instead of temporary patches.`,
    ({ skills, focus }) =>
      `Standardized coding patterns for ${skills} modules involved in ${focus}, speeding peer review turnaround.`,
    ({ company, skills }) =>
      `Secured service boundaries at ${company} with ${skills}-backed auth and audit trails for sensitive flows.`,
    ({ title, skills }) =>
      `Elevated developer experience as ${title} by streamlining local ${skills} setup and shared debug recipes.`,
    ({ company, focus }) =>
      `Consolidated overlapping services at ${company} related to ${focus}, reducing operational surface area.`,
  ],
  [
    ({ company, skills, focus }) =>
      `Spearheaded ${skills} delivery at ${company} for ${focus}, pairing architecture decisions with hands-on implementation.`,
    ({ title, skills }) =>
      `Unified fragmented ${skills} components under clearer interfaces during the ${title} tenure.`,
    ({ company, skills }) =>
      `Deployed progressive delivery controls at ${company} with ${skills}, limiting blast radius of risky changes.`,
    ({ skills, focus }) =>
      `Instrumented ${skills} pipelines measuring ${focus} health signals used in weekly reliability reviews.`,
    ({ company, skills }) =>
      `Scaled batch and online workloads at ${company} using ${skills}, balancing cost against throughput goals.`,
    ({ title, focus }) =>
      `Mentored engineers on ${focus} design reviews while holding ${title} accountability for production quality.`,
    ({ company, skills }) =>
      `Accelerated experiment cycles at ${company} by packaging ${skills} tooling that shortened feedback loops.`,
  ],
];

/**
 * Build unique bullets per role. Never reuse the same sentence shell across companies.
 * Avoids Resume Worded "similar bullet points" / repeated verb / phrase flags.
 */
export function buildVariedExperienceBullets(
  exp: ExperienceSeed,
  extracted: ExtractedJD,
  existing: string[],
  targetCount = 7,
  usedOpeners?: Set<string>,
  usedStructures?: Set<string>,
  knownCompanies?: string[],
  openerCounts?: Map<string, number>,
): string[] {
  const skills = skillPool(extracted);
  const focuses = jdFocusLines(extracted);
  const seed = hashSeed(`${exp.company}|${exp.title}|${extracted.jobTitle}`);
  const roleIndex = seed % ROLE_FAMILIES.length;
  const family = ROLE_FAMILIES[roleIndex];
  const openers = usedOpeners || new Set<string>();
  const structures = usedStructures || new Set<string>();
  const verbCounts = openerCounts || new Map<string, number>();
  const companies = [
    ...(knownCompanies || []),
    exp.company,
  ].filter(Boolean);

  const seen = new Set<string>();
  const out: string[] = [];

  const tryPush = (raw: string) => {
    const bullet = sanitizeExperienceBullet(raw);
    if (!bullet) return false;
    const key = normalizeBulletKey(bullet);
    if (key.length < 24 || seen.has(key)) return false;
    const opener = (bullet.trim().split(/\s+/)[0] || "").toLowerCase();
    // Resume Worded: same action verb more than twice → reject
    if (opener && (verbCounts.get(opener) || 0) >= 2) return false;
    const sig = structureSignature(bullet, companies);
    if ([...structures].some((s) => s.slice(0, 55) === sig.slice(0, 55))) {
      return false;
    }
    const prefix = key.slice(0, 48);
    if ([...seen].some((s) => s.slice(0, 48) === prefix)) return false;

    seen.add(key);
    if (opener) {
      openers.add(opener);
      verbCounts.set(opener, (verbCounts.get(opener) || 0) + 1);
    }
    structures.add(sig);
    out.push(bullet);
    return true;
  };

  for (const bullet of existing) {
    if (out.length >= targetCount) break;
    tryPush(bullet);
  }

  for (let i = 0; i < family.length && out.length < targetCount; i++) {
    const focus =
      focuses[(roleIndex + i) % Math.max(1, focuses.length)] ||
      `${extracted.jobTitle || "platform"} reliability`;
    const skillsPhrase = skillPhrase(skills, seed + i * 2 + roleIndex, 2);
    tryPush(
      family[i]({
        company: exp.company,
        title: exp.title,
        skills: skillsPhrase,
        focus,
        roleIndex,
        bulletIndex: i,
        seed,
      }),
    );
  }

  // Spillover from other families with unused openers if still short
  if (out.length < targetCount) {
    for (let f = 0; f < ROLE_FAMILIES.length && out.length < targetCount; f++) {
      if (f === roleIndex) continue;
      for (let i = 0; i < ROLE_FAMILIES[f].length && out.length < targetCount; i++) {
        const focus =
          focuses[(f + i) % Math.max(1, focuses.length)] ||
          "production delivery";
        tryPush(
          ROLE_FAMILIES[f][i]({
            company: exp.company,
            title: exp.title,
            skills: skillPhrase(skills, seed + f * 5 + i, 2),
            focus,
            roleIndex: f,
            bulletIndex: i,
            seed,
          }),
        );
      }
    }
  }

  // Last resort: unique verb + company-specific line (still no shared template)
  let verbIdx = seed % VERB_BANK.length;
  while (out.length < targetCount && verbIdx < VERB_BANK.length + 20) {
    const verb = VERB_BANK[verbIdx % VERB_BANK.length];
    verbIdx += 1;
    if ((verbCounts.get(verb.toLowerCase()) || 0) >= 2) continue;
    const sk = skillPhrase(skills, verbIdx, 2);
    tryPush(
      `${verb} ${sk} capabilities for ${exp.company} while serving as ${exp.title}, focusing on maintainable production delivery.`,
    );
  }

  return out.slice(0, Math.max(targetCount, Math.min(8, out.length)));
}
