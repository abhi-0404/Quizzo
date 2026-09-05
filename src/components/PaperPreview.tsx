import { useState } from "react";
import { ArrowLeft, Check, Eye, EyeOff, PlayCircle, Timer } from "lucide-react";
import { UniversalRenderer } from "@/components/UniversalRenderer";
import {
  isChoiceType, isSingleAnswer, isSubChoice, isSubSingle,
  type Question,
  type QuestionAsset,
} from "@/data/questions";

/**
 * Independent, distraction-free preview of a built paper.
 *
 * Rendered *instead of* AppLayout, so the global sidebar is absent entirely —
 * this is a focused reading environment, not a modal over the editor.
 * "Toggle Answers" off is exactly the student view; on reveals the key.
 */

interface PaperPreviewProps {
  subject: string;
  /** e.g. "End Term | Jan Term - 2026" */
  headerLine: string;
  dateLabel: string;
  duration: string;
  totalQuestions: number;
  totalMarks: number;
  /** e.g. "BS in Data Science and Applications · Foundation" */
  programmeLine: string;
  questions: Question[];
  onBack: () => void;
  onRun: (mode: "practice" | "exam") => void;
}

const solidBtn =
  "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors " +
  "bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-black dark:hover:bg-white";
const ghostBtn =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 " +
  "text-[12px] font-medium text-foreground hover:bg-secondary transition-colors";

/** Solid green treatment for a revealed correct answer. */
const CORRECT =
  "border-emerald-500 bg-emerald-50 dark:bg-[#0F1A14] text-emerald-800 dark:text-emerald-300";

function OptionRow({
  assets,
  letter, text, correct, showAnswers, round,
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
    <div
      className={`flex items-start gap-2 rounded-md border px-3 py-2 transition-colors ${
        reveal ? CORRECT : "border-border bg-card"
      }`}
    >
      <span
        className={`shrink-0 mt-0.5 h-5 w-5 flex items-center justify-center border text-[11px] font-medium ${
          round ? "rounded-full" : "rounded"
        } ${reveal ? "border-emerald-500 bg-emerald-500 text-white" : "border-border bg-card text-muted-foreground"}`}
      >
        {reveal ? <Check className="h-3 w-3" /> : letter}
      </span>
      <UniversalRenderer className="text-[13px] leading-relaxed" content={text} assets={assets} />
    </div>
  );
}

function NumericAnswer({ value, showAnswers }: { value: string; showAnswers: boolean }) {
  if (!showAnswers) {
    return (
      <div className="h-9 max-w-[240px] rounded-md border border-border bg-muted flex items-center px-3">
        <span className="text-[12px] text-muted-foreground">Numerical answer</span>
      </div>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] font-medium ${CORRECT}`}>
      <Check className="h-3.5 w-3.5" />
      <UniversalRenderer content={value || "—"} />
    </span>
  );
}

export function PaperPreview({
  subject, headerLine, dateLabel, duration, totalQuestions, totalMarks,
  programmeLine, questions, onBack, onRun,
}: PaperPreviewProps) {
  const [showAnswers, setShowAnswers] = useState(false);

  let n = 0; // running number so comprehension children join the main sequence

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Minimalist sticky header */}
      <header className="sticky top-0 z-30 bg-card border-b border-border">
        <div className="px-4 md:px-6 py-2.5 flex items-center justify-between gap-4">
          <button onClick={onBack} className={ghostBtn}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Create Content
          </button>

          <div className="min-w-0 text-center hidden sm:block">
            <p className="text-[13px] font-medium truncate">{subject}</p>
            <p className="text-[11px] text-muted-foreground truncate">
              {headerLine} · {dateLabel} · {duration} · {totalQuestions} Q · {totalMarks} marks
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => onRun("practice")} className={ghostBtn} title="Open in the real practice runner">
              <PlayCircle className="h-3.5 w-3.5" /> Practice
            </button>
            <button onClick={() => onRun("exam")} className={ghostBtn} title="Open in the real exam runner">
              <Timer className="h-3.5 w-3.5" /> Exam
            </button>
            <button
              onClick={() => setShowAnswers((v) => !v)}
              aria-pressed={showAnswers}
              className={solidBtn}
            >
              {showAnswers ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              Toggle Answers
            </button>
          </div>
        </div>
      </header>

      {/* Centred question feed */}
      <div className="mx-auto max-w-4xl px-4 md:px-6 py-8">
        {/* Paper masthead */}
        <div className="border border-border rounded-md bg-card px-5 py-4 mb-4">
          <h1 className="text-lg font-semibold">{subject}</h1>
          <p className="text-[13px] text-foreground/80">{headerLine}</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
            <span>Date: {dateLabel}</span>
            <span>Duration: {duration}</span>
            <span>Questions: {totalQuestions}</span>
            <span>Total Marks: {totalMarks}</span>
          </div>
          <p className="mt-2 text-[12px] text-muted-foreground">{programmeLine}</p>
        </div>

        {questions.length === 0 ? (
          <div className="border border-border rounded-md bg-card px-4 py-12 text-center">
            <p className="text-[13px] text-muted-foreground">No questions added yet — the paper is empty.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {questions.map((q) => {
              /* ── Comprehension parent ─────────────────────────────── */
              if (q.inputMode === "form" && q.type === "comprehension") {
                const start = n;
                n += q.subQuestions.length;
                return (
                  <section key={q.id} className="border border-border rounded-md bg-card px-5 py-4">
                    {q.passage.trim() && (
                      <div className="mb-4 border border-border rounded-md bg-muted px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground mb-1">Passage</p>
                        <UniversalRenderer className="text-[13px] leading-relaxed" content={q.passage} assets={q.assets} />
                      </div>
                    )}
                    <div className="space-y-5">
                      {q.subQuestions.map((sq, si) => (
                        <div key={sq.id} className="flex gap-3">
                          <span className="text-[13px] font-medium tabular-nums shrink-0">{start + si + 1}.</span>
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

              n += 1;
              const num = n;

              /* ── Raw source only (never parsed into fields) ───────── */
              if (!q.stem.trim()) {
                return (
                  <section key={q.id} className="border border-border rounded-md bg-card px-5 py-4">
                    <div className="flex gap-3">
                      <span className="text-[13px] font-medium tabular-nums shrink-0">{num}.</span>
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

              /* ── Standard question ────────────────────────────────── */
              return (
                <section key={q.id} className="border border-border rounded-md bg-card px-5 py-4">
                  <div className="flex gap-3">
                    <span className="text-[13px] font-medium tabular-nums shrink-0">{num}.</span>
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
            })}
          </div>
        )}
      </div>
    </div>
  );
}
