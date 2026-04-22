import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";
import { isLoggedIn } from "../lib/auth";

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
    supermarket_id?: number;
    supermarket_name?: string;
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

function normalizeText(value?: string | null) {
    return (value ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function formatMoney(value?: number | string | null, currency?: string | null) {
    const n = Number(value ?? 0);
    const symbol = currency?.trim() || "RD$";
    return `${symbol} ${Number.isFinite(n) ? n.toFixed(2) : "0.00"}`;
}

function sortForDisplay(items: PopularProduct[]) {
    return [...items].sort((a, b) => {
        const imgDiff = Number(Boolean(b.image_url)) - Number(Boolean(a.image_url));
        if (imgDiff !== 0) return imgDiff;

        const stockDiff = Number(b.stock > 0) - Number(a.stock > 0);
        if (stockDiff !== 0) return stockDiff;

        return a.price - b.price;
    });
}

function productMatchesAny(name: string, terms: string[]) {
    return terms.some((term) => name.includes(term));
}

function pickByKeywordGroups(
    source: PopularProduct[],
    groups: string[][],
    excludedIds?: Set<number>
) {
    const usedIds = new Set<number>(excludedIds ?? []);
    const clean = source.filter((item) => item.stock > 0);
    const result: PopularProduct[] = [];

    for (const terms of groups) {
        const match = sortForDisplay(
            clean.filter((item) => {
                const name = normalizeText(item.product_name);
                return !usedIds.has(item.supermarket_product_id) && productMatchesAny(name, terms);
            })
        )[0];

        if (match) {
            result.push(match);
            usedIds.add(match.supermarket_product_id);
        }
    }

    return result;
}

function buildCollection(items: PopularProduct[], kind: string) {
    const source = items.filter((item) => item.stock > 0);

    const popularGroups: string[][] = [
        ["manzana", "apple"],
        ["pera"],
        ["guineo", "banana"],
        ["platano"],
        ["uva"],
        ["naranja"],
        ["limon"],
        ["aguacate"],
        ["tomate"],
        ["cebolla"],
        ["papa"],
        ["zanahoria"],
        ["lechuga"],
        ["pepino"],
        ["ajo"],
        ["brocoli", "brócoli"],
        ["fresa"],
        ["piña", "pina"],
        ["auyama"],
        ["yuca"],
        ["leche"],
        ["huevo"],
        ["queso"],
        ["agua"],
        ["jugo"],
        ["pan"],
    ];

    const bestsellerGroups: string[][] = [
        ["arroz"],
        ["aceite"],
        ["leche"],
        ["huevo"],
        ["pan"],
        ["pollo"],
        ["queso"],
        ["pasta", "espagueti", "spaghetti"],
        ["agua"],
        ["coca cola", "cocacola"],
        ["pepsi", "refresco"],
        ["detergente"],
        ["papel higienico"],
        ["avena"],
        ["azucar"],
        ["cafe"],
        ["salami"],
        ["mayonesa"],
        ["ketchup"],
        ["servilleta"],
        ["jabon", "jabón"],
        ["cloro"],
    ];

    if (kind === "vendidos") {
        return pickByKeywordGroups(source, bestsellerGroups);
    }

    return pickByKeywordGroups(source, popularGroups);
}

function Heart() {
    return (
        <div className="grid h-8 w-8 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-400">
            ♥
        </div>
    );
}

function ProductMiniCard(props: {
    p: PopularProduct;
    quantityInCart: number;
    busy: boolean;
    onAdd: () => void;
    onIncrease: () => void;
    onDecrease: () => void;
}) {
    const p = props.p;
    const showStrike =
        typeof p.regular_price === "number" && p.regular_price > p.price;

    return (
        <div className="relative rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:-translate-y-[1px] hover:shadow-md">
            <div className="absolute right-3 top-3">
                <Heart />
            </div>

            <div className="grid h-24 place-items-center overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                {p.image_url ? (
                    <img
                        src={p.image_url}
                        alt={p.product_name}
                        className="h-full w-full bg-white object-contain p-2"
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

                <div className="mt-1 text-xs text-zinc-400">
                    {p.supermarket_name || p.category_name || "Producto"}
                </div>

                <div className="mt-3 flex items-end justify-between gap-2">
                    <div className="min-w-0">
                        <div className="text-lg font-semibold text-zinc-950">
                            {formatMoney(p.price, p.currency)}
                        </div>
                        {showStrike ? (
                            <div className="text-[11px] text-zinc-400 line-through">
                                {formatMoney(p.regular_price, p.currency)}
                            </div>
                        ) : (
                            <div className="text-[11px] text-zinc-400">&nbsp;</div>
                        )}
                    </div>

                    {props.quantityInCart > 0 ? (
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={props.onDecrease}
                                disabled={props.busy}
                                className="grid h-10 w-10 place-items-center rounded-2xl border border-zinc-200 bg-white text-lg font-bold text-zinc-800 disabled:opacity-50"
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
                            >
                                +
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={props.onAdd}
                            disabled={props.busy || p.stock <= 0}
                            className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-600 text-2xl text-white shadow-sm disabled:opacity-50"
                        >
                            {props.busy ? "…" : "+"}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function HomeCollection() {
    const navigate = useNavigate();
    const location = useLocation();
    const { kind = "populares" } = useParams();

    const locationState = (location.state ?? {}) as {
        title?: string;
        kind?: string;
        items?: PopularProduct[];
    };

    const rawItems = Array.isArray(locationState.items) ? locationState.items : [];
    const ordered = useMemo(() => buildCollection(rawItems, kind), [rawItems, kind]);

    const [visibleCount, setVisibleCount] = useState(8);
    const [cartMap, setCartMap] = useState<
        Record<number, { cart_item_id: number; quantity: number }>
    >({});
    const [busyProductId, setBusyProductId] = useState<number | null>(null);
    const sentinelRef = useRef<HTMLDivElement | null>(null);

    const visibleItems = ordered.slice(0, visibleCount);

    useEffect(() => {
        setVisibleCount(8);
    }, [kind]);

    useEffect(() => {
        const node = sentinelRef.current;
        if (!node) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (!entry.isIntersecting) return;
                setVisibleCount((prev) => Math.min(prev + 6, ordered.length));
            },
            { threshold: 0.2 }
        );

        observer.observe(node);
        return () => observer.disconnect();
    }, [ordered.length]);

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
                        quantity: Number(item.quantity ?? 0),
                    };
                }
            }

            setCartMap(next);
        } catch {
            setCartMap({});
        }
    }

    useEffect(() => {
        refreshCart();
    }, []);

    async function addToCart(supermarket_product_id: number) {
        if (!isLoggedIn()) {
            navigate("/login");
            return;
        }

        try {
            setBusyProductId(supermarket_product_id);

            await apiPost("/cart/items", {
                supermarket_product_id,
                quantity: 1,
            });

            await refreshCart();
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

            await apiPatch(`/cart/items/${current.cart_item_id}`, {
                quantity: current.quantity + 1,
            });

            await refreshCart();
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

            if (current.quantity <= 1) {
                await apiDelete(`/cart/items/${current.cart_item_id}`);
            } else {
                await apiPatch(`/cart/items/${current.cart_item_id}`, {
                    quantity: current.quantity - 1,
                });
            }

            await refreshCart();
        } finally {
            setBusyProductId(null);
        }
    }

    const title =
        locationState.title ||
        (kind === "vendidos" ? "Más vendidos" : "Más populares");

    return (
        <div className="mx-auto max-w-[430px] px-4 pb-8 pt-2">
            <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-zinc-100 bg-white px-4 pb-3 pt-1">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="grid h-10 w-10 place-items-center rounded-full text-xl text-zinc-700 transition hover:bg-zinc-50"
                        aria-label="Volver"
                    >
                        ←
                    </button>

                    <div>
                        <div className="text-[22px] font-semibold text-zinc-950">{title}</div>
                        <div className="text-sm text-zinc-500">
                            Selección curada con productos reales
                        </div>
                    </div>
                </div>
            </div>

            {!ordered.length ? (
                <div className="rounded-3xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500 shadow-sm">
                    No hay productos para mostrar aquí todavía.
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-4">
                        {visibleItems.map((p) => {
                            const cartEntry = cartMap[p.supermarket_product_id];
                            const qty = cartEntry?.quantity ?? 0;

                            return (
                                <ProductMiniCard
                                    key={p.supermarket_product_id}
                                    p={p}
                                    quantityInCart={qty}
                                    busy={busyProductId === p.supermarket_product_id}
                                    onAdd={() => addToCart(p.supermarket_product_id)}
                                    onIncrease={() => increaseQty(p.supermarket_product_id)}
                                    onDecrease={() => decreaseQty(p.supermarket_product_id)}
                                />
                            );
                        })}
                    </div>

                    <div ref={sentinelRef} className="h-16" />

                    {visibleCount < ordered.length && (
                        <div className="pb-2 text-center text-sm text-zinc-400">
                            Cargando más productos...
                        </div>
                    )}
                </>
            )}
        </div>
    );
}