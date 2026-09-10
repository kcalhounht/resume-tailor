import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

let sql: NeonQueryFunction<false, false> | null = null;
let ready: Promise<void> | null = null;

export function getSql() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error("DATABASE_URL is not set. Add your Neon connection string.");
  }
  if (!sql) sql = neon(url);
  return sql;
}

export async function withDatabase() {
  const client = getSql();
  if (!ready) {
    ready = ensureSchema(client).catch((err) => {
      ready = null;
      throw err;
    });
  }
  await ready;
  return client;
}

async function ensureSchema(client: NeonQueryFunction<false, false>) {
  await client`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
      priority TEXT NOT NULL CHECK (priority IN ('able', 'disable')),
      profile JSONB
    )
  `;
  await client`
    CREATE TABLE IF NOT EXISTS tailor_records (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL CHECK (status IN ('done', 'error')),
      job_description TEXT NOT NULL,
      company TEXT NOT NULL DEFAULT '',
      job_title TEXT NOT NULL DEFAULT '',
      extracted JSONB,
      ats_score INTEGER,
      zip_name TEXT,
      folder_name TEXT,
      resume_docx_name TEXT,
      resume_pdf_name TEXT,
      cover_letter_docx_name TEXT,
      error TEXT
    )
  `;
  await client`CREATE INDEX IF NOT EXISTS tailor_records_user_id_idx ON tailor_records (user_id)`;
  await client`CREATE INDEX IF NOT EXISTS tailor_records_created_at_idx ON tailor_records (created_at DESC)`;
  await client`CREATE INDEX IF NOT EXISTS tailor_records_zip_name_idx ON tailor_records (zip_name)`;
  await client`CREATE INDEX IF NOT EXISTS tailor_records_folder_name_idx ON tailor_records (folder_name)`;
  await client`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      payload JSONB NOT NULL
    )
  `;
}

export function isUniqueViolation(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return /duplicate key|unique constraint/i.test(message);
}

export function asIsoDate(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    return value;
  }
  return new Date().toISOString();
}
