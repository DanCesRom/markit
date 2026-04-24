import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { apiDelete, apiGet, apiPatch, apiPost } from "../lib/api";

type SearchOption = {
    product: string;
    supermarket: string;
    supermarket_id: number;
    supermarket_product_id: number;
    unit_price: string;
    currency: string;
    in_stock: boolean;
    stock_qty: number | null;
    requested_qty: string;
    purchase_qty: string;
    qty: string;
    line_total: string;
    image_url?: string;
    pricing_mode?: "weighted" | "unit" | "package";
    purchase_note?: string | null;
};

type SearchSuggestion = {
    original: string;
    corrected: string;
};

type NormalSearchItem = {
    query: string;
    qty: string;
    options: SearchOption[];
    best_option: SearchOption | null;
};

type NormalSearchResponse = {
    intent: "search" | "add_to_cart" | "best_price";
    preferences: {
        cheapest: boolean;
        delivery: boolean;
        pickup: boolean;
    };
    raw: string;
    items: NormalSearchItem[];
    estimated_total_best: string;
    recipe: null;
};

type RecipeItem = {
    ingredient_key: string;
    ingredient_name: string;
    query: string;
    qty: string;
    required: boolean;
    selected_option: SearchOption | null;
    alternatives: SearchOption[];
    found: boolean;
};

type RecipeSearchResponse = {
    intent: "recipe";
    preferences: {
        cheapest: boolean;
        delivery: boolean;
        pickup: boolean;
    };
    raw: string;
    recipe: {
        name: string;
        servings: number;
        source: string;
        needs_confirmation: boolean;
    };
    summary: {
        ingredients_total: number;
        ingredients_found: number;
        ingredients_missing: number;
        estimated_total: string;
    };
    items: RecipeItem[];
};

type RecipeAddToCartResponse = {
    recipe_name: string;
    servings: number;
    added: Array<{
        ingredient_key: string;
        ingredient_name: string;
        qty: string;
        supermarket_product_id: number;
        product: string;
        supermarket: string;
        unit_price: string;
        currency: string;
        line_total: string;
    }>;
    estimated_total_added: string;
};

type SmartSearchRecipeResponse = {
    mode: "recipe";
    suggestion?: SearchSuggestion | null;
    data: RecipeSearchResponse;
};

type SmartSearchNormalResponse = {
    mode: "normal";
    suggestion?: SearchSuggestion | null;
    data: NormalSearchResponse;
};

type SmartSearchResponse = SmartSearchRecipeResponse | SmartSearchNormalResponse;

type SearchMode =
    | "idle"
    | "loading"
    | "normal"
    | "recipe"
    | "empty"
    | "error";

type RecipeSelectionsState = Record<string, number>;
type RemovedRecipeItemsState = Record<string, boolean>;

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


function formatMoney(v?: string | number) {
    const n = typeof v === "number" ? v : Number(v ?? 0);
    return `RD$ ${Number.isFinite(n) ? n.toFixed(2) : "0.00"}`;
}

function toNumber(v?: string | number) {
    const n = typeof v === "number" ? v : Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
}

function formatNeededQty(rawQty: string, name?: string) {
    const qty = toNumber(rawQty);
    const lowered = (name ?? "").toLowerCase();

    if (!qty) return "Cantidad variable";

    if (
        lowered.includes("plátano") ||
        lowered.includes("platano") ||
        lowered.includes("mazorca") ||
        lowered.includes("cebolla") ||
        lowered.includes("ajo") ||
        lowered.includes("ají") ||
        lowered.includes("aji")
    ) {
        const rounded = Math.max(1, Math.round(qty));
        return `${rounded} ${rounded === 1 ? "unidad" : "unidades"}`;
    }

    if (qty < 1) return `${qty.toFixed(2)} lb aprox.`;
    return `${qty.toFixed(2)} lb`;
}

function formatPurchaseQty(option: SearchOption) {
    const purchaseQty = toNumber(option.purchase_qty || option.qty);
    const pricingMode = option.pricing_mode ?? "weighted";

    if (option.purchase_note?.trim()) return option.purchase_note;

    // 🔑 AQUÍ SE RESPETA TU REGLA:
    // si es paquete, SIEMPRE compra completo aunque necesite menos
    if (pricingMode === "package") return "Se comprará 1 presentación completa";

    if (pricingMode === "unit") {
        const rounded = Math.max(1, Math.round(purchaseQty));
        return `Se comprarán ${rounded} ${rounded === 1 ? "unidad" : "unidades"}`;
    }

    return `Se comprará ${purchaseQty.toFixed(2)} lb aprox.`;
}

function buildOptionCaption(option: SearchOption) {
    const pricingMode = option.pricing_mode ?? "weighted";
    const purchaseQty = toNumber(option.purchase_qty || option.qty);

    if (pricingMode === "package") return "Presentación completa";

    if (pricingMode === "unit") {
        const rounded = Math.max(1, Math.round(purchaseQty));
        return `${rounded} ${rounded === 1 ? "unidad" : "unidades"}`;
    }

    return `${purchaseQty.toFixed(2)} lb`;
}

