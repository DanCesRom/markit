import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiGet, apiPost } from "../lib/api";
import type { Order, OrderStatusHistoryListResponse, OrderStatusHistoryItem } from "../lib/types";

function fmtMinutesByStatus(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "completed") return 0;
  if (s === "preparing") return 20;
  if (s === "paid") return 30;
  if (s === "created") return 30;
  return 25;
}

function normalizeStatus(s: string) {
  const v = (s || "").toLowerCase();
  if (v === "created" || v === "paid") return "Pedido Realizado";
  if (v === "preparing") return "En Camino";
  if (v === "completed") return "Pedido Recibido";
  if (v === "cancelled") return "Cancelado";
  return s;
}

function pickTimeline(history: OrderStatusHistoryItem[], fallbackStatus: string) {
  // intentamos construir estado actual
  const sorted = [...history].sort((a, b) => String(a.changed_at).localeCompare(String(b.changed_at)));
  const last = sorted[sorted.length - 1]?.status || fallbackStatus;

  const steps = [
    { key: "created", label: "Pedido Realizado" },
    { key: "paid", label: "Pedido Confirmado" }, // en tu backend paid se usa como confirm
    { key: "preparing", label: "En Camino" },
    { key: "completed", label: "Pedido Recibido" },
  ];

  // si no existe paid en history, igual la mostramos como "pendiente"
  const doneSet = new Set(sorted.map((h) => (h.status || "").toLowerCase()));

  // heurística: si last es preparing, consideramos created+paid done si existen o si el order está paid
  const lastKey = (last || "").toLowerCase();

  const isDone = (k: string) => {
    if (doneSet.has(k)) return true;
    // si está preparing o completed, consideramos confirm/placed done
    if ((lastKey === "preparing" || lastKey === "completed") && (k === "created" || k === "paid")) return true;
    if (lastKey === "completed" && k === "preparing") return true;
    return false;
  };

  return { steps, isDone, lastKey };
}

export default function TrackOrder() {
  const navigate = useNavigate();
  const { orderId } = useParams();

  const [order, setOrder] = useState<Order | null>(null);
  const [history, setHistory] = useState<OrderStatusHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  async function load() {
    const o = await apiGet<Order>(`/orders/${orderId}`);
    const h = await apiGet<OrderStatusHistoryListResponse>(`/orders/${orderId}/status-history`);
    setOrder(o);
    setHistory(h.history ?? []);
  }

  useEffect(() => {
    (async () => {
      setErr(null);
      setLoading(true);
      try {
        await load();
      } catch (e: any) {
        setErr(e?.message ?? "No pude cargar tracking");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const currentStatus = (order?.status ?? "").toLowerCase();
  const eta = fmtMinutesByStatus(currentStatus);

  const { steps, isDone, lastKey } = useMemo(
    () => pickTimeline(history, order?.status ?? "created"),
    [history, order?.status]
  );

  async function markReceived() {
    if (!orderId) return;
    setErr(null);
    setFinishing(true);
    try {
      await apiPost(`/orders/${orderId}/status`, { status: "completed", changed_by: "user" });
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "No pude completar la orden");
    } finally {
      setFinishing(false);
    }
  }

  if (loading) return <div className="text-sm text-zinc-500">Cargando tracking…</div>;

  if (!order) {
    return (
      <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-600">
        No pude cargar la orden.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="grid h-9 w-9 place-items-center rounded-xl hover:bg-zinc-100"
          >
            ←
          </button>
          <div className="text-lg font-semibold">Rastrear Pedido</div>
        </div>
        <button className="grid h-9 w-9 place-items-center rounded-xl hover:bg-zinc-100">
          ⋮
        </button>
      </div>

      {/* Driver card + map placeholder */}
      <div className="overflow-hidden rounded-2xl border bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 overflow-hidden rounded-full bg-zinc-200" />
            <div>
              <div className="text-sm font-semibold">Sofia</div>
              <div className="text-xs text-zinc-500">Información de entrega</div>
            </div>
          </div>

          <button className="grid h-10 w-10 place-items-center rounded-full border border-emerald-700 text-emerald-700">
            ☎
          </button>
        </div>

        <div className="h-44 w-full bg-[linear-gradient(135deg,#e2e8f0,#f8fafc)]">
          {/* map placeholder */}
          <div className="h-full w-full bg-[radial-gradient(circle_at_20%_30%,#94a3b8,transparent_40%),radial-gradient(circle_at_70%_60%,#cbd5e1,transparent_35%)]" />
        </div>

        <div className="grid grid-cols-2 gap-2 px-4 py-3 text-center text-xs">
          <div className="rounded-xl bg-zinc-50 p-2">
            <div className="text-[10px] text-zinc-500">TIEMPO ESTIMADO</div>
            <div className="mt-0.5 font-semibold">{eta} minutos</div>
          </div>
          <div className="rounded-xl bg-zinc-50 p-2">
            <div className="text-[10px] text-zinc-500">NÚMERO DE PEDIDO</div>
            <div className="mt-0.5 font-semibold">#{order.id}</div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-2">
        {steps.map((s) => {
          const done = isDone(s.key);
          const active = !done && s.key === (lastKey === "paid" ? "paid" : lastKey);

          return (
            <div
              key={s.key}
              className={`rounded-2xl border bg-white p-4 ${
                done ? "border-emerald-700" : "border-zinc-200"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 grid h-7 w-7 place-items-center rounded-full border ${
                    done
                      ? "border-emerald-700 bg-emerald-700 text-white"
                      : active
                      ? "border-emerald-700 text-emerald-700"
                      : "border-zinc-300 text-zinc-400"
                  }`}
                >
                  {done ? "✓" : "○"}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{s.label}</div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {normalizeStatus(s.key)} {done ? "✓" : ""}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Address card */}
      <div className="rounded-2xl border bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 grid h-7 w-7 place-items-center rounded-full border border-zinc-300 text-zinc-500">
            ⌂
          </div>
          <div>
            <div className="text-sm font-semibold">{order.delivery_type === "delivery" ? "Home" : "Pickup"}</div>
            <div className="mt-1 text-xs text-zinc-500">
              {order.delivery_type === "delivery"
                ? "Dirección guardada en la orden (snapshot)."
                : "Recogida en tienda."}
            </div>
          </div>
        </div>
      </div>

      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      <button
        onClick={markReceived}
        disabled={finishing || currentStatus === "completed" || currentStatus === "cancelled"}
        className={`w-full rounded-full py-4 text-sm font-semibold ${
          currentStatus === "completed"
            ? "bg-zinc-200 text-zinc-600"
            : "bg-slate-900 text-white"
        } disabled:opacity-50`}
      >
        {currentStatus === "completed" ? "Pedido Recibido" : finishing ? "Actualizando…" : "Pedido Recibido"}
      </button>
    </div>
  );
}