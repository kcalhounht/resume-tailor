"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/session";
import { findUserById, isUserAble, PRIORITY_DISABLED_MESSAGE, updateUserAccount } from "@/lib/users";
import { requireSession } from "@/app/actions/auth";

export type AccountFormState = {
  message?: string;
  errors?: {
    name?: string[];
    currentPassword?: string[];
    password?: string[];
    confirmPassword?: string[];
  };
};

const schema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters."),
    currentPassword: z.string().optional(),
    password: z.string().optional(),
    confirmPassword: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const password = value.password ?? "";
    const confirm = value.confirmPassword ?? "";
    const current = value.currentPassword ?? "";
    const changingPassword = password.length > 0 || confirm.length > 0;

    if (!changingPassword) return;

    if (!current) {
      ctx.addIssue({
        code: "custom",
        message: "Enter your current password to change it.",
        path: ["currentPassword"],
      });
    }
    if (password.length < 8) {
      ctx.addIssue({
        code: "custom",
        message: "Password must be at least 8 characters.",
        path: ["password"],
      });
    }
    if (!confirm) {
      ctx.addIssue({
        code: "custom",
        message: "Confirm your new password.",
        path: ["confirmPassword"],
      });
    } else if (password !== confirm) {
      ctx.addIssue({
        code: "custom",
        message: "Passwords do not match.",
        path: ["confirmPassword"],
      });
    }
  });

export async function updateOwnAccount(
  _prev: AccountFormState,
  formData: FormData,
): Promise<AccountFormState> {
  const session = await requireSession();
  const parsed = schema.safeParse({
    name: formData.get("name"),
    currentPassword: String(formData.get("currentPassword") ?? ""),
    password: String(formData.get("password") ?? ""),
    confirmPassword: String(formData.get("confirmPassword") ?? ""),
  });

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  const user = await findUserById(session.userId);
  if (!user) {
    return { errors: { name: ["Account not found."] } };
  }
  if (!isUserAble(user)) {
    return { errors: { name: [PRIORITY_DISABLED_MESSAGE] } };
  }

  const changingPassword = Boolean(parsed.data.password);
  if (changingPassword) {
    const currentOk = await verifyPassword(
      parsed.data.currentPassword || "",
      user.passwordHash,
    );
    if (!currentOk) {
      return {
        errors: { currentPassword: ["Current password is incorrect."] },
      };
    }
  }

  const passwordHash = changingPassword
    ? await hashPassword(parsed.data.password || "")
    : undefined;

  try {
    await updateUserAccount(session.userId, {
      name: parsed.data.name,
      email: user.email,
      role: user.role,
      priority: user.priority,
      passwordHash,
    });
  } catch (err) {
    return {
      errors: {
        name: [err instanceof Error ? err.message : "Could not update account."],
      },
    };
  }

  const token = createSessionToken({
    userId: user.id,
    email: user.email,
    name: parsed.data.name,
  });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions());

  revalidatePath("/");
  revalidatePath("/admin");
  return { message: "Account updated." };
}
