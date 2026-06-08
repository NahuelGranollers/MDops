"use client";

import { useEffect, useState } from "react";
import { api, clearSession, type SessionUser } from "./api";

export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: SessionUser }>("/auth/me")
      .then((result) => setUser(result.user))
      .catch(() => {
        clearSession();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  return { user, loading, isAdmin: user?.roles.includes("admin") ?? false };
}
