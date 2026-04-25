// src/pages/Splash.tsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { isLoggedIn, isOnboardingDone } from "../lib/auth";
import { preloadMarkitEssentials } from "../lib/preload";
import NoScroll from "../components/NoScroll";

export default function Splash() {
    const navigate = useNavigate();

    useEffect(() => {
        let cancelled = false;

        async function run() {
            const minSplashTime = new Promise((resolve) => window.setTimeout(resolve, 900));

            await Promise.allSettled([
                preloadMarkitEssentials(),
                minSplashTime,
            ]);

            if (cancelled) return;

            if (!isOnboardingDone()) {
                navigate("/onboarding", { replace: true });
                return;
            }

            if (!isLoggedIn()) {
                navigate("/get-started", { replace: true });
                return;
            }

            navigate("/", { replace: true });
        }

        run();

        return () => {
            cancelled = true;
        };
    }, [navigate]);

    return (
        <>
            <NoScroll />

            <div className="flex min-h-screen flex-col items-center justify-center bg-[#66B23A]">
                <div className="flex flex-col items-center gap-4 text-white">
                    <div className="text-5xl">🛒</div>
                    <div className="text-3xl font-extrabold tracking-tight">Markit</div>

                    <div className="mt-6 h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
                </div>
            </div>
        </>
    );
}