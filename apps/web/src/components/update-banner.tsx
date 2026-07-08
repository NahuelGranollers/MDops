"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { BrowserAPI } from "@/lib/browser-api";

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function UpdateBanner() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!BUILD_ID) return;
    if (pathname.startsWith("/login")) return;

    // clean up stale cache-busting param
    if (BrowserAPI.getSearch().includes("_cb=")) {
      const url = BrowserAPI.createUrl(BrowserAPI.getHref());
      if (url) {
        url.searchParams.delete("_cb");
        BrowserAPI.replaceHistory(url.toString());
      }
    }

    let mounted = true;

    async function check() {
      try {
        const res = await fetch(`${BASE_PATH}/build-id.json?_=${Date.now()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (mounted && data.id && data.id !== BUILD_ID) {
          setShow(true);
        }
      } catch {
        // network error, ignore
      }
    }

    check();
    const interval = BrowserAPI.setInterval(check, 120000);
    return () => {
      mounted = false;
      BrowserAPI.clearInterval(interval);
    };
  }, [pathname]);

  if (!show) return null;

  return (
    <div className="update-banner">
      <RefreshCw size={18} />
      <span>Hi ha una nova versió disponible</span>
      <button className="button update-banner-btn" onClick={() => {
        BrowserAPI.reload();
      }}>
        <RefreshCw size={16} />
        Actualitzar
      </button>
    </div>
  );
}
