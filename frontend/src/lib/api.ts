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
        if (Array.isArray(data.detail) && data.detail[0]?.msg) {
            return String(data.detail[0].msg);
        }
        if (typeof data.message === "string" && data.message.trim()) {
            return data.message;
        }
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

/* ---------------- CACHE SIMPLE ---------------- */

type CacheEntry<T> = {
    value: T;
    expiresAt: number;
};

const memoryCache = new Map<string, CacheEntry<any>>();

function cacheKey(path: string) {
    const token = getToken();
    return `markit-cache:${token ? "auth" : "guest"}:${path}`;
}

function readCache<T>(path: string): T | null {
    const key = cacheKey(path);

    const mem = memoryCache.get(key);
    if (mem && mem.expiresAt > Date.now()) return mem.value as T;

    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as CacheEntry<T>;
        if (!parsed || parsed.expiresAt <= Date.now()) {
            localStorage.removeItem(key);
            memoryCache.delete(key);
            return null;
        }

        memoryCache.set(key, parsed);
        return parsed.value;
    } catch {
        return null;
    }
}

function writeCache<T>(path: string, value: T, ttlMs: number) {
    const key = cacheKey(path);
    const entry: CacheEntry<T> = {
        value,
        expiresAt: Date.now() + ttlMs,
    };

    memoryCache.set(key, entry);

    try {
        localStorage.setItem(key, JSON.stringify(entry));
    } catch {
        // storage lleno o bloqueado
    }
}

export function invalidateApiCache(path?: string) {
    if (!path) {
        memoryCache.clear();

        try {
            Object.keys(localStorage)
                .filter((k) => k.startsWith("markit-cache:"))
                .forEach((k) => localStorage.removeItem(k));
        } catch {
            // ignore
        }

        return;
    }

    const suffix = `:${path}`;

    for (const key of Array.from(memoryCache.keys())) {
        if (key.endsWith(suffix)) memoryCache.delete(key);
    }

    try {
        Object.keys(localStorage)
            .filter((k) => k.startsWith("markit-cache:") && k.endsWith(suffix))
            .forEach((k) => localStorage.removeItem(k));
    } catch {
        // ignore
    }
}

/* ---------------- API ---------------- */

export async function apiGet<T>(path: string): Promise<T> {
    const res = await fetch(buildUrl(path), {
        headers: { "Content-Type": "application/json", ...authHeaders() },
    });

    await handleAuthFailure(res);

    const data = await readBody(res);

    if (!res.ok) {
        throw new Error(extractFastApiError(data, `GET ${path} failed (${res.status})`));
    }

    return data as T;
}

export async function apiGetCached<T>(
    path: string,
    options?: {
        ttlMs?: number;
        force?: boolean;
    }
): Promise<T> {
    const ttlMs = options?.ttlMs ?? 1000 * 60 * 5;

    if (!options?.force) {
        const cached = readCache<T>(path);
        if (cached !== null) return cached;
    }

    const data = await apiGet<T>(path);
    writeCache(path, data, ttlMs);

    return data;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(buildUrl(path), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body ?? {}),
    });

    await handleAuthFailure(res);

    const data = await readBody(res);

    if (!res.ok) {
        throw new Error(extractFastApiError(data, `POST ${path} failed (${res.status})`));
    }

    invalidateApiCache("/cart");

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

    if (!res.ok) {
        throw new Error(extractFastApiError(data, `PATCH ${path} failed (${res.status})`));
    }

    invalidateApiCache("/cart");

    return data as T;
}

export async function apiDelete<T>(path: string): Promise<T> {
    const res = await fetch(buildUrl(path), {
        method: "DELETE",
        headers: { ...authHeaders() },
    });

    await handleAuthFailure(res);

    const data = await readBody(res);

    if (!res.ok) {
        throw new Error(extractFastApiError(data, `DELETE ${path} failed (${res.status})`));
    }

    invalidateApiCache("/cart");

    return data as T;
}