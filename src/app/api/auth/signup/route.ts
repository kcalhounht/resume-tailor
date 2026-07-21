import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

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

    // First account becomes admin
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

    // Empty profile row so later profile APIs have a record
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
      { ok: false, error: "Unable to create account" },
      { status: 500 },
    );
  }
}
