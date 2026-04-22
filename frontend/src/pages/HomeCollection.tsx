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

function productMatchesAny(name: string, terms: string[]) {
    return terms.some((term) => name.includes(term));
}

function productHasBlockedWords(name: string) {
    return [
        "alimento",
        "perro",
        "perros",
        "cachorro",
        "gato",
        "gatos",
        "mascota",
        "shampoo",
        "acondicionador",
        "ampolla",
        "tratamiento",
        "crema",
        "locion",
        "loción",
        "detergente",
        "cloro",
        "dog chow",
        "purina",
        "paws",
    ].some((term) => name.includes(term));
}

function getDisplayPriority(item: PopularProduct) {
    let score = 0;
    if (item.image_url) score += 3;
    if (item.stock > 0) score += 2;
    if (item.is_on_sale) score += 1;
    return score;
}

function sortForDisplay(items: PopularProduct[]) {
    return [...items].sort((a, b) => {
        const prio = getDisplayPriority(b) - getDisplayPriority(a);
        if (prio !== 0) return prio;
        return a.price - b.price;
    });
}

function cleanProductKey(name?: string | null) {
    return normalizeText(name)
        .replace(/\([^)]*\)/g, " ")
        .replace(
            /\b(roja|rojo|verde|amarilla|amarillo|maduro|premium|extra|selecta|selecto|und|unidad|unidades|lb|libra|libras|pqte|paquete|pack|funda|botella|lata|onz|oz|ml|g|kg)\b/g,
            " "
        )
        .replace(/\s+/g, " ")
        .trim();
}

function firstLetterKey(name?: string | null) {
    const cleaned = cleanProductKey(name);
    return cleaned.charAt(0) || "";
}

function isAllowedPopularCategory(item: PopularProduct) {
    const cat = normalizeText(item.category_name);
    if (!cat) return true;

    return (
        cat.includes("frutas") ||
        cat.includes("vegetales") ||
        cat.includes("alimentacion") ||
        cat.includes("alimentación") ||
        cat.includes("despensa") ||
        cat.includes("lacteos") ||
        cat.includes("huevos") ||
        cat.includes("bebidas") ||
        cat.includes("quesos") ||
        cat.includes("panaderia") ||
        cat.includes("reposteria")
    );
}

function isAllowedBestSellerCategory(item: PopularProduct) {
    const cat = normalizeText(item.category_name);
    if (!cat) return true;

    return (
        cat.includes("alimentacion") ||
        cat.includes("alimentación") ||
        cat.includes("despensa") ||
        cat.includes("lacteos") ||
        cat.includes("huevos") ||
        cat.includes("bebidas") ||
        cat.includes("quesos") ||
        cat.includes("embutidos") ||
        cat.includes("panaderia") ||
        cat.includes("reposteria")
    );
}

function pickBestUnique(
    source: PopularProduct[],
    terms: string[],
    usedIds: Set<number>,
    usedNames: Set<string>,
    usedInitials: Set<string>,
    categoryGuard: (item: PopularProduct) => boolean,
    options?: { blockProcessed?: boolean; avoidSameInitial?: boolean }
) {
    const candidates = sortForDisplay(
        source.filter((item) => {
            const name = normalizeText(item.product_name);
            const cleanName = cleanProductKey(item.product_name);
            const initial = firstLetterKey(item.product_name);

            if (options?.blockProcessed && productHasBlockedWords(name)) return false;

            if (options?.avoidSameInitial && initial && usedInitials.has(initial)) {
                return false;
            }

            return (
                item.stock > 0 &&
                categoryGuard(item) &&
                !usedIds.has(item.supermarket_product_id) &&
                !usedNames.has(cleanName) &&
                productMatchesAny(name, terms)
            );
        })
    );

    const fallbackCandidates =
        candidates.length > 0
            ? candidates
            : sortForDisplay(
                source.filter((item) => {
                    const name = normalizeText(item.product_name);
                    const cleanName = cleanProductKey(item.product_name);

                    if (options?.blockProcessed && productHasBlockedWords(name)) return false;

                    return (
                        item.stock > 0 &&
                        categoryGuard(item) &&
                        !usedIds.has(item.supermarket_product_id) &&
                        !usedNames.has(cleanName) &&
                        productMatchesAny(name, terms)
                    );
                })
            );

    const picked = fallbackCandidates[0];
    if (!picked) return null;

    usedIds.add(picked.supermarket_product_id);
    usedNames.add(cleanProductKey(picked.product_name));

    const initial = firstLetterKey(picked.product_name);
    if (initial) usedInitials.add(initial);

    return picked;
}

function pickOneFromGroup(
    source: PopularProduct[],
    groupTerms: string[][],
    usedIds: Set<number>,
    usedNames: Set<string>,
    usedInitials: Set<string>,
    categoryGuard: (item: PopularProduct) => boolean,
    options?: { blockProcessed?: boolean; avoidSameInitial?: boolean }
) {
    for (const terms of groupTerms) {
        const picked = pickBestUnique(
            source,
            terms,
            usedIds,
            usedNames,
            usedInitials,
            categoryGuard,
            options
        );
        if (picked) return picked;
    }
    return null;
}

