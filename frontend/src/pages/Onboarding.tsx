// src/pages/Onboarding.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { setOnboardingDone } from "../lib/auth";
import { AnimatePresence, motion } from "framer-motion";
import NoScroll from "../components/NoScroll";

//  assets (opción A)
import bgBase from "../assets/onboarding/bg.png";
import overlayA from "../assets/onboarding/overlay.png";
import hero1 from "../assets/onboarding/hero1.png";
import hero2 from "../assets/onboarding/hero2.png";
import hero3 from "../assets/onboarding/hero3.png";

//  precarga assets de GetStarted (opción A)
import facebookLogo from "../assets/getstarted/facebook.png";
import googleLogo from "../assets/getstarted/google.png";
import appleLogo from "../assets/getstarted/apple.png";
import xLogo from "../assets/getstarted/x.png";

type Slide = {
    title: string;
    subtitle: string;
    button: string;
    bg?: string;
    overlay?: string | null;
    hero?: string;
};

export default function Onboarding() {
    const navigate = useNavigate();

    const slides: Slide[] = useMemo(
        () => [
            {
                title: "Welcome to\nMarkit",
                subtitle: "Compras en Supermercado más fácil y\nrápido.",
                button: "Next",
                bg: bgBase,
                overlay: null,
                hero: hero1,
            },
            {
                title: "150K+ Member\nActive",
                subtitle: "Miles compran con Markit cada día.",
                button: "Next",
                bg: bgBase,
                overlay: overlayA,
                hero: hero2,
            },
            {
                title: "Find Fast\n& Easy",
                subtitle: "Ofertas y entregas a tiempo.",
                button: "Enjoy",
                bg: bgBase,
                overlay: null,
                hero: hero3,
            },
        ],
        []
    );

    const [step, setStep] = useState(0);
    const [isSwitching, setIsSwitching] = useState(false);

    const s = slides[step];

    useEffect(() => {
        const urls = [
            hero1,
            hero2,
            hero3,
            overlayA,
            bgBase,
            facebookLogo,
            googleLogo,
            appleLogo,
            xLogo,
        ];

        urls.forEach((src) => {
            const img = new Image();
            img.src = src;
        });
    }, []);

    function finish() {
        setOnboardingDone(true);
        navigate("/get-started", { replace: true });
    }

    function next() {
        if (isSwitching) return;

        if (step < slides.length - 1) {
            setIsSwitching(true);

            requestAnimationFrame(() => {
                setStep((v) => v + 1);
                setTimeout(() => setIsSwitching(false), 20);
            });
            return;
        }

        finish();
    }

    function prev() {
        if (isSwitching) return;
        if (step > 0) {
            setIsSwitching(true);
            requestAnimationFrame(() => {
                setStep((v) => v - 1);
                setTimeout(() => setIsSwitching(false), 20);
            });
        }
    }

    return (
        <>
            <NoScroll />

            <div className="relative min-h-screen overflow-hidden bg-[#F5FBF3]">
                {/* ===== CAPAS ===== */}
                <div className="absolute inset-0">
                    <img
                        src={s.bg ?? bgBase}
                        alt=""
                        className="h-full w-full object-cover"
                        draggable={false}
                    />
                </div>

                {/* overlay opcional con fade suave */}
                <AnimatePresence>
                    {s.overlay ? (
                        <motion.img
                            key={`overlay-${step}`}
                            src={s.overlay}
                            alt=""
                            draggable={false}
                            className="absolute inset-0 h-full w-full object-cover pointer-events-none"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.18 }}
                        />
                    ) : null}
                </AnimatePresence>

                <div className="absolute inset-0 bg-white/10" />

                {/* ===== CONTENIDO ===== */}
                <div className="relative z-10 min-h-screen px-6 pt-10 pb-10 flex flex-col">
                    {/* Top */}
                    <div className="flex items-center justify-between">
                        <button
                            onClick={prev}
                            className={`inline-flex items-center justify-center w-11 h-11 rounded-full bg-white/70 text-2xl text-zinc-900 transition ${step === 0 ? "opacity-0 pointer-events-none" : "opacity-100"
                                }`}
                            aria-label="Back"
                        >
                            ←
                        </button>

                        <button
                            onClick={finish}
                            className="text-sm font-semibold text-zinc-700"
                        >
                            Skip
                        </button>
                    </div>

                    {/* Center */}
                    <div className="flex-1 flex items-center justify-center">
                        <motion.div
                            key={step}
                            initial={{ x: 70 }}
                            animate={{ x: 0 }}
                            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                            className={`w-full flex flex-col items-center text-center transition-opacity ${isSwitching ? "opacity-0" : "opacity-100"
                                }`}
                        >
                            {s.hero ? (
                                <img
                                    src={s.hero}
                                    alt=""
                                    draggable={false}
                                    className="mb-7 w-[180px] sm:w-[210px] max-w-[70vw] drop-shadow-sm"
                                />
                            ) : null}

                            <h1 className="whitespace-pre-line text-4xl font-extrabold text-[#66B23A] leading-tight">
                                {s.title}
                            </h1>

                            <p className="mt-4 whitespace-pre-line text-base text-zinc-800">
                                {s.subtitle}
                            </p>

                            <div className="mt-8 flex items-center justify-center gap-2">
                                {slides.map((_, i) => (
                                    <span
                                        key={i}
                                        className={`h-2.5 w-2.5 rounded-full ${i === step ? "bg-[#66B23A]" : "bg-[#66B23A]/30"
                                            }`}
                                    />
                                ))}
                            </div>
                        </motion.div>
                    </div>

                    {/* CTA */}
                    <button
                        onClick={next}
                        className="w-full max-w-xs mx-auto rounded-full bg-[#0D1B3D] py-4 text-sm font-semibold text-white"
                    >
                        {s.button}
                    </button>
                </div>
            </div>
        </>
    );
}