"use client";

import { useEffect } from "react";

/** In-app dialog used for save/create/delete. Not window.alert and not the .error banner. */

export type ConfirmRequest = {
  message: string;
  confirmLabel: string;
  work: () => void;
};

export function MessageBox({
  message,
  confirmLabel = "OK",
  cancelLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm?: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="message-box-overlay" onClick={onClose}>
      <div
        className="message-box"
        role="alertdialog"
        aria-modal="true"
        aria-describedby="message-box-text"
        onClick={(event) => event.stopPropagation()}
      >
        <p id="message-box-text">{message}</p>
        <div className="message-box-actions">
          {cancelLabel ? (
            <button type="button" className="text-btn" onClick={onClose}>
              {cancelLabel}
            </button>
          ) : null}
          <button
            type="button"
            className={danger ? "text-btn danger-btn" : "primary"}
            autoFocus
            onClick={onConfirm ?? onClose}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
