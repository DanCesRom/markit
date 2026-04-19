import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiDelete, apiGet, apiPatch } from "../lib/api";
import carritoImg from "../assets/cart/carrito.png";
import NoScroll from "../components/NoScroll";

type CartItem = {
    cart_item_id: number;
    supermarket_product_id: number;
    product_name: string;
    supermarket_id: number;
    supermarket_name: string;

    unit_price: string;
    quantity: number;
    line_total: string;

    image_url?: string | null;
    regular_price?: string | null;
    line_savings?: string | null;
    currency?: string | null;
    is_on_sale?: boolean;
};

type CartGroup = {
    supermarket_id: number;
    supermarket_name: string;
    subtotal: string;
    savings?: string;
    items: CartItem[];
};

type CartResponse = {
    cart_id: number;
    total: string;
    savings_total?: string;
    supermarkets: CartGroup[];
};

function toNum(x: string | number | null | undefined) {
    const s = typeof x === "string" ? x.trim() : String(x ?? "0");
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
}

function money(x: string | number | null | undefined) {
    return `RD$ ${toNum(x).toFixed(2)}`;
}

function pickUnitLabel(name: string) {
    const s = (name || "").toLowerCase();
    const m =
        s.match(/(\d+(?:[.,]\d+)?\s?(kg|g|lb|oz|ml|l)\b)/i) ||
        s.match(/(\d+\s?(pcs|pc|uds|ud|unidades|unidad)\b)/i) ||
        s.match(/(\d+\s?(pack|pk)\b)/i);
    return m ? m[1].replace(/\s+/g, "") : "";
}

function EmptyCartBackground() {
    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.07]">
            <div className="absolute -left-8 top-6 h-20 w-10 rotate-[-25deg] rounded-full border border-zinc-400" />
            <div className="absolute left-10 top-24 h-14 w-24 rotate-[20deg] rounded-[100px] border border-zinc-400" />
            <div className="absolute right-6 top-6 h-28 w-28 rounded-full border border-zinc-400" />
            <div className="absolute right-10 top-24 h-20 w-20 rounded-[28px] border border-zinc-400" />
            <div className="absolute right-2 top-44 h-28 w-28 rounded-full border border-zinc-400" />
            <div className="absolute -left-10 top-60 h-28 w-28 rounded-full border border-zinc-400" />
            <div className="absolute left-5 top-96 h-14 w-14 rounded-full border border-zinc-400" />
            <div className="absolute right-6 top-[370px] h-20 w-20 rounded-full border border-zinc-400" />
            <div className="absolute -left-14 bottom-28 h-48 w-48 rounded-full border border-zinc-400" />
            <div className="absolute right-0 bottom-32 h-24 w-16 rotate-[25deg] rounded-full border border-zinc-400" />
            <div className="absolute right-14 bottom-8 h-28 w-28 rounded-full border border-zinc-400" />
            <div className="absolute left-28 bottom-16 h-16 w-28 rounded-full border border-zinc-400" />
        </div>
    );
}

