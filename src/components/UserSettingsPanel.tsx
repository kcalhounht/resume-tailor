"use client";

import { useState } from "react";
import { saveOwnPageStyle } from "@/app/actions/appearance";
import { PAGE_STYLES, type PageStyle } from "@/lib/appearance";

export function UserSettingsPanel({
  initialStyle,
}: {
  initialStyle: PageStyle;
}) {
  const [selected, setSelected] = useState<PageStyle>(initialStyle);
  const [saved, setSaved] = useState<PageStyle>(initialStyle);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section
      className="composer"
      id="panel-settings"
      role="tabpanel"
      aria-labelledby="tab-settings"
    >
      <div className="section-head">
        <div>
          <h2>Page style</h2>
          <p className="hint">
            Choose another look for Resume Tailor. Your choice is saved to your
            account and used across the site.
          </p>
        </div>
      </div>

      <div className="style-grid">
        {PAGE_STYLES.map((option) => {
          const active = selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              className={`style-card${active ? " active" : ""}`}
              disabled={busy}
              aria-pressed={active}
              onClick={() => {
                setSelected(option.id);
                setMessage(null);
                setError(null);
                document.documentElement.setAttribute("data-theme", option.id);
                setBusy(true);
                void saveOwnPageStyle(option.id)
                  .then(() => {
                    setSaved(option.id);
                    setMessage(`${option.name} is on.`);
                  })
                  .catch(() => {
                    setError("Could not save that style.");
                    setSelected(saved);
                    document.documentElement.setAttribute("data-theme", saved);
                  })
                  .finally(() => setBusy(false));
              }}
            >
              <span
                className="style-swatch"
                style={{
                  background: `linear-gradient(135deg, ${option.paper} 0%, ${option.surface} 55%, ${option.accent} 100%)`,
                }}
                aria-hidden
              />
              <span className="style-card-name">{option.name}</span>
              <span className="style-card-hint">{option.hint}</span>
            </button>
          );
        })}
      </div>

      <div className="composer-footer">
        {message ? <p className="inline-status">{message}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>
    </section>
  );
}
