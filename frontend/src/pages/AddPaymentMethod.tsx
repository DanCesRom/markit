import { useNavigate } from "react-router-dom";

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

function AddMethodRow({
  title,
  subtitle,
  icon,
  onClick,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-[24px] border border-zinc-200 bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-[1px] hover:shadow-md"
    >
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-zinc-100 text-zinc-800">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold text-zinc-950">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-zinc-500">{subtitle}</div> : null}
      </div>

      <div className="text-zinc-400">
        <ChevronRightIcon />
      </div>
    </button>
  );
}

export default function AddPaymentMethod() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 pb-8">
      <ScreenHeader
        title="Add Payment Method"
        onBack={() => navigate(-1)}
      />

      <div className="space-y-3">
        <AddMethodRow
          title="Credit or debit card"
          subtitle="Visa, Mastercard and more"
          icon={<CardIcon />}
          onClick={() => navigate("/wallet/add-card")}
        />

        <AddMethodRow
          title="Apple Pay"
          subtitle="Coming soon"
          icon={<ApplePayIcon />}
          onClick={() => {}}
        />

      </div>
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

function ApplePayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.27 12.39c.01 2.2 1.93 2.94 1.95 2.95-.02.05-.31 1.06-1.02 2.1-.61.89-1.25 1.78-2.25 1.8-.98.02-1.29-.58-2.41-.58-1.13 0-1.47.56-2.39.6-.96.04-1.69-.95-2.31-1.84-1.26-1.81-2.22-5.11-.93-7.35.64-1.11 1.78-1.81 3.03-1.83.94-.02 1.83.63 2.41.63.58 0 1.67-.78 2.81-.67.48.02 1.83.19 2.69 1.45-.07.04-1.6.93-1.58 2.74zM14.92 5.82c.51-.62.85-1.48.76-2.34-.73.03-1.62.49-2.14 1.11-.47.55-.88 1.43-.77 2.27.81.06 1.64-.41 2.15-1.04z" />
    </svg>
  );
}