export default function Cart() {
    const navigate = useNavigate();

    const [cart, setCart] = useState<CartResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<number | null>(null);
    const [err, setErr] = useState<string | null>(null);
    const [selected, setSelected] = useState<Record<number, boolean>>({});

    async function refresh() {
        const data = await apiGet<CartResponse>("/cart");
        setCart(data);

        const next: Record<number, boolean> = {};
        for (const g of data.supermarkets ?? []) {
            for (const it of g.items ?? []) next[it.cart_item_id] = true;
        }
        setSelected(next);
    }

    useEffect(() => {
        (async () => {
            setErr(null);
            setLoading(true);
            try {
                await refresh();
            } catch (e: any) {
                setErr(e?.message ?? "No pude cargar el carrito");
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const groups = cart?.supermarkets ?? [];

    const allItems = useMemo(() => {
        const items: CartItem[] = [];
        for (const g of groups) items.push(...(g.items ?? []));
        return items;
    }, [groups]);

    const isEmpty = allItems.length === 0;

    const allChecked = useMemo(() => {
        if (isEmpty) return false;
        return allItems.every((it) => selected[it.cart_item_id] === true);
    }, [allItems, selected, isEmpty]);

    const selectedItems = useMemo(() => {
        return allItems.filter((it) => selected[it.cart_item_id]);
    }, [allItems, selected]);

    const selectedTotal = useMemo(() => {
        return selectedItems.reduce((acc, it) => acc + toNum(it.line_total), 0);
    }, [selectedItems]);

    const selectedSavings = useMemo(() => {
        return selectedItems.reduce((acc, it) => {
            const ls = toNum(it.line_savings);
            if (ls > 0) return acc + ls;

            const reg = toNum(it.regular_price);
            const cur = toNum(it.unit_price);
            if (reg > cur) return acc + (reg - cur) * toNum(it.quantity);
            return acc;
        }, 0);
    }, [selectedItems]);

    async function changeQty(cart_item_id: number, nextQty: number) {
        setErr(null);
        setBusyId(cart_item_id);
        try {
            if (nextQty <= 0) {
                await apiDelete(`/cart/items/${cart_item_id}`);
            } else {
                await apiPatch(`/cart/items/${cart_item_id}`, { quantity: nextQty });
            }
            await refresh();
        } catch (e: any) {
            setErr(e?.message ?? "No pude actualizar el carrito");
        } finally {
            setBusyId(null);
        }
    }

    async function remove(cart_item_id: number) {
        setErr(null);
        setBusyId(cart_item_id);
        try {
            await apiDelete(`/cart/items/${cart_item_id}`);
            await refresh();
        } catch (e: any) {
            setErr(e?.message ?? "No pude eliminar el item");
        } finally {
            setBusyId(null);
        }
    }

    if (loading) {
        return (
            <div className="mx-auto w-full max-w-[430px] px-4 pt-6 text-sm text-zinc-500">
                Cargando carrito…
            </div>
        );
    }

    if (!cart || isEmpty) {
        return (
            <>
                <NoScroll />

                <div className="mx-auto w-full max-w-[430px]">
                    <div className="relative min-h-[calc(100dvh-64px)] overflow-hidden bg-[#f7f7f7]">
                        <EmptyCartBackground />

                        <div className="relative flex min-h-[calc(100dvh-64px)] flex-col px-5">
                            {err && (
                                <div className="pt-4">
                                    <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                        {err}
                                    </div>
                                </div>
                            )}

                            <div className="flex flex-1 items-center justify-center">
                                <div className="flex w-full flex-col items-center text-center">
                                    <img
                                        src={carritoImg}
                                        alt="Carrito vacío"
                                        className="h-[104px] w-[104px] object-contain"
                                        draggable={false}
                                    />

                                    <h1 className="mt-8 max-w-[320px] text-[38px] font-extrabold leading-[1.06] tracking-[-0.03em] text-black">
                                        Tu carrito está
                                        <br />
                                        vacío!
                                    </h1>

                                    <p className="mt-7 max-w-[330px] text-[16px] leading-[1.35] text-[#555555]">
                                        Una vez agregues artículos de un negocio o restaurante, tu
                                        carrito aparecerá aquí.
                                    </p>

                                    <button
                                        onClick={() => navigate("/")}
                                        className="mt-11 h-[52px] w-full rounded-full bg-[#182B6F] px-6 text-[16px] font-semibold text-white"
                                    >
                                        Empieza a comprar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    return (
        <div className="mx-auto w-full max-w-[430px] px-4 pb-28 pt-4">
            <div className="mb-3 flex items-center gap-3">
                <button
                    onClick={() => navigate(-1)}
                    className="grid h-9 w-9 place-items-center rounded-xl hover:bg-zinc-100"
                    aria-label="Back"
                >
                    ←
                </button>
                <div className="text-xl font-semibold text-emerald-700">My cart</div>
            </div>

            {err && (
                <div className="mb-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {err}
                </div>
            )}

            <div className="space-y-6">
                {groups.map((g) => (
                    <div
                        key={g.supermarket_id}
                        className="rounded-2xl border border-zinc-100 bg-white"
                    >
                        <div className="flex items-center justify-between px-3 py-3">
                            <div className="text-sm font-semibold">{g.supermarket_name}</div>
                            <div className="text-sm font-semibold">{money(g.subtotal)}</div>
                        </div>

                        <div className="px-3 pb-2">
                            {g.items.map((it) => {
                                const checked = selected[it.cart_item_id] ?? true;
                                const unitLabel = pickUnitLabel(it.product_name);
                                const reg = toNum(it.regular_price);
                                const cur = toNum(it.unit_price);
                                const showStrike = reg > cur;

                                return (
                                    <div
                                        key={it.cart_item_id}
                                        className="flex items-center gap-3 border-t py-3"
                                    >
                                        <button
                                            onClick={() =>
                                                setSelected((p) => ({
                                                    ...p,
                                                    [it.cart_item_id]: !checked,
                                                }))
                                            }
                                            className={`grid h-6 w-6 place-items-center rounded-md border ${checked
                                                    ? "border-emerald-600 bg-emerald-600 text-white"
                                                    : "border-zinc-300 bg-white"
                                                }`}
                                            aria-label="Select item"
                                        >
                                            {checked ? "✓" : ""}
                                        </button>

                                        <div className="h-12 w-12 overflow-hidden rounded-xl bg-zinc-100">
                                            {it.image_url ? (
                                                <img
                                                    src={it.image_url}
                                                    alt={it.product_name}
                                                    className="h-full w-full object-cover"
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <div className="grid h-full w-full place-items-center text-xs font-semibold text-zinc-500">
                                                    MK
                                                </div>
                                            )}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-semibold">
                                                {it.product_name}
                                            </div>
                                            <div className="mt-0.5 text-xs text-zinc-500">
                                                {unitLabel || "—"}
                                            </div>

                                            <div className="mt-1 text-sm font-semibold">
                                                {showStrike ? (
                                                    <span className="mr-2 text-xs text-zinc-400 line-through">
                                                        {money(reg)}
                                                    </span>
                                                ) : null}
                                                <span>{money(cur)}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                disabled={busyId === it.cart_item_id}
                                                onClick={() =>
                                                    changeQty(it.cart_item_id, toNum(it.quantity) - 1)
                                                }
                                                className="grid h-7 w-7 place-items-center rounded-lg border bg-white text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50"
                                            >
                                                –
                                            </button>

                                            <div className="w-5 text-center text-sm font-semibold">
                                                {toNum(it.quantity)}
                                            </div>

                                            <button
                                                disabled={busyId === it.cart_item_id}
                                                onClick={() =>
                                                    changeQty(it.cart_item_id, toNum(it.quantity) + 1)
                                                }
                                                className="grid h-7 w-7 place-items-center rounded-lg border bg-white text-sm font-semibold hover:bg-zinc-50 disabled:opacity-50"
                                            >
                                                +
                                            </button>

                                            <button
                                                disabled={busyId === it.cart_item_id}
                                                onClick={() => remove(it.cart_item_id)}
                                                className="ml-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-50"
                                                aria-label="Remove"
                                                title="Remove"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            <button
                onClick={() => navigate("/")}
                className="mt-6 w-full rounded-2xl border border-emerald-600 bg-white py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
            >
                Continue Shopping
            </button>

            <div className="fixed bottom-14 left-0 right-0 z-40">
                <div className="mx-auto w-full max-w-[430px] border-t bg-emerald-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                        <button
                            onClick={() => {
                                const next: Record<number, boolean> = {};
                                for (const it of allItems) next[it.cart_item_id] = !allChecked;
                                setSelected(next);
                            }}
                            className="flex items-center gap-2 text-xs text-zinc-700"
                        >
                            <span
                                className={`grid h-5 w-5 place-items-center rounded-md border ${allChecked
                                        ? "border-emerald-600 bg-emerald-600 text-white"
                                        : "border-zinc-300 bg-white"
                                    }`}
                            >
                                {allChecked ? "✓" : ""}
                            </span>
                            All
                        </button>

                        <div className="flex-1 text-xs text-zinc-600">
                            <div>
                                Total price:{" "}
                                <span className="font-semibold text-zinc-900">
                                    {money(selectedTotal)}
                                </span>
                            </div>
                            <div className="text-[11px] text-emerald-700">
                                Save: {money(selectedSavings)}
                            </div>
                        </div>

                        <button
                            disabled={selectedItems.length === 0}
                            onClick={() =>
                                navigate("/checkout", {
                                    state: {
                                        selectedCartItemIds: selectedItems.map(
                                            (it) => it.cart_item_id
                                        ),
                                    },
                                })
                            }
                            className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
                        >
                            Checkout
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}