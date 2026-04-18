// src/pages/ForgotVerify.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AuthLayout from "../layouts/AuthLayout";
import { apiPost } from "../lib/api";

type ForgotVerifyState = {
  email?: string;
  channel?: "email" | "sms";
  targetMasked?: string; // ✅ para mostrar “sent to …”
  codeHint?: string;     // MVP
};

type VerifyRes = { message: string; reset_token: string };
type SendRes = { message: string; mvp_code?: string | null };

export default function ForgotVerify() {
  const navigate = useNavigate();
  const loc = useLocation();
  const state = (loc.state ?? {}) as ForgotVerifyState;

  const email = useMemo(() => (state.email ?? "").trim().toLowerCase(), [state.email]);
  const channel = (state.channel ?? "email") as "email" | "sms";
  const targetMasked =
    state.targetMasked ?? (channel === "sms" ? "your phone" : email);

  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [err, setErr] = useState<string | null>(null);
  const [loadingVerify, setLoadingVerify] = useState(false);

  // ✅ resend state
  const COOLDOWN_SEC = 30;
  const [cooldown, setCooldown] = useState(0);
  const [loadingResend, setLoadingResend] = useState(false);

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

  // ✅ cooldown tick
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setInterval(() => {
      setCooldown((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(t);
  }, [cooldown]);

  // ✅ start cooldown on mount (optional, feels like “real app”)
  useEffect(() => {
    setCooldown(COOLDOWN_SEC);
    // focus first box
    setTimeout(() => focusIndex(0), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function resendCode() {
    if (cooldown > 0 || loadingResend) return;
    setErr(null);
    setLoadingResend(true);

    try {
      const res = await apiPost<SendRes>("/auth/forgot-password/send", {
        email,
        channel,
      });

      // MVP: si backend devuelve hint, puedes mostrarlo (no obligatorio)
      // pero como hint viene por state, no lo actualizamos aquí para no “pelear” con TS.
      void res;

      setCooldown(COOLDOWN_SEC);
    } catch (e2: any) {
      setErr(e2?.message ?? "Could not send code");
    } finally {
      setLoadingResend(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (code.length !== 6) {
      setErr("Enter the 6 digits code");
      return;
    }

    setLoadingVerify(true);
    try {
      const res = await apiPost<VerifyRes>("/auth/forgot-password/verify", { email, code });

      navigate("/reset-password", {
        replace: true,
        state: { resetToken: res.reset_token, email },
      });
    } catch (e2: any) {
      setErr(e2?.message ?? "This code is not correct");
      setDigits(Array(6).fill(""));
      setTimeout(() => focusIndex(0), 0);
    } finally {
      setLoadingVerify(false);
    }
  }

  return (
    <AuthLayout>
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
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
        on your {channel === "sms" ? "SMS" : "Email"}
      </p>

      {/* ✅ sent to */}
      <div className="mt-3 text-center text-sm text-zinc-700">
        Code sent to <span className="font-semibold">{targetMasked}</span>
      </div>

      {hasError && <div className="mt-4 text-center text-sm text-red-500">{err}</div>}

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

        {/* ✅ Resend */}
        <button
          type="button"
          onClick={resendCode}
          disabled={loadingResend || cooldown > 0}
          className="mt-6 w-full flex items-center justify-center gap-2 text-[#66B23A] font-semibold disabled:opacity-50"
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

          {cooldown > 0 ? `Resend in ${cooldown}s` : loadingResend ? "Sending…" : "Get new code"}
        </button>

        {/* Verify button */}
        <button
          disabled={loadingVerify}
          className="mt-8 w-full rounded-full bg-[#0D1B3D] py-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loadingVerify ? "Verifying…" : "Verify"}
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