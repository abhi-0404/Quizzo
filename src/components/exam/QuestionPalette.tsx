import { memo, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { answeredTotal, counts, type QStatus } from "@/lib/exam-session";

export const STATUS_LOOK: Record<QStatus, string> = {
  notVisited: "bg-muted text-muted-foreground border border-input",
  notAnswered: "bg-destructive text-destructive-foreground dark:text-black",
  answered: "bg-success text-black",
  marked: "bg-review text-review-foreground rounded-full",
  answeredMarked: "bg-review text-review-foreground rounded-full",
};

export const STATUS_LABEL: Record<QStatus, string> = {
  notVisited: "Not visited",
  notAnswered: "Not answered",
  answered: "Answered",
  marked: "Marked for review",
  answeredMarked: "Answered & marked",
};

const LEGEND_SHORT: Record<QStatus, string> = {
  answered: "Answered",
  notAnswered: "Not answered",
  marked: "Marked",
  answeredMarked: "Ans. + marked",
  notVisited: "Not visited",
};

/** Soft tinted chip per state, for the legend. */
const LEGEND_TINT: Record<QStatus, string> = {
  answered: "border-success/40 bg-success/10",
  notAnswered: "border-destructive/40 bg-destructive/10",
  marked: "border-review/40 bg-review/10",
  answeredMarked: "border-review/40 bg-review/10",
  notVisited: "border-border bg-muted",
};

const LEGEND_ORDER: QStatus[] = ["answered", "notAnswered", "marked", "answeredMarked", "notVisited"];

/** Colour AND shape carry the state, so it reads without colour vision too. */
export function StatusSwatch({ status, children, className, small }: { status: QStatus; children?: React.ReactNode; className?: string; small?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-[5px] text-[11px] font-semibold tabular-nums",
        STATUS_LOOK[status],
        className
      )}
    >
      {children}
      {status === "answeredMarked" && (
        <span
          className={cn(
            "absolute rounded-full bg-success",
            small ? "-right-px -top-px h-1.5 w-1.5 border border-card" : "-right-0.5 -top-0.5 h-2.5 w-2.5 border-2 border-card"
          )}
        />
      )}
    </span>
  );
}

const PaletteCell = memo(function PaletteCell({
  index,
  status,
  current,
  hasNote,
  onGo,
}: {
  index: number;
  status: QStatus;
  current: boolean;
  hasNote: boolean;
  onGo: (i: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onGo(index)}
      aria-label={`Question ${index + 1}, ${STATUS_LABEL[status].toLowerCase()}${hasNote ? ", has a note" : ""}`}
      aria-current={current ? "step" : undefined}
      className={cn(
        "relative flex aspect-square min-h-[44px] w-full items-center justify-center rounded-lg text-[15px] font-semibold tabular-nums transition-[transform,filter] hover:brightness-110 active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        "min-[2200px]:min-h-[52px] min-[2200px]:text-[17px]",
        STATUS_LOOK[status],
        current && "ring-2 ring-foreground ring-offset-2 ring-offset-card"
      )}
    >
      {index + 1}
      {status === "answeredMarked" && (
        <span aria-hidden className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card bg-success" />
      )}
      {hasNote && (
        <span aria-hidden className="absolute bottom-1 left-1/2 h-1 w-3 -translate-x-1/2 rounded-full bg-current opacity-60" />
      )}
    </button>
  );
});

/** Progress line plus the question grid, one continuous set of numbers. */
export const PaletteGrid = memo(function PaletteGrid({
  statuses,
  current,
  noted,
  onGo,
}: {
  statuses: QStatus[];
  current: number;
  noted?: Set<number>;
  onGo: (i: number) => void;
}) {
  const c = useMemo(() => counts(statuses), [statuses]);
  const done = answeredTotal(c);
  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <div className="flex items-baseline justify-between text-[12px] text-muted-foreground">
          <span>
            <span className="text-[15px] font-semibold tabular-nums text-foreground">{done}</span> / {statuses.length} answered
          </span>
          <span className="tabular-nums">On Q{current + 1}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className="h-full rounded-full bg-success transition-[width] duration-300"
            style={{ width: `${statuses.length ? (100 * done) / statuses.length : 0}%` }}
          />
        </div>
      </div>
      <nav aria-label="Questions" className="grid grid-cols-5 gap-2.5 sm:grid-cols-8 lg:grid-cols-5">
        {statuses.map((s, i) => (
          <PaletteCell key={i} index={i} status={s} current={i === current} hasNote={!!noted?.has(i)} onGo={onGo} />
        ))}
      </nav>
    </div>
  );
});

const LEGEND_KEY = "quizzo_legend_open";
const readOpen = () => {
  try {
    return localStorage.getItem(LEGEND_KEY) !== "0";
  } catch {
    return true;
  }
};

/**
 * The five states with live counts. Collapsible: folded, it is one compact row
 * of swatch + count (the question grid gets the space); open, it adds labels.
 * The choice is remembered on this device.
 */
export const PaletteLegend = memo(function PaletteLegend({ statuses }: { statuses: QStatus[] }) {
  const c = useMemo(() => counts(statuses), [statuses]);
  const [open, setOpen] = useState(readOpen);
  const toggle = () =>
    setOpen((o) => {
      try {
        localStorage.setItem(LEGEND_KEY, o ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !o;
    });

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-[12px] font-medium text-muted-foreground hover:text-foreground"
      >
        <span>Status</span>
        {!open && (
          <span className="ml-1 flex flex-1 items-center justify-end gap-2.5" aria-label="Question status counts">
            {LEGEND_ORDER.map((s) => (
              <span key={s} className="inline-flex items-center gap-1" title={STATUS_LABEL[s]}>
                <StatusSwatch status={s} small className="h-3 w-3" />
                <span className="tabular-nums text-foreground">{c[s]}</span>
              </span>
            ))}
          </span>
        )}
        <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 transition-transform", !open && "-rotate-90")} aria-hidden />
      </button>
      {open && (
        <ul className="mt-1.5 grid grid-cols-2 gap-1.5" aria-label="Question status counts">
          {LEGEND_ORDER.map((s) => (
            <li
              key={s}
              className={cn(
                "flex items-center gap-2 rounded-md border px-2 py-1.5 text-[12px]",
                LEGEND_TINT[s],
                s === "notVisited" && "col-span-2"
              )}
            >
              <StatusSwatch status={s} small className="h-4 w-4" />
              <span className="min-w-0 truncate text-foreground/80" title={STATUS_LABEL[s]}>{LEGEND_SHORT[s]}</span>
              <span className="ml-auto text-[13px] font-semibold tabular-nums text-foreground">{c[s]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
