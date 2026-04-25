import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiDelete, apiGet, apiGetCached, apiPatch, apiPost } from "../lib/api";
import { isLoggedIn } from "../lib/auth";
import type { Address } from "../lib/types";
import AddressPickerSheet, {
    getStoredActiveAddressId,
    setStoredActiveAddressId,
} from "../components/address/AddressPickerSheet";

import nacionalSquare from "../assets/supermarket/Nacional2x2.jpg";
import nacionalWide from "../assets/supermarket/Nacional3x4.jpg";
import sirenaWide from "../assets/supermarket/sirena3x4.svg";
import avatarImg from "../assets/home/avatar.png";
import mapPinIcon from "../assets/home/map-pin.svg";
import findIcon from "../assets/home/find.png";
import markitPlusBanner from "../assets/banners/markit-plus.png";

type MeResponse = {
    id?: number;
    first_name?: string | null;
    last_name?: string | null;
    name?: string | null;
    full_name?: string | null;
    email?: string | null;
};

type SupermarketApiItem = {
    id: number;
    name: string;
};

type Store = {
    id: string;
    name: string;
    eta: string;
    rating: number;
    deliveryFee?: number;
    favorite?: boolean;
    logoSrc: string;
    logoAlt: string;
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
    supermarket_id?: number;
    supermarket_name?: string;
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

const GENERIC_LABELS = new Set([
    "home",
    "work",
    "office",
    "apartment",
    "house",
    "hotel",
    "other",
]);

function toNum(v?: string | number | null) {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
}

function formatMoney(value?: number | string | null, currency?: string | null) {
    const n = Number(value ?? 0);
    const symbol = currency?.trim() || "RD$";
    return `${symbol} ${Number.isFinite(n) ? n.toFixed(2) : "0.00"}`;
}

function getFirstNameFromMe(me: MeResponse | null | undefined) {
    const full =
        me?.full_name?.trim() ||
        me?.name?.trim() ||
        `${me?.first_name ?? ""} ${me?.last_name ?? ""}`.trim() ||
        me?.first_name?.trim() ||
        "";

    if (!full) return "Usuario";

    const first = full.split(/\s+/).filter(Boolean)[0];
    return first || "Usuario";
}

function normalizeText(value?: string | null) {
    return (value ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function cleanCommaSpaces(v: string) {
    return v
        .replace(/\s+,/g, ",")
        .replace(/,\s*,+/g, ", ")
        .replace(/\s+/g, " ")
        .trim();
}

function dedupeCommaParts(v: string) {
    const seen = new Set<string>();

    return v
        .split(",")
        .map((x) => x.trim())
        .filter((x) => {
            if (!x) return false;
            const key = x.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .join(", ");
}

function buildShortAddress(address: Address) {
    const first =
        address.line1?.trim() ||
        address.formatted_address?.split(",")[0]?.trim() ||
        "";

    const second = address.city?.trim() || address.state?.trim() || "";

    return cleanCommaSpaces(
        dedupeCommaParts([first, second].filter(Boolean).join(", "))
    );
}

function buildLongAddress(address: Address) {
    const formatted = cleanCommaSpaces(address.formatted_address?.trim() || "");

    if (formatted) {
        return dedupeCommaParts(formatted);
    }

    return cleanCommaSpaces(
        dedupeCommaParts(
            [
                address.line1,
                address.line2 || "",
                address.city || "",
                address.state || "",
                address.postal_code || "",
            ]
                .filter((x) => String(x).trim().length > 0)
                .join(", ")
        )
    );
}

function getAddressButtonText(address: Address | null) {
    if (!address) return "Elige dirección";

    const label = (address.label || "").trim();
    if (label && !GENERIC_LABELS.has(label.toLowerCase())) {
        return label;
    }

    const shortAddress = buildShortAddress(address);
    return shortAddress || label || "Elige dirección";
}

function pickActiveAddress(list: Address[]) {
    const storedId = getStoredActiveAddressId();
    if (storedId) {
        const found = list.find((x) => x.id === storedId);
        if (found) return found;
    }

    return list.find((x) => x.is_default) ?? list[0] ?? null;
}

function findMarketIdByName(
    supermarkets: SupermarketApiItem[],
    nameNeedle: string
) {
    const found = supermarkets.find((s) =>
        s.name.toLowerCase().includes(nameNeedle.toLowerCase())
    );
    return found ? String(found.id) : "";
}

function attachStoreName(
    items: PopularProduct[],
    supermarket_id: number,
    supermarket_name: string
) {
    return items.map((item) => ({
        ...item,
        supermarket_id,
        supermarket_name,
    }));
}

function uniqueByProductId(items: PopularProduct[]) {
    const used = new Set<number>();
    return items.filter((item) => {
        if (used.has(item.supermarket_product_id)) return false;
        used.add(item.supermarket_product_id);
        return true;
    });
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
        "suavizante",
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

            if (
                options?.avoidSameInitial &&
                initial &&
                usedInitials.has(initial)
            ) {
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

            if (
                options?.avoidSameInitial &&
                initial &&
                usedInitials.has(initial)
            ) {
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

function buildFakeHomeCollections(items: PopularProduct[]) {
    const source = uniqueByProductId(items).filter((item) => item.stock > 0);

    const usedIds = new Set<number>();
    const usedNames = new Set<string>();
    const usedInitials = new Set<string>();

    const popularPreview: PopularProduct[] = [];

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
        if (picked) popularPreview.push(picked);
    }

    while (popularPreview.length < 4) {
        const fallback = pickFallback(
            source,
            usedIds,
            usedNames,
            usedInitials,
            isAllowedPopularCategory,
            { blockProcessed: false, avoidSameInitial: true }
        );
        if (!fallback) break;
        popularPreview.push(fallback);
    }

    const bestsellerPreview: PopularProduct[] = [];

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
    if (soldPantry) bestsellerPreview.push(soldPantry);

    const soldDairy = pickOneFromGroup(
        source,
        dairyGroups,
        usedIds,
        usedNames,
        usedInitials,
        isAllowedBestSellerCategory
    );
    if (soldDairy) bestsellerPreview.push(soldDairy);

    const soldDrink = pickOneFromGroup(
        source,
        beverageGroups,
        usedIds,
        usedNames,
        usedInitials,
        isAllowedBestSellerCategory
    );
    if (soldDrink) bestsellerPreview.push(soldDrink);

    const soldOther = pickOneFromGroup(
        source,
        otherGroups,
        usedIds,
        usedNames,
        usedInitials,
        isAllowedBestSellerCategory
    );
    if (soldOther) bestsellerPreview.push(soldOther);

    while (bestsellerPreview.length < 4) {
        const fallback = pickFallback(
            source,
            usedIds,
            usedNames,
            usedInitials,
            isAllowedBestSellerCategory
        );
        if (!fallback) break;
        bestsellerPreview.push(fallback);
    }

    return {
        popularPreview,
        bestsellerPreview,
    };
}

function SectionHeader(props: {
    title: string;
    to?: string;
    state?: Record<string, unknown>;
}) {
    return (
        <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[20px] font-semibold tracking-tight text-zinc-950">
                {props.title}
            </h2>

            {props.to ? (
                <Link
                    to={props.to}
                    state={props.state}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                >
                    Ver más
                    <span>→</span>
                </Link>
            ) : null}
        </div>
    );
}

function Heart({ active }: { active?: boolean }) {
    return (
        <div
            className={`grid h-8 w-8 place-items-center rounded-full border bg-white ${active
                ? "border-emerald-200 text-emerald-600"
                : "border-zinc-200 text-zinc-400"
                }`}
            aria-label="favorite"
        >
            ♥
        </div>
    );
}

function StoreCard(props: {
    store: Store;
    showFee?: boolean;
}) {
    const s = props.store;

    return (
        <Link
            to={`/store/${s.id}`}
            className="relative rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:-translate-y-[1px] hover:shadow-md"
        >
            <div className="absolute right-3 top-3">
                <Heart active={s.favorite} />
            </div>

            <div
                className={`grid h-20 place-items-center overflow-hidden rounded-2xl border border-zinc-200 ${s.name.toLowerCase() === "sirena" ? "bg-[#FFD84D]" : "bg-white"
                    }`}
            >
                <img
                    src={s.logoSrc}
                    alt={s.logoAlt}
                    className="h-full w-full object-contain"
                    draggable={false}
                />
            </div>

            <div className="mt-3">
                <div className="text-sm font-semibold leading-snug text-zinc-900">
                    Supermercado <br />
                    {s.name}
                </div>

                <div className="mt-1 text-xs text-zinc-500">{s.eta}</div>

                <div className="mt-2 flex items-center gap-2 text-xs text-zinc-600">
                    <span className="text-black">★</span>
                    <span className="font-semibold">{s.rating.toFixed(1)}</span>
                </div>

                {props.showFee && typeof s.deliveryFee === "number" && (
                    <div className="mt-3 text-lg font-semibold text-zinc-950">
                        ${s.deliveryFee.toFixed(2)}
                    </div>
                )}
            </div>
        </Link>
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
        <div className="relative rounded-3xl border border-zinc-200 bg-white p-3 shadow-sm transition hover:-translate-y-[1px] hover:shadow-md">
            <div className="absolute right-3 top-3">
                <Heart active={false} />
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

            <div className="mt-2 flex flex-col">
                <div className="line-clamp-3 text-[15px] font-semibold leading-[1.2] text-zinc-900">
                    {p.product_name}
                </div>

                <div className="mt-1 text-xs text-zinc-400">
                    {p.supermarket_name || p.category_name || "Producto"}
                </div>

                <div className="mt-0">
                    <div>
                        <div className="truncate text-[15px] font-semibold leading-none text-zinc-950">
                            {formatMoney(p.price, p.currency)}
                        </div>

                        {showStrike ? (
                            <div className="mt-[2px] truncate text-[10px] leading-none text-zinc-400 line-through">
                                {formatMoney(p.regular_price, p.currency)}
                            </div>
                        ) : (
                            <div className="mt-1 text-[0px] leading-none text-zinc-400">
                                &nbsp;
                            </div>
                        )}
                    </div>

                    <div className="mt-[2px] flex items-center justify-end">
                        {props.quantityInCart > 0 ? (
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={props.onDecrease}
                                    disabled={props.busy}
                                    className="grid h-[36px] w-[36px] place-items-center rounded-[14px] border border-zinc-200 bg-white text-[18px] font-bold leading-none text-zinc-800 disabled:opacity-50"
                                    aria-label="decrease"
                                >
                                    –
                                </button>

                                <div className="w-[18px] text-center text-sm font-semibold text-zinc-900">
                                    {props.quantityInCart}
                                </div>

                                <button
                                    type="button"
                                    onClick={props.onIncrease}
                                    disabled={props.busy}
                                    className="grid h-[36px] w-[36px] place-items-center rounded-[14px] bg-emerald-700 text-[18px] font-bold leading-none text-white disabled:opacity-50"
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
                                className="grid h-[36px] w-[36px] place-items-center rounded-[14px] bg-emerald-600 text-[22px] leading-none text-white shadow-sm disabled:opacity-50"
                                aria-label="add"
                            >
                                {props.busy ? "…" : "+"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function HomeSearchBar(props: { onOpen: () => void }) {
    function openFromGesture() {
        props.onOpen();
    }

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={openFromGesture}
            onTouchStart={openFromGesture}
            onPointerDown={openFromGesture}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openFromGesture();
                }
            }}
            className="flex w-full cursor-pointer items-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-zinc-300 active:scale-[0.998]"
            aria-label="Abrir búsqueda"
        >
            <span className="pointer-events-none text-zinc-400">
                <img src={findIcon} alt="Buscar" className="h-5 w-5 opacity-70" />
            </span>

            <span className="pointer-events-none ml-3 flex-1 truncate text-[16px] leading-normal text-zinc-400">
                ¿Qué te gustaría cocinar hoy?
            </span>
        </div>
    );
}

function HomeSearchOverlay(props: {
    open: boolean;
    onClose: () => void;
    onSubmit: (value: string) => void;
}) {
    const [q, setQ] = useState("");
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (!props.open) {
            setQ("");
            return;
        }

        const focusInput = () => {
            if (!inputRef.current) return;
            inputRef.current.focus({ preventScroll: true });
            inputRef.current.select();
        };

        focusInput();

        const t1 = window.setTimeout(focusInput, 20);
        const t2 = window.setTimeout(focusInput, 80);
        const t3 = window.setTimeout(focusInput, 180);
        const t4 = window.setTimeout(focusInput, 320);

        return () => {
            window.clearTimeout(t1);
            window.clearTimeout(t2);
            window.clearTimeout(t3);
            window.clearTimeout(t4);
        };
    }, [props.open]);

    useEffect(() => {
        if (!props.open) return;

        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = prev;
        };
    }, [props.open]);

    if (!props.open) return null;

    const suggestions = [
        "arroz",
        "leche",
        "pechuga de pollo",
        "quiero hacer un sancocho",
        "ingredientes para mofongo",
        "pasta y queso",
    ];

    return (
        <div className="fixed inset-0 z-[100] bg-white">
            <div className="mx-auto max-w-[430px] px-4 pb-6 pt-1">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        const value = q.trim();
                        if (!value) return;
                        props.onSubmit(value);
                    }}
                    className="sticky top-0 bg-white pb-2 pt-1"
                >
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={props.onClose}
                            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-xl text-zinc-700 transition hover:bg-zinc-50"
                            aria-label="Volver"
                        >
                            ←
                        </button>

                        <div className="flex flex-1 items-center gap-3 rounded-[22px] border border-zinc-200 bg-white px-4 py-3 shadow-sm transition focus-within:border-emerald-600 focus-within:ring-4 focus-within:ring-emerald-100">
                            <span className="text-xl leading-none text-zinc-400">⌕</span>
                            <input
                                ref={inputRef}
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="Buscar productos o recetas"
                                className="w-full bg-transparent text-[16px] leading-normal outline-none placeholder:text-[14px] placeholder:text-zinc-400"
                                enterKeyHint="search"
                                autoCapitalize="sentences"
                                autoCorrect="on"
                                spellCheck
                            />
                        </div>
                    </div>
                </form>

                <div className="space-y-3">
                    <div className="text-sm font-semibold text-zinc-800">Sugerencias</div>

                    <div className="flex flex-wrap gap-2">
                        {suggestions.map((item) => (
                            <button
                                key={item}
                                type="button"
                                onClick={() => props.onSubmit(item)}
                                className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                            >
                                {item}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function PromoBanner() {
    return (
        <section className="rounded-3xl overflow-hidden border border-emerald-100 shadow-sm">
            <img
                src={markitPlusBanner}
                alt="Markit Plus"
                className="w-full h-full object-cover"
                loading="lazy"
                draggable={false}
            />
        </section>
    );
}

export default function Home() {
    const navigate = useNavigate();

    const [addressPickerOpen, setAddressPickerOpen] = useState(false);
    const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
    const [activeAddress, setActiveAddress] = useState<Address | null>(null);
    const [supermarkets, setSupermarkets] = useState<SupermarketApiItem[]>([]);
    const [popularProducts, setPopularProducts] = useState<PopularProduct[]>([]);
    const [bestSellingProducts, setBestSellingProducts] = useState<PopularProduct[]>(
        []
    );
    const [allShowcaseProducts, setAllShowcaseProducts] = useState<PopularProduct[]>(
        []
    );
    const [homeErr, setHomeErr] = useState<string | null>(null);
    const [me, setMe] = useState<MeResponse | null>(null);

    const [cartMap, setCartMap] = useState<
        Record<number, { cart_item_id: number; quantity: number }>
    >({});
    const [busyProductId, setBusyProductId] = useState<number | null>(null);

    const firstName = useMemo(() => getFirstNameFromMe(me), [me]);

    async function refreshCart() {
        if (!isLoggedIn()) {
            setCartMap({});
            return;
        }

        try {
            const cart = await apiGet<CartResponse>("/cart");
            const next: Record<number, { cart_item_id: number; quantity: number }> =
                {};

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
        let active = true;

        (async () => {
            if (!isLoggedIn()) {
                if (active) setMe(null);
                return;
            }

            try {
                const data = await apiGetCached<MeResponse>("/auth/me", { ttlMs: 1000 * 60 * 10 });
                if (!active) return;
                setMe(data);
            } catch {
                if (!active) return;
                setMe(null);
            }
        })();

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const list = await apiGetCached<Address[]>("/addresses", { ttlMs: 1000 * 60 * 10 });
                const chosen = pickActiveAddress(list);
                if (chosen) {
                    setActiveAddress(chosen);
                    setStoredActiveAddressId(chosen.id);
                }
            } catch {
                // ignore
            }
        })();
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const rows = await apiGetCached<SupermarketApiItem[]>("/supermarkets", {
                    ttlMs: 1000 * 60 * 30,
                });
                setSupermarkets(rows ?? []);
            } catch {
                // ignore
            }
        })();
    }, []);

    useEffect(() => {
        (async () => {
            const nacionalId = Number(findMarketIdByName(supermarkets, "nacional"));
            const sirenaId = Number(findMarketIdByName(supermarkets, "sirena"));

            if (!nacionalId && !sirenaId) return;

            try {
                setHomeErr(null);
                
                const [nacionalRes, sirenaRes] = await Promise.all([
                    nacionalId
                        ? apiGetCached<PopularProductsResponse>(
                            `/supermarkets/${nacionalId}/popular-products?limit=60`,
                            { ttlMs: 1000 * 60 * 10 }
                        )
                        : Promise.resolve({ supermarket_id: 0, limit: 0, items: [] }),
                    sirenaId
                        ? apiGetCached<PopularProductsResponse>(
                            `/supermarkets/${sirenaId}/popular-products?limit=60`,
                            { ttlMs: 1000 * 60 * 10 }
                        )
                        : Promise.resolve({ supermarket_id: 0, limit: 0, items: [] }),
                ]);

                const mixed = uniqueByProductId([
                    ...attachStoreName(nacionalRes.items ?? [], nacionalId, "Nacional"),
                    ...attachStoreName(sirenaRes.items ?? [], sirenaId, "Sirena"),
                ]);

                const collections = buildFakeHomeCollections(mixed);

                setAllShowcaseProducts(mixed);
                setPopularProducts(collections.popularPreview);
                setBestSellingProducts(collections.bestsellerPreview);

                await refreshCart();
            } catch (e: any) {
                setHomeErr(e?.message ?? "No pude cargar productos destacados");
            }
        })();
    }, [supermarkets]);

    const stores = useMemo<Store[]>(() => {
        const nacionalId = findMarketIdByName(supermarkets, "nacional");
        const sirenaId = findMarketIdByName(supermarkets, "sirena");

        const items: Store[] = [
            {
                id: nacionalId || "1",
                name: "Nacional",
                eta: "40–60 min",
                rating: 4.7,
                favorite: false,
                logoSrc: nacionalWide || nacionalSquare,
                logoAlt: "Supermercado Nacional",
            },
            {
                id: sirenaId || "2",
                name: "Sirena",
                eta: "50–75 min",
                rating: 4.7,
                favorite: true,
                logoSrc: sirenaWide,
                logoAlt: "Supermercado Sirena",
            },
        ];

        return items.filter((x) => x.id);
    }, [supermarkets]);

    async function addToCart(supermarket_product_id: number) {
        if (!isLoggedIn()) {
            navigate("/login");
            return;
        }

        try {
            setBusyProductId(supermarket_product_id);
            setHomeErr(null);

            await apiPost("/cart/items", {
                supermarket_product_id,
                quantity: 1,
            });

            await refreshCart();
        } catch (e: any) {
            setHomeErr(e?.message ?? "No pude agregar al carrito");
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
            setHomeErr(null);

            await apiPatch(`/cart/items/${current.cart_item_id}`, {
                quantity: current.quantity + 1,
            });

            await refreshCart();
        } catch (e: any) {
            setHomeErr(e?.message ?? "No pude actualizar el carrito");
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
            setHomeErr(null);

            if (current.quantity <= 1) {
                await apiDelete(`/cart/items/${current.cart_item_id}`);
            } else {
                await apiPatch(`/cart/items/${current.cart_item_id}`, {
                    quantity: current.quantity - 1,
                });
            }

            await refreshCart();
        } catch (e: any) {
            setHomeErr(e?.message ?? "No pude actualizar el carrito");
        } finally {
            setBusyProductId(null);
        }
    }

    const buttonText = getAddressButtonText(activeAddress);
    const detailText = activeAddress ? buildLongAddress(activeAddress) : "";

    return (
        <>
            <div className="space-y-6">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <img
                            src={avatarImg}
                            alt="User avatar"
                            className="h-[68px] w-[68px] rounded-full object-cover"
                            draggable={false}
                        />

                        <div className="leading-tight">
                            <div className="text-sm font-semibold text-zinc-600">
                                Hola {firstName}
                            </div>
                            <div className="text-xl font-semibold text-emerald-700">
                                ¡Vamos de compras!
                            </div>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => setAddressPickerOpen(true)}
                        className="inline-flex max-w-[170px] items-center gap-2 rounded-full border border-emerald-200 bg-white px-4 py-2 text-left text-sm font-semibold text-emerald-700 shadow-sm"
                        aria-label="Choose address"
                        title={detailText || buttonText}
                    >
                        <img src={mapPinIcon} alt="Map" className="h-5 w-5 shrink-0" />
                        <span className="truncate">{buttonText}</span>
                    </button>
                </div>

                <HomeSearchBar onOpen={() => setSearchOverlayOpen(true)} />
                <PromoBanner />

                {homeErr && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {homeErr}
                    </div>
                )}

                <section>
                    <SectionHeader title="Supermercados" />
                    <div className="grid grid-cols-2 gap-4">
                        {stores[0] ? <StoreCard store={stores[0]} /> : null}
                        {stores[1] ? <StoreCard store={stores[1]} showFee /> : null}
                    </div>
                </section>

                <section>
                    <SectionHeader
                        title="Más populares"
                        to="/home/collection/populares"
                        state={{
                            title: "Más populares",
                            kind: "populares",
                            items: allShowcaseProducts,
                        }}
                    />
                    <div className="grid grid-cols-2 gap-4">
                        {popularProducts.map((p) => {
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
                </section>

                <section>
                    <SectionHeader
                        title="Más vendidos"
                        to="/home/collection/vendidos"
                        state={{
                            title: "Más vendidos",
                            kind: "vendidos",
                            items: allShowcaseProducts,
                        }}
                    />
                    <div className="grid grid-cols-2 gap-4">
                        {bestSellingProducts.map((p) => {
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
                </section>
            </div>

            <HomeSearchOverlay
                open={searchOverlayOpen}
                onClose={() => setSearchOverlayOpen(false)}
                onSubmit={(value) => {
                    navigate(`/search?q=${encodeURIComponent(value)}`);
                }}
            />

            <AddressPickerSheet
                open={addressPickerOpen}
                onClose={() => setAddressPickerOpen(false)}
                onSelect={(address) => {
                    setActiveAddress(address);
                    setStoredActiveAddressId(address.id);
                }}
            />
        </>
    );
}