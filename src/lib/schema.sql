-- Neon / Postgres schema for Resume Tailor.
-- Tables are also created automatically on first request when DATABASE_URL is set.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  priority TEXT NOT NULL CHECK (priority IN ('able', 'disable')),
  profile JSONB
);

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
);

CREATE INDEX IF NOT EXISTS tailor_records_user_id_idx ON tailor_records (user_id);
CREATE INDEX IF NOT EXISTS tailor_records_created_at_idx ON tailor_records (created_at DESC);
CREATE INDEX IF NOT EXISTS tailor_records_zip_name_idx ON tailor_records (zip_name);
CREATE INDEX IF NOT EXISTS tailor_records_folder_name_idx ON tailor_records (folder_name);
