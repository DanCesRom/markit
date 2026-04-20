import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../lib/api";
import { CATEGORY_ART, CATEGORY_ART_BY_MARKET } from "../config/categoryArt";
import findIcon from "../assets/home/find.png";

type Supermarket = { id: number; name: string };

type CategoryRow = {
    supermarket_category_id: number;
    slug: string;
    name: string;
    items_count: number;
};

function CategoriesSearchBar() {
    const [q, setQ] = useState("");
    const navigate = useNavigate();

    function submitSearch() {
        const value = q.trim();
        if (!value) return;
        navigate(`/search?q=${encodeURIComponent(value)}`);
    }

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                submitSearch();
            }}
            className="w-full"
        >
            <div className="flex items-center rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
                <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="¿Qué te gustaría cocinar hoy?"
                    className="w-full bg-transparent pr-3 text-[16px] leading-normal outline-none placeholder:text-zinc-400"
                    enterKeyHint="search"
                />

                <button
                    type="submit"
                    className="grid h-8 w-8 shrink-0 place-items-center"
                    aria-label="Buscar"
                    title="Buscar"
                >
                    <img src={findIcon} alt="Buscar" className="h-4 w-4 opacity-70" />
                </button>
            </div>
        </form>
    );
}

export default function Categories() {
    const navigate = useNavigate();

    const [markets, setMarkets] = useState<Supermarket[]>([]);
    const [marketId, setMarketId] = useState<number | null>(null);

    const [cats, setCats] = useState<CategoryRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const activeMarket = useMemo(() => {
        if (!marketId) return null;
        return markets.find((m) => m.id === marketId) ?? null;
    }, [markets, marketId]);

    const activeMarketKey = useMemo(() => {
        const name = activeMarket?.name ?? "";
        return name.trim().toLowerCase();
    }, [activeMarket]);

    useEffect(() => {
        let alive = true;

        async function run() {
            try {
                const rows = await apiGet<Supermarket[]>("/supermarkets/");
                if (!alive) return;

                setMarkets(rows);

                const nacional = rows.find((x) => x.name.toLowerCase() === "nacional");
                setMarketId(nacional?.id ?? rows[0]?.id ?? null);
            } catch (e: unknown) {
                if (!alive) return;

                const message =
                    e instanceof Error ? e.message : "No pude cargar supermercados";
                setErr(message);
            }
        }

        run();

        return () => {
            alive = false;
        };
    }, []);

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
            } catch (e: unknown) {
                if (!alive) return;

                const message =
                    e instanceof Error ? e.message : "No pude cargar categorías";
                setErr(message);
            } finally {
                if (alive) setLoading(false);
            }
        }

        run();

        return () => {
            alive = false;
        };
    }, [marketId]);

    const getCategoryArt = (slug: string) => {
        const byMarket = CATEGORY_ART_BY_MARKET[activeMarketKey];
        return byMarket?.[slug] ?? CATEGORY_ART[slug];
    };

    return (
        <div className="space-y-4">
            <div className="pt-1">
                <h1 className="text-3xl font-semibold text-emerald-700">
                    Categorías
                </h1>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
                {markets.map((m) => {
                    const active = m.id === marketId;

                    return (
                        <button
                            key={m.id}
                            onClick={() => setMarketId(m.id)}
                            className={`shrink-0 rounded-full border px-4 py-2 text-xs font-semibold ${active
                                    ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                                    : "bg-white text-zinc-700 hover:bg-zinc-50"
                                }`}
                        >
                            {m.name}
                        </button>
                    );
                })}
            </div>

            <CategoriesSearchBar />

            {err && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {err}
                </div>
            )}

            {loading && (
                <div className="text-sm text-zinc-500">Cargando categorías…</div>
            )}

            <div className="grid grid-cols-2 gap-4">
                {cats.map((c) => {
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
                                                e.currentTarget.style.display = "none";
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