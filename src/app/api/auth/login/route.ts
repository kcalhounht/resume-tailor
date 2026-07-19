import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth";
import { findUserByUsername } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

export const runtime = "nodejs";

const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: Request) {
  let body: z.infer<typeof loginSchema>;
  try {
    body = loginSchema.parse(await request.json());
  } catch (err) {
    const message =
      err instanceof ZodError
        ? err.issues[0]?.message || "Invalid request"
        : "Invalid request";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  const user = findUserByUsername(body.username);
  if (!user || !verifyPassword(body.password, user.password_hash)) {
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
}
