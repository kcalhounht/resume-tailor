import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth";
import { createUser, findUserByUsername } from "@/lib/db";

export const runtime = "nodejs";

const signupSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(40, "Username is too long")
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      "Username can only use letters, numbers, dots, underscores, and hyphens",
    ),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export async function POST(request: Request) {
  let body: z.infer<typeof signupSchema>;
  try {
    body = signupSchema.parse(await request.json());
  } catch (err) {
    const message =
      err instanceof ZodError
        ? err.issues[0]?.message || "Invalid request"
        : "Invalid request";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }

  if (findUserByUsername(body.username)) {
    return NextResponse.json(
      { ok: false, error: "Username is already taken" },
      { status: 409 },
    );
  }

  try {
    const user = createUser(body.username, body.password);
    const token = await createSessionToken(user.id, user.username);
    const response = NextResponse.json({
      ok: true,
      username: user.username,
      userId: user.id,
    });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signup failed";
    if (/UNIQUE/i.test(message)) {
      return NextResponse.json(
        { ok: false, error: "Username is already taken" },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
