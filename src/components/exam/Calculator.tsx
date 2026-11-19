import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, GripHorizontal, RotateCw, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The TCS iON scientific calculator (the one in the real exam), embedded in a
 * floating window that never blocks the question.
 *
 * Mouse only:
 *  - drag the title bar to move it anywhere;
 *  - drag any edge or corner to scale it (proportionally), or scroll the
 *    mouse wheel over the title bar;
 *  - drag the round handle above it to rotate (snaps to upright).
 * Position, size and angle are remembered on this device.
 *
 * The calculator is TCS's own page, embedded as is. tcsion.com decides whether it
 * may be shown inside another site; when a browser refuses, the title bar's
 * "open in its own window" button opens the same calculator in a small popup.
 */
const SRC = "https://www.tcsion.com/OnlineAssessment/ScientificCalculator/Calculator.html";
const BASE_W = 400;
const BASE_H = 500;
const BAR_H = 34;
const KEY = "quizzo_calc_window";
const MIN_SCALE = 0.5;
const MAX_SCALE = 1.8;

interface Win {
  x: number;
  y: number;
  scale: number;
  rotate: number;
}

type Mode = "drag" | "rotate" | "scale";

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(s * 100) / 100));

function defaultWin(): Win {
  const w = typeof window === "undefined" ? 1280 : window.innerWidth;
  const h = typeof window === "undefined" ? 800 : window.innerHeight;
  const scale = w < 640 ? Math.max(MIN_SCALE, Math.min(1, (w - 24) / BASE_W)) * 0.85 : 0.9;
  return { x: Math.max(8, w - BASE_W * scale - 24), y: Math.max(8, Math.min(96, h - (BASE_H + BAR_H) * scale - 8)), scale, rotate: 0 };
}

function loadWin(): Win {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const w = JSON.parse(raw) as Win;
      if ([w.x, w.y, w.scale, w.rotate].every((n) => typeof n === "number" && Number.isFinite(n))) {
        return { ...w, scale: clampScale(w.scale) };
      }
    }
  } catch {
    /* ignore */
  }
  return defaultWin();
}

/** Keep part of the title bar on screen so the window can always be grabbed back. */
function keepOnScreen(w: Win): Win {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = BASE_W * w.scale;
  return { ...w, x: Math.min(vw - 60, Math.max(60 - width, w.x)), y: Math.min(vh - 40, Math.max(0, w.y)) };
}

function openPopup() {
  const w = 420;
  const h = 560;
  const left = Math.max(0, window.screenX + window.outerWidth - w - 40);
  const top = Math.max(0, window.screenY + 80);
  window.open(SRC, "quizzo-tcs-calculator", `popup=yes,width=${w},height=${h},left=${left},top=${top}`);
}

/** Invisible grab zones on every edge and corner; only the cursor changes. */
const EDGES: { cls: string; cursor: string }[] = [
  { cls: "-top-1.5 left-3 right-3 h-3", cursor: "ns-resize" },
  { cls: "-bottom-1.5 left-3 right-3 h-3", cursor: "ns-resize" },
  { cls: "-left-1.5 top-3 bottom-3 w-3", cursor: "ew-resize" },
  { cls: "-right-1.5 top-3 bottom-3 w-3", cursor: "ew-resize" },
  { cls: "-left-1.5 -top-1.5 h-4 w-4", cursor: "nwse-resize" },
  { cls: "-right-1.5 -bottom-1.5 h-4 w-4", cursor: "nwse-resize" },
  { cls: "-right-1.5 -top-1.5 h-4 w-4", cursor: "nesw-resize" },
  { cls: "-left-1.5 -bottom-1.5 h-4 w-4", cursor: "nesw-resize" },
];

