import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { db } from "@/lib/db";
import { EMPTY_PROFILE } from "@/lib/profile";
import type { CandidateProfile } from "@/lib/types";
import { draftProfileSchema } from "@/lib/validate";

export const runtime = "nodejs";

async function requireSession() {
  const jar = await cookies();
  const session = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  return session;
}

function parseProfileRow(row: {
  personal_json: string;
  experiences_json: string;
  education_json: string;
} | null): CandidateProfile {
  if (!row) return structuredClone(EMPTY_PROFILE);

  try {
    const personal = JSON.parse(row.personal_json || "{}");
    const experiences = JSON.parse(row.experiences_json || "[]");
    const education = (
      JSON.parse(row.education_json || "[]") as Array<Record<string, string>>
    ).map((edu) => ({
      school: edu.school || "",
      degree: edu.degree || "",
      discipline: edu.discipline || "",
      period: edu.period || "",
      location: edu.location || "",
    }));

    // Empty signup placeholder "{}" / "[]" → treat as empty profile
    const hasPersonal =
      personal &&
      typeof personal === "object" &&
      Object.values(personal).some(
        (v) => typeof v === "string" && v.trim().length > 0,
      );

    if (!hasPersonal && (!Array.isArray(experiences) || experiences.length === 0)) {
      return structuredClone(EMPTY_PROFILE);
    }

    return {
      personal: {
        name: personal.name || "",
        phone: personal.phone || "",
        linkedin: personal.linkedin || "",
        email: personal.email || "",
        location: personal.location || "",
      },
      experiences: Array.isArray(experiences) && experiences.length > 0
        ? experiences
        : structuredClone(EMPTY_PROFILE.experiences),
      education:
        Array.isArray(education) && education.length > 0
          ? education
          : structuredClone(EMPTY_PROFILE.education),
    };
  } catch {
    return structuredClone(EMPTY_PROFILE);
  }
}

async function getProfileFromPostgres(
  userId: number,
): Promise<CandidateProfile> {
  const result = await db.query(
    `SELECT personal_json, experiences_json, education_json
     FROM profiles
     WHERE user_id = $1`,
    [userId],
  );

  if (!result.rowCount) {
    await db.query(
      `INSERT INTO profiles (user_id, personal_json, experiences_json, education_json)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO NOTHING`,
      [
        userId,
        JSON.stringify(EMPTY_PROFILE.personal),
        JSON.stringify(EMPTY_PROFILE.experiences),
        JSON.stringify(EMPTY_PROFILE.education),
      ],
    );
    return structuredClone(EMPTY_PROFILE);
  }

  return parseProfileRow(result.rows[0]);
}

async function saveProfileToPostgres(
  userId: number,
  profile: CandidateProfile,
): Promise<CandidateProfile> {
  await db.query(
    `INSERT INTO profiles (user_id, personal_json, experiences_json, education_json, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       personal_json = EXCLUDED.personal_json,
       experiences_json = EXCLUDED.experiences_json,
       education_json = EXCLUDED.education_json,
       updated_at = NOW()`,
    [
      userId,
      JSON.stringify(profile.personal),
      JSON.stringify(profile.experiences),
      JSON.stringify(profile.education),
    ],
  );
  return profile;
}

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const profile = await getProfileFromPostgres(session.userId);
    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    console.error("Profile load error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to load profile";
    return NextResponse.json(
      { ok: false, error: `Failed to load profile: ${message}` },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const profile = draftProfileSchema.parse(body.profile ?? body);
    const saved = await saveProfileToPostgres(session.userId, profile);
    return NextResponse.json({ ok: true, profile: saved });
  } catch (err) {
    console.error("Profile save error:", err);
    const message =
      err instanceof ZodError
        ? err.issues[0]?.message || "Invalid profile"
        : err instanceof Error
          ? err.message
          : "Failed to save profile";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
