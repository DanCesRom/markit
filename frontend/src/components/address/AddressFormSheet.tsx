import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { apiPatch, apiPost } from "../../lib/api";
import type { Address, AddressCreateInput } from "../../lib/types";

const DEFAULT_CENTER: [number, number] = [18.4861, -69.9312]; // Santo Domingo

const IOS_SAFE_INPUT_CLASS =
    "text-base [transform:scale(0.875)] origin-left";
const IOS_SAFE_TEXTAREA_CLASS =
    "text-base [transform:scale(0.875)] origin-top-left";

let googleMapsConfigured = false;

type GoogleAddressParts = {
    country?: string;
    countryCode?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    route?: string;
    streetNumber?: string;
};

type GoogleGeocodeResult = {
    lat: number;
    lng: number;
    formattedAddress: string;
    parts: GoogleAddressParts;
};

function toNullableString(v: string) {
    const s = v.trim();
    return s.length ? s : null;
}

function getComponent(
    components: google.maps.GeocoderAddressComponent[] | undefined,
    type: string,
    mode: "long" | "short" = "long"
) {
    const found = components?.find((c) => c.types.includes(type));
    if (!found) return "";
    return mode === "short" ? found.short_name : found.long_name;
}

function parseGoogleAddress(
    result: google.maps.GeocoderResult
): GoogleGeocodeResult {
    const components = result.address_components ?? [];
    const location = result.geometry.location;

    const city =
        getComponent(components, "locality") ||
        getComponent(components, "administrative_area_level_2") ||
        getComponent(components, "sublocality") ||
        getComponent(components, "neighborhood");

    return {
        lat: location.lat(),
        lng: location.lng(),
        formattedAddress: result.formatted_address ?? "",
        parts: {
            country: getComponent(components, "country"),
            countryCode: getComponent(components, "country", "short"),
            city,
            state: getComponent(components, "administrative_area_level_1"),
            postalCode: getComponent(components, "postal_code"),
            route: getComponent(components, "route"),
            streetNumber: getComponent(components, "street_number"),
        },
    };
}

function buildLine1FromGoogle(parts?: GoogleAddressParts) {
    const road = parts?.route ?? "";
    const number = parts?.streetNumber ?? "";
    return [road, number].filter(Boolean).join(" ").trim();
}

function isDominicanRepublic(parts?: GoogleAddressParts) {
    const code = (parts?.countryCode || "").toLowerCase().trim();
    const country = (parts?.country || "").toLowerCase().trim();

    return (
        code === "do" ||
        country === "dominican republic" ||
        country === "república dominicana" ||
        country === "republica dominicana"
    );
}

async function ensureGoogleMapsReady() {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
        throw new Error("Falta configurar VITE_GOOGLE_MAPS_API_KEY.");
    }

    if (!googleMapsConfigured) {
        setOptions({
            key: apiKey,
        });

        googleMapsConfigured = true;
    }

    await importLibrary("maps");
    await importLibrary("marker");
}

async function geocodeAddress(query: string): Promise<GoogleGeocodeResult | null> {
    const q = query.trim();
    if (!q) return null;

    await ensureGoogleMapsReady();

    const geocoder = new google.maps.Geocoder();

    return new Promise((resolve, reject) => {
        geocoder.geocode(
            {
                address: `${q}, Dominican Republic`,
                region: "DO",
            },
            (results: google.maps.GeocoderResult[] | null, status: google.maps.GeocoderStatus) => {
                if (status === "OK" && results?.[0]) {
                    resolve(parseGoogleAddress(results[0]));
                    return;
                }

                reject(new Error("No encontré esa dirección. Intenta con una más específica."));
            }
        );
    });
}

async function reverseGeocode(
    lat: number,
    lng: number
): Promise<GoogleGeocodeResult | null> {
    await ensureGoogleMapsReady();

    const geocoder = new google.maps.Geocoder();

    return new Promise((resolve, reject) => {
        geocoder.geocode(
            {
                location: { lat, lng },
                region: "DO",
            },
            (results: google.maps.GeocoderResult[] | null, status: google.maps.GeocoderStatus) => {
                if (status === "OK" && results?.[0]) {
                    resolve(parseGoogleAddress(results[0]));
                    return;
                }

                reject(new Error("No pude obtener la dirección desde el pin."));
            }
        );
    });
}

