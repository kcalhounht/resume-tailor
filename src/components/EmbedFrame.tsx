"use client";

import { useEffect } from "react";

export function EmbedFrame() {
  useEffect(() => {
    if (window.parent !== window) {
      document.documentElement.dataset.embed = "1";
    }
  }, []);
  return null;
}
