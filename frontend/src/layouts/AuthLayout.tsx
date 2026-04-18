import type { ReactNode } from "react";
import bg from "../assets/auth-bg.png"; // pon el archivo aquí

export default function AuthLayout(props: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#F6FBF3] text-zinc-900">
      {/* Fondo con pattern */}
      <div
        className="min-h-dvh"
        style={{
          backgroundImage: `url(${bg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="min-h-dvh bg-white/70 backdrop-blur-[1px]">
          <div className="mx-auto w-full max-w-sm px-5 py-8">
            {props.children}
          </div>
        </div>
      </div>
    </div>
  );
}