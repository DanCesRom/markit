import { apiGetCached } from "./api";
import { isLoggedIn } from "./auth";

import { NAV_ICONS } from "../config/navIcons";
import { CATEGORY_ART, CATEGORY_ART_BY_MARKET } from "../config/categoryArt";

import hero1 from "../assets/onboarding/hero1.png";
import hero2 from "../assets/onboarding/hero2.png";
import hero3 from "../assets/onboarding/hero3.png";
import bgBase from "../assets/onboarding/bg.png";
import overlayA from "../assets/onboarding/overlay.png";

import facebookLogo from "../assets/getstarted/facebook.png";
import googleLogo from "../assets/getstarted/google.png";
import appleLogo from "../assets/getstarted/apple.png";
import xLogo from "../assets/getstarted/x.png";

import nacionalSquare from "../assets/supermarket/Nacional2x2.jpg";
import nacionalWide from "../assets/supermarket/Nacional3x4.jpg";
import sirenaWide from "../assets/supermarket/sirena3x4.svg";

import avatarImg from "../assets/home/avatar.png";
import mapPinIcon from "../assets/home/map-pin.svg";
import findIcon from "../assets/home/find.png";
import markitPlusBanner from "../assets/banners/markit-plus.png";
import carritoImg from "../assets/cart/carrito.png";

type Supermarket = {
    id: number;
    name: string;
};

function preloadImage(src?: string | null) {
    return new Promise<void>((resolve) => {
        if (!src) return resolve();

        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = src;
    });
}

function unique(values: string[]) {
    return Array.from(new Set(values.filter(Boolean)));
}

export async function preloadMarkitImages() {
    const categoryImages = [
        ...Object.values(CATEGORY_ART),
        ...Object.values(CATEGORY_ART_BY_MARKET).flatMap((x) => Object.values(x)),
    ];

    const navImages = Object.values(NAV_ICONS);

    const images = unique([
        hero1,
        hero2,
        hero3,
        bgBase,
        overlayA,

        facebookLogo,
        googleLogo,
        appleLogo,
        xLogo,

        nacionalSquare,
        nacionalWide,
        sirenaWide,

        avatarImg,
        mapPinIcon,
        findIcon,
        markitPlusBanner,
        carritoImg,

        ...navImages,
        ...categoryImages,
    ]);

    await Promise.allSettled(images.map(preloadImage));
}

export async function preloadMarkitApi() {
    if (!isLoggedIn()) return;

    const supermarkets = await apiGetCached<Supermarket[]>("/supermarkets/", {
        ttlMs: 1000 * 60 * 30,
    }).catch(() => []);

    await Promise.allSettled([
        apiGetCached("/auth/me", { ttlMs: 1000 * 60 * 10 }),
        apiGetCached("/addresses", { ttlMs: 1000 * 60 * 10 }),
        apiGetCached("/cart", { ttlMs: 1000 * 60 * 2 }),

        ...supermarkets.map((s) =>
            apiGetCached(`/supermarkets/${s.id}/categories`, {
                ttlMs: 1000 * 60 * 30,
            })
        ),

        ...supermarkets.map((s) =>
            apiGetCached(`/supermarkets/${s.id}/popular-products?limit=60`, {
                ttlMs: 1000 * 60 * 10,
            })
        ),
    ]);
}

export async function preloadMarkitEssentials() {
    await Promise.allSettled([preloadMarkitImages(), preloadMarkitApi()]);
}