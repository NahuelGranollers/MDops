"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || "";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function UpdateBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!BUILD_ID) return;
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
    const interval = setInterval(check, 120000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (!show) return null;

  return (
    <div className="update-banner">
      <RefreshCw size={18} />
      <span>Hi ha una nova versió disponible</span>
      <button className="button update-banner-btn" onClick={() => {
        const url = new URL(window.location.href);
        url.searchParams.set("_cb", Date.now().toString());
        window.location.href = url.toString();
      }}>
        <RefreshCw size={16} />
        Actualitzar
      </button>
    </div>
  );
}
