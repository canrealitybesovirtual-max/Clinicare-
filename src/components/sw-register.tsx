"use client";
import { useEffect } from "react";

/** Registers the offline service worker in production only. The SW caches static app files, never clinical text. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* offline support is optional; never log details */
    });
  }, []);
  return null;
}
