"use client";

import { useEffect } from "react";
import type { PageStyle } from "@/lib/appearance";

export function PageStyleSync({ style }: { style: PageStyle }) {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", style);
  }, [style]);
  return null;
}
