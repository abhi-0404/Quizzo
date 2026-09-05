import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Calculator as CalculatorIcon, Camera, ChevronLeft, ChevronRight, Delete, FileText, Flag, Lightbulb, Moon, Sun, X } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import { useQuery } from "@tanstack/react-query";
import { loadPreviewPaper } from "@/data/preview-paper";
import { loadPaper, saveAttempt, type LoadedQuestion } from "@/lib/pyq-read";
import { gradeAnswer } from "@/lib/grade";
import { useAuth } from "@/contexts/AuthContext";
import { UniversalRenderer } from "@/components/UniversalRenderer";
import type { QuestionAsset } from "@/data/questions";

type Status = "notVisited" | "notAnswered" | "answered" | "marked";
type QType = "single" | "multi" | "comprehension" | "integer";

interface Question {
  id: number;
  type: QType;
  text: string;
  options: string[];
  passage?: string;
  marks: number;
  /** Figures the stem, options or passage reference as `asset-<id>`. */
  assets?: QuestionAsset[];
  /** Database id, so an attempt can record an answer against this question. */
  questionId?: string;
  /** The key extracted from the source paper. Empty for the admin preview. */
  correct?: number[];
  numericalAnswer?: string;
}

const TOTAL_QUESTIONS = 30;

function makeQuestions(subject: string): Question[] {
  const types: QType[] = ["single", "multi", "comprehension", "integer"];
  return Array.from({ length: TOTAL_QUESTIONS }, (_, i) => {
    const type = types[i % types.length];
    return {
      id: i + 1,
      type,
      text:
        type === "integer"
          ? `(${subject}) Question ${i + 1}: Compute the integer value corresponding to item ${i + 1}.`
          : `(${subject}) Sample question ${i + 1}: Which of the following statements is correct regarding the concept illustrated in item ${i + 1}?`,
      options:
        type === "integer"
          ? []
          : [
              `Option A for question ${i + 1}`,
              `Option B for question ${i + 1}`,
              `Option C for question ${i + 1}`,
              `Option D for question ${i + 1}`,
            ],
      passage:
        type === "comprehension"
          ? `Read the following passage carefully and answer the question that follows.\n\nIn the context of ${subject}, researchers have long studied the phenomena described in item ${i + 1}. Consider the assumptions, relationships, and constraints. The passage discusses key definitions, examples, and counter-examples, providing enough context to reason about the correct choice below.`
          : undefined,
      marks: 4,
    };
  });
}

function statusClasses(s: Status) {
  switch (s) {
    case "answered":
      return "bg-emerald-600 text-white";
    case "notAnswered":
      return "bg-rose-600 text-white";
    case "marked":
      return "bg-indigo-600 text-white";
    default:
      return "bg-gray-200 dark:bg-[#27272A] text-gray-700 dark:text-gray-300";
  }
}

