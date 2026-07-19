import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { isUserAdmin } from "@/lib/db";

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
  if (!isUserAdmin(session.userId)) {
    return {
      error: NextResponse.json(
        { ok: false, error: "Admin access required" },
        { status: 403 },
      ),
    };
  }
  return { session };
}
