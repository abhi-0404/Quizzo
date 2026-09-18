import { useState } from "react";
import { ArrowLeft, Eye, EyeOff, PlayCircle, Timer } from "lucide-react";
import { QuestionBlock } from "@/components/QuestionBlock";
import type { Question } from "@/data/questions";

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
              const start = n + 1;
              n += q.inputMode === "form" && q.type === "comprehension" ? q.subQuestions.length : 1;
              return <QuestionBlock key={q.id} question={q} startNumber={start} showAnswers={showAnswers} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
