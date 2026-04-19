// src/pages/Login.tsx
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../layouts/AuthLayout";
import AuthInput from "../components/AuthInput";
import NoScroll from "../components/NoScroll";
import { isLoggedIn, setToken } from "../lib/auth";
import { API_BASE } from "../lib/api";

// Logos sociales
import facebookLogo from "../assets/login/facebook.png";
import googleLogo from "../assets/login/google.png";
import appleLogo from "../assets/login/apple.png";
import xLogo from "../assets/login/x.png";

type SocialBtnProps = {
    icon: string;
    onClick?: () => void;
};

function SocialBtn({ icon, onClick }: SocialBtnProps) {
    return (
        <button
            type="button"
            onClick={onClick ?? (() => alert("MVP: social login luego"))}
            className="
        w-14 h-14
        flex items-center justify-center
        rounded-2xl
        bg-white
        border border-zinc-200
        shadow-sm
        hover:shadow-md
        active:scale-95
        transition
      "
        >
            <img
                src={icon}
                alt=""
                draggable={false}
                className="w-7 h-7 object-contain"
            />
        </button>
    );
}

function MailIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M4 6h16v12H4V6Z" stroke="currentColor" strokeWidth="2" />
            <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="2" />
        </svg>
    );
}

function LockIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
                d="M7 11V8a5 5 0 0 1 10 0v3"
                stroke="currentColor"
                strokeWidth="2"
            />
            <path d="M6 11h12v10H6V11Z" stroke="currentColor" strokeWidth="2" />
        </svg>
    );
}

function EyeIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
                d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z"
                stroke="currentColor"
                strokeWidth="2"
            />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
        </svg>
    );
}

function EyeOffIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
                d="M17.94 17.94A10.94 10.94 0 0 1 12 19C7 19 2.73 15.11 1 12c.73-1.27 1.8-2.66 3.17-3.83M9.9 4.24A10.94 10.94 0 0 1 12 5c5 0 9.27 3.89 11 7-1.08 1.88-2.83 3.83-5.06 5.06M1 1l22 22"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
            />
        </svg>
    );
}

type LoginResponse = { access_token: string; token_type: string };

export default function Login() {
    const navigate = useNavigate();

    useEffect(() => {
        if (isLoggedIn()) navigate("/", { replace: true });
    }, [navigate]);

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [remember, setRemember] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        setErr(null);
        setLoading(true);

        try {
            const form = new URLSearchParams();
            form.append("username", email.trim().toLowerCase());
            form.append("password", password);

            const res = await fetch(`${API_BASE}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: form.toString(),
            });

            const text = await res.text().catch(() => "");
            let data: any = null;

            try {
                data = text ? JSON.parse(text) : null;
            } catch {
                data = text;
            }

            if (!res.ok) {
                const msg =
                    (data && typeof data === "object" && data.detail) ||
                    (typeof data === "string" ? data : `HTTP ${res.status}`);
                throw new Error(String(msg));
            }

            const json = data as LoginResponse;
            setToken(json.access_token, remember);

            navigate("/", { replace: true });
        } catch (e: any) {
            setErr(e?.message ?? "No se pudo iniciar sesión.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <NoScroll />

            <AuthLayout>
                <button
                    onClick={() => navigate(-1)}
                    className="mb-4 inline-flex items-center justify-center w-12 h-12 text-4xl rounded-full bg-zinc-0 hover:bg-zinc-0 transition"
                >
                    ←
                </button>

                <h1 className="text-3xl font-semibold leading-tight">
                    Login to your <br /> Account
                </h1>

                <form onSubmit={submit} className="mt-6 space-y-3">
                    <AuthInput
                        icon={<MailIcon />}
                        value={email}
                        onChange={(v) => {
                            setEmail(v);
                            if (err) setErr(null);
                        }}
                        placeholder="Email"
                        error={!!err}
                    />

                    <AuthInput
                        icon={<LockIcon />}
                        value={password}
                        onChange={(v) => {
                            setPassword(v);
                            if (err) setErr(null);
                        }}
                        placeholder="Password"
                        type={showPassword ? "text" : "password"}
                        error={!!err}
                        rightIcon={
                            <button
                                type="button"
                                onClick={() => setShowPassword((v) => !v)}
                                className="text-zinc-400 hover:text-zinc-700 transition"
                                aria-label={showPassword ? "Hide password" : "Show password"}
                            >
                                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                            </button>
                        }
                    />

                    <div className="flex items-center justify-between pt-1 text-sm">
                        <label className="flex items-center gap-2 text-zinc-600">
                            <input
                                type="checkbox"
                                checked={remember}
                                onChange={(e) => setRemember(e.target.checked)}
                                className="h-4 w-4 accent-emerald-600"
                            />
                            Remember me
                        </label>

                        <button
                            type="button"
                            onClick={() =>
                                navigate("/forgot-password", { state: { email } })
                            }
                            className="text-emerald-700"
                        >
                            Forgot the password?
                        </button>
                    </div>

                    {err && <div className="text-sm text-red-600">{err}</div>}

                    <button
                        disabled={loading}
                        className="mt-2 w-full rounded-2xl bg-[#0D1B3D] py-3 text-sm font-semibold text-white disabled:opacity-50"
                    >
                        {loading ? "Entrando…" : "Login"}
                    </button>

                    <div className="pt-4 text-center text-xs text-zinc-500">
                        or continue with
                    </div>

                    <div className="mt-4 flex justify-center gap-4">
                        <SocialBtn icon={facebookLogo} />
                        <SocialBtn icon={googleLogo} />
                        <SocialBtn icon={appleLogo} />
                        <SocialBtn icon={xLogo} />
                    </div>

                    <div className="pt-4 text-center text-sm text-zinc-600">
                        Don’t have an account?{" "}
                        <Link to="/register" className="font-semibold text-emerald-700">
                            Sign up
                        </Link>
                    </div>

                    <div className="pt-6 flex items-center justify-between text-[11px] text-zinc-400">
                        <span>Privacy Policy</span>
                        <span>Term of Service</span>
                    </div>
                </form>
            </AuthLayout>
        </>
    );
}