import { useEffect, useMemo, useState } from "react";
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
      className="sticky top-0 z-10 -mx-4 border-b border-zinc-100 bg-[#fafafa]/95 px-4 pb-3 pt-2 backdrop-blur"
    >
      <div className="flex items-center gap-3">
        <div className="flex flex-1 items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
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
          className="rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
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
      className={`grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-zinc-100 ${
        props.size ?? "h-20 w-20"
      }`}
    >
      {props.src ? (
        <img
          src={props.src}
          alt={props.alt}
          className="max-h-full max-w-full object-contain p-2"
          loading="lazy"
          draggable={false}
        />
      ) : (
        <span className="text-2xl">🛒</span>
      )}
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
      className={`rounded-2xl border p-2 text-left ${
        props.active
          ? "border-emerald-500 bg-emerald-50"
          : "border-zinc-200 bg-white"
      }`}
    >
      <div className="mb-2 flex justify-center">
        <ProductImage
          src={props.option.image_url}
          alt={props.option.product}
          size="h-16 w-full"
        />
      </div>

      <div className="line-clamp-2 text-[11px] font-semibold text-zinc-800">
        {getPreviewLabel(props.option.product)}
      </div>

      <div className="mt-1 text-[11px] text-zinc-500">
        {shortSupermarket(props.option.supermarket)}
      </div>

      <div className="mt-1 text-[11px] font-semibold text-zinc-900">
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
    <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex gap-3">
        <ProductImage src={best.image_url} alt={best.product} />

        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            {props.item.query}
          </div>

          <div className="mt-1 line-clamp-2 text-[17px] font-semibold leading-tight text-zinc-950">
            {best.product}
          </div>

          <div className="mt-1 text-sm text-zinc-500">
            {shortSupermarket(best.supermarket)}
          </div>

          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <div className="text-[28px] font-semibold leading-none">
                {formatMoney(best.line_total)}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                Se comprará: {buildOptionCaption(best)}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold"
              >
                {open ? "Ocultar" : "Ver más"}
              </button>

              <button
                type="button"
                disabled={props.addingProductId === best.supermarket_product_id}
                onClick={() => props.onAdd(best)}
                className="rounded-2xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {props.addingProductId === best.supermarket_product_id
                  ? "Agregando..."
                  : "+ Agregar"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {open && props.item.options.length > 0 && (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
          <div className="mb-3 text-sm font-semibold text-zinc-800">
            Otras opciones
          </div>

          <div className="space-y-2">
            {props.item.options.slice(0, 6).map((opt) => (
              <div
                key={`${opt.supermarket_id}-${opt.supermarket_product_id}`}
                className="flex items-center gap-3 rounded-2xl bg-white px-3 py-3"
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
                  <div className="text-sm font-semibold">
                    {formatMoney(opt.line_total)}
                  </div>
                  <button
                    type="button"
                    disabled={props.addingProductId === opt.supermarket_product_id}
                    onClick={() => props.onAdd(opt)}
                    className="mt-1 rounded-xl bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
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
    <div className="rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex gap-3">
        <ProductImage src={selected.image_url} alt={selected.product} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[19px] font-semibold text-zinc-950">
              {props.item.ingredient_name}
            </div>

            {!props.item.required && (
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-semibold text-zinc-500">
                Opcional
              </span>
            )}
          </div>

          <div className="mt-1 text-xs text-zinc-500">
            Necesitas: {formatNeededQty(props.item.qty, props.item.ingredient_name)}
          </div>

          <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
            <div className="text-xs font-semibold text-zinc-500">
              Producto seleccionado
            </div>

            <div className="mt-1 line-clamp-2 text-base font-semibold text-zinc-950">
              {selected.product}
            </div>

            <div className="mt-1 text-sm text-zinc-500">
              {shortSupermarket(selected.supermarket)}
            </div>

            <div className="mt-2 text-2xl font-semibold text-zinc-950">
              {formatMoney(selected.line_total)}
            </div>

            <div className="mt-1 text-xs text-zinc-500">
              {formatPurchaseQty(selected)}
            </div>
          </div>

          {options.length > 1 && (
            <div className="mt-3">
              <div className="mb-2 text-xs font-semibold text-zinc-500">
                Cambiar opción
              </div>

              <div className="space-y-3">
                <div className="overflow-x-auto pb-1">
                  <div className="flex gap-2">
                    {options.slice(0, 5).map((opt) => {
                      const active =
                        opt.supermarket_product_id ===
                        selected.supermarket_product_id;

                      return (
                        <div
                          key={`${opt.supermarket_id}-${opt.supermarket_product_id}-preview`}
                          className="w-[108px] shrink-0"
                        >
                          <AlternativePreview
                            option={opt}
                            active={active}
                            onClick={() =>
                              props.onSelect(
                                props.item.ingredient_key,
                                opt.supermarket_product_id
                              )
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <select
                  value={selected.supermarket_product_id}
                  onChange={(e) =>
                    props.onSelect(
                      props.item.ingredient_key,
                      Number(e.target.value)
                    )
                  }
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-3 py-3 text-[16px] leading-normal outline-none"
                >
                  {options.map((opt) => (
                    <option
                      key={`${opt.supermarket_id}-${opt.supermarket_product_id}`}
                      value={opt.supermarket_product_id}
                    >
                      {opt.product} — {opt.supermarket} — {formatMoney(opt.line_total)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SearchEmptyState(props: { title: string; message: string }) {
  return (
    <div className="flex min-h-[calc(100dvh-210px)] items-center justify-center px-6">
      <div className="w-full max-w-[260px] text-center">
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

        <div className="mt-4 text-[22px] font-semibold leading-tight text-zinc-800">
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

      {mode !== "empty" && (
        <div className="px-1">
          <div className="text-[32px] font-semibold leading-none text-zinc-950">
            Resultados AI
          </div>
          <div className="mt-2 text-sm text-zinc-500">
            {q ? `Buscando: “${q}”` : "Busca productos o recetas"}
          </div>

          {suggestion &&
            suggestion.corrected.trim().toLowerCase() !==
              suggestion.original.trim().toLowerCase() && (
              <div className="mt-2 text-sm text-zinc-500">
                Mostrando resultados para{" "}
                <span className="font-semibold text-zinc-800">
                  “{suggestion.corrected}”
                </span>
              </div>
            )}
        </div>
      )}

      {mode === "idle" && (
        <div className="rounded-3xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500 shadow-sm">
          Escribe algo como “arroz”, “quiero arroz y leche” o “quiero hacer un sancocho”.
        </div>
      )}

      {mode === "loading" && (
        <div className="rounded-3xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500 shadow-sm">
          Buscando…
        </div>
      )}

      {mode === "empty" && (
        <SearchEmptyState
          title="Oops! No results found."
          message="Please check spelling or try different keywords."
        />
      )}

      {mode === "error" && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 shadow-sm">
          {error}
        </div>
      )}

      {mode === "normal" && normalData && (
        <>
          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="text-[24px] font-semibold text-zinc-950">
              Búsqueda normal
            </div>
            <div className="mt-2 text-base text-zinc-600">
              Total estimado mejor opción:{" "}
              <span className="font-semibold text-zinc-950">{normalTotal}</span>
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
          <div className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="text-[28px] font-semibold text-zinc-950">
              {recipeData.recipe.name}
            </div>

            <div className="mt-2 text-base text-zinc-500">
              {recipeData.summary.ingredients_found} de{" "}
              {recipeData.summary.ingredients_total} ingredientes encontrados
            </div>

            <div className="mt-1 text-sm text-zinc-500">
              Seleccionados: {selectedRecipeCount}
            </div>

            <div className="mt-3 text-[28px] font-semibold text-emerald-700">
              Total estimado: {recipeTotal}
            </div>

            <button
              type="button"
              disabled={addingRecipe || selectedRecipeCount === 0}
              onClick={handleAddSelectedRecipeToCart}
              className="mt-4 rounded-2xl bg-black px-5 py-4 text-base font-semibold text-white disabled:opacity-60"
            >
              {addingRecipe
                ? "Agregando..."
                : "Agregar receta seleccionada al carrito"}
            </button>
          </div>

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
    </div>
  );
}