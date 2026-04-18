// src/pages/Splash.tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { isLoggedIn, isOnboardingDone } from "../lib/auth";

export default function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => {
      if (!isOnboardingDone()) return navigate("/onboarding", { replace: true });
      if (!isLoggedIn()) return navigate("/get-started", { replace: true });
      return navigate("/", { replace: true });
    }, 900); // ~1s para que se vea el loading

    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#66B23A] flex flex-col items-center justify-center">
      <div className="text-white flex flex-col items-center gap-4">
        <div className="text-5xl">🛒</div>
        <div className="text-3xl font-extrabold tracking-tight">Markit</div>

        <div className="mt-6 h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
      </div>
    </div>
  );
}