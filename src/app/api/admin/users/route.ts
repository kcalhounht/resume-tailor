import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { createUser, listUsers } from "@/lib/db";

export const runtime = "nodejs";

const createSchema = z.object({
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
  isAdmin: z.boolean().optional(),
});

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  return NextResponse.json({ ok: true, users: listUsers() });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const body = createSchema.parse(await request.json());
    const user = createUser(body.username, body.password, {
      isAdmin: body.isAdmin,
    });
    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        isAdmin: Boolean(user.is_admin),
        createdAt: user.created_at,
      },
    });
  } catch (err) {
    const message =
      err instanceof ZodError
        ? err.issues[0]?.message || "Invalid request"
        : err instanceof Error
          ? err.message
          : "Failed to create user";
    const status = /already taken|UNIQUE/i.test(message) ? 409 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
