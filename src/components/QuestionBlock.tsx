import { Check } from "lucide-react";
import { UniversalRenderer } from "@/components/UniversalRenderer";
import {
  isChoiceType, isSingleAnswer, isSubChoice, isSubSingle,
  type Question, type QuestionAsset,
} from "@/data/questions";

/**
 * Renders one question exactly the way the full paper preview does — the
 * single source both share, so a one-off look (e.g. clicking a question in
 * the builder's stream) can never quietly drift from what "Preview Paper"
 * shows for the same block.
 */

/** Solid green treatment for a revealed correct answer. */
export const CORRECT_TREATMENT =
  "border-emerald-500 bg-emerald-50 dark:bg-[#0F1A14] text-emerald-800 dark:text-emerald-300";

export function OptionRow({
  assets, letter, text, correct, showAnswers, round,
}: {
  letter: string;
  text: string;
  correct: boolean;
  showAnswers: boolean;
  round: boolean;
  /** Figures the option text may reference; an imported option can be a figure. */
  assets?: QuestionAsset[];
}) {
  const reveal = showAnswers && correct;
  return (
    <div className="flex items-center gap-2 py-1">
      <input
        type={round ? "radio" : "checkbox"}
        checked={reveal}
        onChange={() => undefined}
        tabIndex={-1}
        aria-label={`Option ${letter}${reveal ? " — correct" : ""}`}
        className="shrink-0 self-center h-4 w-4 accent-emerald-600"
      />
      <UniversalRenderer
        className={`text-[13px] leading-relaxed option-figure-scale ${reveal ? "text-emerald-700 dark:text-emerald-300 font-medium" : ""}`}
        content={text}
        assets={assets}
      />
    </div>
  );
}

export function NumericAnswer({ value, showAnswers }: { value: string; showAnswers: boolean }) {
  if (!showAnswers) {
    return (
      <div className="h-9 max-w-[240px] rounded-md border border-border bg-muted flex items-center px-3">
        <span className="text-[12px] text-muted-foreground">Numerical answer</span>
      </div>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-medium ${CORRECT_TREATMENT}`}>
      <Check className="h-3.5 w-3.5" />
      <UniversalRenderer content={value || "—"} />
    </span>
  );
}

export interface QuestionBlockProps {
  question: Question;
  /** Number shown before the stem; a comprehension block counts its sub-questions up from here. */
  startNumber?: number;
  /** Reveal the correct answer. Defaults on — this is a builder/admin view, not a student one. */
  showAnswers?: boolean;
  className?: string;
  /** Skip this block's own card chrome (border/background/padding) — for
   *  nesting inside a caller that already provides it, e.g. an inline
   *  preview expanded directly in the question stream. */
  bare?: boolean;
}

export function QuestionBlock({
  question: q, startNumber = 1, showAnswers = true, className = "", bare = false,
}: QuestionBlockProps) {
  const wrap = bare ? className : `border border-border rounded-md bg-card px-5 py-4 ${className}`;

  if (q.inputMode === "form" && q.type === "comprehension") {
    return (
      <section className={wrap}>
        {q.passage.trim() && (
          <div className="mb-4 border border-border rounded-md bg-muted px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground mb-1">Passage</p>
            <UniversalRenderer className="text-[13px] leading-relaxed" content={q.passage} assets={q.assets} />
          </div>
        )}
        <div className="space-y-5">
          {q.subQuestions.map((sq, si) => (
            <div key={sq.id} className="flex gap-3">
              <span className="text-[13px] font-medium tabular-nums shrink-0">{startNumber + si}.</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <UniversalRenderer className="text-[13px] leading-relaxed" content={sq.stem} assets={sq.assets} />
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">[{sq.marks}]</span>
                </div>
                <div className="mt-3">
                  {isSubChoice(sq.type) ? (
                    <div className="space-y-2">
                      {sq.options.map((opt, oi) => (
                        <OptionRow
                          key={oi}
                          letter={String.fromCharCode(65 + oi)}
                          text={opt}
                          correct={sq.correct.includes(oi)}
                          showAnswers={showAnswers}
                          round={isSubSingle(sq.type)}
                          assets={sq.assets}
                        />
                      ))}
                    </div>
                  ) : (
                    <NumericAnswer value={sq.numericalAnswer} showAnswers={showAnswers} />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  /* Raw source only (never parsed into fields). */
  if (!q.stem.trim()) {
    return (
      <section className={wrap}>
        <div className="flex gap-3">
          <span className="text-[13px] font-medium tabular-nums shrink-0">{startNumber}.</span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground mb-1">
              LaTeX source · {q.marks} mark{q.marks === 1 ? "" : "s"}
            </p>
            <pre className="ghost-scroll border border-border rounded-md bg-muted px-3 py-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
              {q.latex}
            </pre>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={wrap}>
      <div className="flex gap-3">
        <span className="text-[13px] font-medium tabular-nums shrink-0">{startNumber}.</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <UniversalRenderer className="text-[13px] leading-relaxed" content={q.stem} assets={q.assets} />
            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">[{q.marks}]</span>
          </div>
          <div className="mt-3">
            {isChoiceType(q.type) ? (
              <div className="space-y-2">
                {q.options.map((opt, oi) => (
                  <OptionRow
                    key={oi}
                    letter={String.fromCharCode(65 + oi)}
                    text={opt}
                    correct={q.correct.includes(oi)}
                    showAnswers={showAnswers}
                    round={isSingleAnswer(q.type)}
                    assets={q.assets}
                  />
                ))}
              </div>
            ) : (
              <NumericAnswer value={q.numericalAnswer} showAnswers={showAnswers} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
