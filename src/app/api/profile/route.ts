import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { getProfileForUser, saveProfileForUser } from "@/lib/db";
import { draftProfileSchema } from "@/lib/validate";

export const runtime = "nodejs";

async function requireSession() {
  const jar = await cookies();
  const session = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!session) return null;
  return session;
}

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const profile = getProfileForUser(session.userId);
  return NextResponse.json({ ok: true, profile });
}

export async function PUT(request: Request) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const profile = draftProfileSchema.parse(body.profile ?? body);
    const saved = saveProfileForUser(session.userId, profile);
    return NextResponse.json({ ok: true, profile: saved });
  } catch (err) {
    const message =
      err instanceof ZodError
        ? err.issues[0]?.message || "Invalid profile"
        : err instanceof Error
          ? err.message
          : "Failed to save profile";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
