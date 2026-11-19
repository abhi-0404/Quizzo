import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Calculator as CalculatorIcon, Camera, ChevronDown, ChevronLeft, ChevronRight, Eraser,
  Flag, Keyboard, LayoutGrid, MessageSquareWarning, Moon, MoreHorizontal, NotebookPen, RotateCcw, Send, Sun, WifiOff, X,
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme-transition";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { loadPreviewPaper } from "@/data/preview-paper";
import { loadPaper, saveAttempt, examTypeLabel, type LoadedQuestion } from "@/lib/pyq-read";
import { reportQuestion, REPORT_REASON_LABEL, type ReportReason } from "@/lib/admin-stats";
import { elapsedSeconds, addQuestionTime, toSeconds, type QuestionTimes } from "@/lib/exam-timing";
import { savePendingAttempt } from "@/lib/pending-attempt";
import {
  afterMark, afterSave, afterVisit, answeredTotal, counts, findNext, hasAnswer, initialStatuses,
  isMarked, pressNumericKey, toggleMark, type Answer, type QStatus,
} from "@/lib/exam-session";
import {
  clearSession, emptyNotes, isResumable, loadNotes, loadSession, notedQuestions, saveNotes, saveSession,
  type ExamNotes, type SavedSession,
} from "@/lib/exam-persist";
import { useAuth } from "@/contexts/AuthContext";
import { UniversalRenderer } from "@/components/UniversalRenderer";
import { QuizzoLoader } from "@/components/QuizzoLoader";
import { StackedLogo } from "@/components/StackedLogo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ExamTimer, formatClock } from "@/components/exam/ExamTimer";
import { PaletteGrid, PaletteLegend, StatusSwatch, STATUS_LABEL } from "@/components/exam/QuestionPalette";
import { NotesPanel, plainSnippet } from "@/components/exam/NotesPanel";
import { OptionList } from "@/components/exam/OptionList";
import { NumericPad } from "@/components/exam/NumericPad";
import { Calculator } from "@/components/exam/Calculator";
import { SolutionPanel, useRevealedAnswer, verdictsFor } from "@/components/exam/SolutionPanel";
import { SubmitDialog } from "@/components/exam/SubmitDialog";
import type { QuestionAsset } from "@/data/questions";

type QType = "single" | "multi" | "comprehension" | "integer";

interface Question {
  id: number;
  type: QType;
  text: string;
  options: string[];
  passage?: string;
  marks: number;
  assets?: QuestionAsset[];
  questionId?: string;
}

const TYPE_LABEL: Record<string, string> = {
  single: "Single correct",
  multi: "Multiple correct",
  integer: "Numerical",
  comprehension: "Comprehension",
};

const SHORTCUTS: [string, string][] = [
  ["A-D / 1-4", "Choose an option"],
  ["N", "Save & next"],
  ["P", "Previous question"],
  ["M", "Mark for review"],
  ["X / Delete", "Clear response"],
  ["T", "Notes for this question"],
];

function ThemeButton() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
      title="Toggle theme"
      className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </Button>
  );
}

function IconButton({ label, onClick, children, className }: { label: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <Button variant="ghost" size="icon" onClick={onClick} aria-label={label} title={label} className={cn("h-9 w-9 text-muted-foreground hover:text-foreground", className)}>
      {children}
    </Button>
  );
}

function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

