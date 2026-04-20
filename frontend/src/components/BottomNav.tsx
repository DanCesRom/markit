import { NavLink } from "react-router-dom";
import { useState } from "react";
import { NAV_ICONS } from "../config/navIcons";

function IconImg({
  src,
  alt,
  fallback,
}: {
  src?: string;
  alt: string;
  fallback: string;
}) {
  const [error, setError] = useState(false);

  if (!src || error) {
    return <span className="text-base leading-none">{fallback}</span>;
  }

  return (
    <img
      src={src}
      alt={alt}
      className="h-5 w-5 object-contain"
      onError={() => setError(true)}
    />
  );
}

const Item = ({
  to,
  label,
  emojiFallback,
  icon,
  iconActive,
}: {
  to: string;
  label: string;
  emojiFallback: string;
  icon?: string;
  iconActive?: string;
}) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] select-none ${
        isActive ? "text-emerald-700" : "text-zinc-500"
      }`
    }
  >
    {({ isActive }) => (
      <>
        <div className="grid h-6 w-6 place-items-center">
          <IconImg
            src={isActive ? iconActive ?? icon : icon}
            alt={label}
            fallback={emojiFallback}
          />
        </div>
        <span className="font-medium">{label}</span>
      </>
    )}
  </NavLink>
);

export default function BottomNav() {
  return (
    <nav
      className="fixed left-0 right-0 z-50 pointer-events-none"
      style={{ bottom: "max(8px, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto max-w-[430px] px-3 pointer-events-auto">
        <div className="flex h-16 rounded-2xl border border-zinc-200 bg-white/95 px-2 shadow-lg backdrop-blur">
          <Item
            to="/"
            label="Tienda"
            emojiFallback="🏪"
            icon={NAV_ICONS.shop}
            iconActive={NAV_ICONS.shopActive}
          />
          <Item
            to="/categories"
            label="Categorías"
            emojiFallback="🧺"
            icon={NAV_ICONS.categories}
            iconActive={NAV_ICONS.categoriesActive}
          />
          <Item
            to="/cart"
            label="Carrito"
            emojiFallback="🛒"
            icon={NAV_ICONS.cart}
            iconActive={NAV_ICONS.cartActive}
          />
          <Item
            to="/profile"
            label=" Mi Cuenta"
            emojiFallback="👤"
            icon={NAV_ICONS.account}
            iconActive={NAV_ICONS.accountActive}
          />
        </div>
      </div>
    </nav>
  );
}