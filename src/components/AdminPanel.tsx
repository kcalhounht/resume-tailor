"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { CandidateProfile, EducationInput, ExperienceInput } from "@/lib/types";

type UserRow = {
  id: number;
  username: string;
  isAdmin: boolean;
  createdAt: string;
  profileUpdatedAt: string | null;
  displayName: string | null;
  email: string | null;
};

const EMPTY_EXPERIENCE: ExperienceInput = {
  company: "",
  title: "",
  period: "",
  location: "",
};

const EMPTY_EDUCATION: EducationInput = {
  school: "",
  degree: "",
  discipline: "",
  period: "",
  location: "",
};

function emptyProfile(): CandidateProfile {
  return {
    personal: {
      name: "",
      phone: "",
      linkedin: "",
      email: "",
      location: "",
    },
    experiences: [{ ...EMPTY_EXPERIENCE }],
    education: [{ ...EMPTY_EDUCATION }],
  };
}

function cloneProfile(profile: CandidateProfile): CandidateProfile {
  return {
    personal: { ...profile.personal },
    experiences: profile.experiences.map((e) => ({ ...e })),
    education: profile.education.map((e) => ({ ...e })),
  };
}

export default function AdminPanel() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [username, setUsername] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [password, setPassword] = useState("");
  const [profile, setProfile] = useState<CandidateProfile>(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const selected = useMemo(
    () => users.find((u) => u.id === selectedId) || null,
    [users, selectedId],
  );

  const loadUsers = useCallback(async () => {
    setError(null);
    const response = await fetch("/api/admin/users");
    const data = await response.json().catch(() => null);
    if (response.status === 403) {
      setForbidden(true);
      return [];
    }
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || "Failed to load users");
    }
    const list = (data.users || []) as UserRow[];
    setUsers(list);
    return list;
  }, []);

  const loadUser = useCallback(async (id: number) => {
    setError(null);
    setMessage(null);
    const response = await fetch(`/api/admin/users/${id}`);
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      throw new Error(data?.error || "Failed to load user");
    }
    setSelectedId(id);
    setUsername(data.user.username);
    setIsAdmin(Boolean(data.user.isAdmin));
    setPassword("");
    setProfile(cloneProfile(data.profile || emptyProfile()));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await loadUsers();
        if (cancelled) return;
        if (list.length) {
          await loadUser(list[0].id);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadUsers, loadUser]);

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (selectedId == null) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/users/${selectedId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          isAdmin,
          password: password || undefined,
          profile,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to save");
      }
      setPassword("");
      setMessage("Saved.");
      await loadUsers();
      if (data.user) {
        setUsername(data.user.username);
        setIsAdmin(Boolean(data.user.isAdmin));
      }
      if (data.profile) setProfile(cloneProfile(data.profile));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (selectedId == null || !selected) return;
    if (
      !window.confirm(
        `Delete user “${selected.username}” and their profile? This cannot be undone.`,
      )
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/users/${selectedId}`, {
        method: "DELETE",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to delete");
      }
      const list = await loadUsers();
      if (list.length) {
        await loadUser(list[0].id);
      } else {
        setSelectedId(null);
        setProfile(emptyProfile());
      }
      setMessage("User deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setSaving(false);
    }
  }

  if (forbidden) {
    return (
      <div className="admin-panel">
        <p className="error">Admin access required.</p>
        <p className="hint">
          The first signed-up user is an admin. You can also set{" "}
          <code>ADMIN_USERNAMES</code> in <code>.env.local</code>.
        </p>
        <Link href="/" className="ghost-btn">
          Back to home
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="admin-panel">
        <p className="hint">Loading database…</p>
      </div>
    );
  }

  const { personal, experiences, education } = profile;

  return (
    <div className="admin-panel">
      <div className="admin-layout">
        <aside className="admin-sidebar">
          <div className="section-head">
            <div>
              <h2>Users</h2>
              <p className="hint">{users.length} account(s)</p>
            </div>
          </div>

          <ul className="admin-user-list">
            {users.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  className={
                    user.id === selectedId
                      ? "admin-user-btn active"
                      : "admin-user-btn"
                  }
                  onClick={() => void loadUser(user.id)}
                >
                  <span className="admin-user-name">
                    {user.username}
                    {user.isAdmin ? (
                      <span className="admin-pill">admin</span>
                    ) : null}
                  </span>
                  <span className="admin-user-meta">
                    {user.displayName || user.email || `ID ${user.id}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="admin-detail">
          {!selected ? (
            <p className="hint">Select a user to edit.</p>
          ) : (
            <form onSubmit={(e) => void onSave(e)}>
              <div className="section-head">
                <div>
                  <h2>Edit user</h2>
                  <p className="hint">
                    Created {selected.createdAt}
                    {selected.profileUpdatedAt
                      ? ` · profile ${selected.profileUpdatedAt}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="ghost-btn danger-text"
                  onClick={() => void onDelete()}
                  disabled={saving}
                >
                  Delete
                </button>
              </div>

              {error && <p className="error">{error}</p>}
              {message && <p className="profile-save-msg">{message}</p>}

              <div className="field-grid">
                <label className="field">
                  <span>Username</span>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    minLength={3}
                  />
                </label>
                <label className="field">
                  <span>New password (optional)</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                    placeholder="Leave blank to keep"
                  />
                </label>
              </div>

              <label className="admin-check">
                <input
                  type="checkbox"
                  checked={isAdmin}
                  onChange={(e) => setIsAdmin(e.target.checked)}
                />
                <span>Admin access</span>
              </label>

              <h3 className="admin-subhead">Personal information</h3>
              <div className="field-grid">
                {(
                  [
                    ["name", "Full name"],
                    ["email", "Email"],
                    ["phone", "Phone"],
                    ["location", "Location"],
                    ["linkedin", "LinkedIn URL"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className={
                      key === "linkedin" ? "field field-span" : "field"
                    }
                  >
                    <span>{label}</span>
                    <input
                      value={personal[key]}
                      onChange={(e) =>
                        setProfile((prev) => ({
                          ...prev,
                          personal: {
                            ...prev.personal,
                            [key]: e.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                ))}
              </div>

              <div className="section-head admin-subhead-row">
                <h3 className="admin-subhead">Experience</h3>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() =>
                    setProfile((prev) => ({
                      ...prev,
                      experiences: [
                        ...prev.experiences,
                        { ...EMPTY_EXPERIENCE },
                      ],
                    }))
                  }
                >
                  + Add
                </button>
              </div>
              {experiences.map((exp, index) => (
                <div key={index} className="admin-card">
                  <div className="field-grid">
                    {(
                      [
                        ["company", "Company"],
                        ["title", "Title"],
                        ["period", "Period"],
                        ["location", "Location"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="field">
                        <span>{label}</span>
                        <input
                          value={exp[key]}
                          onChange={(e) =>
                            setProfile((prev) => ({
                              ...prev,
                              experiences: prev.experiences.map((item, i) =>
                                i === index
                                  ? { ...item, [key]: e.target.value }
                                  : item,
                              ),
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                  {experiences.length > 1 && (
                    <button
                      type="button"
                      className="ghost-btn danger-text"
                      onClick={() =>
                        setProfile((prev) => ({
                          ...prev,
                          experiences: prev.experiences.filter(
                            (_, i) => i !== index,
                          ),
                        }))
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}

              <div className="section-head admin-subhead-row">
                <h3 className="admin-subhead">Education</h3>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() =>
                    setProfile((prev) => ({
                      ...prev,
                      education: [...prev.education, { ...EMPTY_EDUCATION }],
                    }))
                  }
                >
                  + Add
                </button>
              </div>
              {education.map((edu, index) => (
                <div key={index} className="admin-card">
                  <div className="field-grid">
                    {(
                      [
                        ["school", "School"],
                        ["degree", "Degree"],
                        ["discipline", "Discipline"],
                        ["period", "Period"],
                        ["location", "Location"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="field">
                        <span>{label}</span>
                        <input
                          value={edu[key]}
                          onChange={(e) =>
                            setProfile((prev) => ({
                              ...prev,
                              education: prev.education.map((item, i) =>
                                i === index
                                  ? { ...item, [key]: e.target.value }
                                  : item,
                              ),
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                  {education.length > 1 && (
                    <button
                      type="button"
                      className="ghost-btn danger-text"
                      onClick={() =>
                        setProfile((prev) => ({
                          ...prev,
                          education: prev.education.filter(
                            (_, i) => i !== index,
                          ),
                        }))
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}

              <div className="admin-actions">
                <button type="submit" className="primary" disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
