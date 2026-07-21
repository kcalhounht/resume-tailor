import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { db } from "@/lib/db";

function isAdminFromEnv(username: string): boolean {
  const fromEnv = (process.env.ADMIN_USERNAMES || "admin")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv.includes(username.toLowerCase());
}

export async function requireAdmin() {
  const jar = await cookies();
  const session = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!session) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      ),
    };
  }

  let isAdmin = isAdminFromEnv(session.username);
  try {
    const result = await db.query(
      `SELECT is_admin FROM users WHERE id = $1`,
      [session.userId],
    );
    if (result.rows[0]?.is_admin) {
      isAdmin = true;
    }
  } catch (error) {
    console.error("Admin check failed:", error);
  }

  if (!isAdmin) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Admin access required" },
        { status: 403 },
      ),
    };
  }

  return { session };
}
