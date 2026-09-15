"use client";

import { useEffect, useRef, useState } from "react";
import { MessageBox } from "@/components/MessageBox";
import { openAppOnTheRight } from "@/lib/bookmarklet";
import {
  EXTENSION_APP_MESSAGE_SOURCE,
  EXTENSION_AVAILABLE_TYPE,
  EXTENSION_JD_MESSAGE_SOURCE,
  EXTENSION_OPEN_PANEL_TYPE,
  EXTENSION_PING_TYPE,
  EXTENSION_SIDE_PANEL_RESULT_TYPE,
} from "@/lib/extension-jd";

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
  const [installed, setInstalled] = useState(false);
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
        setInstalled(true);
      }
      if (payload.type === EXTENSION_SIDE_PANEL_RESULT_TYPE && payload.ok === false) {
        setMessage(
          typeof payload.error === "string"
            ? payload.error
            : "Could not open the side panel.",
        );
      }
    }

    window.addEventListener("message", onMessage);
    postToExtension(EXTENSION_PING_TYPE);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (hidden) return null;

  function onClick() {
    postToExtension(EXTENSION_PING_TYPE);
    if (availableRef.current) {
      postToExtension(EXTENSION_OPEN_PANEL_TYPE);
      return;
    }
    if (!openAppOnTheRight()) {
      setMessage("Allow popups, then click Open on the right again.");
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={onClick}>
        {installed ? "Open in side panel" : "Open on the right"}
      </button>
      {message ? (
        <MessageBox message={message} onClose={() => setMessage(null)} />
      ) : null}
    </>
  );
}
