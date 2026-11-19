import { cn } from "@/lib/utils";

/**
 * The QUIZZO mark as a loader: the logo's three bars slide in a staggered wave
 * into an aligned stack and back out to the logo shape. The keyframes live in a
 * <style> block in index.html, so the very same loader also shows on the first
 * paint, before any JavaScript has loaded. Reduced-motion users get a gentle
 * pulse instead.
 */
export function QuizzoMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={cn("qz-mark", className)}
    >
      <rect className="qz-bar qz-bar-1" x="3" y="1.5" width="10" height="3.5" rx="0.5" />
      <rect className="qz-bar qz-bar-2" x="4.5" y="6.5" width="10" height="3.5" rx="0.5" />
      <rect className="qz-bar qz-bar-3" x="2" y="11.5" width="10" height="3.5" rx="0.5" />
    </svg>
  );
}

/**
 * `fullscreen` fills the viewport (route and page loads). Without it the loader
 * sits inline, centred in its container.
 */
export function QuizzoLoader({
  label = "Loading",
  fullscreen = false,
  size = 44,
  className,
}: {
  label?: string;
  fullscreen?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-foreground",
        fullscreen ? "min-h-[100dvh] bg-background" : "py-16",
        className
      )}
    >
      <QuizzoMark size={size} />
      <span className="qz-label text-[12px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}
