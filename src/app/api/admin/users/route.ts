import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { ZodError, z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { EMPTY_PROFILE } from "@/lib/profile";

export const runtime = "nodejs";

const createSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(80, "Username is too long"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  isAdmin: z.boolean().optional(),
});

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

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const result = await db.query(
      `SELECT u.id, u.username, u.is_admin, u.created_at,
              p.updated_at AS profile_updated_at, p.personal_json
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       ORDER BY u.id ASC`,
    );
    return NextResponse.json({
      ok: true,
      users: result.rows.map(toPublicUser),
    });
  } catch (error) {
    console.error("Admin list users error:", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Failed to list users",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const body = createSchema.parse(await request.json());

    const existing = await db.query(
      "SELECT id FROM users WHERE LOWER(username) = LOWER($1)",
      [body.username],
    );
    if (existing.rowCount && existing.rowCount > 0) {
      return NextResponse.json(
        { ok: false, error: "Username is already taken" },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const isAdmin = body.isAdmin ? 1 : 0;

    const inserted = await db.query(
      `INSERT INTO users (username, password_hash, is_admin)
       VALUES ($1, $2, $3)
       RETURNING id, username, is_admin, created_at`,
      [body.username, passwordHash, isAdmin],
    );

    const user = inserted.rows[0];
    await db.query(
      `INSERT INTO profiles (user_id, personal_json, experiences_json, education_json)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO NOTHING`,
      [
        user.id,
        JSON.stringify(EMPTY_PROFILE.personal),
        JSON.stringify(EMPTY_PROFILE.experiences),
        JSON.stringify(EMPTY_PROFILE.education),
      ],
    );

    return NextResponse.json({
      ok: true,
      user: toPublicUser({ ...user, personal_json: null }),
    });
  } catch (err) {
    console.error("Admin create user error:", err);
    const message =
      err instanceof ZodError
        ? err.issues[0]?.message || "Invalid request"
        : err instanceof Error
          ? err.message
          : "Failed to create user";
    const status = /already taken|UNIQUE|23505/i.test(message) ? 409 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
