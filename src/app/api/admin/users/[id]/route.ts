import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { ZodError, z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { EMPTY_PROFILE } from "@/lib/profile";
import type { CandidateProfile } from "@/lib/types";
import { draftProfileSchema } from "@/lib/validate";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  username: z.string().trim().min(3).max(80).optional(),
  password: z.union([z.string().min(6), z.literal("")]).optional(),
  isAdmin: z.boolean().optional(),
  profile: draftProfileSchema.optional(),
});

function parseProfile(row: {
  personal_json?: string;
  experiences_json?: string;
  education_json?: string;
} | null): CandidateProfile {
  if (!row?.personal_json) return structuredClone(EMPTY_PROFILE);
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
    return {
      personal: {
        name: personal.name || "",
        phone: personal.phone || "",
        linkedin: personal.linkedin || "",
        email: personal.email || "",
        location: personal.location || "",
      },
      experiences:
        Array.isArray(experiences) && experiences.length > 0
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

function toPublicUser(row: {
  id: number;
  username: string;
  is_admin: number | boolean;
  created_at: string | Date;
  profile_updated_at?: string | Date | null;
  personal_json?: string | null;
}) {
  let displayName: string | null = null;
  let email: string | null = null;
  if (row.personal_json) {
    try {
      const personal = JSON.parse(row.personal_json) as {
        name?: string;
        email?: string;
      };
      displayName = personal.name?.trim() || null;
      email = personal.email?.trim() || null;
    } catch {
      // ignore
    }
  }
  return {
    id: row.id,
    username: row.username,
    isAdmin: Boolean(row.is_admin),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    profileUpdatedAt: row.profile_updated_at
      ? row.profile_updated_at instanceof Date
        ? row.profile_updated_at.toISOString()
        : String(row.profile_updated_at)
      : null,
    displayName,
    email,
  };
}

async function getUserDetail(userId: number) {
  const userResult = await db.query(
    `SELECT u.id, u.username, u.is_admin, u.created_at,
            p.updated_at AS profile_updated_at, p.personal_json,
            p.experiences_json, p.education_json
     FROM users u
     LEFT JOIN profiles p ON p.user_id = u.id
     WHERE u.id = $1`,
    [userId],
  );
  if (!userResult.rowCount) return null;
  const row = userResult.rows[0];
  return {
    user: toPublicUser(row),
    profile: parseProfile(row),
  };
}

export async function GET(_request: Request, context: Ctx) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json(
      { ok: false, error: "Invalid user id" },
      { status: 400 },
    );
  }

  try {
    const detail = await getUserDetail(id);
    if (!detail) {
      return NextResponse.json(
        { ok: false, error: "User not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, ...detail });
  } catch (error) {
    console.error("Admin get user error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load user",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, context: Ctx) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json(
      { ok: false, error: "Invalid user id" },
      { status: 400 },
    );
  }

  try {
    const body = updateSchema.parse(await request.json());

    const existing = await db.query(
      `SELECT id, username, is_admin FROM users WHERE id = $1`,
      [id],
    );
    if (!existing.rowCount) {
      return NextResponse.json(
        { ok: false, error: "User not found" },
        { status: 404 },
      );
    }
    const current = existing.rows[0];

    if (body.username != null) {
      const next = body.username.trim();
      if (next.toLowerCase() !== String(current.username).toLowerCase()) {
        const clash = await db.query(
          `SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND id != $2`,
          [next, id],
        );
        if (clash.rowCount && clash.rowCount > 0) {
          return NextResponse.json(
            { ok: false, error: "Username is already taken" },
            { status: 409 },
          );
        }
      }
      await db.query(`UPDATE users SET username = $1 WHERE id = $2`, [
        next,
        id,
      ]);
    }

    if (body.password != null && body.password.length > 0) {
      const passwordHash = await bcrypt.hash(body.password, 12);
      await db.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [
        passwordHash,
        id,
      ]);
    }

    if (body.isAdmin != null) {
      if (!body.isAdmin && current.is_admin) {
        const otherAdmins = await db.query(
          `SELECT COUNT(*)::int AS c FROM users WHERE is_admin = 1 AND id != $1`,
          [id],
        );
        if ((otherAdmins.rows[0]?.c ?? 0) === 0) {
          return NextResponse.json(
            { ok: false, error: "Cannot remove the last admin" },
            { status: 409 },
          );
        }
      }
      await db.query(`UPDATE users SET is_admin = $1 WHERE id = $2`, [
        body.isAdmin ? 1 : 0,
        id,
      ]);
    }

    if (body.profile) {
      await db.query(
        `INSERT INTO profiles (user_id, personal_json, experiences_json, education_json, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           personal_json = EXCLUDED.personal_json,
           experiences_json = EXCLUDED.experiences_json,
           education_json = EXCLUDED.education_json,
           updated_at = NOW()`,
        [
          id,
          JSON.stringify(body.profile.personal),
          JSON.stringify(body.profile.experiences),
          JSON.stringify(body.profile.education),
        ],
      );
    }

    const detail = await getUserDetail(id);
    return NextResponse.json({ ok: true, ...detail });
  } catch (err) {
    console.error("Admin update user error:", err);
    const message =
      err instanceof ZodError
        ? err.issues[0]?.message || "Invalid request"
        : err instanceof Error
          ? err.message
          : "Failed to update user";
    const status = /not found/i.test(message)
      ? 404
      : /already taken|last admin/i.test(message)
        ? 409
        : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json(
      { ok: false, error: "Invalid user id" },
      { status: 400 },
    );
  }

  if (auth.session.userId === id) {
    return NextResponse.json(
      { ok: false, error: "You cannot delete your own account from here" },
      { status: 400 },
    );
  }

  try {
    const existing = await db.query(
      `SELECT id, is_admin FROM users WHERE id = $1`,
      [id],
    );
    if (!existing.rowCount) {
      return NextResponse.json(
        { ok: false, error: "User not found" },
        { status: 404 },
      );
    }

    if (existing.rows[0].is_admin) {
      const otherAdmins = await db.query(
        `SELECT COUNT(*)::int AS c FROM users WHERE is_admin = 1 AND id != $1`,
        [id],
      );
      if ((otherAdmins.rows[0]?.c ?? 0) === 0) {
        return NextResponse.json(
          { ok: false, error: "Cannot delete the last admin" },
          { status: 409 },
        );
      }
    }

    await db.query(`DELETE FROM profiles WHERE user_id = $1`, [id]);
    await db.query(`DELETE FROM users WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Admin delete user error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to delete user";
    const status = /not found/i.test(message)
      ? 404
      : /last admin/i.test(message)
        ? 409
        : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
