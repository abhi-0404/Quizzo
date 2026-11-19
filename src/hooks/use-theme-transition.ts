import { useCallback } from "react";
import { flushSync } from "react-dom";
import { useTheme as useNextTheme } from "next-themes";

const DURATION_MS = 650;
const EASING = "cubic-bezier(0.65, 0, 0.35, 1)";

type ViewTransitionDocument = Document & {
  startViewTransition?: (cb: () => void) => { ready: Promise<void>; finished: Promise<void> };
};

/** Applies the theme class to <html> right away, so the view transition snapshots the new state. */
function applyThemeClass(theme: string) {
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved === "light" ? "light" : "dark");
  root.style.colorScheme = resolved === "light" ? "light" : "dark";
}

/**
 * Drop-in replacement for next-themes' useTheme: setTheme reveals the new theme
 * as a circle growing from the top-right corner of the viewport.
 * Falls back to an instant switch without View Transitions support or with reduced motion.
 */
export function useTheme() {
  const ctx = useNextTheme();
  const { setTheme: setNextTheme, resolvedTheme } = ctx;

  const setTheme = useCallback(
    (next: string) => {
      const doc = document as ViewTransitionDocument;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (!doc.startViewTransition || reduceMotion || next === resolvedTheme) {
        setNextTheme(next);
        return;
      }

      const root = document.documentElement;
      root.classList.add("theme-switching");

      const transition = doc.startViewTransition(() => {
        applyThemeClass(next);
        flushSync(() => setNextTheme(next));
      });

      transition.ready
        .then(() => {
          const radius = Math.hypot(window.innerWidth, window.innerHeight);
          root.animate(
            {
              clipPath: [
                `circle(0px at 100% 0%)`,
                `circle(${radius}px at 100% 0%)`,
              ],
            },
            { duration: DURATION_MS, easing: EASING, pseudoElement: "::view-transition-new(root)" },
          );
        })
        .catch(() => {});

      transition.finished.finally(() => root.classList.remove("theme-switching"));
    },
    [setNextTheme, resolvedTheme],
  );

  return { ...ctx, setTheme };
}
