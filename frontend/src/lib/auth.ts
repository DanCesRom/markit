// src/lib/auth.ts

// ✅ declara el global definido por Vite (vite.config.ts -> define.__MARKIT_DEV_BOOT__)
declare const __MARKIT_DEV_BOOT__: number;

const TOKEN_KEY = "markit_token";
const TOKEN_EXP_KEY = "markit_token_exp";
const TOKEN_STORE_KEY = "markit_token_store"; // "local" | "session"
const ONBOARDING_KEY = "markit_onboarding_done";

// ✅ nuevo: guarda el boot-id del último arranque de Vite en el que se hizo reset
const DEMO_BOOT_KEY = "markit_demo_boot_id";

// ---- env helpers ----
function envFlag(name: string): boolean {
  return String((import.meta as any).env?.[name] ?? "").toLowerCase() === "true";
}

function sessionTtlMin(): number | null {
  const raw = (import.meta as any).env?.VITE_SESSION_TTL_MIN;
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getStore(): Storage {
  const pref = localStorage.getItem(TOKEN_STORE_KEY);
  return pref === "session" ? sessionStorage : localStorage;
}

function setStore(remember: boolean) {
  localStorage.setItem(TOKEN_STORE_KEY, remember ? "local" : "session");
}

function clearBothStores() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_EXP_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_EXP_KEY);
  localStorage.removeItem(TOKEN_STORE_KEY);
}

// ---- token api ----
export function setToken(token: string, remember: boolean = true) {
  setStore(remember);

  const store = remember ? localStorage : sessionStorage;
  store.setItem(TOKEN_KEY, token);

  const ttl = sessionTtlMin();
  if (ttl) {
    const expMs = Date.now() + ttl * 60_000;
    store.setItem(TOKEN_EXP_KEY, String(expMs));
  } else {
    store.removeItem(TOKEN_EXP_KEY);
  }
}

export function getToken(): string | null {
  const store = getStore();
  const token = store.getItem(TOKEN_KEY);
  if (!token) return null;

  const expRaw = store.getItem(TOKEN_EXP_KEY);
  if (!expRaw) return token; // no TTL

  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || Date.now() >= exp) {
    clearToken();
    return null;
  }

  return token;
}

export function clearToken() {
  clearBothStores();
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

// ---- onboarding flags ----
export function setOnboardingDone(done: boolean) {
  if (done) localStorage.setItem(ONBOARDING_KEY, "true");
  else localStorage.removeItem(ONBOARDING_KEY); // ✅ mejor que guardar "false"
}

export function isOnboardingDone(): boolean {
  return localStorage.getItem(ONBOARDING_KEY) === "true";
}

// ---- MVP/demo reset (1 vez por cada arranque de Vite) ----
// Con VITE_DEMO_RESET_AUTH=true:
// - al arrancar "npm run dev" -> se resetea 1 vez
// - no vuelve a resetear mientras ese dev server siga corriendo
// - si paras y vuelves a arrancar npm -> boot cambia -> resetea otra vez
export function resetForDemoIfEnabled() {
  if (!envFlag("VITE_DEMO_RESET_AUTH")) return;

  // ✅ boot id cambia cada vez que reinicias Vite (npm run dev)
  const boot = String(__MARKIT_DEV_BOOT__);
  const lastBoot = localStorage.getItem(DEMO_BOOT_KEY);

  if (lastBoot === boot) return; // ya se reseteó en este mismo arranque

  // reset demo
  clearToken();
  setOnboardingDone(false);

  // marca este arranque como “ya reseteado”
  localStorage.setItem(DEMO_BOOT_KEY, boot);

  // (opcional) limpia el flag viejo si lo tenías de antes
  sessionStorage.removeItem("markit_demo_reset_done_session");
}