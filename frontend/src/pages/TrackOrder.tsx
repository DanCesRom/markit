import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiGet, apiPost } from "../lib/api";


type MeResponse = {
    id?: number;
    first_name?: string | null;
    last_name?: string | null;
    name?: string | null;
    full_name?: string | null;
    email?: string | null;
};


import type {
    Order,
    OrderStatusHistoryListResponse,
    OrderStatusHistoryItem,
} from "../lib/types";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";

import avatarImg from "../assets/home/avatar.png";

let googleMapsConfigured = false;

type LatLngPoint = {
    lat: number;
    lng: number;
};

function fmtMinutesByStatus(status: string) {
    const s = (status || "").toLowerCase();
    if (s === "completed") return 0;
    if (s === "preparing") return 20;
    if (s === "paid") return 30;
    if (s === "created") return 30;
    return 25;
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


function normalizeStatus(s: string) {
    const v = (s || "").toLowerCase();
    if (v === "created" || v === "paid") return "Pedido Realizado";
    if (v === "preparing") return "En Camino";
    if (v === "completed") return "Pedido Recibido";
    if (v === "cancelled") return "Cancelado";
    return s;
}

function pickTimeline(history: OrderStatusHistoryItem[], fallbackStatus: string) {
    const sorted = [...history].sort((a, b) =>
        String(a.changed_at).localeCompare(String(b.changed_at))
    );

    const last = sorted[sorted.length - 1]?.status || fallbackStatus;

    const steps = [
        { key: "created", label: "Pedido Realizado" },
        { key: "paid", label: "Pedido Confirmado" },
        { key: "preparing", label: "En Camino" },
        { key: "completed", label: "Pedido Recibido" },
    ];

    const doneSet = new Set(sorted.map((h) => (h.status || "").toLowerCase()));
    const lastKey = (last || "").toLowerCase();

    const isDone = (k: string) => {
        if (doneSet.has(k)) return true;

        if (
            (lastKey === "preparing" || lastKey === "completed") &&
            (k === "created" || k === "paid")
        ) {
            return true;
        }

        if (lastKey === "completed" && k === "preparing") return true;

        return false;
    };

    return { steps, isDone, lastKey };
}

function TrackingMap(props: {
    supermercado: LatLngPoint;
    cliente: LatLngPoint;
    onEtaMinutes?: (minutes: number | null) => void;
}) {
    const mapRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function initMap() {
            const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

            if (!apiKey || !mapRef.current) {
                props.onEtaMinutes?.(null);
                return;
            }

            if (!googleMapsConfigured) {
                setOptions({
                    key: apiKey,
                });

                googleMapsConfigured = true;
            }

            const mapsLibrary = (await importLibrary(
                "maps"
            )) as google.maps.MapsLibrary;

            await importLibrary("marker");

            if (cancelled || !mapRef.current) return;

            const map = new mapsLibrary.Map(mapRef.current, {
                center: props.supermercado,
                zoom: 13,
                disableDefaultUI: true,
                gestureHandling: "greedy",
            });

            new google.maps.Marker({
                position: props.supermercado,
                map,
                title: "Supermercado",
                label: "S",
            });

            new google.maps.Marker({
                position: props.cliente,
                map,
                title: "Cliente",
                label: "C",
            });

            const directionsService = new google.maps.DirectionsService();

            const directionsRenderer = new google.maps.DirectionsRenderer({
                map,
                suppressMarkers: true,
                preserveViewport: false,
            });

            directionsService.route(
                {
                    origin: props.supermercado,
                    destination: props.cliente,
                    travelMode: google.maps.TravelMode.DRIVING,
                },
                (result: google.maps.DirectionsResult | null, status: string) => {
                    if (cancelled) return;

                    if (status === "OK" && result) {
                        directionsRenderer.setDirections(result);

                        const leg = result.routes?.[0]?.legs?.[0];
                        const seconds = leg?.duration?.value;

                        props.onEtaMinutes?.(seconds ? Math.ceil(seconds / 60) : null);
                        return;
                    }

                    console.error("Directions error:", status);
                    props.onEtaMinutes?.(null);
                }
            );
        }

        initMap().catch((e) => {
            console.error("Error cargando Google Maps:", e);
            props.onEtaMinutes?.(null);
        });

        return () => {
            cancelled = true;
        };
    }, [props.supermercado, props.cliente, props.onEtaMinutes]);

    return <div ref={mapRef} className="h-full w-full" />;
}

function CompletedOrderMessage() {
    return (
        <div className="flex h-44 w-full items-center justify-center bg-gradient-to-br from-emerald-50 via-white to-emerald-50 px-6 text-center">
            <div>
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-700 text-2xl text-white shadow-sm">
                    ✓
                </div>

                <div className="mt-4 text-xl font-semibold text-zinc-950">
                    ¡Disfruta tu compra!
                </div>

                <div className="mx-auto mt-2 max-w-[260px] text-sm leading-5 text-zinc-500">
                    Gracias por comprar con Markit. Tu pedido fue recibido correctamente.
                </div>
            </div>
        </div>
    );
}

