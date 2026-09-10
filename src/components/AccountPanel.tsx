"use client";

import { useActionState } from "react";
import { updateOwnAccount, type AccountFormState } from "@/app/actions/account";
import type { SessionPayload } from "@/lib/session";

const initial: AccountFormState = {};

export function AccountPanel({ session }: { session: SessionPayload }) {
  const [state, action] = useActionState(updateOwnAccount, initial);

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
          />
        </div>
        <div className="field">
          <label htmlFor="own-account-email">Email</label>
          <input
            id="own-account-email"
            type="email"
            value={session.email}
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
          />
        </div>
        <div className="field">
          <label htmlFor="own-confirm-password">Confirm new password</label>
          <input
            id="own-confirm-password"
            type="password"
            name="confirmPassword"
            autoComplete="new-password"
          />
        </div>
      </div>

      <div className="composer-footer">
        <button type="submit" className="primary">
          Save account
        </button>
        {state.message ? (
          <p className="inline-status">{state.message}</p>
        ) : null}
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
      </div>
    </form>
  );
}
