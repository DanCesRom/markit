import { useEffect, useMemo, useState } from "react";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { apiPatch, apiPost } from "../../lib/api";
import type { Address, AddressCreateInput } from "../../lib/types";

const DEFAULT_CENTER: [number, number] = [18.4861, -69.9312]; // Santo Domingo

const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const IOS_SAFE_INPUT_CLASS =
  "text-base [transform:scale(0.875)] origin-left";
const IOS_SAFE_TEXTAREA_CLASS =
  "text-base [transform:scale(0.875)] origin-top-left";

type NominatimAddress = {
  country?: string;
  country_code?: string;
  city?: string;
  town?: string;
  village?: string;
  state?: string;
  postcode?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  house_number?: string;
};

type NominatimSearchItem = {
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
};

type NominatimReverseItem = {
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
};

function toNullableString(v: string) {
  const s = v.trim();
  return s.length ? s : null;
}

function pickCity(address?: NominatimAddress) {
  return address?.city || address?.town || address?.village || "";
}

function buildLine1FromAddress(address?: NominatimAddress) {
  const road = address?.road ?? "";
  const houseNumber = address?.house_number ?? "";
  return [road, houseNumber].filter(Boolean).join(" ").trim();
}

function isDominicanRepublic(address?: NominatimAddress) {
  const code = (address?.country_code || "").toLowerCase().trim();
  const country = (address?.country || "").toLowerCase().trim();

  return (
    code === "do" ||
    country === "dominican republic" ||
    country === "república dominicana" ||
    country === "republica dominicana"
  );
}

async function geocodeAddress(query: string): Promise<NominatimSearchItem | null> {
  const q = query.trim();
  if (!q) return null;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "do");
  url.searchParams.set("q", `${q}, Dominican Republic`);

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error("No pude buscar la dirección en el mapa.");
  }

  const data = (await res.json()) as NominatimSearchItem[];
  return data[0] ?? null;
}

async function reverseGeocode(lat: number, lon: number): Promise<NominatimReverseItem | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error("No pude obtener la dirección desde el pin.");
  }

  const data = (await res.json()) as NominatimReverseItem;
  return data ?? null;
}

function MapController(props: { center: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.setView(props.center, 16, { animate: true });
  }, [map, props.center]);

  return null;
}

