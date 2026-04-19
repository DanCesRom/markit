import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiPost } from "../lib/api";

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
  loading: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit();
      }}
      className="sticky top-0 z-20 -mx-4 border-b border-zinc-100 bg-[#fafafa]/95 px-4 pb-3 pt-2 backdrop-blur"
    >
      <div className="flex items-center gap-3">
        <div className="flex flex-1 items-center gap-3 rounded-[22px] border border-zinc-200 bg-white px-4 py-3 shadow-sm transition focus-within:border-emerald-600 focus-within:ring-4 focus-within:ring-emerald-100">
          <span className="text-zinc-400">⌕</span>
          <input
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            placeholder="Busca productos o recetas"
            className="w-full bg-transparent text-[16px] leading-normal outline-none placeholder:text-zinc-400"
            enterKeyHint="search"
          />
        </div>

        <button
          type="submit"
          disabled={props.loading}
          className="rounded-[22px] bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-60"
        >
          {props.loading ? "..." : "Buscar"}
        </button>
      </div>
    </form>
  );
}

function ProductImage(props: { src?: string; alt: string; size?: string }) {
  return (
    <div
      className={`grid shrink-0 place-items-center overflow-hidden rounded-[22px] bg-zinc-100 ${
        props.size ?? "h-20 w-20"
      }`}
    >
      {props.src ? (
        <img
          src={props.src}
          alt={props.alt}
          className="h-full w-full object-contain p-2"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <span className="text-2xl">🛒</span>
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
    <div className="px-1">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[30px] font-semibold leading-none text-zinc-950">
          {props.title}
        </div>

        {props.badge && (
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
            {props.badge}
          </span>
        )}
      </div>

      {props.subtitle && (
        <div className="mt-2 text-sm leading-5 text-zinc-500">{props.subtitle}</div>
      )}
    </div>
  );
}

function SearchLoadingState(props: { query: string }) {
  const isRecipe = looksLikeRecipeQuery(props.query);

  return (
    <div className="rounded-[28px] border border-emerald-100 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="relative mt-1 h-12 w-12 shrink-0">
          <div className="absolute inset-0 rounded-full border-4 border-emerald-100" />
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-emerald-600" />
          <div className="absolute inset-[10px] rounded-full bg-emerald-50" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-zinc-950">
            {isRecipe ? "Preparando tu receta" : "Buscando los mejores productos"}
          </div>

          <div className="mt-1 text-sm leading-6 text-zinc-500">
            {isRecipe
              ? "Buscando ingredientes, revisando opciones y armando una selección más conveniente para ti."
              : "Comparando resultados, disponibilidad y alternativas para mostrarte una mejor selección."}
          </div>

          <div className="mt-4 space-y-2">
            <div className="h-3 w-[78%] animate-pulse rounded-full bg-zinc-100" />
            <div className="h-3 w-[62%] animate-pulse rounded-full bg-zinc-100" />
            <div className="h-3 w-[70%] animate-pulse rounded-full bg-zinc-100" />
          </div>
        </div>
      </div>
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
      className={`w-[132px] shrink-0 snap-start rounded-[22px] border p-2.5 text-left transition ${
        props.active
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
          className={`absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full border text-[10px] font-bold ${
            props.active
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

function NormalResultCard(props: {
  item: NormalSearchItem;
  onAdd: (option: SearchOption) => void;
  addingProductId: number | null;
}) {
  const [open, setOpen] = useState(false);
  const best = props.item.best_option;

  if (!best) return null;

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

              <button
                type="button"
                disabled={props.addingProductId === best.supermarket_product_id}
                onClick={() => props.onAdd(best)}
                className="rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
              >
                {props.addingProductId === best.supermarket_product_id
                  ? "Agregando..."
                  : "Agregar"}
              </button>
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
            {props.item.options.slice(0, 6).map((opt) => (
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
                  <button
                    type="button"
                    disabled={props.addingProductId === opt.supermarket_product_id}
                    onClick={() => props.onAdd(opt)}
                    className="mt-2 rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                  >
                    {props.addingProductId === opt.supermarket_product_id
                      ? "..."
                      : "Agregar"}
                  </button>
                </div>
              </div>
            ))}
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
}) {
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

            <div className="mt-3 rounded-[22px] border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                Selección actual
              </div>

              <div className="mt-1 line-clamp-2 text-base font-semibold text-zinc-950">
                {selected.product}
              </div>

              <div className="mt-1 text-sm text-zinc-500">
                {shortSupermarket(selected.supermarket)}
              </div>

              <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="text-[28px] font-semibold leading-none text-zinc-950">
                    {formatMoney(selected.line_total)}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {formatPurchaseQty(selected)}
                  </div>
                </div>

                <div className="rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-zinc-600 shadow-sm">
                  {buildOptionCaption(selected)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {options.length > 1 && (
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
                      onClick={() =>
                        props.onSelect(
                          props.item.ingredient_key,
                          opt.supermarket_product_id
                        )
                      }
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
  recipeData: RecipeSearchResponse;
  selectedRecipeCount: number;
  recipeTotal: string;
  addingRecipe: boolean;
  onAdd: () => void;
  ctaRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const missingCount =
    props.recipeData.summary.ingredients_total -
    props.recipeData.summary.ingredients_found;

  return (
    <div className="overflow-hidden rounded-[30px] border border-emerald-100 bg-white shadow-sm">
      <div className="bg-gradient-to-br from-emerald-50 via-white to-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[30px] font-semibold leading-none text-zinc-950">
              {props.recipeData.recipe.name}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
                {props.recipeData.recipe.servings} porciones
              </span>

              <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-600">
                {props.recipeData.summary.ingredients_found} de{" "}
                {props.recipeData.summary.ingredients_total} encontrados
              </span>

              {missingCount > 0 && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700">
                  {missingCount} pendientes
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
              {Math.max(0, missingCount)}
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
  const [params] = useSearchParams();

  const initialQ = (params.get("q") ?? "").trim();

  const [q, setQ] = useState(initialQ);
  const [mode, setMode] = useState<SearchMode>(initialQ ? "loading" : "idle");
  const [error, setError] = useState("");
  const [normalData, setNormalData] = useState<NormalSearchResponse | null>(null);
  const [recipeData, setRecipeData] = useState<RecipeSearchResponse | null>(null);
  const [suggestion, setSuggestion] = useState<SearchSuggestion | null>(null);
  const [recipeSelections, setRecipeSelections] = useState<RecipeSelectionsState>(
    {}
  );
  const [addingRecipe, setAddingRecipe] = useState(false);
  const [addingProductId, setAddingProductId] = useState<number | null>(null);
  const [showFloatingRecipeBar, setShowFloatingRecipeBar] = useState(false);

  const recipePrimaryCtaRef = useRef<HTMLButtonElement | null>(null);

  async function addSingleProduct(option: SearchOption) {
    setAddingProductId(option.supermarket_product_id);

    try {
      await apiPost("/cart/items", {
        supermarket_product_id: option.supermarket_product_id,
        quantity: option.purchase_qty || option.qty,
      });
    } catch (e: any) {
      setError(e?.message ?? "No pude agregar el producto al carrito");
      setMode("error");
    } finally {
      setAddingProductId(null);
    }
  }

  function buildRecipeSelectionsPayload() {
    if (!recipeData) return [];

    return recipeData.items
      .map((item) => {
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

        const selected =
          options.find((opt) => opt.supermarket_product_id === selectedId) ??
          item.selected_option ??
          null;

        if (!selected) return null;

        return {
          ingredient_key: item.ingredient_key,
          ingredient_name: item.ingredient_name,
          qty: item.qty,
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
      setError("");
      return;
    }

    navigate(`/search?q=${encodeURIComponent(text)}`, { replace: true });
    setQ(text);
    setMode("loading");
    setError("");
    setNormalData(null);
    setRecipeData(null);
    setSuggestion(null);
    setRecipeSelections({});
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
      setError("");
      setShowFloatingRecipeBar(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQ]);

  useEffect(() => {
    if (!recipeData) {
      setRecipeSelections({});
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
  }, [mode, recipeData, recipeSelections]);

  const normalTotal = useMemo(() => {
    if (!normalData) return "RD$ 0.00";
    return formatMoney(normalData.estimated_total_best);
  }, [normalData]);

  const recipeTotal = useMemo(() => {
    if (!recipeData) return "RD$ 0.00";
    return formatMoney(recipeData.summary.estimated_total);
  }, [recipeData]);

  const selectedRecipeCount = useMemo(() => {
    return buildRecipeSelectionsPayload().length;
  }, [recipeData, recipeSelections]);

  return (
    <div className="space-y-4 pb-8">
      <SearchTopBar
        value={q}
        onChange={setQ}
        onSubmit={() => runSearch()}
        loading={mode === "loading"}
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
          badge={mode === "recipe" ? "Receta" : mode === "normal" ? "Productos" : undefined}
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
        <div className="rounded-[28px] border border-zinc-200 bg-white p-5 text-sm text-zinc-500 shadow-sm">
          Escribe algo como “arroz”, “quiero arroz y leche” o “quiero hacer un sancocho”.
        </div>
      )}

      {mode === "loading" && <SearchLoadingState query={q} />}

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
                addingProductId={addingProductId}
              />
            ))}
          </div>
        </>
      )}

      {mode === "recipe" && recipeData && (
        <>
          <RecipeSummaryCard
            recipeData={recipeData}
            selectedRecipeCount={selectedRecipeCount}
            recipeTotal={recipeTotal}
            addingRecipe={addingRecipe}
            onAdd={handleAddSelectedRecipeToCart}
            ctaRef={recipePrimaryCtaRef}
          />

          <div className="space-y-3">
            {recipeData.items.map((item) => (
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
  );
}