export default function TrackOrder() {
    const navigate = useNavigate();
    const { orderId } = useParams();
    const [me, setMe] = useState<MeResponse | null>(null);

    const [order, setOrder] = useState<Order | null>(null);
    const [history, setHistory] = useState<OrderStatusHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [finishing, setFinishing] = useState(false);
    const [mapEtaMinutes, setMapEtaMinutes] = useState<number | null>(null);

    useEffect(() => {
        let active = true;

        (async () => {
            try {
                const data = await apiGet<MeResponse>("/auth/me");
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

    async function load() {
        const o = await apiGet<Order>(`/orders/${orderId}`);
        const h = await apiGet<OrderStatusHistoryListResponse>(
            `/orders/${orderId}/status-history`
        );

        setOrder(o);
        setHistory(h.history ?? []);
    }

    useEffect(() => {
        (async () => {
            setErr(null);
            setLoading(true);

            try {
                await load();
            } catch (e: any) {
                setErr(e?.message ?? "No pude cargar tracking");
            } finally {
                setLoading(false);
            }
        })();

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderId]);

    const currentStatus = (order?.status ?? "").toLowerCase();
    const isCompleted = currentStatus === "completed";
    const customerName = useMemo(() => getFirstNameFromMe(me), [me]);

    const supermercadoCoords = useMemo<LatLngPoint>(() => {
        return {
            lat: 18.502229,
            lng: -69.943382,
        };
    }, []);

    const clienteCoords = useMemo<LatLngPoint>(() => {
        return {
            lat: 18.506273,
            lng: -70.002204,
        };
    }, []);

    const eta = isCompleted
        ? 0
        : mapEtaMinutes ?? fmtMinutesByStatus(currentStatus);

    const { steps, isDone, lastKey } = useMemo(
        () => pickTimeline(history, order?.status ?? "created"),
        [history, order?.status]
    );

    async function markReceived() {
        if (!orderId) return;

        setErr(null);
        setFinishing(true);

        try {
            await apiPost(`/orders/${orderId}/status`, {
                status: "completed",
                changed_by: "user",
            });

            await load();
        } catch (e: any) {
            setErr(e?.message ?? "No pude completar la orden");
        } finally {
            setFinishing(false);
        }
    }

    if (loading) {
        return <div className="text-sm text-zinc-500">Cargando tracking…</div>;
    }

    if (!order) {
        return (
            <div className="rounded-2xl border bg-white p-4 text-sm text-zinc-600">
                No pude cargar la orden.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => navigate("/")}
                        className="grid h-9 w-9 place-items-center rounded-xl hover:bg-zinc-100"
                    >
                        ←
                    </button>

                    <div className="text-lg font-semibold">Rastrear Pedido</div>
                </div>

                <button
                    type="button"
                    className="grid h-9 w-9 place-items-center rounded-xl hover:bg-zinc-100"
                >
                    ⋮
                </button>
            </div>

            <div className="overflow-hidden rounded-2xl border bg-white">
                <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                        <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-zinc-100">
                            <img
                                src={avatarImg}
                                alt={customerName}
                                className="h-full w-full object-cover"
                                draggable={false}
                            />
                        </div>

                        <div>
                            <div className="text-sm font-semibold">{customerName}</div>
                            <div className="text-xs text-zinc-500">
                                {isCompleted
                                    ? "Pedido entregado"
                                    : "Información de entrega"}
                            </div>
                        </div>
                    </div>

                    {!isCompleted && (
                        <button
                            type="button"
                            className="grid h-10 w-10 place-items-center rounded-full border border-emerald-700 text-emerald-700"
                        >
                            ☎
                        </button>
                    )}
                </div>

                <div className="h-44 w-full overflow-hidden bg-zinc-100">
                    {isCompleted ? (
                        <CompletedOrderMessage />
                    ) : (
                        <TrackingMap
                            supermercado={supermercadoCoords}
                            cliente={clienteCoords}
                            onEtaMinutes={setMapEtaMinutes}
                        />
                    )}
                </div>

                <div className="grid grid-cols-2 gap-2 px-4 py-3 text-center text-xs">
                    <div className="rounded-xl bg-zinc-50 p-2">
                        <div className="text-[10px] text-zinc-500">
                            {isCompleted ? "ESTADO" : "TIEMPO ESTIMADO"}
                        </div>
                        <div className="mt-0.5 font-semibold">
                            {isCompleted ? "Recibido" : `${eta} minutos`}
                        </div>
                    </div>

                    <div className="rounded-xl bg-zinc-50 p-2">
                        <div className="text-[10px] text-zinc-500">NÚMERO DE PEDIDO</div>
                        <div className="mt-0.5 font-semibold">#{order.id}</div>
                    </div>
                </div>
            </div>

            <div className="space-y-2">
                {steps.map((s) => {
                    const done = isDone(s.key);
                    const active =
                        !done && s.key === (lastKey === "paid" ? "paid" : lastKey);

                    return (
                        <div
                            key={s.key}
                            className={`rounded-2xl border bg-white p-4 ${done ? "border-emerald-700" : "border-zinc-200"
                                }`}
                        >
                            <div className="flex items-start gap-3">
                                <div
                                    className={`mt-0.5 grid h-7 w-7 place-items-center rounded-full border ${done
                                            ? "border-emerald-700 bg-emerald-700 text-white"
                                            : active
                                                ? "border-emerald-700 text-emerald-700"
                                                : "border-zinc-300 text-zinc-400"
                                        }`}
                                >
                                    {done ? "✓" : "○"}
                                </div>

                                <div className="min-w-0 flex-1">
                                    <div className="text-sm font-semibold">{s.label}</div>
                                    <div className="mt-0.5 text-xs text-zinc-500">
                                        {normalizeStatus(s.key)} {done ? "✓" : ""}
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>


            {err && (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {err}
                </div>
            )}

            <button
                type="button"
                onClick={markReceived}
                disabled={finishing || isCompleted || currentStatus === "cancelled"}
                className={`w-full rounded-full py-4 text-sm font-semibold ${isCompleted
                        ? "bg-zinc-200 text-zinc-600"
                        : "bg-slate-900 text-white"
                    } disabled:opacity-50`}
            >
                {isCompleted
                    ? "Pedido Recibido"
                    : finishing
                        ? "Actualizando…"
                        : "Pedido Recibido"}
            </button>
        </div>
    );
}