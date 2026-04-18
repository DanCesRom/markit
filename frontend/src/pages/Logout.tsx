import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { clearToken } from "../lib/auth";

export default function Logout() {
  const navigate = useNavigate();

  useEffect(() => {
    // ✅ Logout real en MVP: borrar token (y expiración/store)
    clearToken();

    // ❗️No tocamos onboarding para que no vuelva a pedir onboarding.
    // Si algún día quieres que /logout también reinicie onboarding:
    // setOnboardingDone(false);

    navigate("/login", { replace: true });
  }, [navigate]);

  // pantalla mínima mientras redirige (opcional)
  return (
    <div className="min-h-screen grid place-items-center bg-[#F5FBF3]">
      <div className="text-sm text-zinc-600">Signing out…</div>
    </div>
  );
}