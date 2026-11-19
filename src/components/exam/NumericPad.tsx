import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

const KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "-", "0", "."];

/**
 * Answer entry for numerical questions. The value is typed on the physical
 * keyboard too (handled by the exam page); this pad is for touch and mouse.
 */
export function NumericPad({
  value,
  onKey,
  disabled,
}: {
  value: string;
  onKey: (key: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="w-full max-w-[280px]">
      <label htmlFor="numeric-answer" className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
        Your answer
      </label>
      <output
        id="numeric-answer"
        aria-live="polite"
        className={cn(
          "flex h-12 w-full items-center justify-end rounded-lg border bg-card px-3 font-mono text-xl tabular-nums",
          value ? "border-primary text-foreground" : "border-border text-muted-foreground"
        )}
      >
        {value || "0"}
      </output>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            disabled={disabled}
            onClick={() => onKey(k)}
            aria-label={k === "-" ? "Plus or minus" : k === "." ? "Decimal point" : k}
            className="h-11 rounded-md border border-border bg-card text-[15px] font-medium text-foreground transition-colors hover:bg-muted active:scale-[0.97] disabled:opacity-50"
          >
            {k === "-" ? "±" : k}
          </button>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={() => onKey("back")}
          aria-label="Backspace"
          className="col-span-2 flex h-11 items-center justify-center gap-1.5 rounded-md border border-border bg-muted text-[13px] font-medium text-foreground hover:bg-secondary disabled:opacity-50"
        >
          <Delete className="h-4 w-4" /> Backspace
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onKey("clear")}
          className="h-11 rounded-md border border-border bg-muted text-[13px] font-medium text-foreground hover:bg-secondary disabled:opacity-50"
        >
          Clear all
        </button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">You can also type digits on your keyboard.</p>
    </div>
  );
}
