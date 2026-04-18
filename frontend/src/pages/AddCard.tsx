import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../lib/api";

type CardBrand = "visa" | "mastercard" | "unknown";

function onlyDigits(v: string) {
  return v.replace(/\D/g, "");
}

function formatCardNumber(v: string) {
  const digits = onlyDigits(v).slice(0, 16);
  return digits.replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(v: string) {
  const digits = onlyDigits(v).slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function detectBrand(cardNumber: string): CardBrand {
  const digits = onlyDigits(cardNumber);
  if (digits.startsWith("4")) return "visa";
  if (/^5[1-5]/.test(digits) || /^2(2[2-9]|[3-6]\d|7[01])/.test(digits)) {
    return "mastercard";
  }
  return "unknown";
}

function isExpiryValid(expiry: string) {
  const digits = onlyDigits(expiry);
  if (digits.length !== 4) return false;

  const month = Number(digits.slice(0, 2));
  const year = Number(digits.slice(2, 4));

  if (month < 1 || month > 12) return false;

  return year >= 0;
}

function getCardPreviewGroups(cardNumber: string) {
  const digits = onlyDigits(cardNumber);
  const padded = (digits + "••••••••••••••••").slice(0, 16);

  return [
    padded.slice(0, 4),
    padded.slice(4, 8),
    padded.slice(8, 12),
    padded.slice(12, 16),
  ];
}

function getPreviewCvv(cvv: string) {
  if (!cvv) return "•••";
  return cvv;
}

function ScreenHeader({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 bg-[#fafafa]/95 pb-4 pt-2 backdrop-blur">
      <div className="relative flex items-center justify-center">
        <button
          type="button"
          onClick={onBack}
          className="absolute left-0 grid h-11 w-11 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-900 shadow-sm"
          aria-label="Back"
        >
          <ArrowLeftIcon />
        </button>

        <h1 className="text-[24px] font-bold text-zinc-950">{title}</h1>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-2 block text-[15px] font-semibold text-zinc-900">{children}</label>;
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-14 w-full rounded-[20px] border border-zinc-200 bg-white px-4 text-[15px] text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 ${props.className ?? ""}`}
    />
  );
}

export default function AddCard() {
  const navigate = useNavigate();

  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [nickname, setNickname] = useState("");
  const [isDefault, setIsDefault] = useState(true);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const brand = useMemo(() => detectBrand(cardNumber), [cardNumber]);
  const previewGroups = useMemo(() => getCardPreviewGroups(cardNumber), [cardNumber]);
  const previewCvv = useMemo(() => getPreviewCvv(cvv), [cvv]);

  const isValid = useMemo(() => {
    return (
      onlyDigits(cardNumber).length >= 16 &&
      isExpiryValid(expiry) &&
      onlyDigits(cvv).length >= 3 &&
      brand !== "unknown"
    );
  }, [cardNumber, expiry, cvv, brand]);

  async function handleSave() {
    if (!isValid) return;

    const digits = onlyDigits(cardNumber);
    const expiryDigits = onlyDigits(expiry);
    const expMonth = Number(expiryDigits.slice(0, 2));
    const expYear = 2000 + Number(expiryDigits.slice(2, 4));

    try {
      setSaving(true);

      await apiPost("/payment-methods", {
        brand,
        last4: digits.slice(-4),
        exp_month: expMonth,
        exp_year: expYear,
        nickname: nickname.trim() || null,
        is_default: isDefault,
      });

      navigate("/wallet");
    } catch {
      setFlash("Could not save card");
    } finally {
      setSaving(false);
    }
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

      <ScreenHeader title="Add Card" onBack={() => navigate(-1)} />

      <section className="rounded-[30px] bg-white p-5 shadow-sm ring-1 ring-zinc-100">
        <div className="mb-4">
          <div className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-emerald-700">
            Card details
          </div>
          <div className="text-sm text-zinc-500">
            Add your payment card metadata for Markit wallet.
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <FieldLabel>Card number</FieldLabel>
            <div className="relative">
              <TextInput
                inputMode="numeric"
                autoComplete="cc-number"
                placeholder="1234 5678 9012 3456"
                value={cardNumber}
                onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                className="pr-16"
              />
              <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
                <CardBrandBadge brand={brand} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Exp. Date</FieldLabel>
              <TextInput
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM/YY"
                value={expiry}
                onChange={(e) => setExpiry(formatExpiry(e.target.value))}
              />
            </div>

            <div>
              <FieldLabel>CVV</FieldLabel>
              <TextInput
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="123"
                value={cvv}
                onChange={(e) => setCvv(onlyDigits(e.target.value).slice(0, 4))}
              />
            </div>
          </div>

          <div>
            <FieldLabel>Nickname (optional)</FieldLabel>
            <TextInput
              placeholder="e.g. Personal or Work card"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-3 rounded-[20px] border border-zinc-200 bg-white px-4 py-4">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-sm font-medium text-zinc-900">
              Make this my default card
            </span>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-[30px] bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-800 p-5 text-white shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-xs uppercase tracking-[0.18em] text-zinc-400">
              Preview
            </div>

            <div className="mt-4 overflow-hidden">
              <div className="flex flex-nowrap items-center gap-3 whitespace-nowrap text-[26px] font-semibold leading-none text-white">
                {previewGroups.map((group, index) => (
                  <span
                    key={`${group}-${index}`}
                    className="inline-block min-w-[4ch] text-left tracking-[0.08em]"
                  >
                    {group}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-6">
              <div>
                <div className="text-[11px] uppercase tracking-[0.15em] text-zinc-400">
                  Expires
                </div>
                <div className="mt-1 text-sm font-medium text-zinc-100">
                  {expiry || "MM/YY"}
                </div>
              </div>

              <div>
                <div className="text-[11px] uppercase tracking-[0.15em] text-zinc-400">
                  CVV
                </div>
                <div className="mt-1 text-sm font-medium text-zinc-100">
                  {previewCvv}
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0">
            <CardBrandBadge brand={brand} dark />
          </div>
        </div>
      </section>

      <button
        type="button"
        disabled={!isValid || saving}
        onClick={handleSave}
        className={`w-full rounded-full px-5 py-4 text-sm font-semibold shadow-sm transition ${
          isValid && !saving
            ? "bg-emerald-600 text-white hover:bg-emerald-700"
            : "cursor-not-allowed bg-zinc-200 text-zinc-500"
        }`}
      >
        {saving ? "Saving..." : "Save card"}
      </button>
    </div>
  );
}

function CardBrandBadge({
  brand,
  dark = false,
}: {
  brand: CardBrand;
  dark?: boolean;
}) {
  if (brand === "visa") {
    return (
      <div className="grid h-9 min-w-[56px] place-items-center rounded-xl bg-blue-600 px-3 text-xs font-bold text-white shadow-sm">
        VISA
      </div>
    );
  }

  if (brand === "mastercard") {
    return (
      <div
        className={`grid h-9 min-w-[56px] place-items-center rounded-xl px-3 shadow-sm ${
          dark ? "bg-zinc-700" : "bg-zinc-100"
        }`}
      >
        <div className="relative h-5 w-8">
          <span className="absolute left-0 top-0 h-5 w-5 rounded-full bg-red-500 opacity-90" />
          <span className="absolute right-0 top-0 h-5 w-5 rounded-full bg-orange-400 opacity-90" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`grid h-9 min-w-[56px] place-items-center rounded-xl px-3 text-xs font-semibold shadow-sm ${
        dark ? "bg-zinc-700 text-zinc-200" : "bg-zinc-100 text-zinc-500"
      }`}
    >
      Card
    </div>
  );
}

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