function shortSupermarket(name?: string) {
    return name?.trim() || "Supermercado";
}

function getPreviewLabel(productName: string) {
    const cleaned = productName
        .replace(/\([^)]*\)/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const parts = cleaned.split(" ");
    if (parts.length <= 3) return cleaned;
    return parts.slice(0, 3).join(" ");
}

function looksLikeRecipeQuery(text: string) {
    const value = text.toLowerCase();
    return [
        "receta",
        "quiero hacer",
        "quiero cocinar",
        "cómo hacer",
        "como hacer",
        "cocinar",
        "sancocho",
        "mangú",
        "mangu",
        "mofongo",
        "lasaña",
        "pastelón",
        "pastelon",
        "asopao",
        "locro",
        "moro",
    ].some((x) => value.includes(x));
}


function SearchTopBar(props: {
    value: string;
    onChange: (v: string) => void;
    onSubmit: () => void;
    onBack: () => void;
    loading: boolean;
    autoFocus?: boolean;
}) {
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (!props.autoFocus) return;

        const focusInput = () => {
            if (!inputRef.current) return;
            inputRef.current.focus({ preventScroll: true });
            inputRef.current.select();
        };

        focusInput();

        const t1 = window.setTimeout(focusInput, 30);
        const t2 = window.setTimeout(focusInput, 120);
        const t3 = window.setTimeout(focusInput, 260);

        return () => {
            window.clearTimeout(t1);
            window.clearTimeout(t2);
            window.clearTimeout(t3);
        };
    }, [props.autoFocus]);

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                props.onSubmit();
            }}
            className="sticky top-0 z-30 -mx-4 border-b border-zinc-100 bg-white px-4 pb-2 pt-1"
        >
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    onClick={props.onBack}
                    className="grid h-10 w-10 place-items-center rounded-full text-xl text-zinc-700 hover:bg-zinc-50"
                >
                    ←
                </button>

                <div className="flex flex-1 items-center gap-3 rounded-[22px] border border-zinc-200 px-4 py-3 shadow-sm focus-within:border-emerald-600 focus-within:ring-4 focus-within:ring-emerald-100">
                    <span className="text-xl text-zinc-400">⌕</span>
                    <input
                        ref={inputRef}
                        value={props.value}
                        onChange={(e) => props.onChange(e.target.value)}
                        placeholder="Buscar productos o recetas"
                        className="w-full bg-transparent outline-none"
                    />
                </div>
            </div>
        </form>
    );
}

function ProductImage(props: { src?: string; alt: string; size?: string }) {
    return (
        <div className={`grid place-items-center rounded-[22px] border bg-white ${props.size ?? "h-20 w-20"}`}>
            {props.src ? (
                <img src={props.src} alt={props.alt} className="object-contain p-2" />
            ) : (
                <span>🛒</span>
            )}
        </div>
    );
}

function SearchSectionHeader(props: {
    title: string;
    subtitle?: string;
    badge?: string;
}) {
    return (
        <div>
            <div className="text-[30px] font-semibold">{props.title}</div>
            {props.subtitle && (
                <div className="text-sm text-zinc-500 mt-1">{props.subtitle}</div>
            )}
        </div>
    );
}

function SearchLoadingState() {
    return (
        <div className="rounded-[28px] border p-5">
            <div className="text-sm text-zinc-500">Buscando...</div>
        </div>
    );
}

function QuickSuggestions(props: { onPick: (value: string) => void }) {
    const items = ["arroz", "leche", "pollo", "sancocho"];

    return (
        <div className="flex flex-wrap gap-2">
            {items.map((item) => (
                <button
                    key={item}
                    onClick={() => props.onPick(item)}
                    className="border px-3 py-1 rounded-full text-sm"
                >
                    {item}
                </button>
            ))}
        </div>
    );
}

function AlternativePreview(props: {
    option: SearchOption;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={props.onClick}
            className={`w-[132px] shrink-0 snap-start rounded-[22px] border p-2.5 text-left transition ${props.active
                ? "border-emerald-600 bg-emerald-50 shadow-sm"
                : "border-zinc-200 bg-white hover:border-zinc-300"
                }`}
        >
            <div className="relative">
                <ProductImage
                    src={props.option.image_url}
                    alt={props.option.product}
                    size="h-24 w-full"
                />

                <div
                    className={`absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full border text-[10px] font-bold ${props.active
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : "border-zinc-300 bg-white text-transparent"
                        }`}
                >
                    ✓
                </div>
            </div>

            <div className="mt-3 line-clamp-2 min-h-[34px] text-[12px] font-semibold leading-4 text-zinc-900">
                {getPreviewLabel(props.option.product)}
            </div>

            <div className="mt-1 text-[11px] text-zinc-500">
                {shortSupermarket(props.option.supermarket)}
            </div>

            <div className="mt-1 text-[11px] text-zinc-500">
                {buildOptionCaption(props.option)}
            </div>

            <div className="mt-2 text-sm font-semibold text-zinc-950">
                {formatMoney(props.option.line_total)}
            </div>
        </button>
    );
}

