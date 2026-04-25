import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export default function CheckoutSuccess() {
    const navigate = useNavigate();
    const location = useLocation();
    const [redirecting, setRedirecting] = useState(false);

    const data = (location.state as any)?.checkout;
    const firstOrderId = data?.orders?.[0]?.order_id ?? null;

    useEffect(() => {
        const t1 = setTimeout(() => setRedirecting(true), 900);

        const t2 = setTimeout(() => {
            if (firstOrderId) {
                navigate(`/orders/${firstOrderId}/accepted`, { replace: true });
            } else {
                navigate("/app", { replace: true });
            }
        }, 2600);

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
        };
    }, [navigate, firstOrderId]);

    return (
        <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white flex items-center justify-center px-6">
            <div className="w-full max-w-sm text-center flex flex-col items-center">

                {/* Check icon (mejorado) */}
                <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-emerald-100 blur-xl opacity-60" />
                    <div className="relative w-20 h-20 rounded-full bg-white border border-emerald-200 flex items-center justify-center shadow-sm">
                        <svg width="42" height="42" viewBox="0 0 24 24" fill="none">
                            <path
                                d="M20 6L9 17l-5-5"
                                stroke="#059669"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                        </svg>
                    </div>
                </div>

                {/* Title */}
                <h1 className="mt-6 text-3xl font-bold text-zinc-900">
                    Orden Confirmada
                </h1>

                {/* Subtitle */}
                <p className="mt-3 text-sm text-zinc-500 leading-relaxed max-w-[260px]">
                    Tu compra fue procesada correctamente.
                    Estamos preparando tu pedido en Markit.
                </p>

                {/* Session */}
                {data?.checkout_session_id && (
                    <div className="mt-3 text-xs text-zinc-400">
                        Checkout #{data.checkout_session_id}
                    </div>
                )}

                {/* Loader */}
                {redirecting && (
                    <div className="mt-8 flex flex-col items-center gap-3">
                        <div className="w-8 h-8 rounded-full border-4 border-zinc-200 border-t-emerald-600 animate-spin" />
                        <span className="text-xs text-zinc-400">
                            Redirigiendo…
                        </span>
                    </div>
                )}

                {/* Botón opcional (por si quiere ir manual) */}
                <button
                    onClick={() => navigate("/")}
                    className="mt-10 w-full rounded-full bg-emerald-600 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
                >
                    Ir al inicio
                </button>

                {/* Hint pequeño */}
                <div className="mt-3 text-[11px] text-zinc-400">
                    Puedes seguir comprando mientras procesamos tu pedido
                </div>
            </div>
        </div>
    );
}