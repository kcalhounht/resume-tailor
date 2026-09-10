import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { hasDatabase, withDatabase } from "./db";
import type { UserPriority, UserRole } from "./users";

export type AppSettings = {
  defaultRole: UserRole;
  defaultPriority: UserPriority;
  allowSignup: boolean;
  llmModel: string;
};

export const DEFAULT_SETTINGS: AppSettings = {
  defaultRole: "user",
  defaultPriority: "disable",
  allowSignup: true,
  llmModel: "",
};

const SETTINGS_ID = "app";

function storePath() {
  return path.join(process.cwd(), "data", "settings.json");
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
  return value === "able" ? "able" : "disable";
}

export function parseSettings(value: unknown): AppSettings {
  const raw =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    defaultRole: asRole(raw.defaultRole),
    defaultPriority: asPriority(raw.defaultPriority),
    allowSignup: raw.allowSignup !== false,
    llmModel: typeof raw.llmModel === "string" ? raw.llmModel.trim() : "",
  };
}

async function readJsonStore(): Promise<AppSettings> {
  try {
    const raw = await readFile(storePath(), "utf8");
    return parseSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

async function writeJsonStore(settings: AppSettings) {
  const dir = path.dirname(storePath());
  await mkdir(dir, { recursive: true });
  await writeFile(storePath(), JSON.stringify(settings, null, 2), "utf8");
}

export async function getSettings(): Promise<AppSettings> {
  if (hasDatabase()) {
    const sql = await withDatabase();
    const rows = (await sql`
      SELECT payload FROM settings WHERE id = ${SETTINGS_ID} LIMIT 1
    `) as Array<{ payload: unknown }>;
    return rows[0] ? parseSettings(rows[0].payload) : { ...DEFAULT_SETTINGS };
  }
  return readJsonStore();
}

export async function saveSettings(input: AppSettings): Promise<AppSettings> {
  const settings = parseSettings(input);
  if (hasDatabase()) {
    const sql = await withDatabase();
    await sql`
      INSERT INTO settings (id, payload)
      VALUES (${SETTINGS_ID}, ${settings})
      ON CONFLICT (id) DO UPDATE SET payload = ${settings}
    `;
    return settings;
  }
  return enqueue(async () => {
    await writeJsonStore(settings);
    return settings;
  });
}
