"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/lib/password";
import {
  SESSION_COOKIE,
  createSessionToken,
  readSessionToken,
  sessionCookieOptions,
  type SessionPayload,
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
import {
  createUser,
  findUserByEmail,
  findUserById,
  hasAnyUser,
  isAdminUser,
  isUserAble,
  PRIORITY_DISABLED_MESSAGE,
  type StoredUser,
} from "@/lib/users";

export type AuthFormState = {
  message?: string;
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

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return readSessionToken(jar.get(SESSION_COOKIE)?.value);
}

export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/signin");
  const user = await findUserById(session.userId);
  if (!user) {
    const jar = await cookies();
    jar.delete(SESSION_COOKIE);
    jar.delete(PAGE_STYLE_COOKIE);
    jar.delete(RESUME_FORMAT_COOKIE);
    redirect("/signin");
  }
  return session;
}

export async function requireAbleUser(): Promise<StoredUser> {
  const session = await requireSession();
  const user = await findUserById(session.userId);
  if (!user) redirect("/signin");
  if (!isUserAble(user)) {
    throw new Error(PRIORITY_DISABLED_MESSAGE);
  }
  return user;
}

function safeNextPath(value: unknown): string {
  if (typeof value !== "string") return "/";
  const next = value.trim();
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return "/";
  }
  if (next.includes("://")) return "/";
  if (next.startsWith("/signin") || next.startsWith("/signup")) return "/";
  return next;
}

export async function requireAdmin(): Promise<{
  session: SessionPayload;
  user: StoredUser;
}> {
  const session = await requireSession();
  const user = await findUserById(session.userId);
  if (!user || !isAdminUser(user)) redirect("/");
  return { session, user };
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
    return {
      message:
        err instanceof Error ? err.message : "Could not create the account.",
    };
  }

  redirect("/");
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

  const user = await findUserByEmail(parsed.data.email);
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return { message: "Email or password is incorrect." };
  }

  await setSessionCookie(user);
  redirect(safeNextPath(formData.get("next")));
}

export async function signout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(PAGE_STYLE_COOKIE);
  jar.delete(RESUME_FORMAT_COOKIE);
  redirect("/signin");
}
