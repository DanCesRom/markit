// src/pages/GetStarted.tsx
import { Link, useNavigate } from "react-router-dom";

// Hero (usamos el mismo del onboarding)
import hero1 from "../assets/onboarding/hero1.png";

// Logos sociales
import facebookLogo from "../assets/getstarted/facebook.png";
import googleLogo from "../assets/getstarted/google.png";
import appleLogo from "../assets/getstarted/apple.png";
import xLogo from "../assets/getstarted/x.png";

type SocialBtnProps = {
  label: string;
  icon: string;
};

function SocialBtn({ label, icon }: SocialBtnProps) {
  return (
    <button
      type="button"
      className="w-full flex items-center gap-3 rounded-full border bg-white py-3 px-10 text-sm font-semibold text-zinc-800 shadow-sm transition hover:shadow-md"
      onClick={() => alert("MVP: social login luego")}
    >
      <img
        src={icon}
        alt=""
        className="w-5 h-5 object-contain"
        draggable={false}
      />
      <span className="flex-1 text-center pr-5">{label}</span>
    </button>
  );
}

export default function GetStarted() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen px-6"> 
      <div className="pt-16 flex flex-col items-center text-center">
        {/* HERO IMAGE (reemplaza el emoji) */}
        <img
          src={hero1}
          alt=""
          className="w-[80px] max-w-[75vw] mb-6"
          draggable={false}
        />

        <h1 className="mt-2 text-3xl font-extrabold text-zinc-900">
          Let’s Get Started!
        </h1>

        {/* Social buttons */}
        <div className="mt-10 w-full max-w-md space-y-3">
          <SocialBtn
            label="Continue with Facebook"
            icon={facebookLogo}
          />
          <SocialBtn
            label="Continue with Google"
            icon={googleLogo}
          />
          <SocialBtn
            label="Continue with Apple"
            icon={appleLogo}
          />
          <SocialBtn
            label="Continue with X"
            icon={xLogo}
          />
        </div>

        {/* Divider */}
        <div className="my-7 flex w-full max-w-md items-center gap-3 text-xs text-zinc-400">
          <div className="h-px flex-1 bg-zinc-200" />
          <span>or</span>
          <div className="h-px flex-1 bg-zinc-200" />
        </div>

        {/* Password login */}
        <button
          onClick={() => navigate("/login")}
          className="w-full max-w-md rounded-full bg-[#0D1B3D] py-4 text-sm font-semibold text-white"
        >
          Sign in with password
        </button>

        <div className="mt-6 text-sm text-zinc-600">
          Don&apos;t have an account?{" "}
          <Link to="/register" className="font-semibold text-[#66B23A]">
            Sign up
          </Link>
        </div>

        <div className="mt-12 w-full max-w-md flex justify-between text-[11px] text-zinc-400">
          <span>Privacy Policy</span>
          <span>Term of Service</span>
        </div>
      </div>
    </div>
  );
}