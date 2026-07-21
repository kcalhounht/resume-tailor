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

    const result = await db.query(
      `SELECT id, username, password_hash
       FROM users
       WHERE LOWER(username) = LOWER($1)`,
      [username],
    );

    if (!result.rowCount) {
      return NextResponse.json(
        { ok: false, error: "Invalid username or password" },
        { status: 401 },
      );
    }

    const user = result.rows[0] as {
      id: number;
      username: string;
      password_hash: string;
    };

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return NextResponse.json(
        { ok: false, error: "Invalid username or password" },
        { status: 401 },
      );
    }

    const token = await createSessionToken(user.id, user.username);
    const response = NextResponse.json({
      ok: true,
      username: user.username,
      userId: user.id,
    });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { ok: false, error: "Unable to log in" },
      { status: 500 },
    );
  }
}
