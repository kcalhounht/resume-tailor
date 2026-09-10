import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type { CandidateProfile } from "./types";
import { emptyProfile, parseProfileDraft } from "./profile";
import {
  asIsoDate,
  hasDatabase,
  isUniqueViolation,
  withDatabase,
} from "./db";
import { getDataRoot } from "./runtime";
import { parsePageStyle, type PageStyle } from "./appearance";

export type UserRole = "admin" | "user";
export type UserPriority = "able" | "disable";

export type StoredUser = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  role: UserRole;
  priority: UserPriority;
  profile?: CandidateProfile;
  pageStyle?: PageStyle;
};

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  priority: UserPriority;
  createdAt: string;
  profile: CandidateProfile;
};

type UserStore = {
  users: StoredUser[];
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  created_at: string | Date;
  role: string;
  priority: string;
  profile: unknown;
  page_style?: string | null;
};

function storePath() {
  return path.join(getDataRoot(), "users.json");
}

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function asRole(value: unknown): UserRole {
  return value === "admin" ? "admin" : "user";
}

function asPriority(value: unknown): UserPriority {
  return value === "disable" ? "disable" : "able";
}

function normalizeStore(store: UserStore): { store: UserStore; changed: boolean } {
  let changed = false;
  const users = store.users.map((user) => {
    const role = asRole(user.role);
    const priority = asPriority(user.priority);
    if (user.role !== role || user.priority !== priority) changed = true;
    return { ...user, role, priority };
  });

  if (users.length && !users.some((user) => user.role === "admin")) {
    const oldest = [...users].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    )[0];
    oldest.role = "admin";
    changed = true;
  }

  return { store: { users }, changed };
}

async function readStore(): Promise<UserStore> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as UserStore;
    if (!parsed || !Array.isArray(parsed.users)) return { users: [] };
    return normalizeStore(parsed).store;
  } catch {
    return { users: [] };
  }
}

async function writeStore(store: UserStore) {
  const dir = path.dirname(storePath());
  await mkdir(dir, { recursive: true });
  const { store: normalized } = normalizeStore(store);
  await writeFile(storePath(), JSON.stringify(normalized, null, 2), "utf8");
}

function toPublicUser(user: StoredUser): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    priority: user.priority,
    createdAt: user.createdAt,
    profile: profileFromUser(user),
  };
}

function rowToUser(row: UserRow): StoredUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: asIsoDate(row.created_at),
    role: asRole(row.role),
    priority: asPriority(row.priority),
    profile: parseProfileDraft(row.profile) ?? undefined,
    pageStyle: parsePageStyle(row.page_style),
  };
}

async function ensureOldestAdmin() {
  const sql = await withDatabase();
  const admins = await sql`SELECT id FROM users WHERE role = 'admin' LIMIT 1`;
  if (admins.length) return;
  const oldest = await sql`
    SELECT id FROM users ORDER BY created_at ASC LIMIT 1
  `;
  if (!oldest[0]?.id) return;
  await sql`UPDATE users SET role = 'admin', priority = 'able' WHERE id = ${oldest[0].id}`;
}

export function userRole(user: StoredUser | null | undefined): UserRole {
  return user?.role === "admin" ? "admin" : "user";
}

export function isAdminUser(user: StoredUser | null | undefined): boolean {
  return userRole(user) === "admin";
}

export function userPriority(
  user: StoredUser | PublicUser | null | undefined,
): UserPriority {
  return user?.priority === "disable" ? "disable" : "able";
}

export function isUserAble(
  user: StoredUser | PublicUser | null | undefined,
): boolean {
  return userPriority(user) === "able";
}

export async function findUserByEmail(email: string): Promise<StoredUser | null> {
  const needle = email.trim().toLowerCase();
  if (hasDatabase()) {
    const sql = await withDatabase();
    const rows = (await sql`
      SELECT * FROM users WHERE email = ${needle} LIMIT 1
    `) as UserRow[];
    return rows[0] ? rowToUser(rows[0]) : null;
  }
  const store = await readStore();
  return store.users.find((user) => user.email === needle) ?? null;
}

export async function findUserById(id: string): Promise<StoredUser | null> {
  if (hasDatabase()) {
    const sql = await withDatabase();
    const rows = (await sql`
      SELECT * FROM users WHERE id = ${id} LIMIT 1
    `) as UserRow[];
    return rows[0] ? rowToUser(rows[0]) : null;
  }
  const store = await readStore();
  return store.users.find((user) => user.id === id) ?? null;
}

