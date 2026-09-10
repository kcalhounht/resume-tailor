"use client";

import { useState } from "react";
import { updateSettings } from "@/app/actions/settings";
import type { PublicSettings } from "@/lib/settings";
import type { UserPriority, UserRole } from "@/lib/users";

export default function AdminSettings({
  initialSettings,
  defaultLlmModel,
}: {
  initialSettings: PublicSettings;
  defaultLlmModel: string;
}) {
  const [defaultRole, setDefaultRole] = useState<UserRole>(
    initialSettings.defaultRole,
  );
  const [defaultPriority, setDefaultPriority] = useState<UserPriority>(
    initialSettings.defaultPriority,
  );
  const [allowSignup, setAllowSignup] = useState(initialSettings.allowSignup);
  const [llmModel, setLlmModel] = useState(initialSettings.llmModel);
  const [openRouterApiKey, setOpenRouterApiKey] = useState("");
  const [hasOpenRouterKey, setHasOpenRouterKey] = useState(
    initialSettings.hasOpenRouterKey,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="composer">
      <div className="section-head">
        <div>
          <h2>Settings</h2>
          <p className="hint">
            Defaults for new accounts, public sign-up, and OpenRouter for
            extraction and generation.
          </p>
        </div>
      </div>

      <form
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          setMessage(null);
          void updateSettings({
            defaultRole,
            defaultPriority,
            allowSignup,
            llmModel,
            openRouterApiKey,
          })
            .then((saved) => {
              setHasOpenRouterKey(saved.hasOpenRouterKey);
              setOpenRouterApiKey("");
              setMessage("Settings saved.");
            })
            .catch((err) =>
              setError(
                err instanceof Error ? err.message : "Could not save settings.",
              ),
            )
            .finally(() => setBusy(false));
        }}
      >
        <div className="field-grid">
          <div className="field">
            <label htmlFor="setting-default-role">Default role</label>
            <select
              id="setting-default-role"
              value={defaultRole}
              disabled={busy}
              onChange={(event) =>
                setDefaultRole(event.target.value as UserRole)
              }
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="setting-default-priority">Default priority</label>
            <select
              id="setting-default-priority"
              value={defaultPriority}
              disabled={busy}
              onChange={(event) =>
                setDefaultPriority(event.target.value as UserPriority)
              }
            >
              <option value="able">able</option>
              <option value="disable">disable</option>
            </select>
            <p className="hint">
              Disable still lets people sign in. They cannot generate, save a
              profile, or change account settings until you switch them to
              able.
            </p>
          </div>
          <div className="field field-span">
            <label htmlFor="setting-openrouter-key">OpenRouter API key</label>
            <input
              id="setting-openrouter-key"
              name="setting-openrouter-key"
              type="password"
              autoComplete="new-password"
              value={openRouterApiKey}
              disabled={busy}
              placeholder={
                hasOpenRouterKey ? "Leave blank to keep the saved key" : ""
              }
              onChange={(event) => setOpenRouterApiKey(event.target.value)}
            />
            <p className="hint">
              {hasOpenRouterKey
                ? "A key is already set. Paste a new one only if you want to replace it."
                : "Get a key at openrouter.ai/keys. After you save, you can generate resumes."}
            </p>
          </div>
          <div className="field field-span">
            <label htmlFor="setting-llm-model">OpenRouter model</label>
            <input
              id="setting-llm-model"
              value={llmModel}
              disabled={busy}
              placeholder={defaultLlmModel}
              onChange={(event) => setLlmModel(event.target.value)}
            />
            <p className="hint">
              Leave blank to use {defaultLlmModel}.
            </p>
          </div>
          <div className="field field-span">
            <label className="check-label" htmlFor="setting-allow-signup">
              <input
                id="setting-allow-signup"
                type="checkbox"
                checked={allowSignup}
                disabled={busy}
                onChange={(event) => setAllowSignup(event.target.checked)}
              />
              Allow public sign-up
            </label>
            <p className="hint">
              When off, /signup is closed except for the first account on an
              empty site. Disable does not block sign-up or sign-in; it only
              blocks generate, profile saves, resume import, account changes,
              and page style until you set priority to able.
            </p>
          </div>
        </div>

        <div className="composer-footer">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save settings"}
          </button>
        </div>
      </form>

      {message && <p className="inline-status">{message}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
