import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../lib/api";
import { CATEGORY_ART, CATEGORY_ART_BY_MARKET } from "../config/categoryArt";

type Supermarket = { id: number; name: string };

type CategoryRow = {
  supermarket_category_id: number;
  slug: string;
  name: string;
  items_count: number;
};

export default function Categories() {
  const navigate = useNavigate();

  const [markets, setMarkets] = useState<Supermarket[]>([]);
  const [marketId, setMarketId] = useState<number | null>(null);

  const [q, setQ] = useState("");
  const [cats, setCats] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // mercado activo (objeto)
  const activeMarket = useMemo(() => {
    if (!marketId) return null;
    return markets.find((m) => m.id === marketId) ?? null;
  }, [markets, marketId]);

  // clave normalizada para lookup (ej: "nacional", "la sirena")
  const activeMarketKey = useMemo(() => {
    const name = activeMarket?.name ?? "";
    return name.trim().toLowerCase();
  }, [activeMarket]);

  // load supermarkets
  useEffect(() => {
    let alive = true;
    async function run() {
      try {
        const rows = await apiGet<Supermarket[]>("/supermarkets/");
        if (!alive) return;
        setMarkets(rows);

        // default: Nacional si existe, sino el primero
        const nacional = rows.find((x) => x.name.toLowerCase() === "nacional");
        setMarketId(nacional?.id ?? rows[0]?.id ?? null);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? "No pude cargar supermercados");
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, []);

  // load categories when market changes
  useEffect(() => {
    if (!marketId) return;

    let alive = true;
    async function run() {
      setLoading(true);
      setErr(null);
      try {
        const rows = await apiGet<CategoryRow[]>(
          `/supermarkets/${marketId}/categories`
        );
        if (!alive) return;
        setCats(rows);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? "No pude cargar categorías");
      } finally {
        if (alive) setLoading(false);
      }
    }
    run();
    return () => {
      alive = false;
    };
  }, [marketId]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return cats;
    return cats.filter((c) => c.name.toLowerCase().includes(needle));
  }, [cats, q]);

  // helper: resuelve el art por supermercado (override) y cae al default
  const getCategoryArt = (slug: string) => {
    const byMarket = CATEGORY_ART_BY_MARKET[activeMarketKey];
    return byMarket?.[slug] ?? CATEGORY_ART[slug];
  };

  return (
    <div className="space-y-4">
      {/* Top title */}
      <div className="pt-1">
        <h1 className="text-3xl font-semibold text-emerald-700">Categories</h1>
      </div>

      {/* Market selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {markets.map((m) => {
          const active = m.id === marketId;
          return (
            <button
              key={m.id}
              onClick={() => setMarketId(m.id)}
              className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold ${
                active
                  ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                  : "bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {m.name}
            </button>
          );
        })}
      </div>

      {/* Search + filter */}
      <div className="flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-2xl border bg-white px-3 py-2 shadow-sm">
          <span className="text-zinc-400">⌕</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="What would you like to cook today?"
            className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
          />
        </div>

      </div>

      {err && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {loading && (
        <div className="text-sm text-zinc-500">Cargando categorías…</div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-2 gap-4">
        {filtered.map((c) => {
          const art = getCategoryArt(c.slug);

          return (
            <button
              key={c.supermarket_category_id}
              onClick={() => {
                if (!marketId) return;
                navigate(`/categories/${marketId}/${c.slug}`, {
                  state: { title: c.name },
                });
              }}
              className="rounded-3xl border bg-white p-4 shadow-sm transition hover:shadow-md"
            >
              <div className="flex flex-col items-center gap-3">
                <div className="grid h-20 w-full place-items-center rounded-2xl bg-zinc-50">
                  {art ? (
                    <img
                      src={art}
                      alt={c.name}
                      className="h-16 w-16 object-contain"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display =
                          "none";
                      }}
                    />
                  ) : (
                    <span className="text-3xl">🧺</span>
                  )}
                </div>

                <div className="text-center">
                  <div className="text-sm font-semibold text-zinc-900">
                    {c.name}
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">
                    {c.items_count.toLocaleString()} items
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}