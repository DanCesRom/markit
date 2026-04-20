import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";
import { isLoggedIn } from "../lib/auth";

type ProductRow = {
  supermarket_product_id: number;
  product_name: string;
  image_url?: string | null;
  product_url?: string | null;
  category_raw?: string | null;

  price: number;
  regular_price?: number | null;
  is_on_sale: boolean;
  currency: string;
  stock: number;
};

type ProductsResp = {
  supermarket_id: number;
  category_slug: string;
  q: string;
  total: number;
  limit: number;
  offset: number;
  items: ProductRow[];
};

type CartItem = {
  cart_item_id: number;
  supermarket_product_id: number;
  quantity: number | string;
};

type CartGroup = {
  supermarket_id: number;
  supermarket_name: string;
  subtotal: string;
  items: CartItem[];
};

type CartResponse = {
  cart_id: number;
  total: string;
  supermarkets: CartGroup[];
};

function toNum(v?: string | number | null) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function FilterIcon() {
  return (
    <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border bg-white text-zinc-600 shadow-sm">
      ☰
    </span>
  );
}

export default function CategoryDetail() {
  const nav = useNavigate();
  const loc = useLocation() as any;

  const params = useParams();
  const supermarketId = Number(params.supermarketId);
  const categorySlug = String(params.categorySlug ?? "");

  const titleFromState = loc?.state?.title as string | undefined;

  const [q, setQ] = useState("");
  const [items, setItems] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyProductId, setBusyProductId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [cartMap, setCartMap] = useState<Record<number, { cart_item_id: number; quantity: number }>>({});

  const limit = 40;

  const title = useMemo(() => {
    if (titleFromState) return titleFromState;
    return categorySlug.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
  }, [titleFromState, categorySlug]);

  async function refreshCart() {
    if (!isLoggedIn()) {
      setCartMap({});
      return;
    }

    try {
      const cart = await apiGet<CartResponse>("/cart");
      const next: Record<number, { cart_item_id: number; quantity: number }> = {};

      for (const group of cart.supermarkets ?? []) {
        for (const item of group.items ?? []) {
          next[item.supermarket_product_id] = {
            cart_item_id: item.cart_item_id,
            quantity: toNum(item.quantity),
          };
        }
      }

      setCartMap(next);
    } catch {
      setCartMap({});
    }
  }

  async function loadPage(offset: number, append: boolean) {
    const qs = new URLSearchParams();
    if (q.trim()) qs.set("q", q.trim());
    qs.set("limit", String(limit));
    qs.set("offset", String(offset));

    const url = `/supermarkets/${supermarketId}/categories/${categorySlug}/products?${qs.toString()}`;

    if (append) setLoadingMore(true);
    else setLoading(true);

    setErr(null);
    try {
      const data = await apiGet<ProductsResp>(url);
      setTotal(data.total);

      if (append) setItems((prev) => [...prev, ...data.items]);
      else setItems(data.items);

      await refreshCart();
    } catch (e: any) {
      setErr(e?.message ?? "No pude cargar productos");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => {
      setItems([]);
      loadPage(0, false);
    }, 250);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supermarketId, categorySlug, q]);

  async function addToCart(supermarket_product_id: number) {
    if (!isLoggedIn()) {
      nav("/login");
      return;
    }

    try {
      setBusyProductId(supermarket_product_id);
      setErr(null);

      await apiPost("/cart/items", {
        supermarket_product_id,
        quantity: 1,
      });

      await refreshCart();
    } catch (e: any) {
      setErr(e?.message ?? "No pude agregar al carrito");
    } finally {
      setBusyProductId(null);
    }
  }

  async function increaseQty(supermarket_product_id: number) {
    if (!isLoggedIn()) {
      nav("/login");
      return;
    }

    const current = cartMap[supermarket_product_id];
    if (!current) {
      await addToCart(supermarket_product_id);
      return;
    }

    try {
      setBusyProductId(supermarket_product_id);
      setErr(null);

      await apiPatch(`/cart/items/${current.cart_item_id}`, {
        quantity: current.quantity + 1,
      });

      await refreshCart();
    } catch (e: any) {
      setErr(e?.message ?? "No pude actualizar el carrito");
    } finally {
      setBusyProductId(null);
    }
  }

  async function decreaseQty(supermarket_product_id: number) {
    if (!isLoggedIn()) {
      nav("/login");
      return;
    }

    const current = cartMap[supermarket_product_id];
    if (!current) return;

    try {
      setBusyProductId(supermarket_product_id);
      setErr(null);

      if (current.quantity <= 1) {
        await apiDelete(`/cart/items/${current.cart_item_id}`);
      } else {
        await apiPatch(`/cart/items/${current.cart_item_id}`, {
          quantity: current.quantity - 1,
        });
      }

      await refreshCart();
    } catch (e: any) {
      setErr(e?.message ?? "No pude actualizar el carrito");
    } finally {
      setBusyProductId(null);
    }
  }

  const canLoadMore = items.length < total;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => nav(-1)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl hover:bg-zinc-100"
          aria-label="Back"
        >
          ←
        </button>

        <div className="text-lg font-semibold">{title}</div>

        <button type="button" onClick={() => {}} aria-label="Filter">
          <FilterIcon />
        </button>
      </div>

      <div className="flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 shadow-sm">
        <span className="text-zinc-400">⌕</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Buscar en ${title}...`}
          className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
        />
      </div>

      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {loading && <div className="text-sm text-zinc-500">Cargando…</div>}

      <div className="grid grid-cols-2 gap-4">
        {items.map((p) => {
          const cartEntry = cartMap[p.supermarket_product_id];
          const qty = cartEntry?.quantity ?? 0;

          return (
            <div
              key={p.supermarket_product_id}
              className="rounded-3xl border bg-white p-3 shadow-sm"
            >
              <div className="relative">
                <button
                  className="absolute right-2 top-2 z-10 text-zinc-300 hover:text-zinc-500"
                  aria-label="favorite"
                  type="button"
                  onClick={() => {}}
                >
                  ♡
                </button>

                <div className="flex h-28 w-full items-center justify-center rounded-2xl bg-zinc-50 p-2">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.product_name}
                      className="max-h-full max-w-full object-contain object-center"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-3xl">🥫</span>
                  )}
                </div>
              </div>

              <div className="mt-3 space-y-2">
                <div className="min-h-[40px] text-sm font-semibold leading-snug">
                  {p.product_name}
                </div>

                <div className="flex items-end justify-between gap-2">
                  <div>
                    <div className="text-base font-semibold">
                      {p.currency} {Number(p.price).toFixed(2)}
                    </div>
                    {p.is_on_sale && p.regular_price ? (
                      <div className="text-[11px] text-zinc-400 line-through">
                        {p.currency} {Number(p.regular_price).toFixed(2)}
                      </div>
                    ) : (
                      <div className="text-[11px] text-zinc-400">&nbsp;</div>
                    )}
                  </div>

                  {qty > 0 ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => decreaseQty(p.supermarket_product_id)}
                        disabled={busyProductId === p.supermarket_product_id}
                        className="grid h-10 w-10 place-items-center rounded-2xl border border-zinc-200 bg-white font-bold text-zinc-800 disabled:opacity-50"
                        aria-label="decrease"
                      >
                        –
                      </button>

                      <div className="min-w-[20px] text-center text-sm font-semibold">
                        {qty}
                      </div>

                      <button
                        onClick={() => increaseQty(p.supermarket_product_id)}
                        disabled={busyProductId === p.supermarket_product_id}
                        className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-700 font-bold text-white disabled:opacity-50"
                        aria-label="increase"
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => addToCart(p.supermarket_product_id)}
                      disabled={
                        busyProductId === p.supermarket_product_id || p.stock <= 0
                      }
                      className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-700 font-bold text-white disabled:opacity-50"
                      aria-label="add"
                    >
                      {busyProductId === p.supermarket_product_id ? "…" : "+"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {canLoadMore && (
        <button
          disabled={loadingMore}
          onClick={() => loadPage(items.length, true)}
          className="w-full rounded-2xl border bg-white py-3 text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50"
        >
          {loadingMore ? "Cargando…" : `Load more (${items.length}/${total})`}
        </button>
      )}
    </div>
  );
}