export async function hasAnyUser(): Promise<boolean> {
  if (hasDatabase()) {
    const sql = await withDatabase();
    const rows = await sql`SELECT id FROM users LIMIT 1`;
    return rows.length > 0;
  }
  const store = await readStore();
  return store.users.length > 0;
}

export async function listPublicUsers(): Promise<PublicUser[]> {
  if (hasDatabase()) {
    await ensureOldestAdmin();
    const sql = await withDatabase();
    const rows = (await sql`
      SELECT * FROM users ORDER BY created_at ASC
    `) as UserRow[];
    return rows.map((row) => toPublicUser(rowToUser(row)));
  }
  const store = await readStore();
  return store.users
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(toPublicUser);
}

export async function createUser(input: {
  name: string;
  email: string;
  passwordHash: string;
  role?: UserRole;
  priority?: UserPriority;
}): Promise<StoredUser> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const profile = {
    ...emptyProfile(),
    personal: {
      ...emptyProfile().personal,
      name,
      email,
    },
  };

  if (hasDatabase()) {
    const sql = await withDatabase();
    const existing = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
    if (existing.length) {
      throw new Error("An account with that email already exists.");
    }
    const admins = await sql`SELECT id FROM users WHERE role = 'admin' LIMIT 1`;
    const hasAdmin = admins.length > 0;
    const role: UserRole = !hasAdmin
      ? "admin"
      : input.role === "admin"
        ? "admin"
        : "user";
    const priority: UserPriority = !hasAdmin
      ? "able"
      : input.priority === "disable"
        ? "disable"
        : "able";
    const user: StoredUser = {
      id: randomUUID(),
      name,
      email,
      passwordHash: input.passwordHash,
      createdAt: new Date().toISOString(),
      role,
      priority,
      profile,
      pageStyle: "forest",
    };
    try {
      await sql`
        INSERT INTO users (
          id, name, email, password_hash, created_at, role, priority, profile, page_style
        ) VALUES (
          ${user.id},
          ${user.name},
          ${user.email},
          ${user.passwordHash},
          ${user.createdAt},
          ${user.role},
          ${user.priority},
          ${user.profile ?? null},
          ${user.pageStyle}
        )
      `;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new Error("An account with that email already exists.");
      }
      throw err;
    }
    return user;
  }

  return enqueue(async () => {
    const store = await readStore();
    if (store.users.some((user) => user.email === email)) {
      throw new Error("An account with that email already exists.");
    }
    const hasAdmin = store.users.some((user) => user.role === "admin");
    const role: UserRole = !hasAdmin
      ? "admin"
      : input.role === "admin"
        ? "admin"
        : "user";
    const user: StoredUser = {
      id: randomUUID(),
      name,
      email,
      passwordHash: input.passwordHash,
      createdAt: new Date().toISOString(),
      role,
      priority: !hasAdmin
        ? "able"
        : input.priority === "disable"
          ? "disable"
          : "able",
      profile,
      pageStyle: "forest",
    };
    store.users.push(user);
    await writeStore(store);
    return user;
  });
}

