import { ImageOff } from "lucide-react";
import type { QuestionAsset } from "@/data/questions";

/**
 * Both-themes proof sheet for extracted figures.
 *
 * Extraction keys the white PDF page out to transparency and the dark theme
 * then recovers the ink with a CSS invert (see `UniversalRenderer`), so a bad
 * crop can look perfect in one theme and be unreadable in the other. Showing
 * both treatments at once means the admin never has to toggle the app theme —
 * and never checks only the half they happen to be sitting in.
 */

/** Mirrors the `dark:invert dark:hue-rotate-180` UniversalRenderer applies. */
const DARK_FILTER = "invert hue-rotate-180";

const CELL = "flex min-h-[72px] flex-1 items-center justify-center overflow-hidden p-3";
const CAPTION = "border-b border-border px-2 py-1 text-[11px] text-muted-foreground";
/** Figures run 24px to 400px tall; cap the tall ones without distorting any. */
const IMG = "h-auto w-auto max-h-[240px] max-w-full object-contain";

/**
 * Both cells sit on a hardcoded background so the comparison is honest
 * regardless of the app's current theme — so this placeholder's text colour
 * has to be hardcoded too, per cell, rather than the theme-flipping
 * `text-muted-foreground` (which reads as ~3.9:1 grey-on-white in dark mode,
 * a low-contrast bug on the very cell meant to always be light).
 */
function Missing({ tone }: { tone: "onLight" | "onDark" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] ${
        tone === "onLight" ? "text-neutral-600" : "text-neutral-400"
      }`}
    >
      <ImageOff className="h-3.5 w-3.5" />
      no image extracted
    </span>
  );
}

export interface FigureThemeStripProps {
  assets: QuestionAsset[];
  /** Heading shown above the strip. Defaults to "Figures". */
  label?: string;
  className?: string;
}

export function FigureThemeStrip({
  assets,
  label = "Figures",
  className = "",
}: FigureThemeStripProps): JSX.Element | null {
  if (!assets.length) return null;

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
        <span className="ml-1.5 normal-case tracking-normal">({assets.length})</span>
      </div>

      <div className="space-y-2">
        {assets.map((asset, i) => (
          // `id` is only unique within one question (parse-tcs-ion.ts restarts
          // its counter per parse), and this strip is also used to show a
          // whole import's figures at once — so the id alone is not a safe key.
          <div
            key={`${asset.id}-${i}`}
            className="overflow-hidden rounded-md border border-border bg-card"
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border bg-muted px-2 py-1.5">
              <span className="font-mono text-[11px] text-foreground">{asset.id}</span>
              {asset.alt ? (
                <span className="text-[11px] text-muted-foreground">{asset.alt}</span>
              ) : null}
            </div>

            <div className="flex flex-col sm:flex-row">
              <div className="flex-1 border-b border-border sm:border-b-0 sm:border-r">
                <div className={CAPTION}>Light</div>
                <div className={`${CELL} bg-white`}>
                  {asset.src ? (
                    <img src={asset.src} alt={asset.alt} className={IMG} />
                  ) : (
                    <Missing tone="onLight" />
                  )}
                </div>
              </div>

              <div className="flex-1">
                <div className={CAPTION}>Dark</div>
                {/* Hardcoded, not a token: this cell must stay dark while the app is in light mode. */}
                <div className={`${CELL} bg-[#0B0B0C]`}>
                  {asset.src ? (
                    <img src={asset.src} alt={asset.alt} className={`${IMG} ${DARK_FILTER}`} />
                  ) : (
                    <Missing tone="onDark" />
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
