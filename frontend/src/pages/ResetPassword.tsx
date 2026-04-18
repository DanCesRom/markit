// src/pages/ResetPassword.tsx
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AuthLayout from "../layouts/AuthLayout";
import { apiPost } from "../lib/api";

type ResetState = { resetToken?: string; email?: string };
type ResetRes = { message: string };

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M10.6 10.6A2.5 2.5 0 0 0 12 15a2.5 2.5 0 0 0 2.4-1.8"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M6.7 6.7C4.1 8.5 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.5 5-1.2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M9.9 4.4A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3.1 4.3"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

// ✅ IMPORTANTE: fuera del componente principal para evitar remount en cada render (mobile keyboard bug)
function PasswordField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  toggle: () => void;
  error?: boolean;
  clearError?: () => void;
  autoComplete?: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm ${
        props.error ? "border-red-400" : "border-zinc-200"
      }`}
    >
      <div className="flex-1">
        <div className="text-xs text-zinc-500">{props.label}</div>

        <input
          className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
          placeholder="••••••••"
          value={props.value}
          onChange={(e) => {
            props.onChange(e.target.value);
            props.clearError?.();
          }}
          type={props.show ? "text" : "password"}
          autoComplete={props.autoComplete ?? "new-password"}
          inputMode="text"
        />
      </div>

      <button
        type="button"
        onClick={props.toggle}
        className="text-zinc-500 hover:text-zinc-800 transition"
        aria-label="Toggle password visibility"
      >
        <EyeIcon open={props.show} />
      </button>
    </div>
  );
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const loc = useLocation();
  const state = (loc.state ?? {}) as ResetState;

  const resetToken = state.resetToken ?? "";

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [show1, setShow1] = useState(false);
  const [show2, setShow2] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function clearErr() {
    if (err) setErr(null);
    if (ok) setOk(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(null);

    if (!resetToken) {
      setErr("Missing reset token. Please try again.");
      return;
    }
    if (pw1.length < 6) {
      setErr("Password must be at least 6 characters");
      return;
    }
    if (pw1 !== pw2) {
      setErr("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await apiPost<ResetRes>("/auth/forgot-password/reset", {
        reset_token: resetToken,
        new_password: pw1,
      });

      setOk(res.message || "Password updated!");
      setTimeout(() => navigate("/reset-success", { replace: true }));
    } catch (e2: any) {
      setErr(e2?.message ?? "Could not reset password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/70 text-2xl text-zinc-900 transition hover:bg-white"
          aria-label="Back"
        >
          ←
        </button>

        <h1 className="text-xl font-semibold text-zinc-900">Reset Password</h1>
      </div>

      <p className="text-sm text-zinc-600">Create a new password for your account.</p>

      <form onSubmit={submit} className="mt-6 space-y-3">
        <PasswordField
          label="New password"
          value={pw1}
          onChange={setPw1}
          show={show1}
          toggle={() => setShow1((v) => !v)}
          error={!!err}
          clearError={clearErr}
          autoComplete="new-password"
        />

        <PasswordField
          label="Confirm password"
          value={pw2}
          onChange={setPw2}
          show={show2}
          toggle={() => setShow2((v) => !v)}
          error={!!err}
          clearError={clearErr}
          autoComplete="new-password"
        />

        {err && <div className="text-sm text-red-600">{err}</div>}
        {ok && <div className="text-sm text-emerald-700">{ok}</div>}

        <button
          disabled={loading}
          className="mt-2 w-full rounded-2xl bg-[#0D1B3D] py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Saving…" : "Save"}
        </button>
      </form>
    </AuthLayout>
  );
}