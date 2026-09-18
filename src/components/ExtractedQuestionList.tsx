import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight } from "lucide-react";
import { UniversalRenderer } from "@/components/UniversalRenderer";
import { FigureThemeStrip } from "@/components/FigureThemeStrip";
import {
  SUB_TYPES,
  countsAsQuestions,
  isSubChoice,
  marksOf,
  typeLabel,
  type Question,
  type QuestionAsset,
  type SubQType,
  type SubQuestion,
} from "@/data/questions";
import type { ImportedCourse } from "@/lib/parse-tcs-ion";

/**
 * Read-back of everything a TCS iON PDF produced, course by course.
 *
 * The import dialog only reports per-course counts, which is enough to spot a
 * paper that failed to parse but not enough to trust one that appears to have
 * worked: a mis-cropped figure, a stem that swallowed the next question, or an
 * answer key read off the wrong colour all show up as plausible numbers. This
 * is the verification surface — every stem, option, key and figure, rendered
 * exactly the way the exam runner will render it.
 */

export interface ExtractedQuestionListProps {
  courses: ImportedCourse[];
  /** Fired when a question is clicked, so a PDF pane can scroll to it. */
  onFocusQuestion?: (courseIndex: number, questionIndex: number) => void;
  className?: string;
}

const CORRECT_ROW =
  "border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-[#0F1A14] dark:text-emerald-300";
const CORRECT_MARK = "border-emerald-500 bg-emerald-500 text-white";

const subTypeLabel = (t: SubQType) => SUB_TYPES.find((x) => x.key === t)?.label ?? t;

const marksLabel = (n: number) => `${n} mark${n === 1 ? "" : "s"}`;

/* ── Options ──────────────────────────────────────────────────────────────── */

interface DisplayOption {
  /** Original index, so the letter still matches the source ordering. */
  index: number;
  text: string;
  correct: boolean;
}

/**
 * The parser pads every option list out to four entries with trailing
 * blanks, so a three-option question carries one. Only *trailing* blanks are
 * trimmed here — an interior blank is not padding, it is a figure whose crop
 * came back empty (attachAssets strips an option down to "" when that
 * happens), and hiding that row would silently skip a letter with nothing to
 * show an admin was ever there. It stays, rendered as "(blank option)".
 */
function displayOptions(options: string[], correct: number[]): DisplayOption[] {
  let end = options.length;
  while (end > 0 && options[end - 1].trim() === "" && !correct.includes(end - 1)) end--;
  return options.slice(0, end).map((text, index) => ({ index, text, correct: correct.includes(index) }));
}

function OptionRow({
  option,
  round,
  assets,
}: {
  option: DisplayOption;
  round: boolean;
  assets: QuestionAsset[];
}) {
  const { correct, index, text } = option;
  return (
    <li
      className={`flex items-start gap-2 rounded-md border px-3 py-2 ${
        correct ? CORRECT_ROW : "border-border bg-card"
      }`}
    >
      {/* The letter is the option's identity and stays visible on every row,
          correct or not — a correct row that showed only a checkmark was the
          one row an admin could never say "option C" about while checking it
          against the PDF's own lettering. */}
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border text-[11px] font-medium ${
          round ? "rounded-full" : "rounded"
        } ${correct ? CORRECT_MARK : "border-border bg-card text-muted-foreground"}`}
      >
        {String.fromCharCode(65 + index)}
      </span>
      <div className="min-w-0 flex-1">
        {text.trim() ? (
          <UniversalRenderer className="text-[13px] leading-relaxed" content={text} assets={assets} />
        ) : (
          <span className="text-[13px] text-muted-foreground">(blank option)</span>
        )}
      </div>
      {/* Colour alone must not carry the key — screen readers and printouts. */}
      <span
        className={`inline-flex shrink-0 items-center gap-1 text-[11px] font-medium ${
          correct ? "text-emerald-700 dark:text-emerald-300" : "sr-only"
        }`}
      >
        {correct && <Check className="h-3 w-3" aria-hidden="true" />}
        {`Option ${String.fromCharCode(65 + index)}${correct ? " — correct answer" : ""}`}
      </span>
    </li>
  );
}

function OptionList({
  options,
  correct,
  round,
  assets,
}: {
  options: string[];
  correct: number[];
  round: boolean;
  assets: QuestionAsset[];
}) {
  const rows = displayOptions(options, correct);
  if (!rows.length) return null;
  return (
    <ul className="mt-2 space-y-1.5">
      {rows.map((o) => (
        <OptionRow key={o.index} option={o} round={round} assets={assets} />
      ))}
    </ul>
  );
}

/* ── Answer key for a short-answer question ───────────────────────────────── */

function NumericAnswer({ value }: { value: string }) {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
      <span className="text-muted-foreground">Expected answer</span>
      {value.trim() ? (
        /* Ranges ("0.45 to 0.50") and negatives ("-0.5") are both real, so the
           source string is shown as-is and never coerced to a number. */
        <span
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[12px] ${CORRECT_ROW}`}
        >
          <Check className="h-3 w-3 shrink-0" aria-hidden="true" />
          {value}
        </span>
      ) : (
        <span className="rounded-md border border-border bg-muted px-2 py-1 text-muted-foreground">
          none extracted
        </span>
      )}
    </p>
  );
}

