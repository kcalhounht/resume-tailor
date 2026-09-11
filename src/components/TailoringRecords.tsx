"use client";

import { useMemo, useState } from "react";
import { removeTailorRecord } from "@/app/actions/admin";
import type { AdminTailorRecord } from "@/app/actions/admin";
import type { ConfirmRequest } from "@/components/MessageBox";

function recordDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDay(key: string) {
  const date = new Date(`${key}T00:00:00`);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

type DayGroup = {
  key: string;
  records: AdminTailorRecord[];
};

export default function TailoringRecords({
  records,
  busy,
  onBusy,
  onRecordsChange,
  onConfirm,
}: {
  records: AdminTailorRecord[];
  busy: boolean;
  onBusy: (label: string, work: () => Promise<void>) => Promise<void>;
  onRecordsChange: (
    update: (current: AdminTailorRecord[]) => AdminTailorRecord[],
  ) => void;
  onConfirm: (request: ConfirmRequest) => void;
}) {
  const [query, setQuery] = useState("");
  const [day, setDay] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const days = useMemo(() => {
    const keys = new Set(records.map((record) => recordDate(record.createdAt)));
    return [...keys].sort((left, right) => right.localeCompare(left));
  }, [records]);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const selectedDay = days.includes(day) ? day : "all";
    const filtered = records.filter((record) => {
      const key = recordDate(record.createdAt);
      if (selectedDay !== "all" && key !== selectedDay) return false;
      if (!needle) return true;
      return [record.company, record.jobTitle, record.jobDescription, record.error]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });

    const byDay = new Map<string, AdminTailorRecord[]>();
    for (const record of filtered) {
      const key = recordDate(record.createdAt);
      const list = byDay.get(key) ?? [];
      list.push(record);
      byDay.set(key, list);
    }

    return [...byDay.entries()]
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([key, items]) => ({
        key,
        records: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      })) satisfies DayGroup[];
  }, [day, days, query, records]);

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Tailoring record</h2>
          <p className="hint">
            This user’s generate history, grouped by date.
          </p>
        </div>
      </div>

      <div className="field-grid">
        <div className="field">
          <label htmlFor="record-day">Date</label>
          <select
            id="record-day"
            value={day}
            disabled={busy}
            onChange={(event) => setDay(event.target.value)}
          >
            <option value="all">All dates ({records.length})</option>
            {days.map((key) => (
              <option key={key} value={key}>
                {formatDay(key)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="record-search">Search</label>
          <input
            id="record-search"
            value={query}
            disabled={busy}
            placeholder="Company, role, or JD text"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="hint">No tailoring records for this user yet.</p>
      ) : (
        <div className="record-history">
          {groups.map((group) => (
            <section key={group.key} className="record-day">
              <div className="record-day-head">
                <h3>{formatDay(group.key)}</h3>
                <p className="hint">
                  {group.records.length}{" "}
                  {group.records.length === 1 ? "run" : "runs"}
                </p>
              </div>
              <ul className="record-list">
                {group.records.map((record) => {
                  const open = openId === record.id;
                  return (
                    <li key={record.id} className="record-card">
                      <div className="record-head">
                        <div>
                          <p className="record-title">
                            {record.company || record.jobTitle
                              ? `${record.company || "Unknown company"} · ${record.jobTitle || "Untitled role"}`
                              : "Failed generate"}
                          </p>
                          <p className="record-meta">{formatTime(record.createdAt)}</p>
                        </div>
                        <span
                          className={`record-status${
                            record.status === "done"
                              ? ""
                              : " record-status-error"
                          }`}
                        >
                          {record.status === "done"
                            ? `ATS ${record.atsScore ?? "—"}/100`
                            : "Failed"}
                        </span>
                      </div>

                      {record.error && <p className="error">{record.error}</p>}

                      <div className="download-actions record-actions">
                        <button
                          type="button"
                          className="text-btn"
                          disabled={busy}
                          onClick={() => setOpenId(open ? null : record.id)}
                        >
                          {open ? "Hide details" : "Details"}
                        </button>
                        {record.status === "done" &&
                          record.folderName &&
                          record.resumeDocxName && (
                            <a
                              className="download-btn"
                              href={`/api/download?folder=${encodeURIComponent(record.folderName)}&name=${encodeURIComponent(record.resumeDocxName)}`}
                            >
                              Resume
                            </a>
                          )}
                        {record.status === "done" &&
                          record.folderName &&
                          record.coverLetterDocxName && (
                            <a
                              className="download-btn"
                              href={`/api/download?folder=${encodeURIComponent(record.folderName)}&name=${encodeURIComponent(record.coverLetterDocxName)}`}
                            >
                              Cover letter
                            </a>
                          )}
                        {record.status === "done" && record.zipName && (
                          <a
                            className="download-btn"
                            href={`/api/download?file=${encodeURIComponent(record.zipName)}`}
                          >
                            Zip
                          </a>
                        )}
                        <button
                          type="button"
                          className="text-btn danger-btn"
                          disabled={busy}
                          onClick={() => {
                            onConfirm({
                              message:
                                "Delete this tailoring record and its files?",
                              confirmLabel: "Delete",
                              work: () => {
                                void onBusy(
                                  "Tailoring record deleted.",
                                  async () => {
                                    await removeTailorRecord(record.id);
                                    onRecordsChange((current) =>
                                      current.filter(
                                        (entry) => entry.id !== record.id,
                                      ),
                                    );
                                    if (openId === record.id) setOpenId(null);
                                  },
                                );
                              },
                            });
                          }}
                        >
                          Delete
                        </button>
                      </div>

                      {open && (
                        <div className="record-details">
                          {record.extracted && (
                            <p className="hint">
                              {record.extracted.summary}
                              {record.extracted.hardTechnicalSkills.length
                                ? ` Skills: ${record.extracted.hardTechnicalSkills.slice(0, 8).join(", ")}`
                                : ""}
                            </p>
                          )}
                          <label className="field">
                            <span>Job description</span>
                            <textarea
                              readOnly
                              value={record.jobDescription}
                              rows={8}
                            />
                          </label>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
