import { useNavigate, useLocation } from "react-router-dom";

export default function LegalPlaceholder() {
  const navigate = useNavigate();
  const location = useLocation();

  const isPrivacy = location.pathname.includes("privacy");
  const title = isPrivacy ? "Política de privacidad" : "Bases";

  return (
    <div className="space-y-5">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex h-12 w-12 items-center justify-center rounded-full text-4xl"
      >
        ←
      </button>

      <div>
        <h1 className="text-3xl font-semibold text-zinc-950">{title}</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Placeholder MVP. Luego pondremos el contenido real aquí.
        </p>
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600 shadow-sm">
        Esta pantalla es temporal mientras definimos el contenido legal final.
      </div>
    </div>
  );
}