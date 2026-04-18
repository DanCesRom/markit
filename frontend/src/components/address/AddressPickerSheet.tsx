import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../../lib/api";
import type { Address } from "../../lib/types";
import AddressFormSheet from "./AddressFormSheet";

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (address: Address) => void;
};

const ACTIVE_ADDRESS_STORAGE_KEY = "markit_active_address_id";

function formatShortAddress(a: Address) {
  const parts = [a.line1, a.city || "", a.state || ""].filter(
    (x) => String(x).trim().length > 0
  );
  return parts.join(", ");
}

export function getStoredActiveAddressId() {
  const raw = localStorage.getItem(ACTIVE_ADDRESS_STORAGE_KEY);
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function setStoredActiveAddressId(id: number | null) {
  if (!id) {
    localStorage.removeItem(ACTIVE_ADDRESS_STORAGE_KEY);
    return;
  }
  localStorage.setItem(ACTIVE_ADDRESS_STORAGE_KEY, String(id));
}

export default function AddressPickerSheet({ open, onClose, onSelect }: Props) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Address | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [initialSearchText, setInitialSearchText] = useState("");

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const list = await apiGet<Address[]>("/addresses");
      setAddresses(list);
    } catch (e: any) {
      setErr(e?.message ?? "No pude cargar direcciones");
    } finally {
      setLoading(false);
    }
  }

  function resetTransientState() {
    setQuery("");
    setEditing(null);
    setInitialSearchText("");
  }

  function handleCloseSheet() {
    resetTransientState();
    onClose();
  }

  function handleCloseForm() {
    setShowForm(false);
    setEditing(null);
    setInitialSearchText("");
  }

  useEffect(() => {
    if (!open) return;

    // ✅ cada vez que se abre, resetea búsqueda y vuelve a cargar
    setQuery("");
    setErr(null);
    load();
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return addresses;

    return addresses.filter((a) => {
      const text = [
        a.label,
        a.line1,
        a.line2 ?? "",
        a.city ?? "",
        a.state ?? "",
        a.formatted_address ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return text.includes(q);
    });
  }, [addresses, query]);

  async function handlePick(address: Address) {
    try {
      await apiPost(`/addresses/${address.id}/make-default`);
    } catch {
      // seguimos localmente aunque falle eso
    }

    setStoredActiveAddressId(address.id);
    onSelect({ ...address, is_default: true });
    handleCloseSheet();
  }

  async function handleSaved(saved: Address) {
    try {
      // ✅ recarga real desde backend para que salgan todas
      const list = await apiGet<Address[]>("/addresses");
      setAddresses(list);
    } catch {
      // fallback local si la recarga falla
      setAddresses((prev) => {
        const exists = prev.some((x) => x.id === saved.id);
        const next = exists
          ? prev.map((x) => (x.id === saved.id ? saved : x))
          : [saved, ...prev];

        return next.sort(
          (a, b) => Number(b.is_default) - Number(a.is_default) || a.id - b.id
        );
      });
    }

    // ✅ limpia filtro para que no se quede viendo solo la recién creada
    setQuery("");
    setEditing(null);
    setInitialSearchText("");

    setStoredActiveAddressId(saved.id);
    onSelect(saved);
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[110]">
        <button
          className="absolute inset-0 bg-black/35"
          onClick={handleCloseSheet}
          aria-label="Close"
        />

        <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[430px] rounded-t-[28px] bg-white shadow-2xl">
          <div className="max-h-[90vh] overflow-y-auto px-5 pb-6 pt-4">
            <div className="mb-4 flex items-center justify-between">
              <button
                onClick={handleCloseSheet}
                className="grid h-10 w-10 place-items-center rounded-full hover:bg-zinc-100"
              >
                ✕
              </button>
              <div className="text-xl font-semibold">Addresses</div>
              <div className="w-10" />
            </div>

            <div className="rounded-2xl bg-zinc-100 px-4 py-3">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for an address"
                className="w-full bg-transparent text-base outline-none placeholder:text-zinc-400 [transform:scale(0.875)] origin-left"
              />
            </div>

            <div className="mt-3">
              <button
                onClick={() => {
                  setEditing(null);
                  setInitialSearchText(query);
                  setShowForm(true);
                }}
                className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"
              >
                Search this on map
              </button>
            </div>

            <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
              {["Home", "Work", "Office"].map((x) => (
                <button
                  key={x}
                  onClick={() => {
                    setEditing(null);
                    setInitialSearchText(query);
                    setShowForm(true);
                  }}
                  className="shrink-0 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700"
                >
                  {x}
                </button>
              ))}

              <button
                onClick={() => {
                  setEditing(null);
                  setInitialSearchText(query);
                  setShowForm(true);
                }}
                className="shrink-0 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-700"
              >
                + Add label
              </button>
            </div>

            <div className="mt-6 text-[20px] font-semibold tracking-tight">
              Saved addresses
            </div>

            {loading && (
              <div className="mt-4 rounded-2xl border border-zinc-200 p-4 text-sm text-zinc-500">
                Loading addresses...
              </div>
            )}

            {err && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {err}
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div className="mt-4 rounded-2xl border border-zinc-200 p-4 text-sm text-zinc-500">
                No addresses found.
              </div>
            )}

            <div className="mt-3 space-y-2">
              {filtered.map((a) => (
                <button
                  key={a.id}
                  onClick={() => handlePick(a)}
                  className="flex w-full items-start justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-left hover:bg-zinc-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-lg">📍</div>
                      <div className="truncate text-sm font-semibold text-zinc-900">
                        {a.label}
                      </div>
                      {a.is_default && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          default
                        </span>
                      )}
                    </div>

                    <div className="mt-1 pl-7 text-sm text-zinc-500">
                      {a.formatted_address || formatShortAddress(a)}
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(a);
                      setInitialSearchText("");
                      setShowForm(true);
                    }}
                    className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100"
                    aria-label="Edit address"
                  >
                    ✎
                  </button>
                </button>
              ))}
            </div>

            <div className="mt-6">
              <button
                onClick={() => {
                  setEditing(null);
                  setInitialSearchText(query);
                  setShowForm(true);
                }}
                className="w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-700"
              >
                Add new address
              </button>
            </div>
          </div>
        </div>
      </div>

      <AddressFormSheet
        open={showForm}
        onClose={handleCloseForm}
        editing={editing}
        initialSearchText={initialSearchText}
        onSaved={handleSaved}
      />
    </>
  );
}