function GoogleMapPicker(props: {
    position: [number, number];
    onChange: (pos: [number, number]) => void;
}) {
    const mapElRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<google.maps.Map | null>(null);
    const markerRef = useRef<google.maps.Marker | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function initMap() {
            try {
                await ensureGoogleMapsReady();

                if (cancelled || !mapElRef.current) return;

                const center = {
                    lat: props.position[0],
                    lng: props.position[1],
                };

                const map = new google.maps.Map(mapElRef.current, {
                    center,
                    zoom: 16,
                    disableDefaultUI: true,
                    gestureHandling: "greedy",
                });

                const marker = new google.maps.Marker({
                    position: center,
                    map,
                    draggable: true,
                    title: "Ubicación de entrega",
                });

                mapRef.current = map;
                markerRef.current = marker;

                map.addListener("click", (e: google.maps.MapMouseEvent) => {
                    if (!e.latLng) return;

                    const lat = e.latLng.lat();
                    const lng = e.latLng.lng();

                    marker.setPosition({ lat, lng });
                    props.onChange([lat, lng]);
                });

                marker.addListener("dragend", (e: google.maps.MapMouseEvent) => {
                    if (!e.latLng) return;

                    const lat = e.latLng.lat();
                    const lng = e.latLng.lng();

                    props.onChange([lat, lng]);
                });
            } catch (e) {
                console.error("Error cargando Google Maps:", e);
            }
        }

        initMap();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const next = {
            lat: props.position[0],
            lng: props.position[1],
        };

        mapRef.current?.setCenter(next);
        markerRef.current?.setPosition(next);
    }, [props.position]);

    return <div ref={mapElRef} className="h-[220px] w-full" />;
}

type Props = {
    open: boolean;
    onClose: () => void;
    onSaved: (address: Address) => void;
    editing?: Address | null;
    initialSearchText?: string;
    initialLabel?: string;
};

const BUILDING_TYPES = [
    { value: "house", label: "House" },
    { value: "apartment", label: "Apartment" },
    { value: "office", label: "Office" },
    { value: "hotel", label: "Hotel" },
    { value: "other", label: "Other" },
];

