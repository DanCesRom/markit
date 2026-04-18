// src/lib/api.ts
import { getToken, clearToken } from "./auth";

function normalizeBaseUrl(v?: string) {
  const raw = (v ?? "").trim();
  const noComma = raw.replace(/[,\s]+$/g, "");
  const noSlash = noComma.replace(/\/+$/g, "");
  return noSlash || "/api";
}

export const API_BASE = normalizeBaseUrl(import.meta.env.VITE_API_URL);

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readBody(res: Response) {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractFastApiError(data: any, fallback: string) {
  if (typeof data === "string" && data.trim()) return data;

  if (data && typeof data === "object") {
    if (typeof data.detail === "string" && data.detail.trim()) return data.detail;
    if (Array.isArray(data.detail) && data.detail[0]?.msg) return String(data.detail[0].msg);
    if (typeof data.message === "string" && data.message.trim()) return data.message;
  }
  return fallback;
}

async function handleAuthFailure(res: Response) {
  if (res.status === 401) {
    clearToken();
  }
}

function buildUrl(path: string) {
  if (!path.startsWith("/")) {
    return `${API_BASE}/${path}`;
  }
  return `${API_BASE}${path}`;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(buildUrl(path), {
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });
  await handleAuthFailure(res);

  const data = await readBody(res);
  if (!res.ok) throw new Error(extractFastApiError(data, `GET ${path} failed (${res.status})`));
  return data as T;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(buildUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body ?? {}),
  });
  await handleAuthFailure(res);

  const data = await readBody(res);
  if (!res.ok) throw new Error(extractFastApiError(data, `POST ${path} failed (${res.status})`));
  return data as T;
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(buildUrl(path), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body ?? {}),
  });
  await handleAuthFailure(res);

  const data = await readBody(res);
  if (!res.ok) throw new Error(extractFastApiError(data, `PATCH ${path} failed (${res.status})`));
  return data as T;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(buildUrl(path), {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
  await handleAuthFailure(res);

  const data = await readBody(res);
  if (!res.ok) throw new Error(extractFastApiError(data, `DELETE ${path} failed (${res.status})`));
  return data as T;
}