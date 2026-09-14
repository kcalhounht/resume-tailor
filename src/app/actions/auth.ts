"use server";

import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/session";
import { getSettings } from "@/lib/settings";
import {
  PAGE_STYLE_COOKIE,
  parsePageStyle,
  pageStyleCookieOptions,
} from "@/lib/appearance";
import {
  parseResumeFormat,
  resumeFormatCookieOptions,
  RESUME_FORMAT_COOKIE,
} from "@/lib/resume-format";
import { createUser, findUserByEmail, hasAnyUser } from "@/lib/users";
import {
  HOST_NEEDS_DATABASE_MESSAGE,
  assertPersistentAccounts,
} from "@/lib/db";

export type AuthFormState = {
  message?: string;
  redirectTo?: string;
  errors?: {
    name?: string[];
    email?: string[];
    password?: string[];
    confirmPassword?: string[];
  };
};

const signupSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters."),
    email: z.email("Enter a valid email."),
    password: z.string().min(8, "Password must be at least 8 characters."),
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

const signinSchema = z.object({
  email: z.email("Enter a valid email."),
  password: z.string().min(1, "Password is required."),
});

async function setSessionCookie(user: {
  id: string;
  email: string;
  name: string;
  pageStyle?: string;
  resumeFormat?: unknown;
}) {
  const jar = await cookies();
  jar.set(
    SESSION_COOKIE,
    createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
    }),
    sessionCookieOptions(),
  );
  jar.set(
    PAGE_STYLE_COOKIE,
    parsePageStyle(user.pageStyle),
    pageStyleCookieOptions(),
  );
  jar.set(
    RESUME_FORMAT_COOKIE,
    JSON.stringify(parseResumeFormat(user.resumeFormat)),
    resumeFormatCookieOptions(),
  );
}

function safeNextPath(value: unknown): string {
  if (typeof value !== "string") return "/";
  const next = value.trim();
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return "/";
  }
  if (next.includes("://")) return "/";
  if (next.startsWith("/signin") || next.startsWith("/signup")) return "/";
  if (next.startsWith("/api/")) return "/";
  return next;
}

export async function signup(
  _state: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  try {
    await assertPersistentAccounts();
    const [settings, siteHasUser] = await Promise.all([
      getSettings(),
      hasAnyUser(),
    ]);
    if (!settings.allowSignup && siteHasUser) {
      return { message: "Public sign-up is turned off." };
    }
    const passwordHash = await hashPassword(parsed.data.password);
    const user = await createUser({
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash,
      role: settings.defaultRole,
      priority: settings.defaultPriority,
    });
    await setSessionCookie(user);
  } catch (err) {
    unstable_rethrow(err);
    return {
      message:
        err instanceof Error ? err.message : "Could not create the account.",
    };
  }

  return { redirectTo: "/" };
}

export async function signin(
  _state: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = signinSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors };
  }

  try {
    await assertPersistentAccounts();
    const user = await findUserByEmail(parsed.data.email);
    if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
      return { message: "Email or password is incorrect." };
    }

    await setSessionCookie(user);
  } catch (err) {
    unstable_rethrow(err);
    const message =
      err instanceof Error ? err.message : "Could not sign in.";
    if (message === HOST_NEEDS_DATABASE_MESSAGE) {
      return { message };
    }
    console.error("signin failed", err);
    return {
      message:
        "Could not reach the account database. Check DATABASE_URL and try again.",
    };
  }

  return { redirectTo: safeNextPath(formData.get("next")) };
}
