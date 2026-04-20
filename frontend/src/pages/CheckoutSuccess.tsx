import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import confetti from "canvas-confetti";
import type { Options } from "canvas-confetti";

export default function CheckoutSuccess() {
  const navigate = useNavigate();
  const location = useLocation();
  const [redirecting, setRedirecting] = useState(false);

  const data = (location.state as any)?.checkout;
  const firstOrderId = data?.orders?.[0]?.order_id ?? null;

  useEffect(() => {
    const shoot = (particleRatio: number, opts: Options) => {
      confetti({
        ...opts,
        origin: { y: 0.35 },
        particleCount: Math.floor(200 * particleRatio),
      });
    };

    shoot(0.25, { spread: 26, startVelocity: 55 });
    shoot(0.2, { spread: 60 });
    shoot(0.35, { spread: 100, decay: 0.91, scalar: 0.9 });
    shoot(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.1 });
    shoot(0.1, { spread: 120, startVelocity: 45 });

    const t1 = setTimeout(() => setRedirecting(true), 700);
    const t2 = setTimeout(() => {
      if (firstOrderId) {
        navigate(`/orders/${firstOrderId}/accepted`, { replace: true });
      } else {
        navigate("/app", { replace: true });
      }
    }, 2200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      confetti.reset();
    };
  }, [navigate, firstOrderId]);

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
          Orden Confirmada
        </h1>

        <p className="mt-4 max-w-[280px] text-sm text-zinc-600">
          Su orden ha sido realizada con éxito. Será redirigido en breve.
        </p>

        {data?.checkout_session_id && (
          <div className="mt-4 text-xs text-zinc-500">
            Checkout #{data.checkout_session_id}
          </div>
        )}

        {redirecting && (
          <div className="mt-10 flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-4 border-[#0D1B3D]/20 border-t-[#0D1B3D] animate-spin" />
            <span className="text-xs text-zinc-500">Redirigiendo…</span>
          </div>
        )}
      </div>
    </div>
  );
}