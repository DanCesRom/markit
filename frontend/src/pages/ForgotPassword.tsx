// src/pages/ForgotPassword.tsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import AuthLayout from "../layouts/AuthLayout";
import { apiPost } from "../lib/api";

type ForgotState = { email?: string };

type Channel = "email" | "sms";
type Option = { channel: Channel; label: string; value_masked: string };
type OptionsRes = { email: string; options: Option[] };
type SendRes = { message: string; mvp_code?: string | null };

function PhoneIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M11 19h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function ForgotPassword() {
  const navigate = useNavigate();
  const loc = useLocation();
  const state = (loc.state ?? {}) as ForgotState;

  const [email, setEmail] = useState((state.email ?? "").trim().toLowerCase());
  const [options, setOptions] = useState<Option[]>([]);
  const [selected, setSelected] = useState<Channel>("email");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canRequest = useMemo(() => email.includes("@") && email.length >= 5, [email]);

  async function loadOptions(e: string) {
    setErr(null);
    setLoading(true);
    try {
      const res = await apiPost<OptionsRes>("/auth/forgot-password/options", { email: e });
      setOptions(res.options);

      const hasSms = res.options.some((o) => o.channel === "sms");
      setSelected(hasSms ? "sms" : "email");
    } catch (e2: any) {
      // fallback “seguro”: solo email
      setErr(null);
      setOptions([{ channel: "email", label: "via Email", value_masked: e }]);
      setSelected("email");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (canRequest) void loadOptions(email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function Card(props: { option: Option; active: boolean; onClick: () => void }) {
    return (
      <button
        type="button"
        onClick={props.onClick}
        className={`
          w-full text-left
          rounded-2xl border px-5 py-4
          flex items-center gap-4
          bg-white
          transition
          ${props.active ? "border-[#66B23A] bg-[#66B23A]/10" : "border-zinc-200"}
        `}
      >
        <div
          className={`
            w-12 h-12 rounded-xl flex items-center justify-center
            ${props.active ? "text-zinc-900" : "text-zinc-400"}
          `}
        >
          <PhoneIcon />
        </div>

        <div className="flex-1">
          <div className="text-sm text-zinc-500">{props.option.label}</div>
          <div className="mt-1 text-base font-semibold text-zinc-900">
            {props.option.value_masked}
          </div>
        </div>
      </button>
    );
  }

  async function continueNext() {
    setErr(null);

    if (!canRequest) {
      setErr("Ingresa tu correo electrónico aquí");
      return;
    }

    if (options.length === 0) {
      await loadOptions(email);
      return;
    }

    setLoading(true);
    try {
      const res = await apiPost<SendRes>("/auth/forgot-password/send", {
        email,
        channel: selected,
      });

      const masked =
        options.find((o) => o.channel === selected)?.value_masked ??
        (selected === "sms" ? "your phone" : email);

      navigate("/forgot-password/verify", {
        replace: true,
        state: {
          email,
          channel: selected,
          targetMasked: masked,
          codeHint: res.mvp_code ?? undefined, // MVP only
        },
      });
    } catch (e2: any) {
      setErr(e2?.message ?? "Could not send code");
    } finally {
      setLoading(false);
    }
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

        <h1 className="text-xl font-semibold text-zinc-900">Olvidé mi contraseña</h1>
      </div>

      <p className="text-sm text-zinc-600">
        Selecciona un método para recibir el código de confirmación.
      </p>

      {/* Email input */}
      <div className="mt-5 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
        <div className="text-xs text-zinc-500">Email</div>
        <input
          className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
          placeholder="abc@yourdomain.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value.toLowerCase());
            if (err) setErr(null);
          }}
          onBlur={() => {
            const v = email.trim().toLowerCase();
            if (v !== email) setEmail(v);
            if (v.includes("@") && v.length >= 5) void loadOptions(v);
          }}
        />
      </div>

      {err && <div className="mt-4 text-center text-sm text-red-500">{err}</div>}

      <div className="mt-6 space-y-4">
        {options.map((o) => (
          <Card
            key={o.channel}
            option={o}
            active={selected === o.channel}
            onClick={() => setSelected(o.channel)}
          />
        ))}
      </div>

      <button
        disabled={loading}
        onClick={continueNext}
        className="mt-10 w-full rounded-full bg-[#0D1B3D] py-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        {loading ? "Cargando…" : "Continuar"}
      </button>
    </AuthLayout>
  );
}