export default function AddressFormSheet({
    open,
    onClose,
    onSaved,
    editing,
    initialSearchText,
    initialLabel,
}: Props) {
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);

    const [searchText, setSearchText] = useState("");
    const [locating, setLocating] = useState(false);
    const [searching, setSearching] = useState(false);
    const [reverseLoading, setReverseLoading] = useState(false);

    const [label, setLabel] = useState("");
    const [line1, setLine1] = useState("");
    const [line2, setLine2] = useState("");
    const [city, setCity] = useState("Santo Domingo");
    const [state, setState] = useState("");
    const [postalCode, setPostalCode] = useState("");
    const [notes, setNotes] = useState("");

    const [buildingType, setBuildingType] = useState("house");
    const [formattedAddress, setFormattedAddress] = useState("");
    const [referenceNote, setReferenceNote] = useState("");
    const [deliveryInstructions, setDeliveryInstructions] = useState("");

    const initialPos = useMemo<[number, number]>(() => {
        const lat = Number(editing?.latitude);
        const lng = Number(editing?.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
        return DEFAULT_CENTER;
    }, [editing]);

    const [position, setPosition] = useState<[number, number]>(initialPos);

    useEffect(() => {
        if (!open) return;

        setErr(null);

        setLabel(editing?.label ?? initialLabel ?? "");
        setLine1(editing?.line1 ?? "");
        setLine2(editing?.line2 ?? "");
        setCity(editing?.city ?? "Santo Domingo");
        setState(editing?.state ?? "");
        setPostalCode(editing?.postal_code ?? "");
        setNotes(editing?.notes ?? "");

        setBuildingType(editing?.building_type ?? "house");
        setFormattedAddress(editing?.formatted_address ?? "");
        setReferenceNote(editing?.reference_note ?? "");
        setDeliveryInstructions(editing?.delivery_instructions ?? "");

        setSearchText(
            initialSearchText?.trim() ??
            editing?.formatted_address ??
            editing?.line1 ??
            ""
        );

        const lat = Number(editing?.latitude);
        const lng = Number(editing?.longitude);

        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            setPosition([lat, lng]);
        } else {
            setPosition(DEFAULT_CENTER);
        }
    }, [open, editing, initialSearchText]);

    function applyGoogleAddressResult(result: GoogleGeocodeResult, fallbackLine1 = "") {
        if (!isDominicanRepublic(result.parts)) {
            throw new Error("La ubicación debe estar dentro de República Dominicana.");
        }

        const nextLine1 =
            buildLine1FromGoogle(result.parts) ||
            fallbackLine1 ||
            line1 ||
            result.formattedAddress ||
            "";

        const nextCity = result.parts.city || city || "Santo Domingo";
        const nextState = result.parts.state || state || "";
        const nextPostal = result.parts.postalCode || postalCode || "";

        setPosition([result.lat, result.lng]);
        setFormattedAddress(result.formattedAddress);
        setLine1(nextLine1);
        setCity(nextCity);
        setState(nextState);
        setPostalCode(nextPostal);
        setSearchText(result.formattedAddress || nextLine1);
    }

    async function applyReverseGeocode(lat: number, lng: number) {
        setReverseLoading(true);
        setErr(null);

        try {
            const result = await reverseGeocode(lat, lng);

            if (!result) {
                throw new Error("No encontré detalles para esa ubicación.");
            }

            applyGoogleAddressResult(result);
        } catch (e: any) {
            setErr(e?.message ?? "No pude obtener la dirección desde el pin.");
        } finally {
            setReverseLoading(false);
        }
    }

    async function handleSearchAddress() {
        if (!searchText.trim()) {
            setErr("Escribe una dirección o calle para buscar.");
            return;
        }

        setSearching(true);
        setErr(null);

        try {
            const found = await geocodeAddress(searchText);

            if (!found) {
                throw new Error("No encontré esa dirección. Intenta con una más específica.");
            }

            applyGoogleAddressResult(found, searchText.trim());
        } catch (e: any) {
            setErr(e?.message ?? "No pude ubicar esa dirección.");
        } finally {
            setSearching(false);
        }
    }

    const handlePinChange = useCallback((pos: [number, number]) => {
        setPosition(pos);
    }, []);

    function handleUseCurrentLocation() {
        if (!navigator.geolocation) {
            setErr("Tu navegador no soporta geolocalización.");
            return;
        }

        setLocating(true);
        setErr(null);

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;

                setPosition([lat, lng]);
                setLocating(false);

                await applyReverseGeocode(lat, lng);
            },
            (geoErr) => {
                setLocating(false);

                if (geoErr.code === 1) {
                    setErr("Debes permitir acceso a tu ubicación para usar esta opción.");
                    return;
                }

                setErr("No pude obtener tu ubicación actual.");
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0,
            }
        );
    }

    async function save() {
        if (!line1.trim()) {
            setErr("Escribe la dirección principal.");
            return;
        }

        setErr(null);
        setSaving(true);

        try {
            const payload: AddressCreateInput = {
                label: label?.trim() ?? "",
                line1: line1.trim(),
                line2: toNullableString(line2),
                city: toNullableString(city),
                state: toNullableString(state),
                postal_code: toNullableString(postalCode),
                notes: toNullableString(notes),
                latitude: position[0],
                longitude: position[1],
                building_type: toNullableString(buildingType),
                formatted_address: toNullableString(formattedAddress) ?? line1.trim(),
                reference_note: toNullableString(referenceNote),
                delivery_instructions: toNullableString(deliveryInstructions),
                is_default: editing?.is_default ?? false,
            };

            let saved: Address;

            if (editing?.id) {
                saved = await apiPatch<Address>(`/addresses/${editing.id}`, payload);
            } else {
                saved = await apiPost<Address>("/addresses", payload);
            }

            onSaved(saved);
            onClose();
        } catch (e: any) {
            setErr(e?.message ?? "No pude guardar la dirección");
        } finally {
            setSaving(false);
        }
    }

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[120]">
            <button
                className="absolute inset-0 bg-black/35"
                onClick={onClose}
                aria-label="Close"
            />

            <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[430px] rounded-t-[28px] bg-white shadow-2xl">
                <div className="max-h-[92vh] overflow-y-auto px-5 pb-6 pt-4">
                    <div className="mb-4 flex items-center justify-between">
                        <button
                            type="button"
                            onClick={onClose}
                            className="grid h-10 w-10 place-items-center rounded-full hover:bg-zinc-100"
                        >
                            ←
                        </button>

                        <div className="text-xl font-semibold">
                            {editing ? "Edit address" : "Address info"}
                        </div>

                        <div className="w-10" />
                    </div>

                    <div>
                        <label className="text-sm font-semibold text-zinc-900">
                            Search address
                        </label>

                        <div className="mt-2 flex gap-2">
                            <input
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                placeholder="Calle La Vigia 14"
                                className={`flex-1 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none focus:border-emerald-600 ${IOS_SAFE_INPUT_CLASS}`}
                            />

                            <button
                                type="button"
                                onClick={handleSearchAddress}
                                disabled={searching}
                                className="rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                            >
                                {searching ? "..." : "Go"}
                            </button>
                        </div>
                    </div>

                    <div className="mt-3 flex gap-2">
                        <button
                            type="button"
                            onClick={handleUseCurrentLocation}
                            disabled={locating}
                            className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 disabled:opacity-50"
                        >
                            {locating ? "Locating..." : "Use current location"}
                        </button>

                        <button
                            type="button"
                            onClick={() => applyReverseGeocode(position[0], position[1])}
                            disabled={reverseLoading}
                            className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 disabled:opacity-50"
                        >
                            {reverseLoading ? "Loading..." : "Use pin location"}
                        </button>
                    </div>

                    <div className="mt-4 overflow-hidden rounded-3xl border border-zinc-200">
                        <GoogleMapPicker position={position} onChange={handlePinChange} />

                        <div className="border-t bg-white px-4 py-3 text-sm text-zinc-600">
                            Toca el mapa o mueve el pin para ajustar la entrega.
                        </div>
                    </div>

                    <div className="mt-4 text-sm text-zinc-700">
                        Lat: {position[0].toFixed(6)} · Lng: {position[1].toFixed(6)}
                    </div>

                    <div className="mt-5">
                        <label className="text-sm font-semibold text-zinc-900">
                            Label (optional)
                        </label>

                        <input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="Home, Office, Apartment..."
                            className={`mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none focus:border-emerald-600 ${IOS_SAFE_INPUT_CLASS}`}
                        />
                    </div>

                    <div className="mt-4">
                        <label className="text-sm font-semibold text-zinc-900">
                            Address line 1
                        </label>

                        <input
                            value={line1}
                            onChange={(e) => setLine1(e.target.value)}
                            placeholder="Calle La Vigia 14"
                            className={`mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none focus:border-emerald-600 ${IOS_SAFE_INPUT_CLASS}`}
                        />
                    </div>

                    <div className="mt-4">
                        <label className="text-sm font-semibold text-zinc-900">
                            Formatted address
                        </label>

                        <input
                            value={formattedAddress}
                            onChange={(e) => setFormattedAddress(e.target.value)}
                            placeholder="Altos de Arroyo Hondo III, Santo Domingo, Dominican Republic"
                            className={`mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none focus:border-emerald-600 ${IOS_SAFE_INPUT_CLASS}`}
                        />
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm font-semibold text-zinc-900">
                                City
                            </label>

                            <input
                                value={city}
                                onChange={(e) => setCity(e.target.value)}
                                placeholder="Santo Domingo"
                                className={`mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none focus:border-emerald-600 ${IOS_SAFE_INPUT_CLASS}`}
                            />
                        </div>

                        <div>
                            <label className="text-sm font-semibold text-zinc-900">
                                State
                            </label>

                            <input
                                value={state}
                                onChange={(e) => setState(e.target.value)}
                                placeholder="Distrito Nacional"
                                className={`mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none focus:border-emerald-600 ${IOS_SAFE_INPUT_CLASS}`}
                            />
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-sm font-semibold text-zinc-900">
                                Postal code
                            </label>

                            <input
                                value={postalCode}
                                onChange={(e) => setPostalCode(e.target.value)}
                                placeholder="10100"
                                className={`mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none focus:border-emerald-600 ${IOS_SAFE_INPUT_CLASS}`}
                            />
                        </div>

                        <div>
                            <label className="text-sm font-semibold text-zinc-900">
                                Building type
                            </label>

                            <select
                                value={buildingType}
                                onChange={(e) => setBuildingType(e.target.value)}
                                className={`mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none focus:border-emerald-600 ${IOS_SAFE_INPUT_CLASS}`}
                            >
                                {BUILDING_TYPES.map((x) => (
                                    <option key={x.value} value={x.value}>
                                        {x.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="mt-4">
                        <label className="text-sm font-semibold text-zinc-900">
                            Additional details
                        </label>

                        <input
                            value={referenceNote}
                            onChange={(e) => setReferenceNote(e.target.value)}
                            placeholder="Casa blanca con portón negro"
                            className={`mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none focus:border-emerald-600 ${IOS_SAFE_INPUT_CLASS}`}
                        />
                    </div>

                    <div className="mt-4">
                        <label className="text-sm font-semibold text-zinc-900">
                            Instructions for delivery person
                        </label>

                        <textarea
                            value={deliveryInstructions}
                            onChange={(e) => setDeliveryInstructions(e.target.value)}
                            placeholder="Por favor tocar el timbre"
                            rows={4}
                            className={`mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none focus:border-emerald-600 ${IOS_SAFE_TEXTAREA_CLASS}`}
                        />
                    </div>

                    <div className="mt-4">
                        <label className="text-sm font-semibold text-zinc-900">
                            Notes
                        </label>

                        <input
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Opcional"
                            className={`mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none focus:border-emerald-600 ${IOS_SAFE_INPUT_CLASS}`}
                        />
                    </div>

                    <div className="mt-4">
                        <label className="text-sm font-semibold text-zinc-900">
                            Address line 2
                        </label>

                        <input
                            value={line2}
                            onChange={(e) => setLine2(e.target.value)}
                            placeholder="Apto, torre, suite..."
                            className={`mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none focus:border-emerald-600 ${IOS_SAFE_INPUT_CLASS}`}
                        />
                    </div>

                    {err && (
                        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {err}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={save}
                        disabled={saving}
                        className="mt-6 w-full rounded-2xl bg-black py-4 text-sm font-semibold text-white disabled:opacity-50"
                    >
                        {saving ? "Saving..." : "Save and continue"}
                    </button>
                </div>
            </div>
        </div>
    );
}