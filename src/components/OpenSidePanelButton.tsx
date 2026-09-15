"use client";

import { useEffect, useRef, useState } from "react";
import { MessageBox } from "@/components/MessageBox";
import {
  EXTENSION_APP_MESSAGE_SOURCE,
  EXTENSION_AVAILABLE_TYPE,
  EXTENSION_JD_MESSAGE_SOURCE,
  EXTENSION_OPEN_PANEL_TYPE,
  EXTENSION_PING_TYPE,
  EXTENSION_SIDE_PANEL_RESULT_TYPE,
} from "@/lib/extension-jd";

const INSTALL_MESSAGE =
  "Chrome only lets an extension use that right-hand panel — the same slot Adobe Acrobat is using. Install Resume Tailor, pin it, then this button docks the app there. A new tab is not that panel.";

function postToExtension(type: string) {
  window.postMessage(
    { source: EXTENSION_APP_MESSAGE_SOURCE, type },
    window.location.origin,
  );
}

export function OpenSidePanelButton({
  className = "side-panel-btn",
}: {
  className?: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);
  const [goToInstall, setGoToInstall] = useState(false);
  const availableRef = useRef(false);

  useEffect(() => {
    if (window.parent !== window) {
      setHidden(true);
      return;
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== window) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      const payload = data as Record<string, unknown>;
      if (payload.source !== EXTENSION_JD_MESSAGE_SOURCE) return;
      if (payload.type === EXTENSION_AVAILABLE_TYPE) {
        availableRef.current = true;
      }
      if (payload.type === EXTENSION_SIDE_PANEL_RESULT_TYPE && payload.ok === false) {
        setGoToInstall(false);
        setMessage(
          typeof payload.error === "string"
            ? payload.error
            : "Could not open the side panel.",
        );
      }
    }

    window.addEventListener("message", onMessage);
    postToExtension(EXTENSION_PING_TYPE);
    const retries = [200, 600, 1200].map((ms) =>
      window.setTimeout(() => postToExtension(EXTENSION_PING_TYPE), ms),
    );
    return () => {
      window.removeEventListener("message", onMessage);
      retries.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  if (hidden) return null;

  function onClick() {
    postToExtension(EXTENSION_PING_TYPE);
    postToExtension(EXTENSION_OPEN_PANEL_TYPE);
    if (availableRef.current) return;
    window.setTimeout(() => {
      if (availableRef.current) return;
      setGoToInstall(true);
      setMessage(INSTALL_MESSAGE);
    }, 250);
  }

  return (
    <>
      <button
        type="button"
        className={className}
        data-rt-side-panel
        onClick={onClick}
      >
        Open in side panel
      </button>
      {message ? (
        <MessageBox
          message={message}
          confirmLabel={goToInstall ? "How to install" : "OK"}
          onConfirm={
            goToInstall
              ? () => {
                  window.location.assign("/extension");
                }
              : undefined
          }
          onClose={() => {
            setMessage(null);
            setGoToInstall(false);
          }}
        />
      ) : null}
    </>
  );
}
