// src/pages/Verify.tsx
import { useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AuthLayout from "../layouts/AuthLayout";
import { apiPost } from "../lib/api";
import { setToken } from "../lib/auth";

type VerifyState = { email?: string; codeHint?: string };

type VerifyOk = { access_token: string; token_type: string };

export default function Verify() {
  const navigate = useNavigate();
  const loc = useLocation();
  const state = (loc.state ?? {}) as VerifyState;

  const [email] = useState((state.email ?? "").trim().toLowerCase());
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const hint = useMemo(() => state.codeHint, [state.codeHint]);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const code = digits.join("");
  const firstEmpty = digits.findIndex((x) => !x);
  const activeIndex = firstEmpty === -1 ? 5 : firstEmpty;
  const hasError = !!err;

  function focusIndex(i: number) {
    const el = inputsRef.current[i];
    if (el) el.focus();
  }

  function updateAt(i: number, value: string) {
    const only = value.replace(/\D/g, "");

    if (!only) {
      setDigits((prev) => {
        const next = [...prev];
        next[i] = "";
        return next;
      });
      return;
    }

    const chars = only.split("");
    setDigits((prev) => {
      const next = [...prev];
      for (let k = 0; k < chars.length && i + k < next.length; k++) {
        next[i + k] = chars[k];
      }
      return next;
    });

    const nextIndex = Math.min(i + chars.length, 5);
    focusIndex(nextIndex);
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[i]) {
        setDigits((prev) => {
          const next = [...prev];
          next[i] = "";
          return next;
        });
        return;
      }
      if (i > 0) focusIndex(i - 1);
    }
    if (e.key === "ArrowLeft" && i > 0) focusIndex(i - 1);
    if (e.key === "ArrowRight" && i < 5) focusIndex(i + 1);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (code.length !== 6) {
      setErr("Enter the 6 digits code");
      return;
    }

    setLoading(true);
    try {
      // ✅ verify ahora devuelve token (Camino A)
      const res = await apiPost<VerifyOk>("/auth/verify", { email, code });

      // ✅ auto-login
      setToken(res.access_token, true);

      // ✅ entra directo al Home / App
      navigate("/", { replace: true });
    } catch (e: any) {
      setErr(e?.message ?? "This code is not correct");
      setDigits(Array(6).fill(""));
      setTimeout(() => focusIndex(0), 0);
    } finally {
      setLoading(false);
    }
  }

  function getNewCode() {
    alert("MVP: Get new code luego");
  }

  return (
    <AuthLayout>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/70 text-2xl text-zinc-900 transition hover:bg-white"
          aria-label="Back"
        >
          ←
        </button>

        <h1 className="text-xl font-semibold text-zinc-900">Enter 6 Digits Code</h1>
      </div>

      <p className="text-sm text-zinc-600 text-center">
        Enter the 6 digits code that you received <br />
        on your SMS
      </p>

      {hasError && (
        <div className="mt-4 text-center text-sm text-red-500">{err}</div>
      )}

      <form onSubmit={submit} className="mt-6">
        {/* OTP inputs */}
        <div className="flex justify-center gap-3">
          {digits.map((d, i) => {
            const base =
              "w-12 h-12 sm:w-14 sm:h-14 rounded-xl text-center text-xl outline-none bg-white border shadow-sm";
            const border = hasError
              ? "border-red-500 text-red-600"
              : i === activeIndex
              ? "border-[#66B23A] ring-2 ring-[#66B23A]/25 text-zinc-900"
              : "border-zinc-200 text-zinc-900";

            return (
              <input
                key={i}
                ref={(el) => {
                  inputsRef.current[i] = el;
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                className={`${base} ${border}`}
                value={d}
                onChange={(e) => {
                  if (err) setErr(null);
                  updateAt(i, e.target.value);
                }}
                onKeyDown={(e) => onKeyDown(i, e)}
                onFocus={() => {
                  const fe = digits.findIndex((x) => !x);
                  if (fe !== -1 && i > fe) focusIndex(fe);
                }}
              />
            );
          })}
        </div>

        {/* Get new code */}
        <button
          type="button"
          onClick={getNewCode}
          className="mt-6 w-full flex items-center justify-center gap-2 text-[#66B23A] font-semibold"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
              d="M21 12a9 9 0 1 1-2.64-6.36"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M21 3v6h-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          Get new code
        </button>

        {/* Verify button */}
        <button
          disabled={loading}
          className="mt-8 w-full rounded-full bg-[#0D1B3D] py-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Verifying…" : "Verify"}
        </button>

        {hint && (
          <div className="pt-4 text-center text-xs text-zinc-500">
            (MVP) code: <b>{hint}</b>
          </div>
        )}
      </form>
    </AuthLayout>
  );
}