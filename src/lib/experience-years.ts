import type { CandidateProfile, ExperienceInput } from "./types";

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function yearPhraseRegex(): RegExp {
  return /\b(\d+)\s*\+?\s*years?(?:\s+of)?(?:\s+professional)?\s+experience\b/gi;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function parseDateToken(text: string, bound: "start" | "end"): Date | null {
  if (/\b(present|current|now|ongoing|today)\b/i.test(text)) {
    return bound === "end" ? new Date() : null;
  }

  const yearMatch = text.match(/\b((?:19|20)\d{2})\b/);
  if (!yearMatch) return null;
  const year = Number(yearMatch[1]);

  const monthMatch = text.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i,
  );
  const month = monthMatch
    ? MONTH_INDEX[monthMatch[1].toLowerCase()]
    : bound === "start"
      ? 0
      : 11;
  if (month === undefined) return null;

  const day = bound === "start" ? 1 : lastDayOfMonth(year, month);
  return new Date(year, month, day);
}

function splitPeriod(period: string): [string, string] {
  const parts = period
    .split(/\s*(?:–|—|-|to|through|until)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return [parts[0], parts.slice(1).join(" ")];
  }
  return [period, period];
}

function parseExperienceRange(
  experience: ExperienceInput,
): { start: Date; end: Date } | null {
  const [startText, endText] = splitPeriod(experience.period || "");
  const start = parseDateToken(startText, "start");
  const end =
    parseDateToken(endText, "end") ||
    parseDateToken(startText, "end");
  if (!start || !end) return null;
  if (end.getTime() < start.getTime()) return { start: end, end: start };
  return { start, end };
}

function monthsBetween(start: Date, end: Date): number {
  return (
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth()) +
    (end.getDate() >= start.getDate() ? 0 : -1)
  );
}

/** Career span in whole years from the earliest role start to the latest end. */
export function yearsOfExperienceFromProfile(
  profile: CandidateProfile,
): number | null {
  const ranges = profile.experiences
    .map(parseExperienceRange)
    .filter((range): range is { start: Date; end: Date } => Boolean(range));
  if (!ranges.length) return null;

  const start = ranges.reduce(
    (earliest, range) =>
      range.start.getTime() < earliest.getTime() ? range.start : earliest,
    ranges[0].start,
  );
  const end = ranges.reduce(
    (latest, range) =>
      range.end.getTime() > latest.getTime() ? range.end : latest,
    ranges[0].end,
  );
  const months = monthsBetween(start, end);
  if (months < 1) return null;
  return Math.max(1, Math.round(months / 12));
}

export function summaryMentionsYears(text: string): boolean {
  return yearPhraseRegex().test(text);
}

export function alignExperienceYears(
  text: string,
  years: number,
): { text: string; changed: boolean } {
  let changed = false;
  const next = text.replace(yearPhraseRegex(), (match, raw) => {
    if (Number(raw) === years) return match;
    changed = true;
    return match.replace(new RegExp(`\\b${raw}\\+?`), String(years));
  });
  return { text: next, changed };
}