function CartQtyControl(props: {
    quantity: number;
    busy: boolean;
    onIncrease: () => void;
    onDecrease: () => void;
}) {
    return (
        <div className="flex items-center gap-2">
            <button
                type="button"
                disabled={props.busy}
                onClick={props.onDecrease}
                className="grid h-10 w-10 place-items-center rounded-full border border-zinc-200 bg-white text-lg font-bold text-zinc-800 disabled:opacity-60"
            >
                –
            </button>

            <div className="min-w-[30px] text-center text-sm font-semibold text-zinc-950">
                {props.quantity}
            </div>

            <button
                type="button"
                disabled={props.busy}
                onClick={props.onIncrease}
                className="grid h-10 w-10 place-items-center rounded-full bg-emerald-700 text-lg font-bold text-white disabled:opacity-60"
            >
                +
            </button>
        </div>
    );
}

function NormalResultCard(props: {
    item: NormalSearchItem;
    onAdd: (option: SearchOption) => void;
    onIncrease: (option: SearchOption) => void;
    onDecrease: (option: SearchOption) => void;
    getCartQuantity: (supermarketProductId: number) => number;
    addingProductId: number | null;
}) {
    const [open, setOpen] = useState(false);
    const best = props.item.best_option;

    if (!best) return null;

    const bestQty = props.getCartQuantity(best.supermarket_product_id);
    const bestBusy = props.addingProductId === best.supermarket_product_id;

    return (
        <div className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-sm">
            <div className="p-4">
                <div className="flex gap-3">
                    <ProductImage src={best.image_url} alt={best.product} size="h-24 w-24" />

                    <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                            {props.item.query}
                        </div>

                        <div className="mt-1 line-clamp-2 text-[18px] font-semibold leading-tight text-zinc-950">
                            {best.product}
                        </div>

                        <div className="mt-1 text-sm text-zinc-500">
                            {shortSupermarket(best.supermarket)}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-zinc-100 px-3 py-1 text-[11px] font-medium text-zinc-600">
                                {buildOptionCaption(best)}
                            </span>

                            {!best.in_stock && (
                                <span className="rounded-full bg-red-50 px-3 py-1 text-[11px] font-medium text-red-600">
                                    Sin stock
                                </span>
                            )}
                        </div>

                        <div className="mt-4 flex items-end justify-between gap-3">
                            <div>
                                <div className="text-[30px] font-semibold leading-none text-zinc-950">
                                    {formatMoney(best.line_total)}
                                </div>
                                <div className="mt-1 text-xs text-zinc-500">
                                    Selección recomendada
                                </div>
                            </div>

                            {bestQty > 0 ? (
                                <CartQtyControl
                                    quantity={bestQty}
                                    busy={bestBusy}
                                    onIncrease={() => props.onIncrease(best)}
                                    onDecrease={() => props.onDecrease(best)}
                                />
                            ) : (
                                <button
                                    type="button"
                                    disabled={bestBusy}
                                    onClick={() => props.onAdd(best)}
                                    className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
                                >
                                    {bestBusy ? "Agregando..." : "Agregar"}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {props.item.options.length > 1 && (
                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        className="mt-4 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                    >
                        {open ? "Ocultar opciones" : "Ver otras opciones"}
                        <span className={`transition ${open ? "rotate-180" : ""}`}>⌄</span>
                    </button>
                )}
            </div>

            {open && props.item.options.length > 1 && (
                <div className="border-t border-zinc-100 bg-zinc-50/80 p-3">
                    <div className="mb-3 text-sm font-semibold text-zinc-800">
                        Más opciones para este producto
                    </div>

                    <div className="space-y-2">
                        {props.item.options.slice(0, 6).map((opt) => {
                            const qty = props.getCartQuantity(opt.supermarket_product_id);
                            const busy = props.addingProductId === opt.supermarket_product_id;

                            return (
                                <div
                                    key={`${opt.supermarket_id}-${opt.supermarket_product_id}`}
                                    className="flex items-center gap-3 rounded-[22px] border border-zinc-200 bg-white px-3 py-3"
                                >
                                    <ProductImage
                                        src={opt.image_url}
                                        alt={opt.product}
                                        size="h-16 w-16"
                                    />

                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-semibold text-zinc-900">
                                            {opt.product}
                                        </div>
                                        <div className="text-xs text-zinc-500">
                                            {shortSupermarket(opt.supermarket)}
                                        </div>
                                        <div className="mt-1 text-[11px] text-zinc-500">
                                            {buildOptionCaption(opt)}
                                        </div>
                                    </div>

                                    <div className="text-right">
                                        <div className="text-sm font-semibold text-zinc-950">
                                            {formatMoney(opt.line_total)}
                                        </div>

                                        <div className="mt-2 flex justify-end">
                                            {qty > 0 ? (
                                                <CartQtyControl
                                                    quantity={qty}
                                                    busy={busy}
                                                    onIncrease={() => props.onIncrease(opt)}
                                                    onDecrease={() => props.onDecrease(opt)}
                                                />
                                            ) : (
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => props.onAdd(opt)}
                                                    className="rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                                                >
                                                    {busy ? "..." : "Agregar"}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

function RecipeIngredientCard(props: {
    item: RecipeItem;
    selectedProductId: number | null;
    onSelect: (ingredientKey: string, supermarketProductId: number) => void;
    onRemove: (ingredientKey: string) => void;
}) {
    const [open, setOpen] = useState(false);

    const options = props.item.alternatives?.length
        ? props.item.alternatives
        : props.item.selected_option
            ? [props.item.selected_option]
            : [];

    const selected =
        options.find((x) => x.supermarket_product_id === props.selectedProductId) ??
        props.item.selected_option ??
        null;

    if (!selected) return null;

    return (
        <div className="overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-sm">
            <div className="p-4">
                <div className="flex gap-3">
                    <ProductImage
                        src={selected.image_url}
                        alt={selected.product}
                        size="h-24 w-24"
                    />

                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="text-[19px] font-semibold leading-tight text-zinc-950">
                                {props.item.ingredient_name}
                            </div>

                            {props.item.required ? (
                                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                                    Requerido
                                </span>
                            ) : (
                                <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-500">
                                    Opcional
                                </span>
                            )}
                        </div>

                        <div className="mt-2 text-sm text-zinc-500">
                            Necesitas:{" "}
                            <span className="font-medium text-zinc-700">
                                {formatNeededQty(props.item.qty, props.item.ingredient_name)}
                            </span>
                        </div>

                        <div className="mt-2.5 inline-block max-w-full rounded-[20px] border border-zinc-200 bg-zinc-50 px-3 py-2.5">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-zinc-500">
                                Selección actual
                            </div>

                            <div className="mt-1 line-clamp-2 text-[15px] font-semibold leading-5 text-zinc-950">
                                {selected.product}
                            </div>

                            <div className="mt-1 text-[13px] text-zinc-500">
                                {shortSupermarket(selected.supermarket)}
                            </div>

                            <div className="mt-2.5">
                                <div className="text-[24px] font-semibold leading-none text-zinc-950">
                                    {formatMoney(selected.line_total)}
                                </div>
                                <div className="mt-1 text-[11px] leading-4 text-zinc-500">
                                    {formatPurchaseQty(selected)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                    <div>
                        {options.length > 1 && (
                            <button
                                type="button"
                                onClick={() => setOpen((v) => !v)}
                                className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                            >
                                {open ? "Ocultar opciones" : "Ver otras opciones"}
                                <span className={`transition ${open ? "rotate-180" : ""}`}>
                                    ⌄
                                </span>
                            </button>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={() => props.onRemove(props.item.ingredient_key)}
                        className="inline-flex items-center justify-center rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-100"
                        aria-label={`Eliminar ${props.item.ingredient_name}`}
                    >
                        Eliminar
                    </button>
                </div>

                {open && options.length > 1 && (
                    <div className="mt-4">
                        <div className="mb-2 text-sm font-semibold text-zinc-800">
                            Otras opciones
                        </div>

                        <div className="overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            <div className="flex snap-x gap-3">
                                {options.slice(0, 8).map((opt) => {
                                    const active =
                                        opt.supermarket_product_id === selected.supermarket_product_id;

                                    return (
                                        <AlternativePreview
                                            key={`${opt.supermarket_id}-${opt.supermarket_product_id}-preview`}
                                            option={opt}
                                            active={active}
                                            onClick={() => {
                                                props.onSelect(
                                                    props.item.ingredient_key,
                                                    opt.supermarket_product_id
                                                );
                                                setOpen(false);
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function RecipeSummaryCard(props: {
    recipeName: string;
    servings: number;
    ingredientsFound: number;
    ingredientsTotal: number;
    missingCount: number;
    selectedRecipeCount: number;
    recipeTotal: string;
    addingRecipe: boolean;
    onAdd: () => void;
    ctaRef?: React.RefObject<HTMLButtonElement | null>;
}) {
    return (
        <div className="overflow-hidden rounded-[30px] border border-emerald-100 bg-white shadow-sm">
            <div className="bg-gradient-to-br from-emerald-50 via-white to-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="text-[30px] font-semibold leading-none text-zinc-950">
                            {props.recipeName}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                                {props.servings} porciones
                            </span>

                            <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-600">
                                {props.ingredientsFound} de {props.ingredientsTotal} encontrados
                            </span>

                            {props.missingCount > 0 && (
                                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700">
                                    {props.missingCount} pendientes
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="text-left sm:text-right">
                        <div className="text-sm text-zinc-500">Total estimado</div>
                        <div className="mt-1 text-[32px] font-semibold leading-none text-emerald-700">
                            {props.recipeTotal}
                        </div>
                    </div>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-[22px] border border-zinc-200 bg-white p-3">
                        <div className="text-xs text-zinc-500">Ingredientes listos</div>
                        <div className="mt-1 text-xl font-semibold text-zinc-950">
                            {props.selectedRecipeCount}
                        </div>
                    </div>

                    <div className="rounded-[22px] border border-zinc-200 bg-white p-3">
                        <div className="text-xs text-zinc-500">Faltantes</div>
                        <div className="mt-1 text-xl font-semibold text-zinc-950">
                            {Math.max(0, props.missingCount)}
                        </div>
                    </div>
                </div>

                <button
                    ref={props.ctaRef}
                    type="button"
                    disabled={props.addingRecipe || props.selectedRecipeCount === 0}
                    onClick={props.onAdd}
                    className="mt-5 w-full rounded-full bg-emerald-700 px-5 py-4 text-base font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
                >
                    {props.addingRecipe
                        ? "Agregando..."
                        : "Agregar selección al carrito"}
                </button>
            </div>
        </div>
    );
}

function FloatingRecipeBar(props: {
    visible: boolean;
    recipeName: string;
    total: string;
    count: number;
    disabled: boolean;
    loading: boolean;
    onClick: () => void;
}) {
    if (!props.visible) return null;

    return (
        <div className="fixed bottom-14 left-0 right-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur">
            <div className="mx-auto max-w-[430px] px-4 py-3">
                <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 px-4 py-3 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-zinc-950">
                                {props.recipeName}
                            </div>
                            <div className="mt-1 text-xs text-zinc-500">
                                {props.count} ingredientes seleccionados · {props.total}
                            </div>
                        </div>

                        <button
                            type="button"
                            disabled={props.disabled || props.loading}
                            onClick={props.onClick}
                            className="shrink-0 rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                        >
                            {props.loading ? "..." : "Agregar"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function SearchEmptyState(props: { title: string; message: string }) {
    return (
        <div className="flex min-h-[calc(100dvh-210px)] items-center justify-center px-6">
            <div className="w-full max-w-[280px] text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center text-zinc-400">
                    <svg
                        viewBox="0 0 64 64"
                        className="h-16 w-16"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden="true"
                    >
                        <circle
                            cx="27"
                            cy="27"
                            r="14"
                            stroke="currentColor"
                            strokeWidth="3"
                        />
                        <path
                            d="M38 38L50 50"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                        />
                        <path
                            d="M22.5 31.5C23.7 29.9 25.4 29 27.1 29C28.8 29 30.5 29.9 31.7 31.5"
                            stroke="currentColor"
                            strokeWidth="2.6"
                            strokeLinecap="round"
                        />
                        <circle cx="22.5" cy="23.5" r="1.8" fill="currentColor" />
                        <circle cx="31.5" cy="23.5" r="1.8" fill="currentColor" />
                    </svg>
                </div>

                <div className="mt-4 text-[24px] font-semibold leading-tight text-zinc-800">
                    {props.title}
                </div>

                <div className="mt-3 text-[13px] leading-5 text-zinc-500">
                    {props.message}
                </div>
            </div>
        </div>
    );
}

export default function Search() {
    const navigate = useNavigate();
    const location = useLocation();
    const [params] = useSearchParams();

    const initialQ = (params.get("q") ?? "").trim();
    const isOverlay = params.get("overlay") === "1";

    const [q, setQ] = useState(initialQ);
    const [mode, setMode] = useState<SearchMode>(initialQ ? "loading" : "idle");
    const [error, setError] = useState("");

    const [normalData, setNormalData] = useState<NormalSearchResponse | null>(null);
    const [recipeData, setRecipeData] = useState<RecipeSearchResponse | null>(null);
    const [suggestion, setSuggestion] = useState<SearchSuggestion | null>(null);

    const [recipeSelections, setRecipeSelections] = useState<RecipeSelectionsState>({});
    const [removedRecipeItems, setRemovedRecipeItems] =
        useState<RemovedRecipeItemsState>({});

    const [addingRecipe, setAddingRecipe] = useState(false);
    const [addingProductId, setAddingProductId] = useState<number | null>(null);
    const [showFloatingRecipeBar, setShowFloatingRecipeBar] = useState(false);

    const [cartMap, setCartMap] = useState<
        Record<number, { cart_item_id: number; quantity: number }>
    >({});

    const recipePrimaryCtaRef = useRef<HTMLButtonElement | null>(null);

    function buildSearchUrl(text: string) {
        const qs = new URLSearchParams();
        if (isOverlay) qs.set("overlay", "1");
        if (text.trim()) qs.set("q", text.trim());
        return `/search?${qs.toString()}`;
    }

    function handleBack() {
        if (location.key !== "default") {
            navigate(-1);
            return;
        }

        navigate("/");
    }

    function getCartQuantity(supermarketProductId: number) {
        return cartMap[supermarketProductId]?.quantity ?? 0;
    }

    async function refreshCart() {
        try {
            const cart = await apiGet<CartResponse>("/cart");
            const next: Record<number, { cart_item_id: number; quantity: number }> = {};

            for (const group of cart.supermarkets ?? []) {
                for (const item of group.items ?? []) {
                    next[item.supermarket_product_id] = {
                        cart_item_id: item.cart_item_id,
                        quantity: toNumber(item.quantity),
                    };
                }
            }

            setCartMap(next);
        } catch {
            setCartMap({});
        }
    }

    async function addSingleProduct(option: SearchOption) {
        setAddingProductId(option.supermarket_product_id);

        try {
            await apiPost("/cart/items", {
                supermarket_product_id: option.supermarket_product_id,
                quantity: option.purchase_qty || option.qty,
            });

            await refreshCart();
        } catch (e: any) {
            setError(e?.message ?? "No pude agregar el producto al carrito");
            setMode("error");
        } finally {
            setAddingProductId(null);
        }
    }

    async function increaseSingleProduct(option: SearchOption) {
        const current = cartMap[option.supermarket_product_id];

        if (!current) {
            await addSingleProduct(option);
            return;
        }

        const step = toNumber(option.purchase_qty || option.qty || 1);

        setAddingProductId(option.supermarket_product_id);

        try {
            await apiPatch(`/cart/items/${current.cart_item_id}`, {
                quantity: current.quantity + step,
            });

            await refreshCart();
        } catch (e: any) {
            setError(e?.message ?? "No pude actualizar el carrito");
            setMode("error");
        } finally {
            setAddingProductId(null);
        }
    }

    async function decreaseSingleProduct(option: SearchOption) {
        const current = cartMap[option.supermarket_product_id];
        if (!current) return;

        const step = toNumber(option.purchase_qty || option.qty || 1);
        const nextQty = current.quantity - step;

        setAddingProductId(option.supermarket_product_id);

        try {
            if (nextQty <= 0) {
                await apiDelete(`/cart/items/${current.cart_item_id}`);
            } else {
                await apiPatch(`/cart/items/${current.cart_item_id}`, {
                    quantity: nextQty,
                });
            }

            await refreshCart();
        } catch (e: any) {
            setError(e?.message ?? "No pude actualizar el carrito");
            setMode("error");
        } finally {
            setAddingProductId(null);
        }
    }

    function removeRecipeIngredient(ingredientKey: string) {
        setRemovedRecipeItems((prev) => ({
            ...prev,
            [ingredientKey]: true,
        }));

        setRecipeSelections((prev) => {
            const next = { ...prev };
            delete next[ingredientKey];
            return next;
        });
    }

    function getActiveRecipeItems() {
        if (!recipeData) return [];

        return recipeData.items.filter(
            (item) => !removedRecipeItems[item.ingredient_key]
        );
    }

    function getSelectedOptionForRecipeItem(item: RecipeItem) {
        const options =
            item.alternatives?.length
                ? item.alternatives
                : item.selected_option
                    ? [item.selected_option]
                    : [];

        const selectedId =
            recipeSelections[item.ingredient_key] ??
            item.selected_option?.supermarket_product_id ??
            null;

        return (
            options.find((opt) => opt.supermarket_product_id === selectedId) ??
            item.selected_option ??
            null
        );
    }

    function buildRecipeSelectionsPayload() {
        if (!recipeData) return [];

        return getActiveRecipeItems()
            .map((item) => {
                const selected = getSelectedOptionForRecipeItem(item);
                if (!selected) return null;

                return {
                    ingredient_key: item.ingredient_key,
                    ingredient_name: item.ingredient_name,
                    qty: selected.purchase_qty || selected.qty || item.qty,
                    supermarket_product_id: selected.supermarket_product_id,
                };
            })
            .filter(Boolean) as Array<{
                ingredient_key: string;
                ingredient_name: string;
                qty: string;
                supermarket_product_id: number;
            }>;
    }

    async function handleAddSelectedRecipeToCart() {
        if (!recipeData) return;

        const selections = buildRecipeSelectionsPayload();

        if (!selections.length) {
            setError("No hay ingredientes seleccionados para agregar");
            setMode("error");
            return;
        }

        setAddingRecipe(true);

        try {
            await apiPost<RecipeAddToCartResponse>("/ai/recipe-add-to-cart", {
                recipe_name: recipeData.recipe.name,
                servings: recipeData.recipe.servings,
                selections,
            });

            navigate("/cart");
        } catch (e: any) {
            setError(e?.message ?? "No pude agregar la receta al carrito");
            setMode("error");
        } finally {
            setAddingRecipe(false);
        }
    }

    async function runSearch(textArg?: string) {
        const text = (textArg ?? q).trim();

        if (!text) {
            setMode("idle");
            setNormalData(null);
            setRecipeData(null);
            setSuggestion(null);
            setRecipeSelections({});
            setRemovedRecipeItems({});
            setError("");
            navigate(buildSearchUrl(""), { replace: true });
            return;
        }

        navigate(buildSearchUrl(text), { replace: true });
        setQ(text);
        setMode("loading");
        setError("");
        setNormalData(null);
        setRecipeData(null);
        setSuggestion(null);
        setRecipeSelections({});
        setRemovedRecipeItems({});
        setShowFloatingRecipeBar(false);

        try {
            const smart = await apiPost<SmartSearchResponse>("/ai/search-smart", {
                text,
                limit_per_item: 5,
                include_alternatives: true,
            });

            setSuggestion(smart.suggestion ?? null);

            if (smart.mode === "recipe") {
                const recipe = smart.data;

                const hasFoundItems =
                    Array.isArray(recipe.items) &&
                    recipe.items.some(
                        (item) =>
                            item.found ||
                            item.selected_option !== null ||
                            (item.alternatives?.length ?? 0) > 0
                    );

                if (!recipe.items?.length || !hasFoundItems) {
                    setMode("empty");
                    return;
                }

                setRecipeData(recipe);
                setMode("recipe");
                return;
            }

            const normal = smart.data;

            const hasResults =
                Array.isArray(normal.items) &&
                normal.items.some(
                    (item) => item.best_option !== null || (item.options?.length ?? 0) > 0
                );

            if (!normal.items?.length || !hasResults) {
                setMode("empty");
                return;
            }

            setNormalData(normal);
            setMode("normal");

            // Solo para productos normales: refresca carrito para mostrar - cantidad +
            await refreshCart();
        } catch (e: any) {
            setError(e?.message ?? "No pude completar la búsqueda");
            setMode("error");
        }
    }


    useEffect(() => {
        setQ(initialQ);

        if (initialQ) {
            runSearch(initialQ);
        } else {
            setMode("idle");
            setNormalData(null);
            setRecipeData(null);
            setSuggestion(null);
            setRecipeSelections({});
            setRemovedRecipeItems({});
            setError("");
            setShowFloatingRecipeBar(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialQ, isOverlay]);

    useEffect(() => {
        if (!recipeData) {
            setRecipeSelections({});
            setRemovedRecipeItems({});
            return;
        }

        const nextSelections: RecipeSelectionsState = {};

        for (const item of recipeData.items) {
            const fallbackId =
                item.selected_option?.supermarket_product_id ??
                item.alternatives?.[0]?.supermarket_product_id ??
                null;

            if (fallbackId) {
                nextSelections[item.ingredient_key] = fallbackId;
            }
        }

        setRecipeSelections(nextSelections);
        setRemovedRecipeItems({});
    }, [recipeData]);

    useEffect(() => {
        if (mode !== "recipe" || !recipePrimaryCtaRef.current) {
            setShowFloatingRecipeBar(false);
            return;
        }

        const node = recipePrimaryCtaRef.current;

        const observer = new IntersectionObserver(
            ([entry]) => {
                setShowFloatingRecipeBar(!entry.isIntersecting);
            },
            {
                threshold: 0.2,
            }
        );

        observer.observe(node);

        return () => observer.disconnect();
    }, [mode, recipeData, recipeSelections, removedRecipeItems]);

    const normalTotal = useMemo(() => {
        if (!normalData) return "RD$ 0.00";
        return formatMoney(normalData.estimated_total_best);
    }, [normalData]);

    const activeRecipeItems = useMemo(() => {
        if (!recipeData) return [];
        return recipeData.items.filter(
            (item) => !removedRecipeItems[item.ingredient_key]
        );
    }, [recipeData, removedRecipeItems]);

    const recipeTotalNumber = useMemo(() => {
        if (!recipeData) return 0;

        return activeRecipeItems.reduce((sum, item) => {
            const selected = getSelectedOptionForRecipeItem(item);
            return sum + toNumber(selected?.line_total);
        }, 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recipeData, activeRecipeItems, recipeSelections]);

    const recipeTotal = useMemo(() => {
        return formatMoney(recipeTotalNumber);
    }, [recipeTotalNumber]);

    const selectedRecipeCount = useMemo(() => {
        return buildRecipeSelectionsPayload().length;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recipeData, recipeSelections, removedRecipeItems]);

    const recipeIngredientsFound = useMemo(() => {
        return activeRecipeItems.filter((item) => {
            const selected = getSelectedOptionForRecipeItem(item);
            return Boolean(selected);
        }).length;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeRecipeItems, recipeSelections]);

    const recipeIngredientsTotal = activeRecipeItems.length;
    const recipeMissingCount = Math.max(
        0,
        recipeIngredientsTotal - recipeIngredientsFound
    );


    return (
        <div className={`pb-8 ${isOverlay ? "min-h-[100dvh] bg-white" : ""}`}>
            <div className="mx-auto max-w-[430px] space-y-4 px-4">
                <SearchTopBar
                    value={q}
                    onChange={setQ}
                    onSubmit={() => runSearch()}
                    onBack={handleBack}
                    loading={mode === "loading"}
                    autoFocus={isOverlay}
                />

                {mode !== "empty" && mode !== "idle" && (
                    <SearchSectionHeader
                        title={
                            mode === "recipe"
                                ? "Mostrando receta"
                                : mode === "normal"
                                    ? "Productos encontrados"
                                    : "Buscando"
                        }
                        subtitle={q ? `Resultados para “${q}”` : "Busca productos o recetas"}
                        badge={
                            mode === "recipe"
                                ? "Receta"
                                : mode === "normal"
                                    ? "Productos"
                                    : undefined
                        }
                    />
                )}

                {suggestion &&
                    suggestion.corrected.trim().toLowerCase() !==
                    suggestion.original.trim().toLowerCase() && (
                        <div className="rounded-[22px] border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-500 shadow-sm">
                            Mostrando resultados para{" "}
                            <span className="font-semibold text-zinc-800">
                                “{suggestion.corrected}”
                            </span>
                        </div>
                    )}

                {mode === "idle" && (
                    <div className="space-y-4">
                        <QuickSuggestions
                            onPick={(value) => {
                                setQ(value);
                                runSearch(value);
                            }}
                        />
                    </div>
                )}

                {mode === "loading" && <SearchLoadingState />}

                {mode === "empty" && (
                    <SearchEmptyState
                        title="No encontré resultados"
                        message="Prueba con otro producto, una receta distinta o cambia algunas palabras de tu búsqueda."
                    />
                )}

                {mode === "error" && (
                    <div className="rounded-[28px] border border-red-200 bg-red-50 p-5 text-sm text-red-700 shadow-sm">
                        {error}
                    </div>
                )}

                {mode === "normal" && normalData && (
                    <>
                        <div className="rounded-[30px] border border-zinc-200 bg-white p-5 shadow-sm">
                            <div className="flex flex-wrap items-end justify-between gap-3">
                                <div>
                                    <div className="text-[24px] font-semibold text-zinc-950">
                                        Resumen de búsqueda
                                    </div>
                                    <div className="mt-2 text-sm text-zinc-500">
                                        Selección recomendada según disponibilidad y precio.
                                    </div>
                                </div>

                                <div className="text-left sm:text-right">
                                    <div className="text-sm text-zinc-500">Total estimado</div>
                                    <div className="mt-1 text-[30px] font-semibold leading-none text-emerald-700">
                                        {normalTotal}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {normalData.items.map((item, idx) => (
                                <NormalResultCard
                                    key={`${item.query}-${idx}`}
                                    item={item}
                                    onAdd={addSingleProduct}
                                    onIncrease={increaseSingleProduct}
                                    onDecrease={decreaseSingleProduct}
                                    getCartQuantity={getCartQuantity}
                                    addingProductId={addingProductId}
                                />
                            ))}
                        </div>
                    </>
                )}

                {mode === "recipe" && recipeData && (
                    <>
                        <RecipeSummaryCard
                            recipeName={recipeData.recipe.name}
                            servings={recipeData.recipe.servings}
                            ingredientsFound={recipeIngredientsFound}
                            ingredientsTotal={recipeIngredientsTotal}
                            missingCount={recipeMissingCount}
                            selectedRecipeCount={selectedRecipeCount}
                            recipeTotal={recipeTotal}
                            addingRecipe={addingRecipe}
                            onAdd={handleAddSelectedRecipeToCart}
                            ctaRef={recipePrimaryCtaRef}
                        />

                        <div className="space-y-3">
                            {activeRecipeItems.map((item) => (
                                <RecipeIngredientCard
                                    key={item.ingredient_key}
                                    item={item}
                                    selectedProductId={
                                        recipeSelections[item.ingredient_key] ??
                                        item.selected_option?.supermarket_product_id ??
                                        null
                                    }
                                    onSelect={(ingredientKey, supermarketProductId) =>
                                        setRecipeSelections((prev) => ({
                                            ...prev,
                                            [ingredientKey]: supermarketProductId,
                                        }))
                                    }
                                    onRemove={removeRecipeIngredient}
                                />
                            ))}
                        </div>
                    </>
                )}

                <FloatingRecipeBar
                    visible={mode === "recipe" && showFloatingRecipeBar}
                    recipeName={recipeData?.recipe.name ?? "Tu receta"}
                    total={recipeTotal}
                    count={selectedRecipeCount}
                    disabled={selectedRecipeCount === 0}
                    loading={addingRecipe}
                    onClick={handleAddSelectedRecipeToCart}
                />

                {mode === "recipe" && showFloatingRecipeBar && <div className="h-28" />}
            </div>
        </div>
    );
}