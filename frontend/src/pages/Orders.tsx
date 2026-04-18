import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../lib/api";
import type { OrderListResponse } from "../lib/types";

function toNum(x: any) {
  const n = Number(String(x ?? "0").trim());
  return Number.isFinite(n) ? n : 0;
}
function money(x: any) {
  return `RD$ ${toNum(x).toFixed(2)}`;
}

export default function Orders() {
  const navigate = useNavigate();
  const [data, setData] = useState<OrderListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setErr(null);
      setLoading(true);
      try {
        const res = await apiGet<OrderListResponse>("/orders/my");
        setData(res);
      } catch (e: any) {
        setErr(e?.message ?? "No pude cargar órdenes");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="text-sm text-zinc-500">Cargando órdenes…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="grid h-9 w-9 place-items-center rounded-xl hover:bg-zinc-100"
        >
          ←
        </button>
        <div className="text-xl font-semibold">My orders</div>
      </div>

      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {(data?.orders ?? []).length === 0 && (
        <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-600">
          No tienes órdenes todavía.
        </div>
      )}

      <div className="space-y-2">
        {(data?.orders ?? []).map((o) => (
          <button
            key={o.id}
            onClick={() => navigate(`/orders/${o.id}/track`)}
            className="w-full rounded-2xl border bg-white p-4 text-left hover:bg-zinc-50"
          >
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{o.supermarket_name}</div>
              <div className="text-sm font-semibold">{money(o.total)}</div>
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              Order #{o.id} • {o.status} • {o.delivery_type}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}