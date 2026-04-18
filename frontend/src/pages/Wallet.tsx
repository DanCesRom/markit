import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet} from "../lib/api";

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

type WalletPaymentItem =
  | {
      id: number;
      type: "card";
      brand: "visa" | "mastercard" | "other";
      label: string;
      subtitle?: string;
      isDefault: boolean;
      nickname?: string;
      last4: string;
      expiry: string;
    }
  | {
      id: string;
      type: "paypal" | "applepay" | "cash";
      label: string;
      subtitle?: string;
      isDefault?: false;
    };

function normalizeBrand(brand: string): "visa" | "mastercard" | "other" {
  const v = brand.trim().toLowerCase();
  if (v === "visa") return "visa";
  if (v === "mastercard") return "mastercard";
  return "other";
}

function formatExpiry(month: number, year: number) {
  return `${String(month).padStart(2, "0")}/${year}`;
}

function formatCardLabel(brand: string, last4: string) {
  const niceBrand =
    brand === "visa"
      ? "Visa"
      : brand === "mastercard"
      ? "Mastercard"
      : brand.charAt(0).toUpperCase() + brand.slice(1);

  return `${niceBrand} •••• ${last4}`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[22px] font-bold tracking-tight text-zinc-950">
      {children}
    </h2>
  );
}

function ScreenHeader({
  title,
}: {
  title: string;
}) {
  const navigate = useNavigate();

  return (
    <div className="sticky top-0 z-10 bg-[#fafafa]/95 pb-4 pt-2 backdrop-blur">
      <div className="relative flex items-center justify-center">
        <button
          type="button"
          onClick={() => navigate("/profile")}
          className="absolute left-0 grid h-11 w-11 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-900 shadow-sm"
          aria-label="Back"
        >
          <ArrowLeftIcon />
        </button>

        <h1 className="text-[26px] font-bold text-zinc-950">{title}</h1>
      </div>
    </div>
  );
}

function MarkitBalanceCard({ balance }: { balance: number }) {
  return (
    <section className="overflow-hidden rounded-[30px] bg-gradient-to-br from-emerald-700 via-emerald-600 to-emerald-500 p-5 text-white shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
            Markit Wallet
          </div>
          <div className="mt-3 text-sm text-emerald-50/90">
            Available balance
          </div>
          <div className="mt-1 text-[38px] font-bold leading-none">
            DOP {balance.toFixed(2)}
          </div>
          <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm text-emerald-50 backdrop-blur-sm">
            <InfoCircleIcon />
            Auto-refill is off
          </div>
        </div>

        <div className="grid h-16 w-16 place-items-center rounded-[22px] bg-white/15 text-white backdrop-blur-sm">
          <WalletIcon />
        </div>
      </div>

      <div className="mt-5">
        <button
          type="button"
          className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
        >
          + Add funds
        </button>
      </div>
    </section>
  );
}

function PaymentMethodIcon({
  type,
  brand,
}: {
  type: WalletPaymentItem["type"];
  brand?: "visa" | "mastercard" | "other";
}) {
  if (type === "card" && brand === "visa") {
    return (
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-600 text-sm font-bold text-white shadow-sm">
        VISA
      </div>
    );
  }

  if (type === "card" && brand === "mastercard") {
    return (
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-zinc-900 shadow-sm">
        <div className="relative h-5 w-8">
          <span className="absolute left-0 top-0 h-5 w-5 rounded-full bg-red-500 opacity-90" />
          <span className="absolute right-0 top-0 h-5 w-5 rounded-full bg-orange-400 opacity-90" />
        </div>
      </div>
    );
  }

  if (type === "paypal") {
    return (
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-sky-50 text-sky-600 shadow-sm">
        <PayPalIcon />
      </div>
    );
  }

  if (type === "applepay") {
    return (
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-black shadow-sm ring-1 ring-zinc-200">
        <ApplePayIcon />
      </div>
    );
  }

  if (type === "cash") {
    return (
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700 shadow-sm">
        <CashIcon />
      </div>
    );
  }

  return (
    <div className="grid h-11 w-11 place-items-center rounded-2xl bg-zinc-100 text-zinc-600 shadow-sm">
      <CardIcon />
    </div>
  );
}

