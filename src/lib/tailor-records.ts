import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type { ExtractedJD } from "./types";
import { asIsoDate, assertJsonStoreAllowed, hasDatabase, withDatabase } from "./db";

export type TailorRecordStatus = "done" | "error";

export type TailorRecord = {
  id: string;
  userId: string;
  createdAt: string;
  status: TailorRecordStatus;
  jobDescription: string;
  company: string;
  jobTitle: string;
  extracted?: ExtractedJD;
  atsScore?: number;
  zipName?: string;
  folderName?: string;
  resumeDocxName?: string;
  resumePdfName?: string;
  coverLetterDocxName?: string;
  error?: string;
};

type RecordStore = {
  records: TailorRecord[];
};

type RecordRow = {
  id: string;
  user_id: string;
  created_at: string | Date;
  status: string;
  job_description: string;
  company: string;
  job_title: string;
  extracted: ExtractedJD | null;
  ats_score: number | null;
  zip_name: string | null;
  folder_name: string | null;
  resume_docx_name: string | null;
  resume_pdf_name: string | null;
  cover_letter_docx_name: string | null;
  error: string | null;
};

function storePath() {
  return path.join(process.cwd(), "data", "tailor-records.json");
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

async function readStore(): Promise<RecordStore> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as RecordStore;
    if (!parsed || !Array.isArray(parsed.records)) return { records: [] };
    return parsed;
  } catch {
    return { records: [] };
  }
}

async function writeStore(store: RecordStore) {
  assertJsonStoreAllowed();
  const dir = path.dirname(storePath());
  await mkdir(dir, { recursive: true });
  await writeFile(storePath(), JSON.stringify(store, null, 2), "utf8");
}

function rowToRecord(row: RecordRow): TailorRecord {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: asIsoDate(row.created_at),
    status: row.status === "error" ? "error" : "done",
    jobDescription: row.job_description,
    company: row.company || "",
    jobTitle: row.job_title || "",
    extracted: row.extracted || undefined,
    atsScore: row.ats_score ?? undefined,
    zipName: row.zip_name || undefined,
    folderName: row.folder_name || undefined,
    resumeDocxName: row.resume_docx_name || undefined,
    resumePdfName: row.resume_pdf_name || undefined,
    coverLetterDocxName: row.cover_letter_docx_name || undefined,
    error: row.error || undefined,
  };
}

function sortNewest(records: TailorRecord[]) {
  return records
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function newTailorRecordId() {
  return randomUUID();
}

export function recordOutputSuffix(id: string) {
  return id.replace(/-/g, "").slice(0, 8);
}

export async function addTailorRecord(
  input: Omit<TailorRecord, "createdAt"> & { createdAt?: string },
): Promise<TailorRecord> {
  const record: TailorRecord = {
    ...input,
    jobDescription: input.jobDescription.slice(0, 50000),
    createdAt: input.createdAt || new Date().toISOString(),
  };

  if (hasDatabase()) {
    const sql = await withDatabase();
    await sql`
      INSERT INTO tailor_records (
        id, user_id, created_at, status, job_description, company, job_title,
        extracted, ats_score, zip_name, folder_name, resume_docx_name,
        resume_pdf_name, cover_letter_docx_name, error
      ) VALUES (
        ${record.id},
        ${record.userId},
        ${record.createdAt},
        ${record.status},
        ${record.jobDescription},
        ${record.company},
        ${record.jobTitle},
        ${record.extracted ?? null},
        ${record.atsScore ?? null},
        ${record.zipName ?? null},
        ${record.folderName ?? null},
        ${record.resumeDocxName ?? null},
        ${record.resumePdfName ?? null},
        ${record.coverLetterDocxName ?? null},
        ${record.error ?? null}
      )
    `;
    return record;
  }

  return enqueue(async () => {
    const store = await readStore();
    store.records.push(record);
    await writeStore(store);
    return record;
  });
}

export async function listTailorRecords(): Promise<TailorRecord[]> {
  if (hasDatabase()) {
    const sql = await withDatabase();
    const rows = (await sql`
      SELECT * FROM tailor_records ORDER BY created_at DESC
    `) as RecordRow[];
    return rows.map(rowToRecord);
  }
  return sortNewest((await readStore()).records);
}

export async function listTailorRecordsForUser(
  userId: string,
): Promise<TailorRecord[]> {
  if (hasDatabase()) {
    const sql = await withDatabase();
    const rows = (await sql`
      SELECT * FROM tailor_records
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `) as RecordRow[];
    return rows.map(rowToRecord);
  }
  const store = await readStore();
  return sortNewest(
    store.records.filter((record) => record.userId === userId),
  );
}

export async function findTailorRecordById(
  id: string,
): Promise<TailorRecord | null> {
  if (hasDatabase()) {
    const sql = await withDatabase();
    const rows = (await sql`
      SELECT * FROM tailor_records WHERE id = ${id} LIMIT 1
    `) as RecordRow[];
    return rows[0] ? rowToRecord(rows[0]) : null;
  }
  const store = await readStore();
  return store.records.find((record) => record.id === id) ?? null;
}

export async function findTailorRecordByOutput(input: {
  zipName?: string | null;
  folderName?: string | null;
}): Promise<TailorRecord | null> {
  if (hasDatabase()) {
    const sql = await withDatabase();
    if (input.zipName) {
      const rows = (await sql`
        SELECT * FROM tailor_records WHERE zip_name = ${input.zipName} LIMIT 1
      `) as RecordRow[];
      return rows[0] ? rowToRecord(rows[0]) : null;
    }
    if (input.folderName) {
      const rows = (await sql`
        SELECT * FROM tailor_records
        WHERE folder_name = ${input.folderName}
        LIMIT 1
      `) as RecordRow[];
      return rows[0] ? rowToRecord(rows[0]) : null;
    }
    return null;
  }

  const store = await readStore();
  if (input.zipName) {
    return store.records.find((record) => record.zipName === input.zipName) ?? null;
  }
  if (input.folderName) {
    return (
      store.records.find((record) => record.folderName === input.folderName) ??
      null
    );
  }
  return null;
}

export async function deleteTailorRecord(id: string): Promise<TailorRecord | null> {
  if (hasDatabase()) {
    const existing = await findTailorRecordById(id);
    if (!existing) return null;
    const sql = await withDatabase();
    await sql`DELETE FROM tailor_records WHERE id = ${id}`;
    return existing;
  }

  return enqueue(async () => {
    const store = await readStore();
    const record = store.records.find((entry) => entry.id === id) ?? null;
    if (!record) return null;
    store.records = store.records.filter((entry) => entry.id !== id);
    await writeStore(store);
    return record;
  });
}

export async function deleteTailorRecordsForUser(
  userId: string,
): Promise<TailorRecord[]> {
  if (hasDatabase()) {
    const removed = await listTailorRecordsForUser(userId);
    const sql = await withDatabase();
    await sql`DELETE FROM tailor_records WHERE user_id = ${userId}`;
    return removed;
  }

  return enqueue(async () => {
    const store = await readStore();
    const removed = store.records.filter((record) => record.userId === userId);
    store.records = store.records.filter((record) => record.userId !== userId);
    await writeStore(store);
    return removed;
  });
}
