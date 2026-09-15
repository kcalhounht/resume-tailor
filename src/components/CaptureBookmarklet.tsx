"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MessageBox } from "@/components/MessageBox";
import { buildCaptureBookmarklet } from "@/lib/bookmarklet";

const DRAG_HINT =
  "Drag this onto the bookmarks bar if you cannot install the Chrome extension. The bookmark sends a job into Resume Tailor, but only the extension can dock beside the page like Acrobat.";

export function CaptureBookmarklet({
  className = "side-panel-btn bookmarklet-btn",
  children = "Send job to Resume Tailor",
}: {
  className?: string;
  children?: ReactNode;
}) {
  const [href, setHref] = useState("#");
  const [hint, setHint] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (window.parent !== window || window.opener || params.has("ext")) {
      setHidden(true);
      return;
    }
    setHref(buildCaptureBookmarklet(window.location.origin));
  }, []);

  if (hidden) return null;

  return (
    <>
      <a
        className={className}
        href={href}
        draggable
        title="Drag onto the bookmarks bar"
        onClick={(event) => {
          event.preventDefault();
          setHint(DRAG_HINT);
        }}
      >
        {children}
      </a>
      {hint ? (
        <MessageBox
          message={hint}
          confirmLabel="OK"
          onClose={() => setHint(null)}
        />
      ) : null}
    </>
  );
}
