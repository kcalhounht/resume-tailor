"use client";

import { useMemo, useState } from "react";
import CandidateForm from "@/components/CandidateForm";
import TailoringRecords from "@/components/TailoringRecords";
import {
  createAccount,
  removeAccount,
  saveAccountProfile,
  updateAccount,
  type AdminTailorRecord,
} from "@/app/actions/admin";
import { isProfileReady } from "@/lib/profile";
import type { CandidateProfile } from "@/lib/types";
import type { PublicUser, UserPriority, UserRole } from "@/lib/users";

type UserTab = "account" | "profile" | "tailoring";

function actionError(err: unknown) {
  return err instanceof Error ? err.message : "Administrator action failed.";
}

function AccountTab({
  adminId,
  selected,
  busy,
  onBusy,
  onUsersChange,
}: {
  adminId: string;
  selected: PublicUser;
  busy: boolean;
  onBusy: (label: string, work: () => Promise<void>) => Promise<void>;
  onUsersChange: (
    update: (current: PublicUser[]) => PublicUser[],
    nextSelectedId?: string,
  ) => void;
}) {
  const [name, setName] = useState(selected.name);
  const [email, setEmail] = useState(selected.email);
  const [role, setRole] = useState<UserRole>(selected.role);
  const [priority, setPriority] = useState<UserPriority>(selected.priority);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordFieldsLocked, setPasswordFieldsLocked] = useState(true);

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Account</h2>
          <p className="hint">
            Login details and priority. Disable blocks generate, profile
            saves, and resume import. They can still sign in.
          </p>
        </div>
      </div>

      <div className="field-grid">
        <div className="field">
          <label htmlFor="account-name">Name</label>
          <input
            id="account-name"
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="account-email">Email</label>
          <input
            id="account-email"
            type="email"
            value={email}
            disabled={busy}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="account-role">Role</label>
          <select
            id="account-role"
            value={role}
            disabled={busy || selected.id === adminId}
            onChange={(event) => setRole(event.target.value as UserRole)}
          >
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="account-priority">Priority</label>
          <select
            id="account-priority"
            value={priority}
            disabled={busy || selected.id === adminId}
            onChange={(event) =>
              setPriority(event.target.value as UserPriority)
            }
          >
            <option value="able">able</option>
            <option value="disable">disable</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="account-password">New password</label>
          <input
            id="account-password"
            name="account-new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            disabled={busy}
            placeholder="Leave blank to keep"
            readOnly={passwordFieldsLocked}
            onFocus={() => setPasswordFieldsLocked(false)}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="account-confirm-password">Confirm new password</label>
          <input
            id="account-confirm-password"
            name="account-confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            disabled={busy}
            placeholder="Required if changing password"
            readOnly={passwordFieldsLocked}
            onFocus={() => setPasswordFieldsLocked(false)}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </div>
      </div>

      <div className="composer-footer">
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => {
            void onBusy("Account saved.", async () => {
              if (password || confirmPassword) {
                if (password.length < 8) {
                  throw new Error("Password must be at least 8 characters.");
                }
                if (!confirmPassword) {
                  throw new Error("Confirm the new password.");
                }
                if (password !== confirmPassword) {
                  throw new Error("Passwords do not match.");
                }
              }
              const updated = await updateAccount(selected.id, {
                name,
                email,
                role,
                priority,
                password: password || undefined,
              });
              onUsersChange((current) =>
                current.map((user) =>
                  user.id === updated.id
                    ? { ...updated, profile: selected.profile }
                    : user,
                ),
              );
              setPassword("");
              setConfirmPassword("");
              setPasswordFieldsLocked(true);
            });
          }}
        >
          Save account
        </button>
        <button
          type="button"
          className="text-btn danger-btn"
          disabled={busy || selected.id === adminId}
          onClick={() => {
            if (
              !window.confirm(`Delete ${selected.email}? This cannot be undone.`)
            ) {
              return;
            }
            void onBusy("Account deleted.", async () => {
              const removedId = selected.id;
              await removeAccount(removedId);
              onUsersChange(
                (current) => current.filter((user) => user.id !== removedId),
                undefined,
              );
            });
          }}
        >
          Delete account
        </button>
      </div>
    </>
  );
}

