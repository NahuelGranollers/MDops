"use client";

export type SessionUser = {
  id: string;
  tenantId: string;
  email: string;
  notificationEmail: string | null;
  name: string;
  profileColor: string;
  avatarUrl: string | null;
  roles: string[];
  permissions: string[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

function apiOrigin() {
  if (API_URL.startsWith("http")) return API_URL.replace(/\/api\/?$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export class ApiError extends Error {
  status: number;
  payload: any;

  constructor(message: string, status: number, payload: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("accessToken");
}

export function setSession(accessToken: string, refreshToken: string) {
  window.localStorage.setItem("accessToken", accessToken);
  window.localStorage.setItem("refreshToken", refreshToken);
}

export function clearSession() {
  window.localStorage.removeItem("accessToken");
  window.localStorage.removeItem("refreshToken");
  window.localStorage.removeItem("md-ops-remember-token");
}

function sendClientLog(entry: {
  type: string;
  message?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  data?: unknown;
}) {
  if (typeof window === "undefined" || entry.path?.startsWith("/session-log")) return;
  const token = getAccessToken();
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  fetch(`${API_URL}/session-log`, {
    method: "POST",
    headers,
    body: JSON.stringify(entry),
    keepalive: true
  }).catch(() => {});
}

export function trackClientEvent(message: string, data?: unknown) {
  sendClientLog({ type: "client_event", message, data });
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const method = (init.method ?? "GET").toUpperCase();
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch (error) {
    const durationMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt);
    sendClientLog({ type: "api_network_error", path, method, durationMs, message: error instanceof Error ? error.message : "Error de red" });
    throw error;
  }
  const durationMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt);
  sendClientLog({ type: "api_request", path, method, statusCode: response.status, durationMs });
  if (!response.ok) {
    const text = await response.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    const message = payload?.message || text || `Error ${response.status}`;
    sendClientLog({ type: "api_error", path, method, statusCode: response.status, durationMs, message, data: payload });
    if (response.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/login")) {
      clearSession();
      const loginPath = `${BASE_PATH}/login/`;
      if (window.location.pathname !== loginPath) window.location.assign(loginPath);
    }
    throw new ApiError(message, response.status, payload);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function streamUrl() {
  const token = getAccessToken();
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  return `${API_URL}/stream${query}`;
}

export function assetUrl(path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  if (path.startsWith("/uploads/")) return `${apiOrigin()}${path}`;
  return path;
}
