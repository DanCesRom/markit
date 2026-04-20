// src/pages/Register.tsx
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../layouts/AuthLayout";
import { apiPost } from "../lib/api";

import facebookLogo from "../assets/register/facebook.png";
import googleLogo from "../assets/register/google.png";
import appleLogo from "../assets/register/apple.png";
import xLogo from "../assets/register/x.png";

type SocialBtnProps = {
  icon: string;
  onClick?: () => void;
};

type DocumentType = "cedula" | "pasaporte";

type RegisterRes = {
  message: string;
  email: string;
  status: string;
  verify_code: string;
};

function SocialBtn({ icon, onClick }: SocialBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick ?? (() => alert("MVP: social signup luego"))}
      className="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:shadow-md active:scale-95"
    >
      <img src={icon} alt="" draggable={false} className="h-7 w-7 object-contain" />
    </button>
  );
}

function FieldIconUser() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M20 21a8 8 0 0 0-16 0" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function FieldIconMail() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M4 6h16v12H4V6Z" stroke="currentColor" strokeWidth="2" />
      <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function FieldIconLock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M7 11V8a5 5 0 0 1 10 0v3" stroke="currentColor" strokeWidth="2" />
      <path d="M6 11h12v10H6V11Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function FieldIconPhone() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M6.5 4.5h3l1.5 4-2 1.7a15 15 0 0 0 5.8 5.8l1.7-2 4 1.5v3A2 2 0 0 1 18.5 20C10.5 20 4 13.5 4 5.5a2 2 0 0 1 2.5-1Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FieldIconCalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="6" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 4v4M16 4v4M4 10h16" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function FieldIconDocument() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="5" y="4" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path
          d="M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6Z"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 3 21 21M10.6 10.7A3 3 0 0 0 12 15a3 3 0 0 0 2.3-.9"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M9.9 5.1A10.8 10.8 0 0 1 12 5c6 0 9 7 9 7a15.8 15.8 0 0 1-4 4.7M6.1 6.1C4.1 7.5 3 9.5 3 12c0 0 3 7 9 7a9.8 9.8 0 0 0 4.1-.9"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function BaseInput(props: {
  icon?: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  error?: boolean;
  right?: React.ReactNode;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  max?: string;
}) {
  return (
    <div
      className={`flex h-14 items-center gap-3 rounded-2xl border bg-white px-4 shadow-sm ${
        props.error ? "border-red-300" : "border-zinc-200"
      }`}
    >
      {props.icon ? <div className="text-zinc-400">{props.icon}</div> : null}

      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        type={props.type ?? "text"}
        inputMode={props.inputMode}
        max={props.max}
        className="w-full bg-transparent text-[15px] text-zinc-900 outline-none placeholder:text-zinc-400"
      />

      {props.right ? <div className="shrink-0 text-zinc-500">{props.right}</div> : null}
    </div>
  );
}

function PasswordInput(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  error?: boolean;
}) {
  const [show, setShow] = useState(false);

  return (
    <div
      className={`flex h-14 items-center gap-3 rounded-2xl border bg-white px-4 shadow-sm ${
        props.error ? "border-red-300" : "border-zinc-200"
      }`}
    >
      <div className="text-zinc-400">
        <FieldIconLock />
      </div>

      <input
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        type={show ? "text" : "password"}
        className="w-full bg-transparent text-[15px] text-zinc-900 outline-none placeholder:text-zinc-400"
      />

      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="shrink-0 text-zinc-500"
        aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
      >
        <EyeIcon open={show} />
      </button>
    </div>
  );
}

