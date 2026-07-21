import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

let schemaReady = false;

async function ensureAuthSchema() {
  if (schemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_admin INTEGER NOT NULL DEFAULT 0;
  `);
  await db.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      personal_json TEXT NOT NULL DEFAULT '{}',
      experiences_json TEXT NOT NULL DEFAULT '[]',
      education_json TEXT NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  schemaReady = true;
}

function pgErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "Unable to create account";
  const err = error as { code?: string; message?: string };

  if (err.code === "42P01") {
    return "Database tables are missing. Run the users/profiles SQL setup.";
  }
  if (err.code === "42703") {
    return "Database columns are missing. Add is_admin to users (see setup SQL).";
  }
  if (err.code === "23505") {
    return "Username already exists";
  }
  if (err.code === "28P01" || err.code === "28000") {
    return "Database login failed. Check CUSTOM_DATABASE_URL.";
  }
  if (
    /CUSTOM_DATABASE_URL|connection string|ECONNREFUSED|ENOTFOUND|timeout/i.test(
      err.message || "",
    )
  ) {
    return "Cannot connect to database. Check CUSTOM_DATABASE_URL on Vercel.";
  }

  // Surface a short hint in the UI so Vercel debugging is easier
  if (err.message) {
    const short = err.message.split("\n")[0].slice(0, 180);
    return `Unable to create account: ${short}`;
  }
  return "Unable to create account";
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = body.username?.trim();
    const password = body.password;

    if (!username || !password) {
      return NextResponse.json(
        { ok: false, error: "Username and password are required" },
        { status: 400 },
      );
    }

    if (username.length < 3) {
      return NextResponse.json(
        { ok: false, error: "Username must be at least 3 characters" },
        { status: 400 },
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { ok: false, error: "Password must be at least 6 characters" },
        { status: 400 },
      );
    }

    if (!process.env.CUSTOM_DATABASE_URL && !process.env.DATABASE_URL) {
      return NextResponse.json(
        {
          ok: false,
          error: "CUSTOM_DATABASE_URL is not set on Vercel.",
        },
        { status: 500 },
      );
    }

    await ensureAuthSchema();

    const existingUser = await db.query(
      "SELECT id FROM users WHERE LOWER(username) = LOWER($1)",
      [username],
    );

    if (existingUser.rowCount && existingUser.rowCount > 0) {
      return NextResponse.json(
        { ok: false, error: "Username already exists" },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const userCount = await db.query("SELECT COUNT(*)::int AS c FROM users");
    const isFirstUser = (userCount.rows[0]?.c ?? 0) === 0;
    const fromEnv = (process.env.ADMIN_USERNAMES || "admin")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const makeAdmin =
      isFirstUser || fromEnv.includes(username.toLowerCase()) ? 1 : 0;

    const result = await db.query(
      `INSERT INTO users (username, password_hash, is_admin)
       VALUES ($1, $2, $3)
       RETURNING id, username`,
      [username, passwordHash, makeAdmin],
    );

    const user = result.rows[0] as { id: number; username: string };

    await db.query(
      `INSERT INTO profiles (user_id, personal_json, experiences_json, education_json)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id, "{}", "[]", "[]"],
    );

    const token = await createSessionToken(user.id, user.username);
    const response = NextResponse.json(
      {
        ok: true,
        username: user.username,
        userId: user.id,
      },
      { status: 201 },
    );
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { ok: false, error: pgErrorMessage(error) },
      { status: 500 },
    );
  }
}
