import { memo, useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { elapsedSeconds, remainingSeconds } from "@/lib/exam-timing";

/** Seconds left at which a timed exam warns, once each. */
const WARN_AT = [15 * 60, 5 * 60, 60];

export function formatClock(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * The only part of the exam screen that re-renders every second. Time is read
 * from the wall clock, so a throttled background tab or a sleeping laptop
 * cannot slow it. Warns at 15, 5 and 1 minute left (toast plus a screen-reader
 * announcement) and calls `onExpire` once at zero.
 */
export const ExamTimer = memo(function ExamTimer({
  startedAt,
  totalSeconds,
  practice,
  onExpire,
  className,
}: {
  startedAt: number;
  totalSeconds: number;
  practice: boolean;
  onExpire: () => void;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [announce, setAnnounce] = useState("");
  const warned = useRef(new Set<number>());
  const expired = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const secs = practice ? elapsedSeconds(startedAt, now) : remainingSeconds(startedAt, totalSeconds, now);

  useEffect(() => {
    if (practice) return;
    // A resumed session can already be past some thresholds: mark those as
    // warned without firing, so only the next one ahead announces itself.
    for (const t of WARN_AT) {
      if (secs <= t && !warned.current.has(t)) {
        warned.current.add(t);
        const fresh = secs > t - 5;
        if (fresh && secs > 0) {
          const msg = t >= 120 ? `${t / 60} minutes left` : "1 minute left";
          toast.warning(msg);
          setAnnounce(msg);
        }
      }
    }
    if (secs === 0 && !expired.current) {
      expired.current = true;
      onExpireRef.current();
    }
  }, [secs, practice]);

  const low = !practice && secs <= 5 * 60;
  const warn = !practice && !low && secs <= 15 * 60;

  return (
    <>
      <span
        role="timer"
        aria-label={practice ? `Time elapsed ${formatClock(secs)}` : `Time remaining ${formatClock(secs)}`}
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 font-mono text-[15px] font-semibold tabular-nums sm:gap-2 sm:px-3 sm:text-base",
          low
            ? "border-destructive text-destructive"
            : warn
              ? "border-warning text-warning"
              : "border-border text-foreground",
          className
        )}
      >
        <Clock className="h-4 w-4 shrink-0" aria-hidden />
        {formatClock(secs)}
      </span>
      <span className="sr-only" aria-live="polite">{announce}</span>
    </>
  );
});