export function Calculator({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [win, setWin] = useState<Win>(loadWin);
  const [busy, setBusy] = useState<Mode | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const start = useRef<{ px: number; py: number; win: Win; angle0: number; dist0: number } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(win));
    } catch {
      /* ignore */
    }
  }, [win]);

  useEffect(() => {
    if (!open) return;
    const fit = () => setWin((w) => keepOnScreen(w));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [open]);

  const centre = () => {
    const r = boxRef.current?.getBoundingClientRect();
    return r ? { cx: r.left + r.width / 2, cy: r.top + r.height / 2 } : { cx: 0, cy: 0 };
  };

  const begin = (mode: Mode) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const { cx, cy } = centre();
    start.current = {
      px: e.clientX,
      py: e.clientY,
      win,
      angle0: Math.atan2(e.clientY - cy, e.clientX - cx),
      dist0: Math.max(1, Math.hypot(e.clientX - cx, e.clientY - cy)),
    };
    setBusy(mode);
  };

  const move = useCallback(
    (e: React.PointerEvent) => {
      const s = start.current;
      if (!s || !busy) return;
      if (busy === "drag") {
        setWin(keepOnScreen({ ...s.win, x: s.win.x + e.clientX - s.px, y: s.win.y + e.clientY - s.py }));
        return;
      }
      const { cx, cy } = centre();
      if (busy === "rotate") {
        let deg = s.win.rotate + ((Math.atan2(e.clientY - cy, e.clientX - cx) - s.angle0) * 180) / Math.PI;
        const snapped = Math.round(deg / 90) * 90;
        if (Math.abs(deg - snapped) < 4) deg = snapped;
        setWin({ ...s.win, rotate: Math.round(deg) });
      } else {
        // Scale by how far the pointer moved from the window's centre.
        setWin({ ...s.win, scale: clampScale(s.win.scale * (Math.hypot(e.clientX - cx, e.clientY - cy) / s.dist0)) });
      }
    },
    [busy]
  );

  const end = () => {
    start.current = null;
    setBusy(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    setWin((w) => keepOnScreen({ ...w, scale: clampScale(w.scale * (e.deltaY < 0 ? 1.06 : 1 / 1.06)) }));
  };

  if (!open) return null;

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label="Scientific calculator"
      className="fixed left-0 top-0 z-50 select-none"
      style={{
        width: BASE_W,
        transform: `translate(${win.x}px, ${win.y}px) rotate(${win.rotate}deg) scale(${win.scale})`,
        transformOrigin: "top left",
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
        <div
          className={cn("flex items-center gap-1.5 border-b border-border bg-muted pl-2 pr-1", busy === "drag" ? "cursor-grabbing" : "cursor-grab")}
          style={{ height: BAR_H, touchAction: "none" }}
          onPointerDown={begin("drag")}
          onWheel={onWheel}
          title="Drag to move. Scroll to resize."
        >
          <GripHorizontal className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="mr-auto truncate text-[12px] font-semibold">Calculator</span>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={openPopup}
            aria-label="Open the calculator in its own window"
            title="Open in its own window (use this if it does not load here)"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onOpenChange(false)}
            aria-label="Close calculator"
            title="Close"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative" style={{ width: BASE_W, height: BASE_H }}>
          <iframe
            src={SRC}
            title="TCS iON scientific calculator"
            width={BASE_W}
            height={BASE_H}
            referrerPolicy="no-referrer-when-downgrade"
            className="relative block"
            // While moving, scaling or rotating, the frame would swallow the pointer.
            style={{ pointerEvents: busy ? "none" : "auto", background: "transparent" }}
          />
        </div>
      </div>

      {/* Mouse scaling: drag any edge or corner. Invisible; only the cursor shows it. */}
      {EDGES.map((z, i) => (
        <span
          key={i}
          aria-hidden
          onPointerDown={begin("scale")}
          className={cn("absolute z-10", z.cls)}
          style={{ cursor: z.cursor, touchAction: "none" }}
        />
      ))}

      {/* Rotate handle above the window. */}
      <button
        type="button"
        aria-label="Drag to rotate"
        title="Drag to rotate"
        onPointerDown={begin("rotate")}
        onDoubleClick={() => setWin((w) => ({ ...w, rotate: 0 }))}
        className="absolute -top-7 left-1/2 flex h-6 w-6 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow hover:text-foreground"
        style={{ touchAction: "none" }}
      >
        <RotateCw className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
