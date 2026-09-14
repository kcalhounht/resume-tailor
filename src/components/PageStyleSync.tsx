"use client";

import { useLayoutEffect } from "react";
import { applyPageStyle, currentPageStyle } from "@/lib/appearance-client";
import type { PageStyle } from "@/lib/appearance";

export function PageStyleSync({ style }: { style: PageStyle }) {
  useLayoutEffect(() => {
    applyPageStyle(currentPageStyle(style));
  }, [style]);
  return null;
}