function pickFallback(
    source: PopularProduct[],
    usedIds: Set<number>,
    usedNames: Set<string>,
    usedInitials: Set<string>,
    categoryGuard: (item: PopularProduct) => boolean,
    options?: { blockProcessed?: boolean; avoidSameInitial?: boolean }
) {
    const candidates = sortForDisplay(
        source.filter((item) => {
            const cleanName = cleanProductKey(item.product_name);
            const name = normalizeText(item.product_name);
            const initial = firstLetterKey(item.product_name);

            if (options?.blockProcessed && productHasBlockedWords(name)) return false;

            if (options?.avoidSameInitial && initial && usedInitials.has(initial)) {
                return false;
            }

            return (
                item.stock > 0 &&
                categoryGuard(item) &&
                !usedIds.has(item.supermarket_product_id) &&
                !usedNames.has(cleanName)
            );
        })
    );

    const fallbackCandidates =
        candidates.length > 0
            ? candidates
            : sortForDisplay(
                source.filter((item) => {
                    const cleanName = cleanProductKey(item.product_name);
                    const name = normalizeText(item.product_name);

                    if (options?.blockProcessed && productHasBlockedWords(name)) return false;

                    return (
                        item.stock > 0 &&
                        categoryGuard(item) &&
                        !usedIds.has(item.supermarket_product_id) &&
                        !usedNames.has(cleanName)
                    );
                })
            );

    const picked = fallbackCandidates[0];
    if (!picked) return null;

    usedIds.add(picked.supermarket_product_id);
    usedNames.add(cleanProductKey(picked.product_name));

    const initial = firstLetterKey(picked.product_name);
    if (initial) usedInitials.add(initial);

    return picked;
}

function buildCollection(items: PopularProduct[], kind: string) {
    const source = items.filter((item) => item.stock > 0);

    const usedIds = new Set<number>();
    const usedNames = new Set<string>();
    const usedInitials = new Set<string>();

    const popularItems: PopularProduct[] = [];

    const popularGroups: string[][][] = [
        [["manzana roja"], ["manzana", "apple"]],
        [["guineo", "banana"], ["platano"]],
        [["papa"], ["tomate"], ["zanahoria"]],
        [["pera"], ["uva"], ["naranja"], ["fresa"], ["piña", "pina"], ["agua"], ["pan"]],
    ];

    for (const group of popularGroups) {
        const picked = pickOneFromGroup(
            source,
            group,
            usedIds,
            usedNames,
            usedInitials,
            isAllowedPopularCategory,
            { blockProcessed: false, avoidSameInitial: true }
        );
        if (picked) popularItems.push(picked);
    }

    while (popularItems.length < 12) {
        const fallback = pickFallback(
            source,
            usedIds,
            usedNames,
            usedInitials,
            isAllowedPopularCategory,
            { blockProcessed: false, avoidSameInitial: true }
        );
        if (!fallback) break;
        popularItems.push(fallback);
    }

    const bestsellerItems: PopularProduct[] = [];

    const pantryGroups: string[][] = [
        ["arroz"],
        ["aceite"],
        ["pasta", "espagueti", "spaghetti"],
        ["pan"],
        ["avena"],
    ];

    const dairyGroups: string[][] = [
        ["leche"],
        ["huevo"],
        ["queso"],
    ];

    const beverageGroups: string[][] = [
        ["agua"],
        ["jugo"],
        ["coca cola", "cocacola"],
        ["pepsi", "refresco"],
        ["cafe"],
    ];

    const otherGroups: string[][] = [
        ["pollo"],
        ["salami"],
        ["jamon", "jamón"],
        ["galleta", "galletas"],
    ];

    const soldPantry = pickOneFromGroup(
        source,
        pantryGroups,
        usedIds,
        usedNames,
        usedInitials,
        isAllowedBestSellerCategory
    );
    if (soldPantry) bestsellerItems.push(soldPantry);

    const soldDairy = pickOneFromGroup(
        source,
        dairyGroups,
        usedIds,
        usedNames,
        usedInitials,
        isAllowedBestSellerCategory
    );
    if (soldDairy) bestsellerItems.push(soldDairy);

    const soldDrink = pickOneFromGroup(
        source,
        beverageGroups,
        usedIds,
        usedNames,
        usedInitials,
        isAllowedBestSellerCategory
    );
    if (soldDrink) bestsellerItems.push(soldDrink);

    const soldOther = pickOneFromGroup(
        source,
        otherGroups,
        usedIds,
        usedNames,
        usedInitials,
        isAllowedBestSellerCategory
    );
    if (soldOther) bestsellerItems.push(soldOther);

    while (bestsellerItems.length < 12) {
        const fallback = pickFallback(
            source,
            usedIds,
            usedNames,
            usedInitials,
            isAllowedBestSellerCategory
        );
        if (!fallback) break;
        bestsellerItems.push(fallback);
    }

    return kind === "vendidos" ? bestsellerItems : popularItems;
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

            <div className="flex h-28 w-full items-center justify-center overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                {p.image_url ? (
                    <img
                        src={p.image_url}
                        alt={p.product_name}
                        className="h-full w-full object-contain"
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

                    <div className="text-[22px] font-semibold text-zinc-950">{title}</div>
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