"use client";

import { useEffect } from "react";

export function EmbedFrame() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      window.parent !== window ||
      window.opener ||
      params.has("ext")
    ) {
      document.documentElement.dataset.embed = "1";
    }
  }, []);
  return null;
}
