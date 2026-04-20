import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../lib/api";

type MeResponse = {
  id?: number;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  full_name?: string | null;
  email?: string | null;
};

type QuickAction = {
  key: string;
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
};

type MenuItem = {
  key: string;
  title: string;
  subtitle?: string;
  route?: string;
  placeholder?: boolean;
  badge?: string | number;
  icon: React.ReactNode;
};

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "M";
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function Avatar({ name }: { name: string }) {
  return (
    <div className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 text-2xl font-bold text-white shadow-sm">
      {getInitials(name)}
    </div>
  );
}

function QuickActionCard({
  title,
  icon,
  onClick,
}: {
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-[108px] w-full flex-col items-center justify-center rounded-[24px] border border-zinc-200 bg-zinc-50 px-3 py-4 text-center shadow-sm transition hover:-translate-y-[1px] hover:bg-white hover:shadow-md"
    >
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-white text-zinc-900 shadow-sm">
        {icon}
      </div>
      <div className="text-[15px] font-semibold text-zinc-900">{title}</div>
    </button>
  );
}

function MenuRow({
  title,
  subtitle,
  icon,
  badge,
  onClick,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  badge?: string | number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-zinc-200 py-4 text-left last:border-b-0"
    >
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-zinc-100 text-zinc-700">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-medium text-zinc-900">{title}</div>
        {subtitle ? (
          <div className="mt-0.5 text-sm text-zinc-500">{subtitle}</div>
        ) : null}
      </div>

      {badge !== undefined ? (
        <div className="mr-1 grid min-h-[22px] min-w-[22px] place-items-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold text-white">
          {badge}
        </div>
      ) : null}

      <div className="shrink-0 text-zinc-400">
        <ChevronRightIcon />
      </div>
    </button>
  );
}

export default function Profile() {
  const navigate = useNavigate();

  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);

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
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 2400);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const userName = useMemo(() => {
    const apiName =
      me?.full_name?.trim() ||
      me?.name?.trim() ||
      `${me?.first_name ?? ""} ${me?.last_name ?? ""}`.trim();

    return apiName || "Markit User";
  }, [me]);

  const quickActions: QuickAction[] = [
    {
      key: "favorites",
      title: "Favoritos",
      icon: <HeartIcon />,
      onClick: () => navigate("/favorites"),
    },
    {
      key: "wallet",
      title: "Billetera",
      icon: <WalletIcon />,
      onClick: () => navigate("/wallet"),
    },
    {
      key: "orders",
      title: "Pedidos",
      icon: <BagIcon />,
      onClick: () => navigate("/orders"),
    },
  ];

  const menuItems: MenuItem[] = [
    {
      key: "promotions",
      title: "Promociones",
      subtitle: "Ofertas y beneficios de descuento",
      placeholder: true,
      icon: <TagIcon />,
    },
    {
      key: "help",
      title: "Ayuda",
      subtitle: "Soporte y asistencia",
      placeholder: true,
      icon: <HelpIcon />,
    },
    {
      key: "invite",
      title: "Invitar amigos",
      subtitle: "Comparte Markit con tus amigos",
      placeholder: true,
      icon: <InviteIcon />,
    },
    {
      key: "privacy",
      title: "Privacidad",
      subtitle: "Permisos y configuración de privacidad",
      placeholder: true,
      icon: <PrivacyIcon />,
    },
    {
      key: "accessibility",
      title: "Accesibilidad",
      subtitle: "Preferencias de lectura y visualización",
      placeholder: true,
      icon: <AccessibilityIcon />,
    },
    {
      key: "communication",
      title: "Comunicación",
      subtitle: "Preferencias de marketing",
      placeholder: true,
      icon: <BellIcon />,
    },
    {
      key: "manage-account",
      title: "Gestionar cuenta de Markit",
      subtitle: "Opciones de perfil y cuenta",
      placeholder: true,
      icon: <UserIcon />,
    },
    {
      key: "about",
      title: "Acerca de",
      subtitle: "Legal, redes sociales e información",
      placeholder: true,
      icon: <InfoIcon />,
    },
  ];

  function openMenuItem(item: MenuItem) {
    if (item.route) {
      navigate(item.route);
      return;
    }

    if (item.placeholder) {
      setFlash(`${item.title} próximamente`);
    }
  }

  if (loading) {
    return (
      <div className="space-y-5 pb-8">
        <div className="h-28 animate-pulse rounded-[28px] bg-zinc-100" />
        <div className="grid grid-cols-3 gap-3">
          <div className="h-28 animate-pulse rounded-[24px] bg-zinc-100" />
          <div className="h-28 animate-pulse rounded-[24px] bg-zinc-100" />
          <div className="h-28 animate-pulse rounded-[24px] bg-zinc-100" />
        </div>
        <div className="h-32 animate-pulse rounded-[28px] bg-zinc-100" />
        <div className="h-80 animate-pulse rounded-[28px] bg-zinc-100" />
      </div>
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-2xl space-y-5 pb-8">
      {flash ? (
        <div className="sticky top-3 z-20">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-sm">
            {flash}
          </div>
        </div>
      ) : null}

      <section className="rounded-[30px] bg-white p-5 shadow-sm ring-1 ring-zinc-100">
        <div className="flex items-center gap-4">
          <Avatar name={userName} />

          <div className="min-w-0">
            <div className="text-sm text-zinc-500">
              Hola {userName.split(" ")[0]}
            </div>
            <h1 className="text-[28px] font-bold leading-tight text-zinc-950">
              {userName}
            </h1>
            <p className="mt-1 text-sm text-emerald-700">
              ¡Vamos de compras!
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-3 gap-3">
        {quickActions.map((item) => (
          <QuickActionCard
            key={item.key}
            title={item.title}
            icon={item.icon}
            onClick={item.onClick}
          />
        ))}
      </section>

      <section className="overflow-hidden rounded-[30px] bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-500 p-5 text-white shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
              Markit Plus
            </div>
            <div className="mt-2 text-2xl font-bold">Prueba Markit Plus gratis</div>
            <div className="mt-2 max-w-[28rem] text-sm leading-5 text-emerald-50/95">
              Banner de membresía de marcador de posición para beneficios de entrega gratuita, promociones especiales y más.
            </div>

            <button
              onClick={() => setFlash("Markit Plus próximamente")}
              className="mt-4 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
            >
              Más información
            </button>
          </div>

          <div className="hidden h-24 w-24 shrink-0 place-items-center rounded-[24px] bg-white/15 backdrop-blur-sm sm:grid">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-emerald-700">
              <GiftIcon />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[30px] bg-white px-5 py-2 shadow-sm ring-1 ring-zinc-100">
        {menuItems.map((item) => (
          <MenuRow
            key={item.key}
            title={item.title}
            subtitle={item.subtitle}
            icon={item.icon}
            badge={item.badge}
            onClick={() => openMenuItem(item)}
          />
        ))}
      </section>
    </div>
  );
}

