import { useNavigate, useParams } from "react-router-dom";

export default function OrderAccepted() {
    const navigate = useNavigate();
    const { orderId } = useParams();

    return (
        <div className="min-h-screen bg-white flex items-center justify-center px-6">
            <div className="w-full max-w-sm text-center flex flex-col items-center">

                {/* Icono */}
                <div className="w-20 h-20 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center shadow-sm">
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
                        <path
                            d="M20 6L9 17l-5-5"
                            stroke="#16a34a"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                </div>

                {/* Título */}
                <h1 className="mt-6 text-3xl font-bold text-zinc-900">
                    Pedido Aceptado
                </h1>

                {/* Subtexto */}
                <p className="mt-3 text-sm text-zinc-500 leading-relaxed max-w-[280px]">
                    Tu pedido fue recibido correctamente.
                    <br />
                    Estamos preparándolo para enviarlo a tu ubicación.
                </p>

                {/* ID */}
                {orderId && (
                    <div className="mt-3 text-xs text-zinc-400">
                        Pedido #{orderId}
                    </div>
                )}

                {/* Acciones */}
                <div className="mt-8 w-full space-y-3">

                    <button
                        onClick={() => navigate(`/orders/${orderId}/track`)}
                        className="w-full rounded-full bg-slate-900 py-4 text-sm font-semibold text-white shadow-sm active:scale-[0.98] transition"
                    >
                        Rastrear Pedido
                    </button>

                    <button
                        onClick={() => navigate("/", { replace: true })}
                        className="w-full rounded-full border border-emerald-600 py-4 text-sm font-semibold text-emerald-600 hover:bg-emerald-50 transition"
                    >
                        Seguir Comprando
                    </button>

                </div>

            </div>
        </div>
    );
}