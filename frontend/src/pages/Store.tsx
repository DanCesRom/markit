import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";
import { isLoggedIn } from "../lib/auth";

import nacionalSquare from "../assets/supermarket/Nacional2x2.jpg";
import nacionalWide from "../assets/supermarket/Nacional3x4.webp";
import sirenaWide from "../assets/supermarket/sirena3x4.svg";

type StoreDetail = {
  id: number;
  name: string;
  address: string;
};

type StoreCategory = {
  supermarket_category_id: number;
  slug: string;
  name: string;
  items_count: number;
};

type PopularProduct = {
  supermarket_product_id: number;
  product_name: string;
  image_url?: string | null;
  product_url?: string | null;
  category_name?: string | null;
  price: number;
  regular_price?: number | null;
  discount_amount?: number;
  discount_percent?: number;
  currency?: string | null;
  is_on_sale?: boolean;
  stock: number;
  popularity_hint?: string;
};

type PopularProductsResponse = {
  supermarket_id: number;
  limit: number;
  items: PopularProduct[];
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

function formatMoney(value?: number | string | null, currency?: string | null) {
  const n = Number(value ?? 0);
  const symbol = currency?.trim() || "RD$";
  return `${symbol} ${Number.isFinite(n) ? n.toFixed(2) : "0.00"}`;
}

function getStoreVisuals(storeName?: string) {
  const normalized = (storeName ?? "").toLowerCase();

  if (normalized.includes("nacional")) {
    return {
      heroSrc: nacionalWide || nacionalSquare,
      heroAlt: "Supermercado Nacional",
      heroBg: "bg-white",
    };
  }

  if (normalized.includes("sirena")) {
    return {
      heroSrc: sirenaWide,
      heroAlt: "Supermercado Sirena",
      heroBg: "bg-[#fff6cc]",
    };
  }

  return {
    heroSrc: nacionalSquare,
    heroAlt: storeName || "Supermercado",
    heroBg: "bg-white",
  };
}

function ProductCard(props: {
  product: PopularProduct;
  quantityInCart: number;
  busy: boolean;
  onAdd: () => void;
  onIncrease: () => void;
  onDecrease: () => void;
}) {
  const p = props.product;
  const showStrike =
    typeof p.regular_price === "number" && p.regular_price > p.price;

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="grid h-28 place-items-center overflow-hidden rounded-2xl bg-zinc-100">
        {p.image_url ? (
          <img
            src={p.image_url}
            alt={p.product_name}
            className="h-full w-full object-contain p-2"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="text-4xl">🛒</div>
        )}
      </div>

      <div className="mt-3">
        <div className="line-clamp-2 min-h-[40px] text-sm font-semibold text-zinc-900">
          {p.product_name}
        </div>

        <div className="mt-1 text-xs text-zinc-500">
          {p.category_name || "Producto popular"}
        </div>

        <div className="mt-3">
          {showStrike ? (
            <div className="text-xs text-zinc-400 line-through">
              {formatMoney(p.regular_price, p.currency)}
            </div>
          ) : (
            <div className="text-xs text-zinc-400">&nbsp;</div>
          )}

          <div className="text-lg font-semibold text-zinc-950">
            {formatMoney(p.price, p.currency)}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              p.stock > 0
                ? "bg-emerald-50 text-emerald-700"
                : "bg-zinc-100 text-zinc-500"
            }`}
          >
            {p.stock > 0 ? "Disponible" : "Sin stock"}
          </div>

          {props.quantityInCart > 0 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={props.onDecrease}
                disabled={props.busy}
                className="grid h-10 w-10 place-items-center rounded-2xl border border-zinc-200 bg-white text-lg font-bold text-zinc-800 disabled:opacity-50"
                aria-label="decrease"
              >
                –
              </button>

              <div className="min-w-[20px] text-center text-sm font-semibold text-zinc-900">
                {props.quantityInCart}
              </div>

              <button
                type="button"
                onClick={props.onIncrease}
                disabled={props.busy}
                className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-700 text-lg font-bold text-white disabled:opacity-50"
                aria-label="increase"
              >
                +
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={props.onAdd}
              disabled={props.busy || p.stock <= 0}
              className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-700 text-lg font-bold text-white disabled:opacity-50"
              aria-label="add"
            >
              {props.busy ? "…" : "+"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionTitle(props: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-[22px] font-semibold tracking-tight text-zinc-950">
        {props.title}
      </h2>
      {props.subtitle ? (
        <p className="mt-1 text-sm text-zinc-500">{props.subtitle}</p>
      ) : null}
    </div>
  );
}

export default function Store() {
  const navigate = useNavigate();
  const { storeId } = useParams();

  const numericStoreId = Number(storeId);

  const [store, setStore] = useState<StoreDetail | null>(null);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [popular, setPopular] = useState<PopularProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [cartMap, setCartMap] = useState<Record<number, { cart_item_id: number; quantity: number }>>({});
  const [busyProductId, setBusyProductId] = useState<number | null>(null);

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

  useEffect(() => {
    async function load() {
      if (!Number.isFinite(numericStoreId) || numericStoreId <= 0) {
        setErr("Supermercado inválido");
        setLoading(false);
        return;
      }

      setLoading(true);
      setErr("");

      try {
        const [storeRes, categoriesRes, popularRes] = await Promise.all([
          apiGet<StoreDetail>(`/supermarkets/${numericStoreId}`),
          apiGet<StoreCategory[]>(`/supermarkets/${numericStoreId}/categories`),
          apiGet<PopularProductsResponse>(
            `/supermarkets/${numericStoreId}/popular-products?limit=12`
          ),
        ]);

        setStore(storeRes);
        setCategories(categoriesRes ?? []);
        setPopular(popularRes.items ?? []);
        await refreshCart();
      } catch (e: any) {
        setErr(e?.message ?? "No pude cargar el supermercado");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [numericStoreId]);

  const visuals = useMemo(() => getStoreVisuals(store?.name), [store?.name]);
  const topCategories = useMemo(() => categories.slice(0, 8), [categories]);

  async function addToCart(supermarket_product_id: number) {
    if (!isLoggedIn()) {
      navigate("/login");
      return;
    }

    try {
      setBusyProductId(supermarket_product_id);
      setErr("");

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
      navigate("/login");
      return;
    }

    const current = cartMap[supermarket_product_id];
    if (!current) {
      await addToCart(supermarket_product_id);
      return;
    }

    try {
      setBusyProductId(supermarket_product_id);
      setErr("");

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
      navigate("/login");
      return;
    }

    const current = cartMap[supermarket_product_id];
    if (!current) return;

    try {
      setBusyProductId(supermarket_product_id);
      setErr("");

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

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="text-sm text-zinc-500">Cargando supermercado…</div>
      </div>
    );
  }

  if (err && !store) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate(-1)}
          className="grid h-10 w-10 place-items-center rounded-full text-zinc-700 hover:bg-zinc-100"
          aria-label="Volver"
        >
          ←
        </button>

        <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {err}
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="rounded-3xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">
        No encontré ese supermercado.
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="grid h-10 w-10 place-items-center rounded-full text-zinc-700 hover:bg-zinc-100"
          aria-label="Volver"
        >
          ←
        </button>

        <div>
          <div className="text-[26px] font-semibold leading-tight text-zinc-950">
            {store.name}
          </div>
          {/* <div className="text-sm text-zinc-500">{store.address}</div> */}
        </div>
      </div>

      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      <section className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div
          className={`grid h-40 place-items-center overflow-hidden rounded-3xl ${visuals.heroBg}`}
        >
          <img
            src={visuals.heroSrc}
            alt={visuals.heroAlt}
            className="h-full w-full object-contain p-4"
            draggable={false}
          />
        </div>

        <div className="mt-4">
          <div className="text-lg font-semibold text-zinc-950">
            Productos populares en {store.name}
          </div>
          <div className="mt-1 text-sm text-zinc-500">
            Selección inicial de consumo habitual y productos masivos.
          </div>
        </div>
      </section>

      {topCategories.length > 0 && (
        <section className="space-y-3">
          <SectionTitle
            title="Categorías"
            subtitle="Explora rápido las categorías principales"
          />

          <div className="flex gap-2 overflow-x-auto pb-1">
            {topCategories.map((cat) => (
              <Link
                key={cat.supermarket_category_id}
                to={`/categories/${store.id}/${cat.slug}`}
                state={{ title: cat.name }}
                className="shrink-0 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm"
              >
                {cat.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <SectionTitle
          title={`Popular en ${store.name}`}
          subtitle="Arroz, leche, huevos, aceite y otros productos de compra frecuente"
        />

        {popular.length === 0 ? (
          <div className="rounded-3xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600 shadow-sm">
            No encontré productos populares para este supermercado todavía.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {popular.map((product) => {
              const cartEntry = cartMap[product.supermarket_product_id];
              const qty = cartEntry?.quantity ?? 0;

              return (
                <ProductCard
                  key={product.supermarket_product_id}
                  product={product}
                  quantityInCart={qty}
                  busy={busyProductId === product.supermarket_product_id}
                  onAdd={() => addToCart(product.supermarket_product_id)}
                  onIncrease={() => increaseQty(product.supermarket_product_id)}
                  onDecrease={() => decreaseQty(product.supermarket_product_id)}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}