/* ── Issues ───────────────────────────────────────────────────────────────── */

function Issues({ issues }: { issues: string[] }) {
  if (!issues.length) return null;
  return (
    <ul className="mt-2 space-y-1">
      {issues.map((issue, i) => (
        <li
          key={i}
          className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900 dark:border-amber-900 dark:bg-[#1E1707] dark:text-amber-300"
        >
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{issue}</span>
        </li>
      ))}
    </ul>
  );
}

/* ── Sub-question ─────────────────────────────────────────────────────────── */

function SubQuestionBlock({ sub, number }: { sub: SubQuestion; number: string }) {
  return (
    <li className="border-l-2 border-border pl-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[12px] font-medium tabular-nums">{number}</span>
        <span className="text-[11px] text-muted-foreground">{subTypeLabel(sub.type)}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {marksLabel(Number(sub.marks) || 0)}
        </span>
      </div>

      {sub.stem.trim() ? (
        <UniversalRenderer
          className="mt-1 text-[13px] leading-relaxed"
          content={sub.stem}
          assets={sub.assets}
        />
      ) : (
        <p className="mt-1 text-[12px] text-muted-foreground">No sub-question text extracted.</p>
      )}

      {isSubChoice(sub.type) ? (
        <OptionList
          options={sub.options}
          correct={sub.correct}
          round={sub.type === "single_correct"}
          assets={sub.assets}
        />
      ) : (
        <NumericAnswer value={sub.numericalAnswer} />
      )}

      <FigureThemeStrip assets={sub.assets} label={`Figures in ${number}`} />
    </li>
  );
}

/* ── Question ─────────────────────────────────────────────────────────────── */

function QuestionBlock({
  question,
  number,
  onFocus,
}: {
  question: Question;
  number: number;
  onFocus?: () => void;
}) {
  const q = question;
  const isComprehension = q.type === "comprehension";
  const marks = marksOf(q);

  const heading = (
    <>
      <span className="text-[13px] font-medium tabular-nums">{number}.</span>
      <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
        {typeLabel(q.type)}
      </span>
      <span className="text-[11px] text-muted-foreground tabular-nums">{marksLabel(marks)}</span>
      {!q.isValid && (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          {q.issues.length} issue{q.issues.length === 1 ? "" : "s"}
        </span>
      )}
    </>
  );

  return (
    <li className="rounded-md border border-border bg-card px-3 py-2.5">
      {/* Only the metadata row is the control: a stem can contain links and the
          code block's own copy button, which must not sit inside a button. */}
      {onFocus ? (
        <button
          type="button"
          onClick={onFocus}
          // No aria-label here: it would replace the accessible name with just
          // this action, silently dropping the type/marks/issue-count content
          // that only exists inside the button — a screen reader would never
          // hear "Single Correct" or "4 marks" for any question. The action is
          // added ahead of that same content instead, so both are announced.
          className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-1 py-0.5 text-left hover:bg-secondary transition-colors"
        >
          <span className="sr-only">Show question {number} in the source PDF. </span>
          {heading}
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 py-0.5">{heading}</div>
      )}

      <div className="mt-1.5">
        {isComprehension ? (
          <>
            {/* The current parser never puts lead-in text on a comprehension
                parent's own stem — it all becomes the passage — but the type
                allows it, so a stray stem is still shown rather than dropped. */}
            {q.stem.trim() && (
              <UniversalRenderer
                className="mb-1.5 text-[13px] leading-relaxed"
                content={q.stem}
                assets={q.assets}
              />
            )}
            {q.passage.trim() ? (
              <div className="rounded-md border border-border bg-muted px-3 py-2">
                <p className="mb-1 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                  Passage
                </p>
                <UniversalRenderer
                  className="text-[13px] leading-relaxed"
                  content={q.passage}
                  assets={q.assets}
                />
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground">No passage extracted.</p>
            )}
            <FigureThemeStrip assets={q.assets} label="Passage figures" />
            {q.subQuestions.length > 0 && (
              <ul className="mt-3 space-y-3">
                {q.subQuestions.map((sub, i) => (
                  <SubQuestionBlock key={sub.id} sub={sub} number={`${number}.${i + 1}`} />
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            {q.stem.trim() ? (
              <UniversalRenderer
                className="text-[13px] leading-relaxed"
                content={q.stem}
                assets={q.assets}
              />
            ) : (
              <p className="text-[12px] text-muted-foreground">No question text extracted.</p>
            )}

            {q.type === "numerical" ? (
              <NumericAnswer value={q.numericalAnswer} />
            ) : (
              <OptionList
                options={q.options}
                correct={q.correct}
                round={q.type === "single"}
                assets={q.assets}
              />
            )}

            <FigureThemeStrip assets={q.assets} />
          </>
        )}
      </div>

      <Issues issues={q.issues} />
    </li>
  );
}

/* ── Course ───────────────────────────────────────────────────────────────── */

interface CourseTotals {
  count: number;
  marks: number;
  flagged: number;
}

const totalsOf = (questions: Question[]): CourseTotals => ({
  // The model helpers own these rules — a comprehension parent contributes its
  // children, not itself, and marks live on the children too.
  count: questions.reduce((n, q) => n + countsAsQuestions(q), 0),
  marks: questions.reduce((n, q) => n + marksOf(q), 0),
  flagged: questions.filter((q) => !q.isValid).length,
});

/* ── List ─────────────────────────────────────────────────────────────────── */

export function ExtractedQuestionList({
  courses,
  onFocusQuestion,
  className = "",
}: ExtractedQuestionListProps): JSX.Element {
  /**
   * Collapsed courses, keyed by section id (falling back to name + position
   * only for the rare course with neither) rather than array index — an
   * index would reattach open/closed state to whatever course a re-parse
   * happens to put in that slot instead of following the course itself.
   */
  const courseKey = (course: ImportedCourse, index: number) =>
    course.sectionId || `${course.name}-${index}`;

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const totals = useMemo(() => courses.map((c) => totalsOf(c.questions)), [courses]);

  if (!courses.length) {
    return (
      <div className={`rounded-md border border-border bg-card px-4 py-10 text-center ${className}`}>
        <p className="text-[13px] text-muted-foreground">
          Nothing extracted yet — parse a paper to review its questions here.
        </p>
      </div>
    );
  }

  return (
    // Scrolling is the caller's to own — a fixed-height panel wrapping this
    // in its own ghost-scroll region is the only way either one actually
    // scrolls; this component has no height of its own to scroll within.
    <div className={className}>
      <div className="space-y-4">
        {courses.map((course: ImportedCourse, courseIndex) => {
          const t = totals[courseIndex];
          const key = courseKey(course, courseIndex);
          const open = !collapsed.has(key);
          const panelId = `pyq-course-${key}`;
          return (
            <section key={key}>
              <button
                type="button"
                onClick={() => toggle(key)}
                aria-expanded={open}
                aria-controls={panelId}
                className="flex w-full items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-left hover:bg-secondary transition-colors"
              >
                {open ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{course.name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                  {t.count} Q · {t.marks} marks
                </span>
                {t.flagged > 0 && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 tabular-nums">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    {t.flagged} flagged
                  </span>
                )}
              </button>

              {open && (
                <ul id={panelId} className="mt-2 space-y-2">
                  {course.questions.map((q, questionIndex) => (
                    <QuestionBlock
                      key={q.id || `${courseIndex}-${questionIndex}`}
                      question={q}
                      number={questionIndex + 1}
                      onFocus={
                        onFocusQuestion
                          ? () => onFocusQuestion(courseIndex, questionIndex)
                          : undefined
                      }
                    />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