export default function Exam() {
  const { slug = "degree", courseSlug = "exam" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const subject = useMemo(
    () => (courseSlug ? courseSlug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Exam"),
    [courseSlug]
  );
  const sessionMode: "exam" | "practice" = searchParams.get("mode") === "practice" ? "practice" : "exam";
  const isPractice = sessionMode === "practice";

  /* ── Which paper ───────────────────────────────────────────────────────── */
  const isPreview = searchParams.get("preview") === "1";
  const previewPaper = useMemo(() => (isPreview ? loadPreviewPaper() : null), [isPreview]);
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
    return [];
  }, [loaded, previewPaper]);

  const courseTitle = loaded?.paper.courseName ?? previewPaper?.subject ?? subject;
  const examLabel = loaded ? `${examTypeLabel(loaded.paper.examType)} · ${loaded.paper.term} ${loaded.paper.year}` : "";
  const total = questions.length;
  const durationMinutes = loaded?.paper.durationMinutes ?? previewPaper?.durationMinutes ?? 60;
  const totalSeconds = durationMinutes * 60;
  const totalMarks = loaded?.paper.totalMarks ?? questions.reduce((n, q) => n + (q.marks || 0), 0);
  const isScored = !!loaded;
  /** Key for persisted progress; the admin preview is never persisted. */
  const persistKey = loaded?.paper.id ?? null;

  /* ── Session state ─────────────────────────────────────────────────────── */
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const started = startedAt !== null;
  const [agreed, setAgreed] = useState(false);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [statuses, setStatuses] = useState<QStatus[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [finished, setFinished] = useState(false);
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [notes, setNotes] = useState<ExamNotes>(emptyNotes);
  /** Right panel on large screens: the question palette or the notes. */
  const [railView, setRailView] = useState<"palette" | "notes">("palette");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>("typo");
  const [reportNote, setReportNote] = useState("");
  const [reporting, setReporting] = useState(false);
  const [passageOpen, setPassageOpen] = useState(true);

  const questionMsRef = useRef<QuestionTimes>({});
  const enteredAtRef = useRef<number | null>(null);
  const currentRef = useRef(0);
  const questionRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const online = useOnline();

  // Statuses follow the paper once it arrives (unless a resume already set them).
  useEffect(() => {
    setStatuses((prev) => (prev.length === total ? prev : initialStatuses(total)));
  }, [total]);

  // Notes stay with the paper across sessions.
  useEffect(() => {
    if (persistKey) setNotes(loadNotes(persistKey));
  }, [persistKey]);
  useEffect(() => {
    if (!persistKey) return;
    const id = window.setTimeout(() => saveNotes(persistKey, notes), 400);
    return () => window.clearTimeout(id);
  }, [notes, persistKey]);

  /* ── Resume after a refresh ────────────────────────────────────────────── */
  const saved = useMemo<SavedSession | null>(() => {
    if (!persistKey || !total) return null;
    const s = loadSession(persistKey, sessionMode, total);
    return s && isResumable(s, isPractice, totalSeconds, Date.now()) ? s : null;
  }, [persistKey, sessionMode, total, isPractice, totalSeconds]);

  const begin = (resume: SavedSession | null) => {
    const now = Date.now();
    if (resume) {
      setAnswers(resume.answers);
      setStatuses(resume.statuses);
      setCurrent(resume.current);
      currentRef.current = resume.current;
      questionMsRef.current = resume.questionMs;
      setStartedAt(resume.startedAt);
    } else {
      if (persistKey) clearSession(persistKey, sessionMode);
      setAnswers({});
      setStatuses(initialStatuses(total));
      setCurrent(0);
      currentRef.current = 0;
      questionMsRef.current = {};
      setStartedAt(now);
    }
    enteredAtRef.current = now;
  };

  // Save progress (answers only, never paper content) while sitting.
  useEffect(() => {
    if (!started || !persistKey || finished) return;
    const id = window.setTimeout(() => {
      saveSession(persistKey, sessionMode, {
        v: 1,
        startedAt: startedAt!,
        answers,
        statuses,
        questionMs: questionMsRef.current,
        current,
      });
    }, 400);
    return () => window.clearTimeout(id);
  }, [answers, statuses, current, started, startedAt, persistKey, sessionMode, finished]);

  // Ask before closing the tab mid-session.
  useEffect(() => {
    if (!started || finished) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [started, finished]);

  /* ── Navigation and answers ────────────────────────────────────────────── */
  const bankQuestionTime = useCallback(() => {
    if (enteredAtRef.current == null) return;
    const now = Date.now();
    questionMsRef.current = addQuestionTime(questionMsRef.current, currentRef.current, now - enteredAtRef.current);
    enteredAtRef.current = now;
  }, []);

  const goTo = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= total) return;
      bankQuestionTime();
      currentRef.current = idx;
      setCurrent(idx);
      setStatuses((prev) => {
        if (prev[idx] === afterVisit(prev[idx])) return prev;
        const next = [...prev];
        next[idx] = afterVisit(prev[idx]);
        return next;
      });
      setPaletteOpen(false);
      scrollRef.current?.scrollTo({ top: 0 });
    },
    [total, bankQuestionTime]
  );

  const q = questions[current];
  const selected = answers[current];

  const setStatus = (i: number, s: QStatus) =>
    setStatuses((prev) => {
      if (prev[i] === s) return prev;
      const next = [...prev];
      next[i] = s;
      return next;
    });

  const chooseOption = (optIdx: number) => {
    if (!q) return;
    setAnswers((prev) => {
      if (q.type === "multi") {
        const cur = (prev[current] as number[] | undefined) ?? [];
        return { ...prev, [current]: cur.includes(optIdx) ? cur.filter((i) => i !== optIdx) : [...cur, optIdx] };
      }
      return { ...prev, [current]: optIdx };
    });
  };

  const pressKey = (k: string) =>
    setAnswers((prev) => ({ ...prev, [current]: pressNumericKey(((prev[current] as string | undefined) ?? ""), k) }));

  // Answering a marked question keeps the mark but shows it is answered, and
  // vice versa, so the palette always tells the truth.
  useEffect(() => {
    if (!started || statuses.length !== total || total === 0) return;
    const s = statuses[current];
    if (s === "marked" || s === "answeredMarked") setStatus(current, afterMark(selected));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const saveAndNext = () => {
    setStatus(current, isMarked(statuses[current]) ? afterMark(selected) : afterSave(selected));
    if (current < total - 1) goTo(current + 1);
    else if (!hasAnswer(selected)) toast.info("This was the last question.");
  };
  const markAndNext = () => {
    setStatus(current, afterMark(selected));
    if (current < total - 1) goTo(current + 1);
  };
  const toggleFlag = () => setStatus(current, toggleMark(statuses[current], selected));
  const clearResponse = () => {
    if (!q) return;
    setAnswers((prev) => ({ ...prev, [current]: q.type === "integer" ? "" : q.type === "multi" ? [] : null }));
    setStatus(current, isMarked(statuses[current]) ? "marked" : "notAnswered");
    setChecked((c) => ({ ...c, [current]: false }));
  };

  /* ── Practice: check answer ────────────────────────────────────────────── */
  const isChecked = isPractice && !!checked[current];
  const { data: currentKey } = useRevealedAnswer(
    isScored ? (q as LoadedQuestion | undefined)?.questionId : undefined,
    isChecked && !!user
  );
  const verdicts = isChecked && q ? verdictsFor(q.type, q.options.length, currentKey, selected) : undefined;
  const checkAnswer = () => {
    if (!user) {
      toast.info("Sign in to check answers");
      return;
    }
    setChecked((c) => ({ ...c, [current]: !c[current] }));
    if (hasAnswer(selected)) setStatus(current, isMarked(statuses[current]) ? afterMark(selected) : afterSave(selected));
  };

  /* ── Submit ────────────────────────────────────────────────────────────── */
  const finishSession = async () => {
    setSubmitOpen(false);
    if (!isScored || !loaded) {
      setFinished(true);
      navigate(`/${slug}/${courseSlug}/report?mode=${sessionMode}`);
      return;
    }
    bankQuestionTime();
    const sessionSeconds = startedAt == null ? 0 : elapsedSeconds(startedAt, Date.now());
    const durationSeconds = isPractice ? sessionSeconds : Math.min(sessionSeconds, totalSeconds);
    const responses = loaded.questions.map((lq: LoadedQuestion, i: number) => ({
      questionId: lq.questionId,
      response: answers[i] ?? null,
      timeSeconds: toSeconds(questionMsRef.current[i] ?? 0),
    }));
    const pending = { paperId: loaded.paper.id, mode: sessionMode, durationSeconds, answers: responses, slug, courseSlug };

    if (!user) {
      savePendingAttempt(pending);
      clearSession(loaded.paper.id, sessionMode);
      setFinished(true);
      toast.info("Sign in or create an account to see your score");
      navigate("/auth");
      return;
    }

    setSubmitting(true);
    try {
      const attemptId = await saveAttempt(pending);
      clearSession(loaded.paper.id, sessionMode);
      setFinished(true);
      navigate(`/${slug}/${courseSlug}/report?attempt=${attemptId}&mode=${sessionMode}`);
    } catch (e) {
      savePendingAttempt(pending);
      toast.error(
        (e instanceof Error ? e.message : "Could not save your attempt") +
          ". Your answers are kept on this device. Check your connection and submit again."
      );
    } finally {
      setSubmitting(false);
    }
  };
  const finishRef = useRef(finishSession);
  finishRef.current = finishSession;
  const onExpire = useCallback(() => {
    toast.info("Time is up. Submitting your answers.");
    void finishRef.current();
  }, []);

  /* ── Report a question ─────────────────────────────────────────────────── */
  const canReport = isScored && !!loaded;
  const submitReport = async () => {
    if (!canReport || !loaded) return;
    if (!user) {
      toast.info("Sign in to report a problem with a question");
      return;
    }
    setReporting(true);
    try {
      const outcome = await reportQuestion((loaded.questions[current] as LoadedQuestion).questionId, reportReason, reportNote);
      toast.success(outcome === "filed" ? "Thanks, the report was sent to the team" : "You already reported this");
      setReportOpen(false);
      setReportNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send the report");
    } finally {
      setReporting(false);
    }
  };

  const captureQuestion = async () => {
    if (!questionRef.current) return;
    try {
      const { default: html2canvas } = await import("html2canvas");
      const root = document.documentElement;
      const canvas = await html2canvas(questionRef.current, {
        // Always a clean light capture on solid white, whatever the theme on
        // screen: it is what reads best pasted into chats and notes, and the
        // dark look depends on blend effects the capture cannot draw. A solid
        // background also matters because figures are transparent; on a
        // transparent canvas their invisible pixels show up as noise.
        backgroundColor: "#ffffff",
        scale: Math.min(2, window.devicePixelRatio || 1) * 1.5,
        useCORS: true,
        onclone: (doc) => {
          // The capture renders a copy of the page in a hidden frame: force
          // that copy to the light theme.
          const html = doc.documentElement;
          html.className = root.className.replace(/\bdark\b/g, "").trim() + " light";
          html.style.cssText = root.style.cssText;
          html.style.colorScheme = "light";
          doc.body.style.background = "#ffffff";
          doc.querySelectorAll("img").forEach((img) => {
            // Lazy images never load in that hidden frame: load them now.
            img.loading = "eager";
            // No filters or blend modes in the capture: a transparent figure
            // drawn on white already looks like ink on paper.
            img.style.filter = "none";
            img.style.mixBlendMode = "normal";
          });
        },
      });
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          toast.success("Question copied to clipboard");
        } catch {
          toast.error("Clipboard not available");
        }
      });
    } catch {
      toast.error("Screenshot failed");
    }
  };

  /** Notes live in the right panel on large screens, in a side sheet of the same width elsewhere. */
  const openNotes = () => {
    if (window.matchMedia("(min-width: 1024px)").matches) {
      setPaletteCollapsed(false);
      setRailView((v) => (v === "notes" && !paletteCollapsed ? "palette" : "notes"));
    } else {
      setNotesOpen(true);
    }
  };

  /* ── Keyboard shortcuts ────────────────────────────────────────────────── */
  // The calculator floats and never blocks the question, so shortcuts keep working with it open.
  const anyDialog = submitOpen || notesOpen || reportOpen || helpOpen || paletteOpen;
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keyHandler.current = (e: KeyboardEvent) => {
    if (!started || finished || anyDialog || !q) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
    const k = e.key.toLowerCase();
    if (q.type === "integer") {
      if (/^[0-9.]$/.test(e.key) || e.key === "-") { e.preventDefault(); pressKey(e.key); return; }
      if (e.key === "Backspace") { e.preventDefault(); pressKey("back"); return; }
    } else {
      const visible = q.options.map((o, i) => (o?.trim() ? i : -1)).filter((i) => i >= 0);
      const pos = "abcdefgh".indexOf(k) >= 0 ? "abcdefgh".indexOf(k) : /^[1-8]$/.test(k) ? Number(k) - 1 : -1;
      if (pos >= 0 && pos < visible.length) { e.preventDefault(); chooseOption(visible[pos]); return; }
    }
    if (k === "n" || e.key === "ArrowRight") { e.preventDefault(); saveAndNext(); }
    else if (k === "p" || e.key === "ArrowLeft") { e.preventDefault(); goTo(current - 1); }
    else if (k === "m") { e.preventDefault(); toggleFlag(); }
    else if (k === "x" || e.key === "Delete") { e.preventDefault(); clearResponse(); }
    else if (k === "t") { e.preventDefault(); openNotes(); }
    else if (k === "?") { e.preventDefault(); setHelpOpen(true); }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const statusCounts = useMemo(() => counts(statuses), [statuses]);
  const noted = useMemo(() => notedQuestions(notes), [notes]);
  const questionText = useCallback((i: number) => questions[i]?.text ?? "", [questions]);

  /* ── Loading / empty ───────────────────────────────────────────────────── */
  if (paperLoading) return <QuizzoLoader fullscreen label="Loading paper" />;

  if (!loaded && !previewPaper) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-background px-6 text-center text-muted-foreground">
        <StackedLogo size={28} />
        <p className="text-[15px] text-foreground">{paperId ? "That paper is not available." : "Choose a paper from the course page to begin."}</p>
        <Link to={`/${slug}/${courseSlug}`} className="text-[13px] underline underline-offset-4 hover:text-foreground">
          Back to the course
        </Link>
      </div>
    );
  }

  /* ── Instructions ──────────────────────────────────────────────────────── */
  if (!started) {
    const savedAnswered = saved ? answeredTotal(counts(saved.statuses)) : 0;
    const savedLeft = saved && !isPractice ? Math.max(0, Math.round((saved.startedAt + totalSeconds * 1000 - Date.now()) / 1000)) : 0;
    return (
      <div className="min-h-[100dvh] bg-background text-foreground">
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-4xl items-center gap-3 px-4">
            <Link to={`/${slug}/${courseSlug}`} className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-4 w-4" /> Back
            </Link>
            <span className="h-4 w-px bg-border" />
            <StackedLogo size={14} />
            <span className="min-w-0 truncate text-[13px] font-semibold">{courseTitle}</span>
            <div className="ml-auto"><ThemeButton /></div>
          </div>
        </header>

        <main className="mx-auto max-w-4xl px-4 pb-36 pt-6 sm:pt-10">
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {isPractice ? "Practice mode" : "Exam mode"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{courseTitle}</h1>
          {examLabel && <p className="mt-1 text-[14px] text-muted-foreground">{examLabel}</p>}
          {isPreview && (
            <span className="mt-3 inline-flex rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5 text-[12px] font-medium text-foreground">
              Admin preview: nothing is recorded
            </span>
          )}

          <dl className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border">
            {[
              ["Questions", String(total)],
              [isPractice ? "Time" : "Duration", isPractice ? "Untimed" : `${durationMinutes} min`],
              ["Marks", String(totalMarks)],
            ].map(([k, v]) => (
              <div key={k} className="bg-card px-3 py-3 sm:px-4">
                <dt className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{k}</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums sm:text-xl">{v}</dd>
              </div>
            ))}
          </dl>

          {saved && (
            <div className="mt-5 flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/[0.06] p-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold">You have an unfinished session</p>
                <p className="text-[13px] text-muted-foreground">
                  {savedAnswered} of {total} answered{!isPractice && ` · ${formatClock(savedLeft)} left on the clock`}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => begin(null)} className="gap-1.5"><RotateCcw className="h-4 w-4" /> Start over</Button>
                <Button onClick={() => begin(saved)}>Resume</Button>
              </div>
            </div>
          )}

          <section className="mt-6 grid gap-4 lg:grid-cols-[1fr_300px]">
            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-[15px] font-semibold">Before you start</h2>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-[14px] leading-relaxed text-muted-foreground marker:text-foreground">
                <li>
                  {isPractice
                    ? "There is no time limit. A stopwatch shows how long you have spent."
                    : `The timer runs for ${durationMinutes} minutes from when you begin and cannot be paused. The paper submits itself at 0:00.`}
                </li>
                <li><span className="text-foreground">Save &amp; Next</span> records your answer and moves on. Clicking a number in the palette jumps without saving the status.</li>
                <li><span className="text-foreground">Mark for review</span> flags a question to come back to. An answered and marked question is still scored.</li>
                <li><span className="text-foreground">Clear response</span> removes your answer to the current question.</li>
                {isPractice && <li><span className="text-foreground">Check answer</span> shows the key and any worked solution for the question you are on.</li>}
                <li>Your progress is saved on this device, so an accidental refresh will not lose it.</li>
              </ol>
            </div>
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-card p-5">
                <h2 className="text-[15px] font-semibold">Palette legend</h2>
                <ul className="mt-3 space-y-2.5">
                  {(["answered", "notAnswered", "marked", "answeredMarked", "notVisited"] as QStatus[]).map((s, i) => (
                    <li key={s} className="flex items-center gap-3 text-[13px]">
                      <StatusSwatch status={s} className="h-7 w-7">{i + 1}</StatusSwatch>
                      <span className="text-muted-foreground">{STATUS_LABEL[s]}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="hidden rounded-lg border border-border bg-card p-5 sm:block">
                <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Keyboard className="h-4 w-4" /> Shortcuts</h2>
                <ul className="mt-3 space-y-1.5 text-[13px]">
                  {SHORTCUTS.map(([k, v]) => (
                    <li key={k} className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">{v}</span>
                      <kbd className="rounded border border-b-2 border-border bg-muted px-1.5 font-mono text-[11px]">{k}</kbd>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        </main>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex cursor-pointer select-none items-center gap-2.5 text-[14px]">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
              />
              I have read the instructions
            </label>
            <Button disabled={!agreed || total === 0} onClick={() => begin(null)} className="h-11 px-6 text-[14px] sm:h-10">
              {isPractice ? "Begin practice" : "Begin exam"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Sitting ───────────────────────────────────────────────────────────── */
  if (!q) return <QuizzoLoader fullscreen />;
  const answered = answeredTotal(statusCounts);
  const flagged = isMarked(statuses[current] ?? "notVisited");
  const multi = q.type === "multi";

  const questionBody = (
    <div className="min-w-0">
      <div className="text-[16px] leading-[1.7] text-foreground sm:text-[17px] 2xl:text-[18px] min-[2200px]:text-[20px] [overflow-wrap:anywhere]">
        <UniversalRenderer content={q.text} assets={q.assets} />
      </div>
      <div className="mt-5">
        {q.type === "integer" ? (
          <NumericPad value={(selected as string | undefined) ?? ""} onKey={pressKey} />
        ) : (
          <>
            {multi && <p className="mb-2 text-[12px] font-medium text-muted-foreground">Select all that apply</p>}
            <OptionList
              options={q.options}
              assets={q.assets}
              multi={multi}
              selected={selected as number | number[] | null | undefined}
              onSelect={chooseOption}
              verdicts={verdicts}
            />
          </>
        )}
      </div>
      {isChecked && (
        <SolutionPanel
          questionId={isScored ? (q as LoadedQuestion).questionId : undefined}
          paperId={isScored ? loaded?.paper.id : undefined}
          kind={q.type}
          options={q.options}
          picked={selected}
          signedIn={!!user}
        />
      )}
    </div>
  );

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground min-[2200px]:text-[17px]">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-card">
        <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4">
          <StackedLogo size={16} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold leading-tight sm:text-[14px]">{courseTitle}</p>
            <p className="truncate text-[11px] leading-tight text-muted-foreground sm:text-[12px]">
              {examLabel ? `${examLabel} · ` : ""}{isPractice ? "Practice" : "Exam"}
            </p>
          </div>
          {!online && (
            <span className="hidden items-center gap-1 rounded-md border border-warning/50 px-2 py-1 text-[11px] text-warning sm:inline-flex" title="Answers are saved on this device">
              <WifiOff className="h-3.5 w-3.5" /> Offline
            </span>
          )}
          <ExamTimer startedAt={startedAt!} totalSeconds={totalSeconds} practice={isPractice} onExpire={onExpire} />
          <div className="hidden items-center md:flex">
            <IconButton label="Calculator" onClick={() => setCalcOpen(true)}><CalculatorIcon className="h-4 w-4" /></IconButton>
            <IconButton
              label="Notes for this question"
              onClick={openNotes}
              className={cn(railView === "notes" && !paletteCollapsed && "lg:bg-muted lg:text-foreground")}
            >
              <NotebookPen className="h-4 w-4" />
            </IconButton>
            <IconButton label="Keyboard shortcuts" onClick={() => setHelpOpen(true)}><Keyboard className="h-4 w-4" /></IconButton>
            <ThemeButton />
          </div>
          <Button
            onClick={() => setSubmitOpen(true)}
            disabled={submitting}
            className={cn("hidden h-9 bg-submit px-4 font-semibold text-submit-foreground shadow-sm hover:bg-submit/90 sm:inline-flex", !paletteCollapsed && "lg:hidden")}
          >
            <Send className="h-4 w-4" /> {isPractice ? "End practice" : "Submit"}
          </Button>
        </div>
        <div className="h-[3px] bg-muted" aria-hidden>
          <div className="h-full bg-success transition-[width] duration-300" style={{ width: `${total ? (100 * answered) / total : 0}%` }} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Question column */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="ghost-scroll flex-1 overflow-y-auto">
            <div
              ref={questionRef}
              className={cn(
                "mx-auto w-full px-4 pb-8 pt-5 sm:px-6 sm:pt-7",
                q.passage ? "max-w-6xl 2xl:max-w-[1500px]" : "max-w-3xl 2xl:max-w-4xl"
              )}
            >
              {/* Question meta */}
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold">
                  Question {current + 1} <span className="font-normal text-muted-foreground">of {total}</span>
                </h2>
                <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {TYPE_LABEL[q.type]}
                </span>
                <span className="rounded-full border border-success/40 px-2 py-0.5 text-[11px] font-medium text-success">
                  +{q.marks} {q.marks === 1 ? "mark" : "marks"}
                </span>
                <div className="ml-auto flex shrink-0 items-center gap-1" data-html2canvas-ignore="true">
                  <button
                    type="button"
                    onClick={toggleFlag}
                    aria-pressed={flagged}
                    className={cn(
                      "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-medium transition-colors",
                      flagged ? "border-review bg-review/15 text-review" : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Flag className={cn("h-3.5 w-3.5", flagged && "fill-current")} />
                    <span className="sm:hidden">{flagged ? "Marked" : "Mark"}</span>
                    <span className="hidden sm:inline">{flagged ? "Marked" : "Mark for review"}</span>
                  </button>
                  <div className="hidden items-center gap-1 sm:flex">
                    <IconButton label="Copy question as image" onClick={captureQuestion} className="h-8 w-8"><Camera className="h-4 w-4" /></IconButton>
                    <IconButton label="Report a problem" onClick={() => setReportOpen(true)} className="h-8 w-8"><MessageSquareWarning className="h-4 w-4" /></IconButton>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label="More actions" className="h-8 w-8 text-muted-foreground sm:hidden">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => void captureQuestion()}><Camera className="mr-2 h-4 w-4" /> Copy as image</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setReportOpen(true)}><MessageSquareWarning className="mr-2 h-4 w-4" /> Report a problem</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {q.passage ? (
                <div className="grid gap-5 lg:grid-cols-2 lg:gap-8">
                  <section aria-label="Passage" className="min-w-0 lg:sticky lg:top-0 lg:max-h-[calc(100dvh-14rem)] lg:overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => setPassageOpen((o) => !o)}
                      className="flex w-full items-center justify-between rounded-t-lg border border-b-0 border-border bg-muted px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted-foreground lg:pointer-events-none"
                      aria-expanded={passageOpen}
                    >
                      Passage
                      <ChevronDown className={cn("h-4 w-4 transition-transform lg:hidden", !passageOpen && "-rotate-90")} />
                    </button>
                    <div className={cn("rounded-b-lg border border-border bg-card p-4 text-[15px] leading-[1.7] whitespace-pre-line", !passageOpen && "hidden lg:block")}>
                      <UniversalRenderer content={q.passage} assets={q.assets} />
                    </div>
                  </section>
                  {questionBody}
                </div>
              ) : (
                questionBody
              )}
            </div>
          </div>

          {/* Action bar */}
          <div className="shrink-0 border-t border-border bg-card px-3 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] sm:px-4">
            <div className={cn("mx-auto flex w-full items-center gap-2", q.passage ? "max-w-6xl 2xl:max-w-[1500px]" : "max-w-3xl 2xl:max-w-4xl")}>
              <Button variant="outline" onClick={() => goTo(current - 1)} disabled={current === 0} className="h-11 px-3 sm:h-10" aria-label="Previous question">
                <ChevronLeft className="h-4 w-4" /><span className="hidden md:inline">Previous</span>
              </Button>
              <Button variant="outline" onClick={clearResponse} className="h-11 gap-1.5 px-3 sm:h-10" aria-label="Clear response">
                <Eraser className="h-4 w-4" /><span className="hidden sm:inline xl:hidden">Clear</span><span className="hidden xl:inline">Clear response</span>
              </Button>
              {isPractice && (
                <Button variant="outline" onClick={checkAnswer} className="h-11 px-3 sm:h-10" aria-pressed={isChecked}>
                  {isChecked ? "Hide answer" : "Check"}
                  <span className="hidden lg:inline">{isChecked ? "" : " answer"}</span>
                </Button>
              )}
              <div className="flex-1" />
              <Button variant="outline" onClick={() => setPaletteOpen(true)} className="h-11 gap-1.5 px-3 lg:hidden" aria-label="Open question palette">
                <LayoutGrid className="h-4 w-4" />
                <span className="tabular-nums text-[12px]">{answered}/{total}</span>
              </Button>
              <Button variant="outline" onClick={markAndNext} className="hidden h-10 px-3 sm:inline-flex">
                <span className="xl:hidden">Mark &amp; next</span><span className="hidden xl:inline">Mark for review &amp; next</span>
              </Button>
              <Button onClick={saveAndNext} className="h-11 gap-1 px-4 sm:h-10">
                Save &amp; next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </main>

        {/* Right panel: one handle in the middle of its edge opens and closes it. */}
        <div className="relative hidden shrink-0 lg:flex">
          <button
            type="button"
            onClick={() => setPaletteCollapsed((c) => !c)}
            aria-label={paletteCollapsed ? "Show the question panel" : "Hide the question panel"}
            aria-expanded={!paletteCollapsed}
            title={paletteCollapsed ? "Show panel" : "Hide panel"}
            className="group absolute -left-4 top-1/2 z-20 flex h-16 w-4 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
          >
            {paletteCollapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {!paletteCollapsed && (
            <aside className="flex w-80 flex-col border-l border-border bg-card 2xl:w-[340px] min-[2200px]:w-[380px]">
              {railView === "palette" ? (
                <>
                  <div className="ghost-scroll min-h-0 flex-1 overflow-y-auto p-4">
                    <PaletteGrid statuses={statuses} current={current} noted={noted} onGo={goTo} />
                  </div>
                  <div className="shrink-0 space-y-3 border-t border-border bg-muted/40 p-3">
                    <PaletteLegend statuses={statuses} />
                    <Button
                      onClick={() => setSubmitOpen(true)}
                      disabled={submitting}
                      className="h-11 w-full gap-2 bg-submit text-[14px] font-semibold text-submit-foreground shadow-sm hover:bg-submit/90"
                    >
                      <Send className="h-4 w-4" /> {isPractice ? "End practice" : "Review & submit"}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border pl-3 pr-1.5">
                    <NotebookPen className="h-4 w-4 text-muted-foreground" />
                    <span className="mr-auto text-[13px] font-semibold">Notes</span>
                    <IconButton label="Close notes" onClick={() => setRailView("palette")} className="h-8 w-8"><X className="h-4 w-4" /></IconButton>
                  </div>
                <div className="min-h-0 flex-1 p-3">
                  <NotesPanel
                    notes={notes}
                    onChange={setNotes}
                    current={current}
                    total={total}
                    questionText={questionText}
                    title={`${courseTitle}${examLabel ? ` · ${examLabel}` : ""}`}
                    onGo={goTo}
                  />
                </div>
                </div>
              )}
            </aside>
          )}
        </div>
      </div>

      {/* Mobile palette */}
      <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-2xl p-4 pb-[env(safe-area-inset-bottom)]">
          <SheetHeader className="mb-3 text-left">
            <SheetTitle className="text-[15px]">Question palette</SheetTitle>
            <SheetDescription className="sr-only">Jump to any question and see its status</SheetDescription>
          </SheetHeader>
          <PaletteGrid statuses={statuses} current={current} noted={noted} onGo={goTo} />
          <div className="mt-4"><PaletteLegend statuses={statuses} /></div>
          <div className="sticky bottom-0 -mx-4 mt-4 grid grid-cols-2 gap-2 border-t border-border bg-card px-4 py-3 sm:hidden">
            <Button variant="outline" onClick={() => { setPaletteOpen(false); setCalcOpen(true); }} className="h-11 gap-1.5"><CalculatorIcon className="h-4 w-4" /> Calculator</Button>
            <Button variant="outline" onClick={() => { setPaletteOpen(false); setNotesOpen(true); }} className="h-11 gap-1.5"><NotebookPen className="h-4 w-4" /> Notes</Button>
            <Button variant="outline" onClick={() => { setPaletteOpen(false); markAndNext(); }} className="h-11">Mark &amp; next</Button>
            <Button
              onClick={() => { setPaletteOpen(false); setSubmitOpen(true); }}
              className="h-11 bg-submit font-semibold text-submit-foreground hover:bg-submit/90"
            >
              {isPractice ? "End practice" : "Submit"}
            </Button>
          </div>
          <div className="mt-4 hidden grid-cols-3 gap-2 sm:grid lg:hidden">
            <Button variant="outline" onClick={() => { setPaletteOpen(false); setCalcOpen(true); }} className="h-11 gap-1.5"><CalculatorIcon className="h-4 w-4" /> Calculator</Button>
            <Button variant="outline" onClick={() => { setPaletteOpen(false); setNotesOpen(true); }} className="h-11 gap-1.5"><NotebookPen className="h-4 w-4" /> Notes</Button>
            <Button
              onClick={() => { setPaletteOpen(false); setSubmitOpen(true); }}
              className="h-11 bg-submit font-semibold text-submit-foreground hover:bg-submit/90"
            >
              {isPractice ? "End practice" : "Review & submit"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Notes (below lg; on large screens they live in the right panel) */}
      <Sheet open={notesOpen} onOpenChange={setNotesOpen}>
        <SheetContent side="right" className="flex w-80 max-w-[90vw] flex-col gap-3 p-3 pt-4 sm:max-w-none">
          <SheetHeader className="pr-8 text-left">
            <SheetTitle className="flex items-center gap-2 text-[15px]"><NotebookPen className="h-4 w-4" /> Notes</SheetTitle>
            <SheetDescription className="text-[12px]">Saved on this device, per question.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1">
            <NotesPanel
              notes={notes}
              onChange={setNotes}
              current={current}
              total={total}
              questionText={questionText}
              title={`${courseTitle}${examLabel ? ` · ${examLabel}` : ""}`}
              onGo={goTo}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Calculator open={calcOpen} onOpenChange={setCalcOpen} />

      {/* Shortcuts */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[15px]"><Keyboard className="h-4 w-4" /> Keyboard shortcuts</DialogTitle>
            <DialogDescription className="text-[12px]">Work only while no text box is focused.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-[13px]">
            {[...SHORTCUTS, ["← / →", "Previous / save & next"], ["?", "This list"]].map(([k, v]) => (
              <li key={k} className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{v}</span>
                <kbd className="rounded border border-b-2 border-border bg-muted px-1.5 font-mono text-[11px]">{k}</kbd>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>

      {/* Report a problem */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[15px]"><Flag className="h-4 w-4" /> Report a problem</DialogTitle>
            <DialogDescription className="text-[12px]">Question {current + 1}. The team reviews every report.</DialogDescription>
          </DialogHeader>
          {!canReport ? (
            <p className="text-[13px] text-muted-foreground">Reports can only be sent for published papers.</p>
          ) : !user ? (
            <p className="text-[13px] text-muted-foreground">Sign in to report a problem with a question.</p>
          ) : (
            <div className="space-y-3">
              <label className="block text-[12px] font-medium text-muted-foreground" htmlFor="report-reason">What is wrong?</label>
              <select
                id="report-reason"
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value as ReportReason)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {(Object.keys(REPORT_REASON_LABEL) as ReportReason[]).map((r) => (
                  <option key={r} value={r}>{REPORT_REASON_LABEL[r]}</option>
                ))}
              </select>
              <textarea
                value={reportNote}
                onChange={(e) => setReportNote(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Details (optional)"
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button onClick={() => void submitReport()} disabled={reporting} className="h-10 w-full">
                {reporting ? "Sending…" : "Send report"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <SubmitDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        counts={statusCounts}
        practice={isPractice}
        submitting={submitting}
        onReviewUnanswered={() => {
          setSubmitOpen(false);
          const i = findNext(statuses, current, (s) => s === "notAnswered" || s === "notVisited" || s === "marked");
          if (i >= 0) goTo(i);
        }}
        onReviewMarked={() => {
          setSubmitOpen(false);
          const i = findNext(statuses, current, isMarked);
          if (i >= 0) goTo(i);
        }}
        onSubmit={() => void finishSession()}
      />

      {submitting && (
        <div className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm">
          <QuizzoLoader fullscreen label="Submitting" className="bg-transparent" />
        </div>
      )}
    </div>
  );
}
