"use client";

import { useEffect } from "react";
import {
  isTrustedExtensionJobEvent,
  storeIncomingJobDescription,
  takeJobDescriptionFromHash,
} from "@/lib/extension-jd";

/** Runs on every page, including sign-in, so a bookmarklet can drop a JD before Generate resume mounts. */
export function CaptureIncomingJob() {
  useEffect(() => {
    storeIncomingJobDescription(takeJobDescriptionFromHash());

    function onMessage(event: MessageEvent) {
      storeIncomingJobDescription(isTrustedExtensionJobEvent(event));
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return null;
}
