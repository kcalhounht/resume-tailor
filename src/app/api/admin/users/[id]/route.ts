import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { requireAdmin } from "@/lib/admin";
import {
  deleteUser,
  getUserDetail,
  saveProfileForUser,
  updateUser,
} from "@/lib/db";
import { draftProfileSchema } from "@/lib/validate";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/)
    .optional(),
  password: z.union([z.string().min(6), z.literal("")]).optional(),
  isAdmin: z.boolean().optional(),
  profile: draftProfileSchema.optional(),
});

export async function GET(_request: Request, context: Ctx) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ ok: false, error: "Invalid user id" }, { status: 400 });
  }

  const detail = getUserDetail(id);
  if (!detail) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...detail });
}

export async function PUT(request: Request, context: Ctx) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ ok: false, error: "Invalid user id" }, { status: 400 });
  }

  try {
    const body = updateSchema.parse(await request.json());
    updateUser(id, {
      username: body.username,
      password: body.password || undefined,
      isAdmin: body.isAdmin,
    });
    if (body.profile) {
      saveProfileForUser(id, body.profile);
    }
    const detail = getUserDetail(id);
    return NextResponse.json({ ok: true, ...detail });
  } catch (err) {
    const message =
      err instanceof ZodError
        ? err.issues[0]?.message || "Invalid request"
        : err instanceof Error
          ? err.message
          : "Failed to update user";
    const status = /not found/i.test(message)
      ? 404
      : /already taken|last admin/i.test(message)
        ? 409
        : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const id = Number((await context.params).id);
  if (!Number.isInteger(id) || id < 1) {
    return NextResponse.json({ ok: false, error: "Invalid user id" }, { status: 400 });
  }

  if (auth.session.userId === id) {
    return NextResponse.json(
      { ok: false, error: "You cannot delete your own account from here" },
      { status: 400 },
    );
  }

  try {
    deleteUser(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete user";
    const status = /not found/i.test(message)
      ? 404
      : /last admin/i.test(message)
        ? 409
        : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