function maxBirthDate() {
  const now = new Date();
  const yyyy = now.getFullYear() - 13;
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function Register() {
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType>("cedula");
  const [documentNumber, setDocumentNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedLegal, setAcceptedLegal] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const fullName = useMemo(
    () => `${firstName.trim()} ${lastName.trim()}`.trim(),
    [firstName, lastName]
  );

  function validate() {
    const next: Record<string, string> = {};

    if (!firstName.trim()) next.firstName = "Campo obligatorio";
    if (!lastName.trim()) next.lastName = "Campo obligatorio";
    if (!birthDate.trim()) next.birthDate = "Campo obligatorio";
    if (!documentNumber.trim()) next.documentNumber = "Campo obligatorio";
    if (!phone.trim()) next.phone = "Campo obligatorio";
    if (!email.trim()) next.email = "Campo obligatorio";
    if (!password.trim()) next.password = "Campo obligatorio";
    if (!confirmPassword.trim()) next.confirmPassword = "Campo obligatorio";

    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      next.email = "Correo inválido";
    }

    if (password && password.length < 6) {
      next.password = "La contraseña debe tener al menos 6 caracteres";
    }

    if (password && confirmPassword && password !== confirmPassword) {
      next.confirmPassword = "Las contraseñas no coinciden";
    }

    if (!acceptedLegal) {
      next.acceptedLegal = "Debes aceptar las bases y política de privacidad";
    }

    setFieldErr(next);
    return Object.keys(next).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    if (!validate()) return;

    setLoading(true);

    try {
      const res = await apiPost<RegisterRes>("/auth/register", {
        email: email.trim().toLowerCase(),
        full_name: fullName,
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        birth_date: birthDate,
        document_type: documentType,
        document_number: documentNumber.trim(),
        phone: phone.trim(),
        accepted_legal: acceptedLegal,
      });

      navigate("/verify", {
        state: {
          email: res.email,
          codeHint: res.verify_code,
        },
      });
    } catch (e: any) {
      setErr(e?.message ?? "No pude crear la cuenta");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout>
      <button
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full text-4xl transition"
      >
        ←
      </button>

      <h1 className="text-3xl font-semibold leading-tight">
        Crea tu Cuenta
      </h1>

      <form onSubmit={submit} className="mt-6 space-y-3">
        <BaseInput
          icon={<FieldIconUser />}
          value={firstName}
          onChange={setFirstName}
          placeholder="Nombre"
          error={!!fieldErr.firstName}
        />
        {fieldErr.firstName ? (
          <div className="-mt-1 px-1 text-xs text-red-600">{fieldErr.firstName}</div>
        ) : null}

        <BaseInput
          icon={<FieldIconUser />}
          value={lastName}
          onChange={setLastName}
          placeholder="Apellido"
          error={!!fieldErr.lastName}
        />
        {fieldErr.lastName ? (
          <div className="-mt-1 px-1 text-xs text-red-600">{fieldErr.lastName}</div>
        ) : null}

        <BaseInput
          icon={<FieldIconCalendar />}
          value={birthDate}
          onChange={setBirthDate}
          placeholder="Fecha de nacimiento"
          type="date"
          max={maxBirthDate()}
          error={!!fieldErr.birthDate}
        />
        {fieldErr.birthDate ? (
          <div className="-mt-1 px-1 text-xs text-red-600">{fieldErr.birthDate}</div>
        ) : null}

        <div className="flex gap-3">
          <div className="w-[44%]">
            <div className="flex h-14 items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 shadow-sm">
              <div className="text-zinc-400">
                <FieldIconDocument />
              </div>

              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value as DocumentType)}
                className="w-full bg-transparent text-[15px] text-zinc-900 outline-none"
              >
                <option value="cedula">Cédula</option>
                <option value="pasaporte">Pasaporte</option>
              </select>
            </div>
          </div>

          <div className="flex-1">
            <BaseInput
              value={documentNumber}
              onChange={setDocumentNumber}
              placeholder={documentType === "cedula" ? "Document number" : "Passport number"}
              error={!!fieldErr.documentNumber}
            />
          </div>
        </div>
        {fieldErr.documentNumber ? (
          <div className="-mt-1 px-1 text-xs text-red-600">{fieldErr.documentNumber}</div>
        ) : null}

        <BaseInput
          icon={<FieldIconPhone />}
          value={phone}
          onChange={setPhone}
          placeholder="Telefono"
          inputMode="tel"
          error={!!fieldErr.phone}
        />
        {fieldErr.phone ? (
          <div className="-mt-1 px-1 text-xs text-red-600">{fieldErr.phone}</div>
        ) : null}

        <BaseInput
          icon={<FieldIconMail />}
          value={email}
          onChange={setEmail}
          placeholder="Correo"
          type="email"
          inputMode="email"
          error={!!fieldErr.email}
        />
        {fieldErr.email ? (
          <div className="-mt-1 px-1 text-xs text-red-600">{fieldErr.email}</div>
        ) : null}

        <PasswordInput
          value={password}
          onChange={setPassword}
          placeholder="Contraseña"
          error={!!fieldErr.password}
        />
        {fieldErr.password ? (
          <div className="-mt-1 px-1 text-xs text-red-600">{fieldErr.password}</div>
        ) : null}

        <PasswordInput
          value={confirmPassword}
          onChange={setConfirmPassword}
          placeholder="Repite Contraseña"
          error={!!fieldErr.confirmPassword}
        />
        {fieldErr.confirmPassword ? (
          <div className="-mt-1 px-1 text-xs text-red-600">{fieldErr.confirmPassword}</div>
        ) : null}

        <label className="flex items-start gap-3 pt-2 text-sm text-zinc-600">
          <input
            type="checkbox"
            checked={acceptedLegal}
            onChange={(e) => setAcceptedLegal(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-emerald-600"
          />
          <span>
            He leído y acepto las{" "}
            <button
              type="button"
              onClick={() => navigate("/legal/terms")}
              className="font-semibold text-emerald-700"
            >
              Bases
            </button>{" "}
            y{" "}
            <button
              type="button"
              onClick={() => navigate("/legal/privacy")}
              className="font-semibold text-emerald-700"
            >
              política de privacidad
            </button>
          </span>
        </label>
        {fieldErr.acceptedLegal ? (
          <div className="-mt-1 px-1 text-xs text-red-600">{fieldErr.acceptedLegal}</div>
        ) : null}

        {err && <div className="text-sm text-red-600">{err}</div>}

        <button
          disabled={loading}
          className="mt-2 w-full rounded-2xl bg-[#0D1B3D] py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Creando…" : "Registrarse"}
        </button>

        <div className="pt-4 text-center text-xs text-zinc-500">o continuar con</div>

        <div className="mt-4 flex justify-center gap-4">
          <SocialBtn icon={facebookLogo} />
          <SocialBtn icon={googleLogo} />
          <SocialBtn icon={appleLogo} />
          <SocialBtn icon={xLogo} />
        </div>

        <div className="pt-4 text-center text-sm text-zinc-600">
          ¿Ya tienes una cuenta?{" "}
          <Link to="/login" className="font-semibold text-emerald-700">
            Inicia sesión
          </Link>
        </div>

        <div className="flex items-center justify-between pt-6 text-[11px] text-zinc-400">
          <span>Política de privacidad</span>
          <span>Términos de servicio</span>
        </div>
      </form>
    </AuthLayout>
  );
}