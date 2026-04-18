import { Outlet } from "react-router-dom";
import BottomNav from "../components/BottomNav";

export function MainLayout() {
  return (
    <div className="min-h-dvh bg-white text-zinc-900">
      
      {/* 
        En mobile real ocupa 100%.
        En desktop se centra simulando teléfono.
      */}
      <div className="mx-auto w-full max-w-[430px]">
        <main className="px-4 py-4 pb-24">
          <Outlet />
        </main>
      </div>

      <BottomNav />
    </div>
  );
}