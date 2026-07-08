"use client";

import { useEffect } from "react";
import { trackClientEvent } from "@/lib/api";
import { BrowserAPI } from "@/lib/browser-api";

export function SessionErrorLogger() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      trackClientEvent("client_error", {
        message: event.message,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error instanceof Error ? event.error.stack : undefined
      });
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      trackClientEvent("client_unhandled_rejection", {
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined
      });
    }

    BrowserAPI.addEventListener("error", onError);
    BrowserAPI.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      BrowserAPI.removeEventListener("error", onError);
      BrowserAPI.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
