"use client";

import { useActionState, useState } from "react";
import { updateOwnAccount, type AccountFormState } from "@/app/actions/account";
import { MessageBox } from "@/components/MessageBox";
import type { SessionPayload } from "@/lib/session";

const initial: AccountFormState = {};

function accountNotice(state: AccountFormState): string | null {
  if (state.message) return state.message;
  return (
    state.errors?.name?.[0] ||
    state.errors?.currentPassword?.[0] ||
    state.errors?.password?.[0] ||
    state.errors?.confirmPassword?.[0] ||
    null
  );
}

export function AccountPanel({
  session,
  canOperate = true,
}: {
  session: SessionPayload;
  canOperate?: boolean;
}) {
  const [state, action] = useActionState(updateOwnAccount, initial);
  const [closedFor, setClosedFor] = useState<AccountFormState | null>(null);
  const notice = accountNotice(state);
  const showBox = Boolean(notice && closedFor !== state);

  return (
    <form
      action={action}
      className="composer"
      id="panel-account"
      role="tabpanel"
      aria-labelledby="tab-account"
    >
      <div className="section-head">
        <div>
          <h2>Your account</h2>
          <p className="hint">
            Change your name and password. Email stays the same.
          </p>
          {!canOperate ? (
            <p className="hint">
              This account is disabled, so account changes are turned off.
            </p>
          ) : null}
        </div>
      </div>

      <div className="field-grid">
        <div className="field">
          <label htmlFor="own-account-name">Name</label>
          <input
            id="own-account-name"
            name="name"
            defaultValue={session.name}
            required
            autoComplete="name"
            disabled={!canOperate}
          />
        </div>
        <div className="field">
          <label htmlFor="own-account-email">Email</label>
          <input
            id="own-account-email"
            type="email"
            defaultValue={session.email}
            readOnly
          />
        </div>
        <div className="field field-span">
          <label htmlFor="own-current-password">Current password</label>
          <input
            id="own-current-password"
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            placeholder="Required only when changing password"
            disabled={!canOperate}
          />
        </div>
        <div className="field">
          <label htmlFor="own-new-password">New password</label>
          <input
            id="own-new-password"
            type="password"
            name="password"
            autoComplete="new-password"
            placeholder="Leave blank to keep your current password"
            disabled={!canOperate}
          />
        </div>
        <div className="field">
          <label htmlFor="own-confirm-password">Confirm new password</label>
          <input
            id="own-confirm-password"
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
            disabled={!canOperate}
          />
        </div>
      </div>

      <div className="composer-footer">
        <button type="submit" className="primary" disabled={!canOperate}>
          Save account
        </button>
      </div>
      {state.errors?.name?.[0] ? (
        <p className="error">{state.errors.name[0]}</p>
      ) : null}
      {state.errors?.currentPassword?.[0] ? (
        <p className="error">{state.errors.currentPassword[0]}</p>
      ) : null}
      {state.errors?.password?.[0] ? (
        <p className="error">{state.errors.password[0]}</p>
      ) : null}
      {state.errors?.confirmPassword?.[0] ? (
        <p className="error">{state.errors.confirmPassword[0]}</p>
      ) : null}
      {showBox && notice ? (
        <MessageBox message={notice} onClose={() => setClosedFor(state)} />
      ) : null}
    </form>
  );
}
