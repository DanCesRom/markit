import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiGet, apiPost } from "../lib/api";
import type { Address } from "../lib/types";
import AddressPickerSheet, {
  getStoredActiveAddressId,
  setStoredActiveAddressId,
} from "../components/address/AddressPickerSheet";

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
  supermarkets: CartGroup[];
  savings_total?: string;
};

type PaymentMethod = {
  id: number;
  brand: string;
  last4: string;
  is_default: boolean;
  status: string;
};

type CheckoutRequest = {
  delivery_type: "delivery" | "pickup";
  payment_method_type: "card" | "cash";
  payment_method_id?: number | null;
  delivery_address_id?: number | null;
  cart_item_ids?: number[];
};

type CheckoutResponse = {
  checkout_session_id: number;
  cart_id: number;
  total: string;
  delivery_type: string;
  payment_method_type: string;
  payment_method_id: number | null;
  orders: Array<{
    order_id: number;
    supermarket_id: number;
    supermarket_name: string;
    total: string;
  }>;
};

function toNum(x: string | number | null | undefined) {
  const s = typeof x === "string" ? x.trim() : String(x ?? "0");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function money(x: string | number | null | undefined) {
  return `RD$ ${toNum(x).toFixed(2)}`;
}

function BrandLabel(b: string) {
  const s = (b || "").toLowerCase();
  if (s.includes("paypal")) return "Paypal";
  if (s.includes("google")) return "Google Pay";
  if (s.includes("apple")) return "Apple Pay";
  if (s.includes("visa")) return "Visa";
  if (s.includes("master")) return "Mastercard";
  return b ? b[0].toUpperCase() + b.slice(1) : "Card";
}

function formatAddressLine(a: Address) {
  const parts = [
    a.formatted_address || "",
    a.line1,
    a.line2 || "",
    a.city || "",
    a.state || "",
    a.postal_code || "",
  ].filter((p) => String(p).trim().length > 0);

  return parts.join(", ");
}

function pickActiveAddress(list: Address[]) {
  const storedId = getStoredActiveAddressId();
  if (storedId) {
    const found = list.find((x) => x.id === storedId);
    if (found) return found;
  }

  return list.find((x) => x.is_default) ?? list[0] ?? null;
}

export default function Checkout() {
  const navigate = useNavigate();
  const location = useLocation();

  const selectedCartItemIds = useMemo<number[]>(() => {
    const ids = (location.state as any)?.selectedCartItemIds;
    return Array.isArray(ids) ? ids.map((x) => Number(x)).filter(Number.isFinite) : [];
  }, [location.state]);

  const [cart, setCart] = useState<CartResponse | null>(null);

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [addressPickerOpen, setAddressPickerOpen] = useState(false);

  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [deliveryType, setDeliveryType] = useState<"pickup" | "delivery">("pickup");
  const [payType, setPayType] = useState<"cash" | "card">("cash");
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);

  async function loadCart() {
    const c = await apiGet<CartResponse>("/cart");
    setCart(c);
  }

  async function loadAddresses() {
    setLoadingAddresses(true);
    try {
      const list = await apiGet<Address[]>("/addresses");
      setAddresses(list);

      const chosen = pickActiveAddress(list);
      setSelectedAddressId(chosen ? chosen.id : null);
    } finally {
      setLoadingAddresses(false);
    }
  }

  async function loadMethods() {
    setLoadingMethods(true);
    try {
      const list = await apiGet<PaymentMethod[]>("/payment-methods");
      setMethods(list);

      const def = list.find((m) => m.is_default) ?? list[0];
      setSelectedCardId(def ? def.id : null);
    } finally {
      setLoadingMethods(false);
    }
  }

  useEffect(() => {
    (async () => {
      setErr(null);
      setLoading(true);
      try {
        await loadCart();
      } catch (e: any) {
        setErr(e?.message ?? "No pude cargar checkout");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const allCartItems = useMemo<CartItem[]>(() => {
    const items: CartItem[] = [];
    for (const g of cart?.supermarkets ?? []) items.push(...(g.items ?? []));
    return items;
  }, [cart]);

  const effectiveSelectedIds = useMemo<number[]>(() => {
    if (selectedCartItemIds.length > 0) return selectedCartItemIds;
    return allCartItems.map((it) => it.cart_item_id);
  }, [selectedCartItemIds, allCartItems]);

  const filteredSupermarkets = useMemo<CartGroup[]>(() => {
    const groups = cart?.supermarkets ?? [];
    const idSet = new Set(effectiveSelectedIds);

    return groups
      .map((g) => {
        const items = (g.items ?? []).filter((it) => idSet.has(it.cart_item_id));

        const subtotal = items.reduce((acc, it) => acc + toNum(it.line_total), 0);
        const savings = items.reduce((acc, it) => {
          const ls = toNum(it.line_savings);
          if (ls > 0) return acc + ls;

          const reg = toNum(it.regular_price);
          const cur = toNum(it.unit_price);
          if (reg > cur) return acc + (reg - cur) * toNum(it.quantity);

          return acc;
        }, 0);

        return {
          ...g,
          items,
          subtotal: String(subtotal),
          savings: String(savings),
        };
      })
      .filter((g) => g.items.length > 0);
  }, [cart, effectiveSelectedIds]);

  const supermarketCount = useMemo(() => filteredSupermarkets.length, [filteredSupermarkets]);

  const allItems = useMemo(() => {
    const items: CartItem[] = [];
    for (const g of filteredSupermarkets) items.push(...(g.items ?? []));
    return items;
  }, [filteredSupermarkets]);

  const isEmpty = useMemo(() => allItems.length === 0, [allItems]);

  const itemsSubtotal = useMemo(() => {
    return allItems.reduce((acc, it) => acc + toNum(it.line_total), 0);
  }, [allItems]);

  const itemsSavings = useMemo(() => {
    return allItems.reduce((acc, it) => {
      const ls = toNum(it.line_savings);
      if (ls > 0) return acc + ls;

      const reg = toNum(it.regular_price);
      const cur = toNum(it.unit_price);
      if (reg > cur) return acc + (reg - cur) * toNum(it.quantity);

      return acc;
    }, 0);
  }, [allItems]);

  const isMultiSupermarket = supermarketCount >= 2;

  const effectiveDeliveryType: "pickup" | "delivery" =
    isMultiSupermarket ? "delivery" : deliveryType;

  const effectivePayType: "cash" | "card" =
    isMultiSupermarket ? "card" : payType;

  const deliveryFee = useMemo(() => {
    return effectiveDeliveryType === "delivery" ? 150 : 0;
  }, [effectiveDeliveryType]);

  const totalPayment = useMemo(() => {
    return itemsSubtotal + deliveryFee;
  }, [itemsSubtotal, deliveryFee]);

  useEffect(() => {
    if (isMultiSupermarket) {
      setDeliveryType("delivery");
      setPayType("card");
      return;
    }

    if (deliveryType === "delivery" && payType === "cash") {
      setPayType("card");
    }
  }, [isMultiSupermarket, deliveryType, payType]);

  useEffect(() => {
    if (effectivePayType === "card") {
      loadMethods().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePayType]);

  useEffect(() => {
    if (effectiveDeliveryType === "delivery") {
      loadAddresses().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveDeliveryType]);

  const pickupDisabled = isMultiSupermarket;
  const deliveryNeedsAddress = effectiveDeliveryType === "delivery";
  const hasAddresses = addresses.length > 0;

  const selectedAddress = useMemo(
    () => addresses.find((a) => a.id === selectedAddressId) ?? null,
    [addresses, selectedAddressId]
  );

  async function submit() {
    if (!cart || isEmpty) return;

    setErr(null);
    setSubmitting(true);

    try {
      const payload: CheckoutRequest = {
        delivery_type: effectiveDeliveryType,
        payment_method_type: effectivePayType,
        payment_method_id: effectivePayType === "card" ? selectedCardId : null,
        delivery_address_id: effectiveDeliveryType === "delivery" ? selectedAddressId : null,
        cart_item_ids: effectiveSelectedIds,
      };

      if (payload.payment_method_type === "card" && !payload.payment_method_id) {
        throw new Error("No tienes tarjeta guardada. Agrega una en Perfil.");
      }

      if (payload.delivery_type === "delivery" && !payload.delivery_address_id) {
        throw new Error("Selecciona una dirección para Delivery.");
      }

      if (!payload.cart_item_ids || payload.cart_item_ids.length === 0) {
        throw new Error("No hay productos seleccionados para checkout.");
      }

      const res = await apiPost<CheckoutResponse>("/checkout", payload);

      navigate("/checkout/success", {
        replace: true,
        state: { checkout: res },
      });
    } catch (e: any) {
      setErr(e?.message ?? "No pude completar el checkout");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="text-sm text-zinc-500">Cargando checkout…</div>;

  if (!cart) {
    return (
      <div className="rounded-3xl border bg-white p-6 text-sm text-zinc-600">
        No pude cargar el checkout.
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="rounded-3xl border bg-white p-6 text-sm text-zinc-600">
        No hay productos seleccionados para checkout.
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        <div className="mb-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="grid h-9 w-9 place-items-center rounded-xl hover:bg-zinc-100"
            aria-label="Back"
          >
            ←
          </button>
          <div className="text-xl font-semibold">Checkout</div>
        </div>

        <div className="rounded-2xl bg-white">
          <div className="text-sm font-semibold">Delivery Type</div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <button
              onClick={() => setDeliveryType("pickup")}
              disabled={pickupDisabled}
              className={`rounded-2xl border px-4 py-4 text-left transition ${
                effectiveDeliveryType === "pickup"
                  ? "border-emerald-700 bg-emerald-50/40"
                  : "border-zinc-200 bg-white"
              } ${pickupDisabled ? "opacity-50" : "hover:bg-zinc-50"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Pickup</div>
                  <div className="mt-1 text-xs text-zinc-500">Recoge en tienda</div>
                </div>

                <span
                  className={`grid h-5 w-5 place-items-center rounded-full border ${
                    effectiveDeliveryType === "pickup"
                      ? "border-emerald-700 bg-emerald-700 text-white"
                      : "border-zinc-300 bg-white"
                  }`}
                >
                  {effectiveDeliveryType === "pickup" ? "✓" : ""}
                </span>
              </div>
            </button>

            <button
              onClick={() => {
                setDeliveryType("delivery");
                if (payType === "cash") setPayType("card");
              }}
              className={`rounded-2xl border px-4 py-4 text-left transition ${
                effectiveDeliveryType === "delivery"
                  ? "border-emerald-700 bg-emerald-50/40"
                  : "border-zinc-200 bg-white"
              } hover:bg-zinc-50`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Delivery</div>
                  <div className="mt-1 text-xs text-zinc-500">Envío a tu dirección</div>
                </div>

                <span
                  className={`grid h-5 w-5 place-items-center rounded-full border ${
                    effectiveDeliveryType === "delivery"
                      ? "border-emerald-700 bg-emerald-700 text-white"
                      : "border-zinc-300 bg-white"
                  }`}
                >
                  {effectiveDeliveryType === "delivery" ? "✓" : ""}
                </span>
              </div>
            </button>
          </div>

          {pickupDisabled && (
            <div className="mt-2 text-xs text-zinc-500">
              * Con 2+ supermercados, pickup no está permitido.
            </div>
          )}
        </div>

        <div className="mt-6 rounded-2xl bg-white">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Dirección de entrega</div>

            {deliveryNeedsAddress && (
              <button
                onClick={() => setAddressPickerOpen(true)}
                className="text-xs font-semibold text-emerald-700"
              >
                Cambiar
              </button>
            )}
          </div>

          {!deliveryNeedsAddress && (
            <div className="mt-2 text-xs text-zinc-500">
              Estás en pickup. Dirección no requerida.
            </div>
          )}

          {deliveryNeedsAddress && (
            <div className="mt-3 space-y-3">
              {loadingAddresses && (
                <div className="rounded-2xl border p-4 text-xs text-zinc-500">
                  Cargando direcciones…
                </div>
              )}

              {!loadingAddresses && !hasAddresses && (
                <div className="rounded-2xl border p-4">
                  <div className="text-sm font-semibold">No tienes direcciones</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    Crea una nueva dirección para usar Delivery.
                  </div>
                  <button
                    onClick={() => setAddressPickerOpen(true)}
                    className="mt-3 w-full rounded-2xl bg-emerald-700 py-3 text-sm font-semibold text-white"
                  >
                    Elegir dirección
                  </button>
                </div>
              )}

              {!loadingAddresses && hasAddresses && selectedAddress && (
                <button
                  onClick={() => setAddressPickerOpen(true)}
                  className="w-full rounded-2xl border border-emerald-700 bg-emerald-50/40 p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 grid h-5 w-5 place-items-center rounded-md border border-emerald-700 bg-emerald-700 text-white">
                        ✓
                      </span>

                      <div className="min-w-0">
                        <div className="text-sm font-semibold">
                          {selectedAddress.label}
                          {selectedAddress.is_default && (
                            <span className="ml-1 text-xs font-medium text-zinc-400">
                              predeterminado
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {formatAddressLine(selectedAddress)}
                        </div>
                      </div>
                    </div>

                    <span className="text-zinc-400">✎</span>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="mt-6">
          <div className="text-sm font-semibold">Método de pago</div>

          <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <button
              onClick={() => {
                if (effectiveDeliveryType === "pickup" && !isMultiSupermarket) {
                  setPayType("cash");
                }
              }}
              disabled={effectiveDeliveryType === "delivery" || isMultiSupermarket}
              className={`flex w-full items-center justify-between px-4 py-4 text-left ${
                effectiveDeliveryType === "delivery" || isMultiSupermarket
                  ? "opacity-50"
                  : "hover:bg-zinc-50"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">👛</span>
                <div className="text-sm font-semibold">Efectivo</div>
              </div>
              <span
                className={`grid h-5 w-5 place-items-center rounded-full border ${
                  effectivePayType === "cash"
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : "border-zinc-300 bg-white"
                }`}
              >
                {effectivePayType === "cash" ? "✓" : ""}
              </span>
            </button>

            <div className="h-px bg-zinc-200" />

            <button
              onClick={() => setPayType("card")}
              className="flex w-full items-center justify-between px-4 py-4 text-left hover:bg-zinc-50"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">💳</span>
                <div className="text-sm font-semibold">Tarjeta</div>
              </div>
              <span
                className={`grid h-5 w-5 place-items-center rounded-full border ${
                  effectivePayType === "card"
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : "border-zinc-300 bg-white"
                }`}
              >
                {effectivePayType === "card" ? "✓" : ""}
              </span>
            </button>

            {effectivePayType === "card" && (
              <div className="border-t bg-zinc-50 p-3">
                {loadingMethods && (
                  <div className="text-xs text-zinc-500">Cargando tarjetas…</div>
                )}

                {!loadingMethods && methods.length === 0 && (
                  <div className="text-xs text-zinc-600">
                    No tienes tarjetas guardadas. Agrega una en <b>Perfil</b>.
                  </div>
                )}

                {!loadingMethods && methods.length > 0 && (
                  <div className="space-y-2">
                    {methods.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setSelectedCardId(m.id)}
                        className={`flex w-full items-center justify-between rounded-2xl border bg-white px-3 py-3 text-left ${
                          selectedCardId === m.id ? "border-emerald-700" : "border-zinc-200"
                        }`}
                      >
                        <div className="text-sm font-semibold">
                          {BrandLabel(m.brand)} •••• {m.last4}
                        </div>

                        <span
                          className={`grid h-5 w-5 place-items-center rounded-full border ${
                            selectedCardId === m.id
                              ? "border-emerald-700 bg-emerald-700 text-white"
                              : "border-zinc-300 bg-white"
                          }`}
                        >
                          {selectedCardId === m.id ? "✓" : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-2 text-xs text-zinc-500">
            {isMultiSupermarket ? "* Con 2+ supermercados solo se permite tarjeta y delivery. " : ""}
            {effectiveDeliveryType === "delivery"
              ? "* Efectivo no está disponible para delivery."
              : "* Efectivo está disponible solo para pickup."}
          </div>
        </div>

        {filteredSupermarkets.length > 0 && (
          <div className="mt-6 space-y-3">
            <div className="text-sm font-semibold">Artículos a ordenar</div>

            {filteredSupermarkets.map((g) => (
              <div
                key={g.supermarket_id}
                className="rounded-2xl border border-zinc-200 bg-white p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-semibold">{g.supermarket_name}</div>
                  <div className="text-sm font-semibold">{money(g.subtotal)}</div>
                </div>

                <div className="space-y-2">
                  {g.items.map((it) => (
                    <div
                      key={it.cart_item_id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-zinc-900">
                          {it.product_name}
                        </div>
                        <div className="text-xs text-zinc-500">Qty: {toNum(it.quantity)}</div>
                      </div>
                      <div className="font-semibold text-zinc-900">{money(it.line_total)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {itemsSavings > 0 && (
          <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Ahorro estimado: <span className="font-semibold">{money(itemsSavings)}</span>
          </div>
        )}

        {err && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        )}

        <div className="fixed bottom-14 left-0 right-0 z-40 border-t bg-white">
          <div className="mx-auto max-w-[430px] px-4 py-3">
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
              <div className="mb-3 text-sm font-semibold text-zinc-900">Detalle de pago</div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-500">Precio total:</span>
                  <span className="font-medium text-zinc-800">{money(itemsSubtotal)}</span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-500">Envío:</span>
                  <span
                    className={
                      deliveryFee > 0
                        ? "font-medium text-zinc-800"
                        : "text-zinc-400 line-through"
                    }
                  >
                    {deliveryFee > 0 ? money(deliveryFee) : "Gratis"}
                  </span>
                </div>

                <div className="h-px bg-zinc-200" />

                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-zinc-900">Pago total</span>
                  <span className="text-base font-bold text-red-600">{money(totalPayment)}</span>
                </div>
              </div>

              <div className="mt-3 text-[11px] leading-4 text-zinc-500">
                Al hacer clic en “Realizar pedido” significa que acepta cumplir con los{" "}
                <span className="font-medium text-emerald-700">términos de uso</span>.
              </div>
            </div>

            {deliveryNeedsAddress && !selectedAddressId && (
              <div className="mt-2 text-xs text-zinc-600">
                Selecciona una dirección para el envío.
              </div>
            )}

            <button
              disabled={
                submitting ||
                (effectivePayType === "card" && methods.length === 0) ||
                (deliveryNeedsAddress && !selectedAddressId)
              }
              onClick={submit}
              className="mt-3 w-full rounded-full bg-emerald-700 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitting ? "Procesando…" : "Realizar pedido"}
            </button>
          </div>
        </div>

        <div className="h-64" />
      </div>

      <AddressPickerSheet
        open={addressPickerOpen}
        onClose={() => setAddressPickerOpen(false)}
        onSelect={(address) => {
          setAddresses((prev) => {
            const exists = prev.some((x) => x.id === address.id);
            const next = exists
              ? prev.map((x) => (x.id === address.id ? address : x))
              : [address, ...prev];
            return next;
          });
          setSelectedAddressId(address.id);
          setStoredActiveAddressId(address.id);
        }}
      />
    </>
  );
}