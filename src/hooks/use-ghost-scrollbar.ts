import { useEffect } from "react";

/**
 * Drives the auto-hiding "ghost" scrollbar. While any scrolling is happening,
 * adds `is-scrolling` to <body>; once scrolling stops it removes the class
 * after `hideDelay` ms, letting the CSS fade the thumb back out.
 *
 * Uses a capture-phase listener on window so scrolls inside nested
 * `overflow` containers (dashboards, tables, drawers) are caught too — scroll
 * events don't bubble, but they do reach window during capture.
 */
export function useGhostScrollbar(hideDelay = 1000) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let timer: number | undefined;
    const onScroll = () => {
      document.body.classList.add("is-scrolling");
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        document.body.classList.remove("is-scrolling");
      }, hideDelay);
    };

    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      if (timer) window.clearTimeout(timer);
      document.body.classList.remove("is-scrolling");
    };
  }, [hideDelay]);
}
