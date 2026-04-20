import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { apiDelete, apiGet } from "../lib/api";

type PaymentMethodApi = {
  id: number;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  nickname?: string | null;
  is_default: boolean;
  status: string;
  created_at: string;
};

function normalizeBrand(brand: string): "visa" | "mastercard" | "other" {
  const v = brand.trim().toLowerCase();
  if (v === "visa") return "visa";
  if (v === "mastercard") return "mastercard";
  return "other";
}

function ScreenHeader({ onBack }: { onBack: () => void }) {
  return (
    <div className="sticky top-0 z-10 bg-[#fafafa]/95 pb-4 pt-2 backdrop-blur">
      <div className="relative flex items-center">
        <button
          type="button"
          onClick={onBack}
          className="grid h-11 w-11 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-900 shadow-sm"
          aria-label="Back"
        >
          <ArrowLeftIcon />
        </button>
      </div>
    </div>
  );
}

function CardBrandIcon({ type }: { type: "visa" | "mastercard" | "other" }) {
  if (type === "visa") {
    return (
      <div className="grid h-16 w-16 place-items-center rounded-[20px] bg-blue-600 text-base font-bold text-white shadow-sm">
        VISA
      </div>
    );
  }

  if (type === "mastercard") {
    return (
      <div className="grid h-16 w-16 place-items-center rounded-[20px] bg-zinc-900 shadow-sm">
        <div className="relative h-7 w-11">
          <span className="absolute left-0 top-0 h-7 w-7 rounded-full bg-red-500 opacity-90" />
          <span className="absolute right-0 top-0 h-7 w-7 rounded-full bg-orange-400 opacity-90" />
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-16 w-16 place-items-center rounded-[20px] bg-zinc-100 text-zinc-600 shadow-sm">
      <CardIcon />
    </div>
  );
}

function ActionRow({
  title,
  subtitle,
  icon,
  danger,
  onClick,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 py-4 text-left ${
        danger ? "text-red-600" : "text-zinc-950"
      }`}
    >
      <div
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
          danger ? "bg-red-50 text-red-600" : "bg-zinc-100 text-zinc-700"
        }`}
      >
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <div
          className={`text-[15px] font-semibold ${
            danger ? "text-red-600" : "text-zinc-950"
          }`}
        >
          {title}
        </div>
        {subtitle ? (
          <div className="mt-1 text-sm text-zinc-500">{subtitle}</div>
        ) : null}
      </div>

      {!danger ? (
        <div className="text-zinc-400">
          <ChevronRightIcon />
        </div>
      ) : null}
    </button>
  );
}

export default function CardDetails() {
  const navigate = useNavigate();
  const params = useParams();
  const cardId = params.cardId;

  const [loading, setLoading] = useState(true);
  const [card, setCard] = useState<PaymentMethodApi | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  async function loadCard() {
    if (!cardId) return;
    const data = await apiGet<PaymentMethodApi>(`/payment-methods/${cardId}`);
    setCard(data);
  }

  useEffect(() => {
    (async () => {
      try {
        await loadCard();
      } catch {
        setFlash("No se pudieron cargar los detalles de la tarjeta");
      } finally {
        setLoading(false);
      }
    })();
  }, [cardId]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 2500);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const brand = useMemo(
    () => normalizeBrand(card?.brand ?? "other"),
    [card?.brand]
  );

  const brandTitle = useMemo(() => {
    if (brand === "visa") return "Visa";
    if (brand === "mastercard") return "Mastercard";
    return card?.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : "Card";
  }, [brand, card?.brand]);

  const formattedExpiry = useMemo(() => {
    if (!card) return "";
    return `${String(card.exp_month).padStart(2, "0")}/${card.exp_year}`;
  }, [card]);

  async function handleRemove() {
    if (!card) return;

    const confirmed = window.confirm(
      `Remove ${brandTitle} •••• ${card.last4}${card.nickname ? ` (${card.nickname})` : ""}?`
    );
    if (!confirmed) return;

    try {
      setRemoving(true);
      await apiDelete(`/payment-methods/${card.id}`);
      navigate("/wallet");
    } catch {
      setFlash("No se pudo eliminar el método de pago");
    } finally {
      setRemoving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-5 pb-8">
        <div className="h-12 animate-pulse rounded-2xl bg-zinc-100" />
        <div className="h-56 animate-pulse rounded-[30px] bg-zinc-100" />
        <div className="h-40 animate-pulse rounded-[30px] bg-zinc-100" />
      </div>
    );
  }

  if (!card) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-5 pb-8">
        <ScreenHeader onBack={() => navigate(-1)} />
        <div className="rounded-[30px] bg-white p-6 shadow-sm ring-1 ring-zinc-100">
          <h1 className="text-2xl font-bold text-zinc-950">Tarjeta no encontrada</h1>
          <p className="mt-2 text-sm text-zinc-500">
            No se pudieron cargar los detalles del método de pago seleccionado.
          </p>

          <button
            type="button"
            onClick={() => navigate("/wallet")}
            className="mt-5 rounded-full bg-zinc-900 px-5 py-3 text-sm font-semibold text-white"
          >
            Volver a la cartera
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 pb-8">
      {flash ? (
        <div className="sticky top-3 z-20">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-sm">
            {flash}
          </div>
        </div>
      ) : null}

      <ScreenHeader onBack={() => navigate(-1)} />

      <section className="flex items-start justify-between gap-4 rounded-[30px] bg-white p-5 shadow-sm ring-1 ring-zinc-100">
        <div className="min-w-0">
          <h1 className="text-[42px] font-bold leading-none text-zinc-950">
            {brandTitle}
          </h1>

          <div className="mt-3 text-[28px] font-medium tracking-wide text-zinc-500">
            •••• {card.last4}
            {card.nickname ? (
              <span className="ml-3 text-zinc-500">({card.nickname})</span>
            ) : null}
          </div>

          <div className="mt-8">
            <div className="text-sm text-zinc-500">Fecha de expiración</div>
            <div className="mt-1 text-[30px] font-semibold text-zinc-950">
              {formattedExpiry}
            </div>
          </div>
        </div>

        <div className="shrink-0">
          <CardBrandIcon type={brand} />
        </div>
      </section>

      <section className="rounded-[30px] bg-white px-5 py-2 shadow-sm ring-1 ring-zinc-100">
        <ActionRow
          title="Editar"
          subtitle="Apodo a Visualizar"
          icon={<EditIcon />}
          onClick={() => setFlash("Edición de tarjeta próximamente")}
        />

        <div className="border-t border-zinc-200" />

        <ActionRow
          title={removing ? "Eliminando..." : "Eliminar método de pago"}
          danger
          icon={<TrashIcon />}
          onClick={handleRemove}
        />
      </section>
    </div>
  );
}

/* Icons */

function ArrowLeftIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15 5l-7 7 7 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M7.5 4.167L12.5 10L7.5 15.833"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 16.75V20h3.25L18.1 9.15l-3.25-3.25L4 16.75z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M13.75 6l3.25 3.25"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 7h10M9 7V5.8c0-.44.36-.8.8-.8h4.4c.44 0 .8.36.8.8V7m-7 0 .6 10.2a1 1 0 001 .8h5.2a1 1 0 001-.8L17 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10.5 10.5v5M13.5 10.5v5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x="3.5"
        y="6"
        width="17"
        height="12"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path d="M3.5 10h17" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M7 14.5h2.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}