function ProfileTab({
  selected,
  busy,
  onBusy,
  onUsersChange,
}: {
  selected: PublicUser;
  busy: boolean;
  onBusy: (label: string, work: () => Promise<void>) => Promise<void>;
  onUsersChange: (
    update: (current: PublicUser[]) => PublicUser[],
    nextSelectedId?: string,
  ) => void;
}) {
  const [profile, setProfile] = useState<CandidateProfile>(selected.profile);

  return (
    <>
      <div className="section-head">
        <div>
          <h2>Profile</h2>
          <p className="hint">
            Saved to this account. They will see it on the Profile tab.
          </p>
        </div>
      </div>

      <CandidateForm
        profile={profile}
        disabled={busy}
        onChange={setProfile}
      />

      <div className="composer-footer">
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => {
            void onBusy("Profile saved.", async () => {
              await saveAccountProfile(selected.id, profile);
              onUsersChange((current) =>
                current.map((user) =>
                  user.id === selected.id ? { ...user, profile } : user,
                ),
              );
            });
          }}
        >
          Save profile
        </button>
      </div>
    </>
  );
}

export default function AdminPanel({
  adminId,
  initialUsers,
  initialRecords,
  defaultRole,
  defaultPriority,
}: {
  adminId: string;
  initialUsers: PublicUser[];
  initialRecords: AdminTailorRecord[];
  defaultRole: UserRole;
  defaultPriority: UserPriority;
}) {
  const [userTab, setUserTab] = useState<UserTab>("account");
  const [users, setUsers] = useState(initialUsers);
  const [records, setRecords] = useState(initialRecords);
  const [selectedId, setSelectedId] = useState(initialUsers[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newConfirmPassword, setNewConfirmPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>(defaultRole);
  const [newPriority, setNewPriority] = useState<UserPriority>(defaultPriority);
  const [createFieldsLocked, setCreateFieldsLocked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = users.find((user) => user.id === selectedId) ?? null;

  const visibleUsers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter(
      (user) =>
        user.name.toLowerCase().includes(needle) ||
        user.email.toLowerCase().includes(needle),
    );
  }, [query, users]);

  const selectedRecords = useMemo(
    () => records.filter((record) => record.userId === selectedId),
    [records, selectedId],
  );

  const recordCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of records) {
      counts.set(record.userId, (counts.get(record.userId) || 0) + 1);
    }
    return counts;
  }, [records]);

  async function run(label: string, work: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await work();
      setMessage(label);
    } catch (err) {
      setError(actionError(err));
    } finally {
      setBusy(false);
    }
  }

  function changeUsers(
    update: (current: PublicUser[]) => PublicUser[],
    nextSelectedId?: string,
  ) {
    const next = update(users);
    setUsers(next);
    setRecords((current) =>
      current.filter((record) => next.some((user) => user.id === record.userId)),
    );
    if (nextSelectedId !== undefined) {
      setSelectedId(nextSelectedId);
    } else if (!next.some((user) => user.id === selectedId)) {
      setSelectedId(next[0]?.id ?? "");
    }
  }

  return (
    <div className="admin-page">
      <section className="composer">
        <div className="section-head">
          <div>
            <h2>Create account</h2>
            <p className="hint">
              Admin-created accounts can sign in immediately. The first account
              on an empty site is always an administrator.
            </p>
          </div>
        </div>
        <form
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            if (!newConfirmPassword) {
              setError("Confirm the password.");
              setMessage(null);
              return;
            }
            if (newPassword !== newConfirmPassword) {
              setError("Passwords do not match.");
              setMessage(null);
              return;
            }
            void run("Account created.", async () => {
              const created = await createAccount({
                name: newName,
                email: newEmail,
                password: newPassword,
                role: newRole,
                priority: newPriority,
              });
              changeUsers((current) => [...current, created], created.id);
              setUserTab("account");
              setNewName("");
              setNewEmail("");
              setNewPassword("");
              setNewConfirmPassword("");
              setNewRole(defaultRole);
              setNewPriority(defaultPriority);
              setCreateFieldsLocked(true);
            });
          }}
        >
          <div aria-hidden className="autofill-trap">
            <input type="text" name="username" autoComplete="username" tabIndex={-1} />
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              tabIndex={-1}
            />
          </div>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="new-name">Name</label>
              <input
                id="new-name"
                name="create-account-name"
                autoComplete="off"
                value={newName}
                disabled={busy}
                readOnly={createFieldsLocked}
                onFocus={() => setCreateFieldsLocked(false)}
                onChange={(event) => setNewName(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="new-email">Email</label>
              <input
                id="new-email"
                name="create-account-email"
                type="email"
                autoComplete="off"
                value={newEmail}
                disabled={busy}
                readOnly={createFieldsLocked}
                onFocus={() => setCreateFieldsLocked(false)}
                onChange={(event) => setNewEmail(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="new-password">Password</label>
              <input
                id="new-password"
                name="create-account-password"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                disabled={busy}
                readOnly={createFieldsLocked}
                onFocus={() => setCreateFieldsLocked(false)}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="new-confirm-password">Confirm password</label>
              <input
                id="new-confirm-password"
                name="create-account-confirm-password"
                type="password"
                autoComplete="new-password"
                value={newConfirmPassword}
                disabled={busy}
                readOnly={createFieldsLocked}
                onFocus={() => setCreateFieldsLocked(false)}
                onChange={(event) => setNewConfirmPassword(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="new-role">Role</label>
              <select
                id="new-role"
                name="create-account-role"
                value={newRole}
                disabled={busy}
                onChange={(event) =>
                  setNewRole(event.target.value as UserRole)
                }
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="new-priority">Priority</label>
              <select
                id="new-priority"
                name="create-account-priority"
                value={newPriority}
                disabled={busy}
                onChange={(event) =>
                  setNewPriority(event.target.value as UserPriority)
                }
              >
                <option value="able">able</option>
                <option value="disable">disable</option>
              </select>
            </div>
          </div>
          <div className="composer-footer">
            <button type="submit" className="primary" disabled={busy}>
              Create account
            </button>
          </div>
        </form>
      </section>

      <div className="admin-layout">
        <aside className="composer admin-user-list" aria-label="Users">
          <div className="section-head">
            <div>
              <h2>Users</h2>
              <p className="hint">{users.length} accounts</p>
            </div>
          </div>
          <div className="field">
            <label htmlFor="user-search">Search</label>
            <input
              id="user-search"
              value={query}
              disabled={busy}
              placeholder="Name or email"
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          {visibleUsers.length === 0 ? (
            <p className="hint">No users match that search.</p>
          ) : (
            <ul className="admin-users">
              {visibleUsers.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    className={`admin-user-item${
                      user.id === selectedId ? " active" : ""
                    }${user.priority === "disable" ? " disabled-user" : ""}`}
                    disabled={busy}
                    onClick={() => {
                      setSelectedId(user.id);
                      setMessage(null);
                      setError(null);
                    }}
                  >
                    <span className="admin-user-name">{user.name}</span>
                    <span className="admin-user-email">{user.email}</span>
                    <span className="admin-user-meta">
                      {user.role}
                      {` · ${user.priority}`}
                      {isProfileReady(user.profile)
                        ? " · Ready"
                        : " · Incomplete"}
                      {` · ${recordCounts.get(user.id) || 0} jobs`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="composer admin-editor">
          {selected ? (
            <>
              <div className="tabs" role="tablist" aria-label="User details">
                <button
                  type="button"
                  role="tab"
                  aria-selected={userTab === "account"}
                  className={`tab${userTab === "account" ? " active" : ""}`}
                  onClick={() => setUserTab("account")}
                >
                  Account
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={userTab === "profile"}
                  className={`tab${userTab === "profile" ? " active" : ""}`}
                  onClick={() => setUserTab("profile")}
                >
                  Profile
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={userTab === "tailoring"}
                  className={`tab${userTab === "tailoring" ? " active" : ""}`}
                  onClick={() => setUserTab("tailoring")}
                >
                  Tailoring record
                  <span className="tab-meta">{selectedRecords.length}</span>
                </button>
              </div>

              {userTab === "account" && (
                <AccountTab
                  key={`${selected.id}-account`}
                  adminId={adminId}
                  selected={selected}
                  busy={busy}
                  onBusy={run}
                  onUsersChange={changeUsers}
                />
              )}
              {userTab === "profile" && (
                <ProfileTab
                  key={`${selected.id}-profile`}
                  selected={selected}
                  busy={busy}
                  onBusy={run}
                  onUsersChange={changeUsers}
                />
              )}
              {userTab === "tailoring" && (
                <TailoringRecords
                  key={`${selected.id}-tailoring`}
                  records={selectedRecords}
                  busy={busy}
                  onBusy={run}
                  onRecordsChange={(update) => setRecords(update(records))}
                />
              )}
            </>
          ) : (
            <p className="hint">Create an account to start the user list.</p>
          )}

          {message && <p className="inline-status">{message}</p>}
          {error && <p className="error">{error}</p>}
        </section>
      </div>
    </div>
  );
}
