import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { isUserAdmin } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const jar = await cookies();
  const session = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ ok: false, authenticated: false }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    authenticated: true,
    username: session.username,
    userId: session.userId,
    isAdmin: isUserAdmin(session.userId),
  });
}