function PinPicker(props: {
  position: [number, number];
  onChange: (pos: [number, number]) => void;
}) {
  useMapEvents({
    click(e) {
      props.onChange([e.latlng.lat, e.latlng.lng]);
    },
  });

  return <Marker position={props.position} icon={markerIcon} />;
}

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: (address: Address) => void;
  editing?: Address | null;
  initialSearchText?: string;
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

    setLabel(editing?.label ?? "");
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

    setSearchText(initialSearchText?.trim() ?? editing?.formatted_address ?? editing?.line1 ?? "");

    const lat = Number(editing?.latitude);
    const lng = Number(editing?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      setPosition([lat, lng]);
    } else {
      setPosition(DEFAULT_CENTER);
    }
  }, [open, editing, initialSearchText]);

  async function applyReverseGeocode(lat: number, lng: number) {
    setReverseLoading(true);
    setErr(null);

    try {
      const result = await reverseGeocode(lat, lng);
      if (!result) {
        throw new Error("No encontré detalles para esa ubicación.");
      }

      if (!isDominicanRepublic(result.address)) {
        throw new Error("La ubicación debe estar dentro de República Dominicana.");
      }

      const nextLine1 = buildLine1FromAddress(result.address) || line1 || "";
      const nextCity = pickCity(result.address) || city || "";
      const nextState = result.address?.state ?? state ?? "";
      const nextPostal = result.address?.postcode ?? postalCode ?? "";

      setFormattedAddress(result.display_name ?? "");
      setLine1(nextLine1);
      setCity(nextCity);
      setState(nextState);
      setPostalCode(nextPostal);
      setSearchText(result.display_name ?? nextLine1 ?? "");
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

      if (!isDominicanRepublic(found.address)) {
        throw new Error("Solo se permiten direcciones dentro de República Dominicana.");
      }

      const lat = Number(found.lat);
      const lng = Number(found.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error("La ubicación encontrada no es válida.");
      }

      setPosition([lat, lng]);

      const nextLine1 = buildLine1FromAddress(found.address) || line1 || "";
      const nextCity = pickCity(found.address) || city || "";
      const nextState = found.address?.state ?? state ?? "";
      const nextPostal = found.address?.postcode ?? postalCode ?? "";

      setFormattedAddress(found.display_name ?? "");
      setLine1(nextLine1 || searchText.trim());
      setCity(nextCity);
      setState(nextState);
      setPostalCode(nextPostal);
    } catch (e: any) {
      setErr(e?.message ?? "No pude ubicar esa dirección.");
    } finally {
      setSearching(false);
    }
  }

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
            <label className="text-sm font-semibold text-zinc-900">Search address</label>
            <div className="mt-2 flex gap-2">
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Calle La Vigia 14"
                className={`flex-1 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none focus:border-emerald-600 ${IOS_SAFE_INPUT_CLASS}`}
              />
              <button
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
              onClick={handleUseCurrentLocation}
              disabled={locating}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 disabled:opacity-50"
            >
              {locating ? "Locating..." : "Use current location"}
            </button>

            <button
              onClick={() => applyReverseGeocode(position[0], position[1])}
              disabled={reverseLoading}
              className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700 disabled:opacity-50"
            >
              {reverseLoading ? "Loading..." : "Use pin location"}
            </button>
          </div>

          <div className="mt-4 overflow-hidden rounded-3xl border border-zinc-200">
            <div className="h-[220px] w-full">
              <MapContainer
                center={position}
                zoom={16}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors"
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <MapController center={position} />
                <PinPicker position={position} onChange={setPosition} />
              </MapContainer>
            </div>

            <div className="border-t bg-white px-4 py-3 text-sm text-zinc-600">
              Tap on the map to move the pin.
            </div>
          </div>

          <div className="mt-4 text-sm text-zinc-700">
            Lat: {position[0].toFixed(6)} · Lng: {position[1].toFixed(6)}
          </div>

          <div className="mt-5">
            <label className="text-sm font-semibold text-zinc-900">Label (optional)</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Home, Office, Apartment..."
              className={`mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none focus:border-emerald-600 ${IOS_SAFE_INPUT_CLASS}`}
            />
          </div>

          <div className="mt-4">
            <label className="text-sm font-semibold text-zinc-900">Address line 1</label>
            <input
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
              placeholder="Calle La Vigia 14"
              className={`mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none focus:border-emerald-600 ${IOS_SAFE_INPUT_CLASS}`}
            />
          </div>

          <div className="mt-4">
            <label className="text-sm font-semibold text-zinc-900">Formatted address</label>
            <input
              value={formattedAddress}
              onChange={(e) => setFormattedAddress(e.target.value)}
              placeholder="Altos de Arroyo Hondo III, Santo Domingo, Dominican Republic"
              className={`mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none focus:border-emerald-600 ${IOS_SAFE_INPUT_CLASS}`}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-zinc-900">City</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Santo Domingo"
                className={`mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none focus:border-emerald-600 ${IOS_SAFE_INPUT_CLASS}`}
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-zinc-900">State</label>
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
              <label className="text-sm font-semibold text-zinc-900">Postal code</label>
              <input
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                placeholder="10100"
                className={`mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none focus:border-emerald-600 ${IOS_SAFE_INPUT_CLASS}`}
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-zinc-900">Building type</label>
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
            <label className="text-sm font-semibold text-zinc-900">Additional details</label>
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
            <label className="text-sm font-semibold text-zinc-900">Notes</label>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional"
              className={`mt-2 w-full rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 outline-none focus:border-emerald-600 ${IOS_SAFE_INPUT_CLASS}`}
            />
          </div>

          <div className="mt-4">
            <label className="text-sm font-semibold text-zinc-900">Address line 2</label>
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