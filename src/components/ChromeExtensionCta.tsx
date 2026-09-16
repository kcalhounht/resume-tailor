"use client";

import { useEffect, useRef, useState } from "react";
import { MessageBox } from "@/components/MessageBox";
import { ADD_TO_CHROME_HREF } from "@/lib/chrome-webstore";
import {
  EXTENSION_APP_MESSAGE_SOURCE,
  EXTENSION_AVAILABLE_TYPE,
  EXTENSION_JD_MESSAGE_SOURCE,
  EXTENSION_OPEN_PANEL_TYPE,
  EXTENSION_PING_TYPE,
  EXTENSION_SIDE_PANEL_RESULT_TYPE,
} from "@/lib/extension-jd";

const PIN_HINT =
  "Pin Resume Tailor from the puzzle piece, then click that toolbar avatar. Chrome docks the app on the right — the same way Adobe Acrobat works.";

function postToExtension(type: string) {
  window.postMessage(
    { source: EXTENSION_APP_MESSAGE_SOURCE, type },
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
  const [message, setMessage] = useState<string | null>(null);
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
        setInstalled(true);
      }
      if (
        payload.type === EXTENSION_SIDE_PANEL_RESULT_TYPE &&
        payload.ok === false
      ) {
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

  if (installed) {
    function onClick() {
      postToExtension(EXTENSION_PING_TYPE);
      postToExtension(EXTENSION_OPEN_PANEL_TYPE);
      window.setTimeout(() => {
        if (availableRef.current) return;
        setGoToInstall(true);
        setMessage(PIN_HINT);
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
          Open on the right
        </button>
        {message ? (
          <MessageBox
            message={message}
            confirmLabel={goToInstall ? "How to install" : "OK"}
            onConfirm={
              goToInstall
                ? () => {
                    window.location.assign(ADD_TO_CHROME_HREF);
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

  return (
    <a className={className} href={ADD_TO_CHROME_HREF}>
      Add to Chrome
    </a>
  );
}