function PaymentMethodRow({
  item,
  onClick,
}: {
  item: WalletPaymentItem;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[24px] border border-zinc-200 bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-[1px] hover:shadow-md"
    >
      <PaymentMethodIcon
        type={item.type}
        brand={item.type === "card" ? item.brand : undefined}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate text-[15px] font-semibold text-zinc-950">
            {item.label}
          </div>
          {item.isDefault ? (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
              Default
            </span>
          ) : null}
        </div>

        {item.subtitle ? (
          <div className="mt-1 text-sm text-zinc-500">{item.subtitle}</div>
        ) : null}
      </div>

      <div className="text-zinc-400">
        <ChevronRightIcon />
      </div>
    </button>
  );
}

export default function Wallet() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<PaymentMethodApi[]>([]);
  const [flash, setFlash] = useState<string | null>(null);

  async function loadPaymentMethods() {
    const methods = await apiGet<PaymentMethodApi[]>("/payment-methods");
    setCards(methods);
  }

  useEffect(() => {
    (async () => {
      try {
        await loadPaymentMethods();
      } catch {
        setFlash("Could not load payment methods");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 2500);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const items = useMemo<WalletPaymentItem[]>(() => {
    const mappedCards: WalletPaymentItem[] = cards.map((card) => {
      const brand = normalizeBrand(card.brand);
      const nickname = card.nickname?.trim() || undefined;

      return {
        id: card.id,
        type: "card",
        brand,
        label: formatCardLabel(brand, card.last4),
        subtitle: nickname || (card.is_default ? "Main card" : "Saved card"),
        isDefault: card.is_default,
        nickname,
        last4: card.last4,
        expiry: formatExpiry(card.exp_month, card.exp_year),
      };
    });

    return [
      ...mappedCards,
      {
        id: "applepay",
        type: "applepay",
        label: "Apple Pay",
      },
      {
        id: "cash",
        type: "cash",
        label: "Cash",
        subtitle: "Pay on delivery",
      },
    ];
  }, [cards]);

  const cardsCount = cards.length;

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-2xl space-y-5 pb-8">
        <div className="h-12 animate-pulse rounded-2xl bg-zinc-100" />
        <div className="h-56 animate-pulse rounded-[30px] bg-zinc-100" />
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-[24px] bg-zinc-100" />
          <div className="h-24 animate-pulse rounded-[24px] bg-zinc-100" />
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

      <ScreenHeader title="Wallet" />

      <MarkitBalanceCard balance={0} />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionTitle>Payment methods</SectionTitle>
          <div className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-600">
            {cardsCount} cards
          </div>
        </div>

        <div className="space-y-3">
          {items.map((item) => (
            <PaymentMethodRow
              key={item.id}
              item={item}
              onClick={() => {
                if (item.type === "card") {
                  navigate(`/wallet/card/${item.id}`);
                  return;
                }

                setFlash(`${item.label} details coming soon`);
              }}
            />
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={() => navigate("/wallet/add-method")}
        className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-black"
      >
        <PlusIcon />
        Add payment method
      </button>
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

function WalletIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 8.5A2.5 2.5 0 016.5 6h10A2.5 2.5 0 0119 8.5V9h1a1 1 0 011 1v6a2 2 0 01-2 2H6.5A2.5 2.5 0 014 15.5v-7z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M16 13h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="16.5" cy="13" r="0.9" fill="currentColor" />
    </svg>
  );
}

function InfoCircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 10.25v5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="7.25" r="1" fill="currentColor" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PayPalIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 19l1.2-9.3A2 2 0 0111.18 8H15a3 3 0 010 6h-2.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 21l1.5-11A2 2 0 019.48 8H13"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ApplePayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.27 12.39c.01 2.2 1.93 2.94 1.95 2.95-.02.05-.31 1.06-1.02 2.1-.61.89-1.25 1.78-2.25 1.8-.98.02-1.29-.58-2.41-.58-1.13 0-1.47.56-2.39.6-.96.04-1.69-.95-2.31-1.84-1.26-1.81-2.22-5.11-.93-7.35.64-1.11 1.78-1.81 3.03-1.83.94-.02 1.83.63 2.41.63.58 0 1.67-.78 2.81-.67.48.02 1.83.19 2.69 1.45-.07.04-1.6.93-1.58 2.74zM14.92 5.82c.51-.62.85-1.48.76-2.34-.73.03-1.62.49-2.14 1.11-.47.55-.88 1.43-.77 2.27.81.06 1.64-.41 2.15-1.04z" />
    </svg>
  );
}

function CashIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7.5h16v9H4v-9z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M7 9.5c0 1.1-.9 2-2 2m12 3c1.1 0 2 .9 2 2m-12 0c0-1.1-.9-2-2-2m12-3c0-1.1.9-2 2-2"
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