"use client";

import { useEffect, useState } from "react";
import { MessageBox } from "@/components/MessageBox";
import {
  EXTENSION_APP_MESSAGE_SOURCE,
  EXTENSION_AVAILABLE_TYPE,
  EXTENSION_JD_MESSAGE_SOURCE,
  EXTENSION_PING_TYPE,
} from "@/lib/extension-jd";

const PIN_HINT =
  "Resume Tailor is already in this browser. Puzzle piece → pin it, then click that toolbar icon. Chrome docks the app on the right — the same way Adobe Acrobat works.";

function postPing() {
  window.postMessage(
    {
      source: EXTENSION_APP_MESSAGE_SOURCE,
      type: EXTENSION_PING_TYPE,
    },
    window.location.origin,
  );
}

export function ChromeExtensionCta({
  className = "side-panel-btn",
}: {
  className?: string;
}) {
  const [installed, setInstalled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [hint, setHint] = useState(false);

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
      if (payload.type === EXTENSION_AVAILABLE_TYPE) setInstalled(true);
    }

    window.addEventListener("message", onMessage);
    postPing();
    const retries = [200, 600, 1200].map((ms) =>
      window.setTimeout(postPing, ms),
    );
    return () => {
      window.removeEventListener("message", onMessage);
      retries.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  if (hidden) return null;

  if (installed) {
    return (
      <>
        <button
          type="button"
          className={className}
          onClick={() => setHint(true)}
        >
          Click the toolbar icon
        </button>
        {hint ? (
          <MessageBox
            message={PIN_HINT}
            confirmLabel="OK"
            onClose={() => setHint(false)}
          />
        ) : null}
      </>
    );
  }

  return (
    <a className={className} href="/extension">
      Add to Chrome
    </a>
  );
}
