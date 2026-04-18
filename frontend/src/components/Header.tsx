import { Link, NavLink } from "react-router-dom";
import SearchBar from "./SearchBar";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-black text-white font-bold">
            M
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Markit</div>
            <div className="text-xs text-zinc-500">Supermercados</div>
          </div>
        </Link>

        <div className="flex-1">
          <SearchBar />
        </div>

        <nav className="flex items-center gap-2 text-sm">
          <NavLink
            to="/cart"
            className={({ isActive }) =>
              `rounded-xl px-3 py-2 ${
                isActive ? "bg-zinc-900 text-white" : "hover:bg-zinc-100"
              }`
            }
          >
            Carrito
          </NavLink>
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `rounded-xl px-3 py-2 ${
                isActive ? "bg-zinc-900 text-white" : "hover:bg-zinc-100"
              }`
            }
          >
            Perfil
          </NavLink>
        </nav>
      </div>
    </header>
  );
}