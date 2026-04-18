import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api";
import { isLoggedIn } from "../lib/auth";
import { useNavigate } from "react-router-dom";

type BestPriceResponse = {
  query: string;
  best: {
    catalog_product_id: number;
    product: string;
    brand: string;
    supermarket_product_id: number;
    supermarket_id: number;
    supermarket: string;
    price: number;
    stock?: number;
  };
  comparison?: {
    second_best?: {
      supermarket_product_id: number;
      supermarket_id: number;
      supermarket: string;
      price: number;
      stock?: number;
    };
    savings_amount?: number;
    savings_percent?: number;
  };
};

type AltOffer = {
  supermarket_product_id?: number;
  supermarket_id?: number;
  supermarket?: string;
  supermarket_name?: string;
  price?: number;
  unit?: string;
};

function marketNameAlt(o: AltOffer) {
  return o.supermarket ?? o.supermarket_name ?? "Supermercado";
}

export default function ProductResultCard(props: {
  query: string;
  title: string;
  brand?: string;
}) {
  const navigate = useNavigate(); // ✅ DENTRO del componente

  const [open, setOpen] = useState(false);
  const [bestResp, setBestResp] = useState<BestPriceResponse | null>(null);
  const [alts, setAlts] = useState<AltOffer[]>([]);
  const [loadingBest, setLoadingBest] = useState(false);
  const [loadingAlts, setLoadingAlts] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function run() {
      setErr(null);
      setLoadingBest(true);
      try {
        const data = await apiGet<BestPriceResponse>(
          `/products/best-price?q=${encodeURIComponent(props.query)}`
        );
        if (alive) setBestResp(data);
      } catch (e: any) {
        if (alive) setErr(e?.message ?? "No pude cargar recomendado");
      } finally {
        if (alive) setLoadingBest(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [props.query]);

  async function loadAlternatives() {
    if (alts.length > 0 || loadingAlts) return;

    setLoadingAlts(true);
    setErr(null);
    try {
      const data = await apiGet<AltOffer[]>(
        `/products/search?q=${encodeURIComponent(props.query)}`
      );
      setAlts(data);
    } catch (e: any) {
      setErr(e?.message ?? "No pude cargar opciones");
    } finally {
      setLoadingAlts(false);
    }
  }

  async function addToCart(supermarket_product_id: number) {
    if (!isLoggedIn()) {
      navigate("/login");
      return;
    }

    try {
      setAdding(supermarket_product_id);
      setErr(null);

      await apiPost<string>("/cart/items", {
        supermarket_product_id,
        quantity: 1,
      });

      navigate("/cart");
    } catch (e: any) {
      setErr(e?.message ?? "No pude agregar al carrito");
    } finally {
      setAdding(null);
    }
  }

  const best = bestResp?.best;
  const bestMarket = best?.supermarket ?? "—";
  const bestPrice = best?.price ?? 0;
  const bestBrand = best?.brand ?? props.brand ?? "—";
  const savingsPct = bestResp?.comparison?.savings_percent;

  return (
    <div className="rounded-3xl border bg-white p-4 shadow-sm">
      <div className="flex gap-3">
        <div className="h-14 w-14 rounded-2xl bg-zinc-100" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">
            {best?.product ?? props.title}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">{bestBrand}</div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-zinc-500">Recomendado</div>
              <div className="text-sm font-semibold">
                {loadingBest ? "Cargando…" : `RD$ ${bestPrice.toFixed(2)}`}
              </div>
              <div className="text-xs text-zinc-500">{bestMarket}</div>

              {typeof savingsPct === "number" && (
                <div className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                  Ahorro {savingsPct.toFixed(0)}%
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  const next = !open;
                  setOpen(next);
                  if (next) await loadAlternatives();
                }}
                className="rounded-2xl border px-3 py-2 text-xs font-semibold hover:bg-zinc-50"
              >
                {open ? "Ocultar" : "Ver más"}
              </button>

              <button
                disabled={
                  !best?.supermarket_product_id ||
                  adding === best?.supermarket_product_id
                }
                onClick={() =>
                  best?.supermarket_product_id && addToCart(best.supermarket_product_id)
                }
                className="rounded-2xl bg-black px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {adding === best?.supermarket_product_id ? "Agregando…" : "+ Agregar"}
              </button>
            </div>
          </div>

          {err && (
            <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {err}
            </div>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-4 rounded-2xl border bg-zinc-50 p-3">
          <div className="mb-2 text-xs font-semibold text-zinc-700">Otras opciones</div>

          {loadingAlts && <div className="text-xs text-zinc-500">Cargando…</div>}

          {!loadingAlts && alts.length === 0 && (
            <div className="text-xs text-zinc-500">No hay más opciones.</div>
          )}

          <div className="space-y-2">
            {alts.slice(0, 6).map((o, idx) => {
              const spid = o.supermarket_product_id;
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-2xl bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold">{marketNameAlt(o)}</div>
                    <div className="text-[11px] text-zinc-500">{o.unit ?? "—"}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-xs font-semibold">RD$ {(o.price ?? 0).toFixed(2)}</div>
                    <button
                      disabled={!spid || adding === spid}
                      onClick={() => spid && addToCart(spid)}
                      className="rounded-xl bg-zinc-900 px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
                    >
                      {adding === spid ? "..." : "Agregar"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-2 text-[11px] text-zinc-500">
            * Mostrando hasta 6 opciones para el MVP.
          </div>
        </div>
      )}
    </div>
  );
}