export async function updateUserAccount(
  userId: string,
  input: {
    name: string;
    email: string;
    role: UserRole;
    priority: UserPriority;
    passwordHash?: string;
  },
): Promise<PublicUser> {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  const nextRole = input.role === "admin" ? "admin" : "user";
  const nextPriority = input.priority === "disable" ? "disable" : "able";

  if (hasDatabase()) {
    const sql = await withDatabase();
    const rows = (await sql`
      SELECT * FROM users WHERE id = ${userId} LIMIT 1
    `) as UserRow[];
    const current = rows[0] ? rowToUser(rows[0]) : null;
    if (!current) throw new Error("Account not found.");

    const taken = await sql`
      SELECT id FROM users WHERE email = ${email} AND id <> ${userId} LIMIT 1
    `;
    if (taken.length) {
      throw new Error("An account with that email already exists.");
    }

    if (current.role === "admin" && nextRole !== "admin") {
      const otherAdmins = await sql`
        SELECT id FROM users WHERE role = 'admin' AND id <> ${userId} LIMIT 1
      `;
      if (!otherAdmins.length) {
        throw new Error("Keep at least one administrator.");
      }
    }

    const profile = current.profile?.personal
      ? {
          ...current.profile,
          personal: {
            ...current.profile.personal,
            name,
            email,
          },
        }
      : current.profile;

    if (input.passwordHash) {
      await sql`
        UPDATE users
        SET name = ${name},
            email = ${email},
            role = ${nextRole},
            priority = ${nextPriority},
            password_hash = ${input.passwordHash},
            profile = ${profile ?? null}
        WHERE id = ${userId}
      `;
    } else {
      await sql`
        UPDATE users
        SET name = ${name},
            email = ${email},
            role = ${nextRole},
            priority = ${nextPriority},
            profile = ${profile ?? null}
        WHERE id = ${userId}
      `;
    }

    const updated = await findUserById(userId);
    if (!updated) throw new Error("Account not found.");
    return toPublicUser(updated);
  }

  return enqueue(async () => {
    const store = await readStore();
    const user = store.users.find((entry) => entry.id === userId);
    if (!user) throw new Error("Account not found.");

    if (
      store.users.some((entry) => entry.id !== userId && entry.email === email)
    ) {
      throw new Error("An account with that email already exists.");
    }

    if (user.role === "admin" && nextRole !== "admin") {
      const otherAdmins = store.users.filter(
        (entry) => entry.id !== userId && entry.role === "admin",
      );
      if (!otherAdmins.length) {
        throw new Error("Keep at least one administrator.");
      }
    }

    user.name = name;
    user.email = email;
    user.role = nextRole;
    user.priority = nextPriority;
    if (input.passwordHash) user.passwordHash = input.passwordHash;
    if (user.profile?.personal) {
      user.profile = {
        ...user.profile,
        personal: {
          ...user.profile.personal,
          name: user.name,
          email: user.email,
        },
      };
    }
    await writeStore(store);
    return toPublicUser(user);
  });
}

export async function deleteUser(userId: string): Promise<void> {
  if (hasDatabase()) {
    const sql = await withDatabase();
    const rows = (await sql`
      SELECT role FROM users WHERE id = ${userId} LIMIT 1
    `) as Array<{ role: string }>;
    if (!rows[0]) throw new Error("Account not found.");
    if (asRole(rows[0].role) === "admin") {
      const otherAdmins = await sql`
        SELECT id FROM users WHERE role = 'admin' AND id <> ${userId} LIMIT 1
      `;
      if (!otherAdmins.length) {
        throw new Error("Keep at least one administrator.");
      }
    }
    await sql`DELETE FROM users WHERE id = ${userId}`;
    return;
  }

  await enqueue(async () => {
    const store = await readStore();
    const user = store.users.find((entry) => entry.id === userId);
    if (!user) throw new Error("Account not found.");
    if (user.role === "admin") {
      const otherAdmins = store.users.filter(
        (entry) => entry.id !== userId && entry.role === "admin",
      );
      if (!otherAdmins.length) {
        throw new Error("Keep at least one administrator.");
      }
    }
    store.users = store.users.filter((entry) => entry.id !== userId);
    await writeStore(store);
  });
}

export async function updateUserPageStyle(
  userId: string,
  pageStyle: PageStyle,
): Promise<void> {
  const next = parsePageStyle(pageStyle);
  if (hasDatabase()) {
    const sql = await withDatabase();
    const exists = await sql`SELECT id FROM users WHERE id = ${userId} LIMIT 1`;
    if (!exists.length) throw new Error("Account not found.");
    await sql`UPDATE users SET page_style = ${next} WHERE id = ${userId}`;
    return;
  }

  await enqueue(async () => {
    const store = await readStore();
    const user = store.users.find((entry) => entry.id === userId);
    if (!user) throw new Error("Account not found.");
    user.pageStyle = next;
    await writeStore(store);
  });
}

export async function saveUserProfile(
  userId: string,
  profile: CandidateProfile,
): Promise<void> {
  const next = parseProfileDraft(profile) ?? emptyProfile();
  if (hasDatabase()) {
    const sql = await withDatabase();
    const exists = await sql`SELECT id FROM users WHERE id = ${userId} LIMIT 1`;
    if (!exists.length) throw new Error("Account not found.");
    await sql`UPDATE users SET profile = ${next} WHERE id = ${userId}`;
    return;
  }

  await enqueue(async () => {
    const store = await readStore();
    const user = store.users.find((entry) => entry.id === userId);
    if (!user) throw new Error("Account not found.");
    user.profile = next;
    await writeStore(store);
  });
}

export function profileFromUser(user: StoredUser | null): CandidateProfile {
  if (!user?.profile) return emptyProfile();
  return parseProfileDraft(user.profile) ?? emptyProfile();
}
