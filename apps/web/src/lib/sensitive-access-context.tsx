"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { api } from "./api";

let sharedToken: string | null = null;
let sharedExpiry: number | null = null;

function isValid() {
  if (!sharedToken || !sharedExpiry) return false;
  if (Date.now() >= sharedExpiry) {
    sharedToken = null;
    sharedExpiry = null;
    return false;
  }
  return true;
}

type SensitiveAccessContextType = {
  granted: boolean;
  verify: (code: string) => Promise<boolean>;
  revoke: () => void;
};

const SensitiveAccessContext = createContext<SensitiveAccessContextType>({
  granted: false,
  verify: async () => false,
  revoke: () => {}
});

export function SensitiveAccessProvider({ children }: { children: React.ReactNode }) {
  const [granted, setGranted] = useState(isValid);
  const grantedRef = useRef(granted);
  grantedRef.current = granted;

  const verify = useCallback(async (code: string) => {
    const result = await api<{ token: string }>("/auth/sensitive-verify", {
      method: "POST",
      body: JSON.stringify({ code })
    });
    sharedToken = result.token;
    sharedExpiry = Date.now() + 15 * 60 * 1000;
    setGranted(true);
    return true;
  }, []);

  const revoke = useCallback(() => {
    sharedToken = null;
    sharedExpiry = null;
    setGranted(false);
  }, []);

  useEffect(() => {
    if (!isValid()) {
      if (grantedRef.current) revoke();
    }
    const interval = setInterval(() => {
      if (!isValid() && grantedRef.current) revoke();
    }, 30_000);
    return () => clearInterval(interval);
  }, [revoke]);

  return (
    <SensitiveAccessContext.Provider value={{ granted, verify, revoke }}>
      {children}
    </SensitiveAccessContext.Provider>
  );
}

export function useSensitiveAccess() {
  return useContext(SensitiveAccessContext);
}
