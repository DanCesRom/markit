import { useEffect } from "react";

export default function NoScroll() {
    useEffect(() => {
        const html = document.documentElement;
        const body = document.body;

        const originalHtmlOverflow = html.style.overflow;
        const originalBodyOverflow = body.style.overflow;
        const originalHtmlOverscroll = html.style.overscrollBehavior;
        const originalBodyOverscroll = body.style.overscrollBehavior;
        const originalBodyTouchAction = body.style.touchAction;

        html.style.overflow = "hidden";
        body.style.overflow = "hidden";
        html.style.overscrollBehavior = "none";
        body.style.overscrollBehavior = "none";
        body.style.touchAction = "none";

        return () => {
            html.style.overflow = originalHtmlOverflow;
            body.style.overflow = originalBodyOverflow;
            html.style.overscrollBehavior = originalHtmlOverscroll;
            body.style.overscrollBehavior = originalBodyOverscroll;
            body.style.touchAction = originalBodyTouchAction;
        };
    }, []);

    return null;
}