import { useNavigate, useParams } from "react-router-dom";

export default function OrderAccepted() {
  const navigate = useNavigate();
  const { orderId } = useParams();

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#F5FBF3]">
      <div className="absolute inset-0 pointer-events-none opacity-[0.10]">
        <div className="absolute -top-10 -left-10 text-[160px]">🛒</div>
        <div className="absolute top-20 right-6 text-[140px]">🍅</div>
        <div className="absolute bottom-24 left-10 text-[140px]">🥗</div>
      </div>

      <div className="relative z-10 min-h-screen px-6 flex flex-col items-center text-center">
        <div className="pt-24" />

        <div className="flex items-center justify-center">
          <div className="w-20 h-20 rounded-full border-4 border-[#66B23A] flex items-center justify-center">
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
              <path
                d="M20 6L9 17l-5-5"
                stroke="#66B23A"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>

        <h1 className="mt-6 text-4xl font-extrabold text-zinc-900">
          Tu pedido ha sido aceptado
        </h1>

        <p className="mt-4 max-w-[300px] text-sm text-zinc-600">
          Tus artículos han sido colocados y están en camino de ser procesados.
        </p>

        {orderId && (
          <div className="mt-4 text-xs text-zinc-500">
            Pedido #{orderId}
          </div>
        )}

        <div className="mt-10 w-full max-w-md space-y-4">
          <button
            onClick={() => navigate(`/orders/${orderId}/track`)}
            className="w-full rounded-full bg-[#0D1B3D] py-4 text-sm font-semibold text-white"
          >
            Rastrear Pedido
          </button>

          <button
            onClick={() => navigate("/", { replace: true })}
            className="w-full rounded-full border border-[#119B6B] bg-transparent py-4 text-sm font-semibold text-[#119B6B]"
          >
            Continuar Comprando
          </button>
        </div>
      </div>
    </div>
  );
}