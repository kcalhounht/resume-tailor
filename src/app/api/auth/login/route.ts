import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth";
import { db, getPostgresConnectionString } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!getPostgresConnectionString()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Database is not configured (DATABASE_URL missing). Add it in Vercel env and redeploy.",
        },
        { status: 503 },
      );
    }

    const body = await request.json();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

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

    const passwordMatches = await verifyPassword(password, user.password_hash);
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
    const message = error instanceof Error ? error.message : String(error);
    const isDb =
      /DATABASE_URL|ECONNREFUSED|ENOTFOUND|password authentication failed|SSL|does not exist|connection/i.test(
        message,
      );
    return NextResponse.json(
      {
        ok: false,
        error: isDb
          ? "Unable to reach the database. Check DATABASE_URL / Postgres and try again."
          : "Unable to log in",
      },
      { status: 500 },
    );
  }
}
