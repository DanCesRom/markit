import { useNavigate } from "react-router-dom";
import { useState } from "react";

export default function SearchBar() {
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const value = q.trim();
        if (!value) return;
        navigate(`/search?q=${encodeURIComponent(value)}`);
      }}
      className="flex items-center gap-2 rounded-2xl border bg-white px-3 py-2 shadow-sm"
    >
      <span className="text-zinc-400">⌕</span>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Busca productos o recetas (ej: ‘sancocho’)…"
        className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
      />
      <button
        type="submit"
        className="rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
      >
        Buscar
      </button>
    </form>
  );
}