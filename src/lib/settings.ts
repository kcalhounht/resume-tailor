import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { hasDatabase, withDatabase } from "./db";
import { getDataRoot } from "./runtime";
import type { UserPriority, UserRole } from "./users";

export type AppSettings = {
  defaultRole: UserRole;
  defaultPriority: UserPriority;
  allowSignup: boolean;
  llmModel: string;
  openRouterApiKey: string;
  settingsVersion: number;
};

export type PublicSettings = {
  defaultRole: UserRole;
  defaultPriority: UserPriority;
  allowSignup: boolean;
  llmModel: string;
  openRouterApiKey: string;
  hasOpenRouterKey: boolean;
};

/** Bump when a one-time settings migration should run on existing stores. */
const CURRENT_SETTINGS_VERSION = 2;

export const DEFAULT_SETTINGS: AppSettings = {
  defaultRole: "user",
  defaultPriority: "disable",
  allowSignup: true,
  llmModel: "",
  openRouterApiKey: "",
  settingsVersion: CURRENT_SETTINGS_VERSION,
};

const SETTINGS_ID = "app";

function storePath() {
  return path.join(getDataRoot(), "settings.json");
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

function asVersion(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

export function parseSettings(value: unknown): AppSettings {
  const raw =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const version = asVersion(raw.settingsVersion);
  return {
    defaultRole: asRole(raw.defaultRole),
    defaultPriority: asPriority(raw.defaultPriority),
    // Missing or null means on. After version 2, an explicit false is respected.
    allowSignup:
      version < CURRENT_SETTINGS_VERSION ? true : raw.allowSignup !== false,
    llmModel: typeof raw.llmModel === "string" ? raw.llmModel.trim() : "",
    openRouterApiKey:
      typeof raw.openRouterApiKey === "string" ? raw.openRouterApiKey.trim() : "",
    settingsVersion: Math.max(version, CURRENT_SETTINGS_VERSION),
  };
}

export function toPublicSettings(settings: AppSettings): PublicSettings {
  const openRouterApiKey =
    settings.openRouterApiKey || process.env.OPENROUTER_API_KEY?.trim() || "";
  return {
    defaultRole: settings.defaultRole,
    defaultPriority: settings.defaultPriority,
    allowSignup: settings.allowSignup,
    llmModel: settings.llmModel,
    openRouterApiKey,
    hasOpenRouterKey: Boolean(openRouterApiKey),
  };
}

async function readJsonFile(): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(storePath(), "utf8"));
  } catch {
    return null;
  }
}

async function writeJsonStore(settings: AppSettings) {
  const dir = path.dirname(storePath());
  await mkdir(dir, { recursive: true });
  await writeFile(storePath(), JSON.stringify(settings, null, 2), "utf8");
}

async function persistSettings(settings: AppSettings): Promise<AppSettings> {
  if (hasDatabase()) {
    const sql = await withDatabase();
    await sql`
      INSERT INTO settings (id, payload)
      VALUES (${SETTINGS_ID}, ${settings})
      ON CONFLICT (id) DO UPDATE SET payload = ${settings}
    `;
    return settings;
  }
  await writeJsonStore(settings);
  return settings;
}

function needsPersist(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return true;
  return (
    asVersion((raw as Record<string, unknown>).settingsVersion) <
    CURRENT_SETTINGS_VERSION
  );
}

export async function getSettings(): Promise<AppSettings> {
  if (hasDatabase()) {
    const sql = await withDatabase();
    const rows = (await sql`
      SELECT payload FROM settings WHERE id = ${SETTINGS_ID} LIMIT 1
    `) as Array<{ payload: unknown }>;
    const raw = rows[0]?.payload ?? null;
    const settings = parseSettings(raw);
    if (needsPersist(raw)) {
      return persistSettings(settings);
    }
    return settings;
  }

  return enqueue(async () => {
    const raw = await readJsonFile();
    const settings = parseSettings(raw);
    if (needsPersist(raw)) {
      return persistSettings(settings);
    }
    return settings;
  });
}

export async function saveSettings(
  input: Omit<AppSettings, "openRouterApiKey" | "settingsVersion"> & {
    openRouterApiKey?: string;
  },
): Promise<AppSettings> {
  const merge = (current: AppSettings) =>
    parseSettings({
      ...current,
      ...input,
      openRouterApiKey: input.openRouterApiKey?.trim()
        ? input.openRouterApiKey
        : current.openRouterApiKey,
      settingsVersion: CURRENT_SETTINGS_VERSION,
    });

  if (hasDatabase()) {
    const current = await getSettings();
    const settings = merge(current);
    return persistSettings(settings);
  }
  return enqueue(async () => {
    const current = parseSettings(await readJsonFile());
    const settings = merge(current);
    return persistSettings(settings);
  });
}