function formatTime(secs: number) {
  const h = Math.floor(secs / 3600).toString().padStart(2, "0");
  const m = Math.floor((secs % 3600) / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function LegendSwatch({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <div className={`w-8 h-8 rounded-md flex items-center justify-center font-medium text-sm ${className}`}>
      {children}
    </div>
  );
}

function ThemeButton() {
  const { theme, setTheme } = useTheme();
  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="relative h-9 w-9 flex items-center justify-center text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors"
      title="Toggle theme"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </button>
  );
}

type Answer = number | number[] | string | null;

export default function Exam() {
  const { slug = "degree", courseSlug = "exam" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const subject = useMemo(
    () => (courseSlug ? courseSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Exam"),
    [courseSlug]
  );
  const examLabel = searchParams.get("exam") ?? "Quiz 1";
  const sessionMode: "exam" | "practice" =
    searchParams.get("mode") === "practice" ? "practice" : "exam";
  const isPractice = sessionMode === "practice";

  /* ── Admin preview: run a paper authored in /admin/create ──────────────── */
  const isPreview = searchParams.get("preview") === "1";
  const previewPaper = useMemo(() => (isPreview ? loadPreviewPaper() : null), [isPreview]);

  /* ── A published paper, addressed by id ────────────────────────────────── */
  const paperId = searchParams.get("paper");
  const { user } = useAuth();
  const { data: loaded, isLoading: paperLoading } = useQuery({
    queryKey: ["paper", paperId],
    queryFn: () => loadPaper(paperId!),
    enabled: !!paperId && !isPreview,
  });

  const questions: Question[] = useMemo(() => {
    if (loaded) return loaded.questions as Question[];
    if (previewPaper) return previewPaper.questions as Question[];
    // Nothing addressed and nothing previewed — the sample paper, as before.
    return makeQuestions(subject);
  }, [loaded, previewPaper, subject]);

  const total = questions.length;
  const durationMinutes =
    loaded?.paper.durationMinutes ?? previewPaper?.durationMinutes ?? 60;
  /** Only a real, published paper can be scored and recorded. */
  const isScored = !!loaded;

  const [started, setStarted] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [statuses, setStatuses] = useState<Status[]>(() => {
    const arr = Array<Status>(total).fill("notVisited");
    arr[0] = "notAnswered";
    return arr;
  });
  // Same reason as the clock: `total` is 0 until the paper loads.
  useEffect(() => {
    setStatuses((prev) => {
      if (prev.length === total) return prev;
      const arr = Array<Status>(total).fill("notVisited");
      if (total > 0) arr[0] = "notAnswered";
      return arr;
    });
  }, [total]);
  const [seconds, setSeconds] = useState(isPractice ? 0 : durationMinutes * 60);
  const [submitting, setSubmitting] = useState(false);
  // The paper arrives after the first render, so the clock is set when it does.
  useEffect(() => {
    if (!isPractice) setSeconds(durationMinutes * 60);
  }, [durationMinutes, isPractice]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [solutionOpen, setSolutionOpen] = useState<Record<number, boolean>>({});
  const [calcOpen, setCalcOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("Typo");
  const [hintOpen, setHintOpen] = useState<Record<number, boolean>>({});
  const questionRef = useRef<HTMLDivElement | null>(null);

  const captureQuestion = async () => {
    if (!questionRef.current) return;
    try {
      const canvas = await html2canvas(questionRef.current, {
        backgroundColor: null,
        scale: 2,
      });
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
          toast.success("Question copied to clipboard!");
        } catch {
          toast.error("Clipboard not available");
        }
      });
    } catch {
      toast.error("Screenshot failed");
    }
  };

  const submitReport = () => {
    toast.success(`Reported: ${reportReason}`);
    setReportOpen(false);
  };

  /**
   * Finish the session.
   *
   * A published paper is graded against the key extracted from the PDF and the
   * attempt is stored, so the report shows what actually happened. The preview
   * and sample papers have no key, so they just navigate as before.
   */
  const finishSession = async () => {
    if (!isScored || !loaded) {
      navigate(`/${slug}/${courseSlug}/report?mode=${sessionMode}`);
      return;
    }

    const graded = loaded.questions.map((q: LoadedQuestion, i: number) => {
      const outcome = gradeAnswer(q, answers[i] as never);
      return {
        questionId: q.questionId,
        response: answers[i] ?? null,
        status: outcome.status,
        marks: outcome.marks,
        timeSeconds: 0,
      };
    });

    if (!user) {
      // Signed-out students can still sit a paper; there is nowhere to store it.
      toast.info("Sign in to save your attempt");
      navigate(`/${slug}/${courseSlug}/report?mode=${sessionMode}`);
      return;
    }

    setSubmitting(true);
    try {
      const attemptId = await saveAttempt({
        userId: user.id,
        paperId: loaded.paper.id,
        mode: sessionMode,
        durationSeconds: isPractice ? seconds : durationMinutes * 60 - seconds,
        totalMarks: loaded.paper.totalMarks,
        answers: graded as never,
      });
      navigate(`/${slug}/${courseSlug}/report?attempt=${attemptId}&mode=${sessionMode}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save your attempt");
      navigate(`/${slug}/${courseSlug}/report?mode=${sessionMode}`);
    } finally {
      setSubmitting(false);
    }
  };

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!started) return;
    timerRef.current = window.setInterval(() => {
      setSeconds((s) => (isPractice ? s + 1 : s > 0 ? s - 1 : 0));
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [started, isPractice]);

  const goTo = (idx: number) => {
    setCurrent(idx);
    setStatuses((prev) => {
      if (prev[idx] === "notVisited") {
        const next = [...prev];
        next[idx] = "notAnswered";
        return next;
      }
      return prev;
    });
    setPaletteOpen(false);
  };

  const q = questions[current];
  const selected = answers[current];

  const selectSingle = (optIdx: number) => {
    setAnswers((prev) => ({ ...prev, [current]: optIdx }));
  };

  const toggleMulti = (optIdx: number) => {
    setAnswers((prev) => {
      const cur = (prev[current] as number[] | undefined) ?? [];
      const next = cur.includes(optIdx) ? cur.filter((i) => i !== optIdx) : [...cur, optIdx];
      return { ...prev, [current]: next };
    });
  };

  const pressKey = (k: string) => {
    setAnswers((prev) => {
      const cur = (prev[current] as string | undefined) ?? "";
      if (k === "back") return { ...prev, [current]: cur.slice(0, -1) };
      if (k === "clear") return { ...prev, [current]: "" };
      if (k === "." && cur.includes(".")) return prev;
      if (cur.length >= 12) return prev;
      return { ...prev, [current]: cur + k };
    });
  };

  const isAnswered = (a: Answer): boolean => {
    if (a == null) return false;
    if (Array.isArray(a)) return a.length > 0;
    if (typeof a === "string") return a.trim().length > 0;
    return true;
  };

  const saveAndNext = () => {
    setStatuses((prev) => {
      const next = [...prev];
      next[current] = isAnswered(answers[current]) ? "answered" : "notAnswered";
      return next;
    });
    if (current < total - 1) goTo(current + 1);
  };

  const markAndNext = () => {
    setStatuses((prev) => {
      const next = [...prev];
      next[current] = "marked";
      return next;
    });
    if (current < total - 1) goTo(current + 1);
  };

  const clearResponse = () => {
    setAnswers((prev) => ({ ...prev, [current]: q.type === "integer" ? "" : q.type === "multi" ? [] : null }));
    setStatuses((prev) => {
      const next = [...prev];
      next[current] = "notAnswered";
      return next;
    });
  };

  // -------- Instruction View --------
  if (!started) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0B0B0F] text-gray-900 dark:text-white">
        <div className="max-w-4xl mx-auto py-8 px-4 pb-32">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Link
                to={`/${slug}/${courseSlug}`}
                className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              >
                <ChevronLeft size={16} /> Back
              </Link>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">General Instructions</h1>
            </div>
            <ThemeButton />
          </div>

          <div className="bg-white dark:bg-[#16161D] rounded-xl p-6 border border-gray-200 dark:border-gray-800">
            <div className="mb-4 text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Mode: <span className="text-gray-900 dark:text-white font-semibold">{isPractice ? "Practice" : "Exam"}</span>
            </div>
            <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
              <p>1. The session contains {total} questions.{isPractice ? " There is no time limit; a stopwatch tracks your time." : ` Total duration is ${durationMinutes} minutes.`}</p>
              <p>2. {isPractice ? "The stopwatch starts as soon as you begin and can be ended anytime." : "The timer starts as soon as you click \"Begin Exam\" and cannot be paused."}</p>
              <p>3. Questions include Single Correct, Multi Correct, Comprehension, and Integer types.</p>
              <p>4. Use "Save & Next" to record your answer and move forward.</p>
              <p>5. Use "Mark for Review & Next" to revisit a question later.</p>
              <p>6. Use "Clear Response" to remove your current selection.</p>
              {isPractice && <p>7. Use "Show Solution" to reveal the correct answer and explanation for the current question.</p>}
            </div>

            <h2 className="mt-8 mb-4 text-base font-semibold text-gray-900 dark:text-white">Question Status Legend</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <LegendSwatch className="bg-emerald-600">1</LegendSwatch>
                <span className="text-sm text-gray-700 dark:text-gray-300">Answered</span>
              </div>
              <div className="flex items-center gap-3">
                <LegendSwatch className="bg-rose-600">2</LegendSwatch>
                <span className="text-sm text-gray-700 dark:text-gray-300">Not answered</span>
              </div>
              <div className="flex items-center gap-3">
                <LegendSwatch className="bg-gray-200 dark:bg-[#27272A] text-gray-700 dark:text-gray-300">3</LegendSwatch>
                <span className="text-sm text-gray-700 dark:text-gray-300">Not visited</span>
              </div>
              <div className="flex items-center gap-3">
                <LegendSwatch className="bg-indigo-600">4</LegendSwatch>
                <span className="text-sm text-gray-700 dark:text-gray-300">Marked for review</span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>
              Subject: <span className="text-gray-900 dark:text-white">
                {previewPaper?.subject ?? subject}
              </span> · {examLabel}
            </span>
            {isPreview && (
              <span className="inline-flex items-center rounded border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-[#1E1707] px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                Admin preview — nothing is recorded
              </span>
            )}
          </div>
        </div>

        <div className="fixed bottom-0 inset-x-0 bg-white dark:bg-[#16161D] border-t border-gray-200 dark:border-gray-800">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 dark:border-gray-700"
              />
              I have read and understood the instructions.
            </label>
            <button
              disabled={!agreed}
              onClick={() => setStarted(true)}
              className="bg-gray-900 text-white dark:bg-gray-200 dark:text-black font-medium px-5 py-2.5 rounded-md text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
            >
              {isPractice ? "Begin Practice" : "Begin Exam"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------- Exam View --------
  const typeLabel =
    q.type === "single"
      ? "Single Correct"
      : q.type === "multi"
      ? "Multi Correct"
      : q.type === "comprehension"
      ? "Comprehension"
      : "Integer Type";

  const Palette = (
    <>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-900 dark:text-white">Question Palette</div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {current + 1} / {total}
          </div>
          <button
            onClick={() => setPaletteCollapsed(true)}
            className="hidden lg:inline-flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            title="Collapse palette"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2 text-xs">
        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
          <span className="w-3 h-3 rounded bg-emerald-600" /> Answered
        </div>
        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
          <span className="w-3 h-3 rounded bg-rose-600" /> Not answered
        </div>
        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
          <span className="w-3 h-3 rounded bg-indigo-600" /> Marked
        </div>
        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
          <span className="w-3 h-3 rounded bg-gray-200 dark:bg-[#27272A]" /> Not visited
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 mt-4">
        {statuses.map((s, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={`w-9 h-9 rounded-md flex items-center justify-center font-medium text-sm transition-transform hover:scale-105 ${statusClasses(
              s
            )} ${i === current ? "ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#16161D] ring-gray-900 dark:ring-white" : ""}`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </>
  );

  const KeyBtn = ({ label, onClick, wide = false }: { label: React.ReactNode; onClick: () => void; wide?: boolean }) => (
    <button
      onClick={onClick}
      className={`bg-gray-100 dark:bg-[#27272A] hover:bg-gray-200 dark:hover:bg-[#323238] text-gray-900 dark:text-white py-3 rounded-md font-medium text-lg transition-colors ${wide ? "col-span-3" : ""} flex items-center justify-center`}
    >
      {label}
    </button>
  );

  // A paper addressed by id is not there on first render; showing the sample
  // paper for a beat would be worse than showing nothing.
  if (paperLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-[#0B0B0F] text-gray-600 dark:text-gray-400">
        Loading paper…
      </div>
    );
  }

  if (paperId && !loaded && !isPreview) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-gray-50 dark:bg-[#0B0B0F] text-gray-600 dark:text-gray-400">
        <p>That paper is not available.</p>
        <Link to={`/${slug}/${courseSlug}`} className="underline underline-offset-2">
          Back to the course
        </Link>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-gray-50 dark:bg-[#0B0B0F] text-gray-900 dark:text-white">
      {/* Top Header */}
      <header className="bg-white dark:bg-[#16161D] h-16 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">{subject}</div>
          <span className="hidden sm:inline text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-gray-100 dark:bg-[#27272A] text-gray-700 dark:text-gray-300">
            {isPractice ? "Practice" : "Exam"}
          </span>
        </div>
        <div className="text-gray-900 dark:text-white font-mono text-xl tabular-nums">{formatTime(seconds)}</div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCalcOpen(true)}
            title="Calculator"
            aria-label="Calculator"
            className="p-2 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-white dark:hover:bg-[#323238] transition-colors"
          >
            <CalculatorIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => setNotesOpen(true)}
            title="Notes"
            aria-label="Notes"
            className="p-2 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-200 dark:text-gray-400 dark:hover:text-white dark:hover:bg-[#323238] transition-colors"
          >
            <FileText className="h-4 w-4" />
          </button>
          <ThemeButton />
          <button
            onClick={() => void finishSession()}
            disabled={submitting}
            className={`text-white text-sm font-medium px-4 py-2 rounded-md ${isPractice ? "bg-gray-800 hover:bg-gray-700 dark:bg-gray-200 dark:text-black dark:hover:bg-white" : "bg-rose-600 hover:bg-rose-500"}`}
          >
            {isPractice ? "End Practice" : "Submit Exam"}
          </button>
        </div>
      </header>

      {/* Main Grid */}
      <div className={`grid flex-1 min-h-0 ${paletteCollapsed ? "lg:grid-cols-1" : "lg:grid-cols-4"}`}>
        {/* Arena */}
        <div className={`${paletteCollapsed ? "" : "lg:col-span-3 lg:border-r"} flex flex-col min-h-0 border-gray-200 dark:border-gray-800`}>
          <div className="flex-1 overflow-y-auto p-6 pb-28 lg:pb-6">
            <div ref={questionRef} className="bg-transparent">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Question {current + 1}</h2>
                <span className="bg-gray-100 dark:bg-[#27272A] text-gray-800 dark:text-gray-200 text-xs px-2 py-1 rounded">
                  {typeLabel}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                  [+{q.marks} Marks]
                </span>
              </div>
              <div className="flex items-center gap-2" data-html2canvas-ignore="true">
                <button
                  onClick={captureQuestion}
                  title="Screenshot"
                  aria-label="Screenshot"
                  className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 dark:hover:text-gray-200 dark:hover:bg-[#27272A] transition-colors"
                >
                  <Camera className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setReportOpen(true)}
                  title="Report Error"
                  aria-label="Report Error"
                  className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 dark:hover:text-gray-200 dark:hover:bg-[#27272A] transition-colors"
                >
                  <Flag className="h-4 w-4" />
                </button>
                {isPractice && (
                  <button
                    onClick={() => setHintOpen((p) => ({ ...p, [current]: !p[current] }))}
                    title="Hint"
                    aria-label="Hint"
                    className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-200 dark:hover:text-gray-200 dark:hover:bg-[#27272A] transition-colors"
                  >
                    <Lightbulb className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {/* A previewed comprehension keeps its child's real type (multi /
                numerical), so key the passage off the passage itself. */}
            {q.passage && (
              <div className="max-h-48 overflow-y-auto bg-gray-100 dark:bg-[#1E1E24] p-4 rounded-lg border border-gray-200 dark:border-gray-800 mb-4 text-gray-800 dark:text-gray-200 whitespace-pre-line text-sm">
                <UniversalRenderer content={q.passage} assets={q.assets} />
              </div>
            )}

            <p className="text-lg leading-relaxed text-gray-900 dark:text-white mb-6"><UniversalRenderer content={q.text} assets={q.assets} /></p>

            {q.type === "single" && (
              <div className="space-y-3">
                {q.options.map((opt, i) => {
                  const isSelected = selected === i;
                  return (
                    <button
                      key={i}
                      onClick={() => selectSingle(i)}
                      className={`w-full text-left bg-white dark:bg-[#16161D] border rounded-lg p-4 flex items-start gap-3 transition-colors ${
                        isSelected
                          ? "border-emerald-600 dark:border-emerald-500"
                          : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                      }`}
                    >
                      <span
                        className={`shrink-0 w-6 h-6 rounded-full border flex items-center justify-center text-xs font-medium ${
                          isSelected
                            ? "bg-emerald-600 border-emerald-600 text-white"
                            : "border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="text-sm text-gray-900 dark:text-white"><UniversalRenderer content={opt} assets={q.assets} /></span>
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === "multi" && (
              <div className="space-y-3">
                {q.options.map((opt, i) => {
                  const arr = (selected as number[] | undefined) ?? [];
                  const isSelected = arr.includes(i);
                  return (
                    <button
                      key={i}
                      onClick={() => toggleMulti(i)}
                      className={`w-full text-left bg-white dark:bg-[#16161D] border rounded-lg p-4 flex items-start gap-3 transition-colors ${
                        isSelected
                          ? "border-emerald-600 dark:border-emerald-500"
                          : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                      }`}
                    >
                      <span
                        className={`shrink-0 w-6 h-6 rounded border flex items-center justify-center text-xs font-medium ${
                          isSelected
                            ? "bg-emerald-600 border-emerald-600 text-white"
                            : "border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        {isSelected ? "✓" : String.fromCharCode(65 + i)}
                      </span>
                      <span className="text-sm text-gray-900 dark:text-white"><UniversalRenderer content={opt} assets={q.assets} /></span>
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === "comprehension" && (
              <div className="space-y-3">
                {q.options.map((opt, i) => {
                  const isSelected = selected === i;
                  return (
                    <button
                      key={i}
                      onClick={() => selectSingle(i)}
                      className={`w-full text-left bg-white dark:bg-[#16161D] border rounded-lg p-4 flex items-start gap-3 transition-colors ${
                        isSelected
                          ? "border-emerald-600 dark:border-emerald-500"
                          : "border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                      }`}
                    >
                      <span
                        className={`shrink-0 w-6 h-6 rounded-full border flex items-center justify-center text-xs font-medium ${
                          isSelected
                            ? "bg-emerald-600 border-emerald-600 text-white"
                            : "border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="text-sm text-gray-900 dark:text-white"><UniversalRenderer content={opt} assets={q.assets} /></span>
                    </button>
                  );
                })}
              </div>
            )}

            {q.type === "integer" && (
              <div className="mt-2">
                <input
                  readOnly
                  value={(selected as string | undefined) ?? ""}
                  placeholder="Your answer"
                  className="text-2xl text-center h-16 w-full max-w-md mx-auto block bg-white dark:bg-[#16161D] border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white outline-none"
                />
                <div className="grid grid-cols-3 gap-2 w-full max-w-xs mx-auto mt-4">
                  {["1","2","3","4","5","6","7","8","9",".","0"].map((k) => (
                    <KeyBtn key={k} label={k} onClick={() => pressKey(k)} />
                  ))}
                  <KeyBtn label={<Delete className="h-5 w-5" />} onClick={() => pressKey("back")} />
                </div>
                <div className="w-full max-w-xs mx-auto mt-2">
                  <button
                    onClick={() => pressKey("clear")}
                    className="w-full bg-gray-100 dark:bg-[#27272A] hover:bg-gray-200 dark:hover:bg-[#323238] text-gray-900 dark:text-white py-3 rounded-md font-medium text-sm transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </div>
            )}
            </div>

            {isPractice && hintOpen[current] && (
              <div className="mt-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/40 rounded-lg p-4 text-sm text-amber-900 dark:text-amber-200 flex gap-3">
                <Lightbulb className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold mb-1">Hint</div>
                  <p className="leading-relaxed">Recall the core definition relevant to question {current + 1}, then narrow down the options by eliminating the ones that violate the primary constraint.</p>
                </div>
              </div>
            )}


            {isPractice && solutionOpen[current] && (() => {
              /* The answer used to be invented from the question's position on
                 screen. It now comes from the key extracted out of the paper —
                 which is the entire point of the import pipeline. */
              const key = q.correct ?? [];
              const hasKey = isScored && (key.length > 0 || !!q.numericalAnswer);
              const answerLabel =
                q.type === "integer"
                  ? q.numericalAnswer
                  : [...key].sort((a, b) => a - b).map((i) => String.fromCharCode(65 + i)).join(", ");

              return (
                <div className="bg-gray-50 dark:bg-[#16161D] border border-emerald-500/50 rounded-lg p-5 mt-4">
                  <div className="text-emerald-700 dark:text-emerald-400 font-bold text-sm mb-2 flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                    Solution
                  </div>
                  {hasKey ? (
                    <div className="mb-1">
                      <span className="inline-block bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300 px-3 py-1 rounded text-sm font-semibold">
                        Correct Answer: {answerLabel}
                      </span>
                    </div>
                  ) : (
                    <p className="text-gray-700 dark:text-gray-300 text-sm">
                      This paper carries no answer key.
                    </p>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Action Bar */}
          <div className="bg-white dark:bg-[#16161D] border-t border-gray-200 dark:border-gray-800 p-3 flex flex-wrap gap-2 justify-between shrink-0">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={markAndNext}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-md"
              >
                Mark for Review &amp; Next
              </button>
              <button
                onClick={clearResponse}
                className="bg-gray-200 dark:bg-[#27272A] text-gray-800 dark:text-white text-sm font-medium px-4 py-2 rounded-md hover:opacity-90"
              >
                Clear Response
              </button>
              {isPractice && (
                <button
                  onClick={() => setSolutionOpen((prev) => ({ ...prev, [current]: !prev[current] }))}
                  className="bg-gray-800 text-white dark:bg-white dark:text-black font-medium text-sm px-4 py-2 rounded-md hover:opacity-90"
                >
                  {solutionOpen[current] ? "Hide Solution" : "Show Solution"}
                </button>
              )}
            </div>
            <button
              onClick={saveAndNext}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium px-4 py-2 rounded-md"
            >
              Save &amp; Next
            </button>
          </div>
        </div>

        {/* Palette - Desktop */}
        {!paletteCollapsed && (
          <aside className="hidden lg:flex bg-white dark:bg-[#16161D] h-full p-4 flex-col overflow-y-auto">
            {Palette}
          </aside>
        )}
      </div>

      {/* Floating expand button when collapsed */}
      {paletteCollapsed && (
        <button
          onClick={() => setPaletteCollapsed(false)}
          className="hidden lg:flex fixed right-0 top-1/2 -translate-y-1/2 z-30 h-16 w-8 items-center justify-center rounded-l-md bg-white dark:bg-[#16161D] border border-r-0 border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-[#27272A] dark:hover:text-white transition-colors"
          title="Expand palette"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      {/* Mobile palette trigger */}
      <button
        onClick={() => setPaletteOpen(true)}
        className="lg:hidden fixed bottom-0 inset-x-0 bg-gray-900 text-white dark:bg-gray-200 dark:text-black font-medium py-3 text-sm z-30"
      >
        View Question Palette
      </button>

      {/* Mobile bottom sheet */}
      {paletteOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex items-end">
          <div className="absolute inset-0 bg-black/60" onClick={() => setPaletteOpen(false)} />
          <div className="relative w-full bg-white dark:bg-[#16161D] border-t border-gray-200 dark:border-gray-800 rounded-t-2xl p-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-2">
              <div className="text-sm font-semibold">Question Palette</div>
              <button onClick={() => setPaletteOpen(false)} className="p-1 text-gray-500 hover:text-gray-900 dark:hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            {Palette}
          </div>
        </div>
      )}

      <Link to="#" className="hidden" />

      {/* Calculator Modal */}
      {calcOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setCalcOpen(false)} />
          <div className="relative bg-white dark:bg-[#16161D] border border-gray-200 dark:border-gray-800 rounded-lg">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800">
              <div className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <CalculatorIcon className="h-4 w-4" /> Scientific Calculator
              </div>
              <button
                onClick={() => setCalcOpen(false)}
                className="p-1 text-gray-500 hover:text-gray-900 dark:hover:text-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <iframe
              src="https://www.tcsion.com/OnlineAssessment/ScientificCalculator/Calculator.html"
              width={400}
              height={500}
              title="Calculator"
              className="block bg-white"
            />
          </div>
        </div>
      )}

      {/* Notes Drawer */}
      {notesOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setNotesOpen(false)} />
          <div className="relative ml-auto h-full w-full max-w-sm bg-white dark:bg-[#16161D] border-l border-gray-200 dark:border-gray-800 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <div className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <FileText className="h-4 w-4" /> Notes
              </div>
              <button
                onClick={() => setNotesOpen(false)}
                className="p-1 text-gray-500 hover:text-gray-900 dark:hover:text-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Rough work / notes for this session..."
              className="flex-1 w-full resize-none bg-transparent p-4 text-sm text-gray-900 dark:text-white outline-none"
            />
            <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-800">
              Notes persist during this session.
            </div>
          </div>
        </div>
      )}

      {/* Report Error Modal */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setReportOpen(false)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-[#16161D] border border-gray-200 dark:border-gray-800 rounded-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <div className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Flag className="h-4 w-4" /> Report Error
              </div>
              <button
                onClick={() => setReportOpen(false)}
                className="p-1 text-gray-500 hover:text-gray-900 dark:hover:text-white"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <label className="text-xs text-gray-500 dark:text-gray-400">Issue type</label>
              <select
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                className="w-full bg-white dark:bg-[#0B0B0F] border border-gray-200 dark:border-gray-800 rounded-md text-sm px-3 py-2 text-gray-900 dark:text-white outline-none"
              >
                <option>Typo</option>
                <option>Wrong Answer</option>
                <option>Missing Image</option>
                <option>Unclear Question</option>
                <option>Other</option>
              </select>
              <button
                onClick={submitReport}
                className="w-full bg-gray-900 text-white dark:bg-white dark:text-black text-sm font-medium py-2 rounded-md hover:opacity-90"
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
