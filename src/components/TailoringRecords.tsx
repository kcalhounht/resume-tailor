"use client";

import { useMemo, useState } from "react";
import {
  clearUserTailorRecords,
  removeTailorRecord,
  type AdminTailorRecord,
} from "@/app/actions/admin";
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

function atsClass(score: number) {
  return score >= 85 ? "high" : score >= 70 ? "mid" : "low";
}

type DayGroup = {
  key: string;
  records: AdminTailorRecord[];
};

export default function TailoringRecords({
  records,
  profileName,
  userId,
  busy,
  onBusy,
  onRecordsChange,
  onConfirm,
}: {
  records: AdminTailorRecord[];
  profileName: string;
  userId: string;
  busy: boolean;
  onBusy: (label: string | null, work: () => Promise<void>) => Promise<void>;
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
      return [
        profileName,
        record.company,
        record.jobTitle,
        record.jobDescription,
        record.error,
        record.extracted?.summary,
      ]
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
  }, [day, days, profileName, query, records]);

  function deleteRecord(record: AdminTailorRecord) {
    onConfirm({
      message: "Delete this tailoring record and its files?",
      confirmLabel: "Delete",
      work: () => {
        void onBusy(null, async () => {
          await removeTailorRecord(record.id);
          onRecordsChange((current) =>
            current.filter((entry) => entry.id !== record.id),
          );
          if (openId === record.id) setOpenId(null);
        });
      },
    });
  }

  function clearAll() {
    onConfirm({
      message: "Delete all tailoring records for this user? This cannot be undone.",
      confirmLabel: "Clear all",
      work: () => {
        void onBusy(null, async () => {
          await clearUserTailorRecords(userId);
          onRecordsChange((current) =>
            current.filter((entry) => entry.userId !== userId),
          );
          setOpenId(null);
        });
      },
    });
  }

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Tailoring record</h2>
          <p className="hint">
            This user’s generate history, grouped by date.
          </p>
        </div>
        <button
          type="button"
          className="text-btn danger-btn"
          disabled={busy || records.length === 0}
          onClick={clearAll}
        >
          Clear all
        </button>
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
            placeholder="Name, role, or JD text"
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
                      <div className="record-row">
                        <span className="record-name">
                          {profileName || record.userName || "—"}
                        </span>
                        <span className="record-role">
                          {record.jobTitle || "—"}
                        </span>
                        <span className="record-time">
                          {formatTime(record.createdAt) || "—"}
                        </span>
                        {record.status === "done" &&
                        typeof record.atsScore === "number" ? (
                          <span
                            className={`ats-score ${atsClass(record.atsScore)}`}
                          >
                            ATS {record.atsScore}/100
                          </span>
                        ) : record.status === "done" ? (
                          <span className="ats-score">ATS —/100</span>
                        ) : (
                          <span className="record-status record-status-error">
                            Failed
                          </span>
                        )}
                        <button
                          type="button"
                          className="text-btn"
                          disabled={busy}
                          onClick={() => setOpenId(open ? null : record.id)}
                        >
                          {open ? "Hide summary" : "Summary"}
                        </button>
                        <button
                          type="button"
                          className="text-btn danger-btn"
                          disabled={busy}
                          onClick={() => deleteRecord(record)}
                        >
                          Delete
                        </button>
                      </div>

                      {record.error && <p className="error">{record.error}</p>}

                      {open ? (
                        <p className="record-summary">
                          {record.extracted?.summary?.trim() ||
                            "No summary saved."}
                        </p>
                      ) : null}
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