/* Icons */

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

function HeartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 20.5s-7-4.35-7-10.125C5 7.25 7.239 5 10.05 5c1.6 0 2.728.729 3.45 1.77C14.222 5.729 15.35 5 16.95 5 19.761 5 22 7.25 22 10.375 22 16.15 15 20.5 12 20.5z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

function BagIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 9h10l-.7 9.1A2 2 0 0114.31 20H9.69a2 2 0 01-1.99-1.9L7 9z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 9V7.75A2.5 2.5 0 0112 5.25a2.5 2.5 0 012.5 2.5V9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 13l-7 7-9-9V4h7l9 9z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M9.75 9.25a2.25 2.25 0 114.03 1.39c-.34.53-.86.86-1.33 1.18-.64.43-1.2.82-1.2 1.68v.25"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.8" r="0.9" fill="currentColor" />
    </svg>
  );
}

function InviteIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M4.5 18a4.5 4.5 0 019 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M17 8v6M14 11h6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PrivacyIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3l7 3v5c0 4.75-2.65 7.82-7 10-4.35-2.18-7-5.25-7-10V6l7-3z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9.75 11.5l1.5 1.5 3-3.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AccessibilityIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="4.5" r="1.8" fill="currentColor" />
      <path
        d="M7 8.5h10M12 8.5v11M9 20l3-4 3 4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 17h8c-.9-1.05-1.25-2.2-1.25-4.25 0-1.86-.95-3.5-2.75-4.05V8a1 1 0 10-2 0v.7c-1.8.55-2.75 2.19-2.75 4.05C9.25 14.8 8.9 15.95 8 17z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M10.25 18.5a1.9 1.9 0 003.5 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M5 19a7 7 0 0114 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

function GiftIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 10h16v10H4V10zM12 10v10M3 7.5h18V10H3V7.5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9.25 7.5S7 6.8 7 5.25A2.25 2.25 0 019.25 3c1.61 0 2.75 2.25 2.75 4.5M14.75 7.5S17 6.8 17 5.25A2.25 2.25 0 0014.75 3C13.14 3 12 5.25 12 7.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}