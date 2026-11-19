import { memo } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { UniversalRenderer } from "@/components/UniversalRenderer";
import type { QuestionAsset } from "@/data/questions";

export type OptionVerdict = "correct" | "wrong" | "missed" | null;

/**
 * One whole-row answer target: at least 48px tall, an A/B/C badge (round for
 * single choice, square for multiple), selected state shown by border, fill
 * and an inset bar. In practice mode, after "Check", rows also carry a verdict.
 */
const OptionRow = memo(function OptionRow({
  letter,
  checked,
  multi,
  verdict,
  disabled,
  onToggle,
  children,
}: {
  letter: string;
  checked: boolean;
  multi: boolean;
  verdict: OptionVerdict;
  disabled?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={checked}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "group flex min-h-12 w-full items-center gap-3 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors sm:px-3.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-default",
        verdict === "correct" && "border-success bg-success/10",
        verdict === "wrong" && "border-destructive bg-destructive/10",
        verdict === "missed" && "border-success border-dashed",
        !verdict && checked && "border-primary bg-primary/10",
        !verdict && !checked && "border-border hover:border-input hover:bg-muted/60"
      )}
    >
      <span
        className={cn(
          "grid h-7 w-7 shrink-0 place-items-center border text-[12px] font-semibold",
          multi ? "rounded-md" : "rounded-full",
          verdict === "correct" || verdict === "missed"
            ? "border-success bg-success text-success-foreground dark:text-black"
            : verdict === "wrong"
              ? "border-destructive bg-destructive text-destructive-foreground"
              : checked
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input text-muted-foreground group-hover:text-foreground"
        )}
      >
        {verdict === "correct" || verdict === "missed" ? <Check className="h-3.5 w-3.5" /> : verdict === "wrong" ? <X className="h-3.5 w-3.5" /> : letter}
      </span>
      <span className="option-figure-scale min-w-0 flex-1 text-[15px] leading-relaxed text-foreground 2xl:text-[16px] min-[2200px]:text-[17px] [overflow-wrap:anywhere]">{children}</span>
    </button>
  );
});

/**
 * Renders the options of a choice question. Blank options are skipped but keep
 * their original index, because the answer key and grading are index based.
 */
export function OptionList({
  options,
  assets,
  multi,
  selected,
  onSelect,
  verdicts,
  disabled,
}: {
  options: string[];
  assets?: QuestionAsset[];
  multi: boolean;
  selected: number | number[] | null | undefined;
  onSelect: (index: number) => void;
  verdicts?: OptionVerdict[];
  disabled?: boolean;
}) {
  const picked = (i: number) => (Array.isArray(selected) ? selected.includes(i) : selected === i);
  let letter = 0;
  return (
    <div role={multi ? "group" : "radiogroup"} aria-label="Answer options" className="grid gap-2.5">
      {options.map((opt, i) => {
        if (!opt?.trim()) return null;
        const l = String.fromCharCode(65 + letter++);
        return (
          <OptionRow
            key={i}
            letter={l}
            checked={picked(i)}
            multi={multi}
            verdict={verdicts?.[i] ?? null}
            disabled={disabled}
            onToggle={() => onSelect(i)}
          >
            <UniversalRenderer content={opt} assets={assets} />
          </OptionRow>
        );
      })}
    </div>
  );
}

/** Letters for a set of option indexes, matching what OptionList displays (blanks skipped). */
export function lettersFor(options: string[], indexes: number[]): string {
  const letterOf = new Map<number, string>();
  let n = 0;
  options.forEach((o, i) => {
    if (o?.trim()) letterOf.set(i, String.fromCharCode(65 + n++));
  });
  return [...indexes]
    .sort((a, b) => a - b)
    .map((i) => letterOf.get(i) ?? "?")
    .join(", ");
}
