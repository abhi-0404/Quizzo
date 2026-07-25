import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Loader2, Upload, Check, Eye, Send, Plus, X,
  ChevronDown, ChevronRight, FileText, FileCode, PanelRightClose, PanelRightOpen,
  Pencil, AlertTriangle, PlayCircle, Timer,
} from "lucide-react";
import {
  SCHEDULE_SEED, findAssessmentDate, formatDate, termKeyFromLabel,
} from "@/data/schedule";
import {
  type InputMode, type QType, type Question, type QuestionDraft,
  type SubQType, type SubQuestion,
  TYPES, SUB_TYPES, DEFAULT_MARKS, blankDraft, blankSubQuestion,
  isChoiceType, isSingleAnswer, isSubChoice, isSubSingle,
  typeLabel, countsAsQuestions, marksOf,
} from "@/data/questions";
import { parseBulkPaper, serializeBlock } from "@/lib/parse-bulk-paper";
import { MathText } from "@/components/MathText";
import { MathField } from "@/components/MathField";
import { storePreviewPaper, toExamQuestions, durationToMinutes } from "@/data/preview-paper";
import { PaperPreview } from "@/components/PaperPreview";
import { slugify } from "@/lib/utils";

/* ── Exam context taxonomy ───────────────────────────────────────────────── */
const DEGREES = [
  "BS in Data Science and Applications",
  "BS in Electronic Systems",
  "Management and Data Science",
  "Aeronautics and Space Technology",
];
const LEVELS = ["Foundation", "Diploma", "Degree"];
const SUBJECTS = [
  "Statistics 1", "Statistics 2", "Mathematics 1", "Mathematics 2",
  "Python", "Computational Thinking", "English 1", "English 2",
  "DBMS", "PDSA", "Java", "System Commands",
  "MAD 1", "MAD 2", "Business Data Management", "Business Analytics",
  "Machine Learning Foundations", "Machine Learning Techniques",
  "Deep Learning", "Big Data", "NLP",
];
const TERM_LABELS = ["Jan Term", "May Term", "Sept Term"];
const EXAMS = ["Quiz 1", "Quiz 2", "End Term"];

/** Where an unprocessed bulk-upload draft is parked between visits. */
const BULK_DRAFT_KEY = "quizzo_bulk_draft";

const CURRENT_YEAR = new Date().getFullYear();
/** 2021 → current year + 2. */
const YEARS: number[] = Array.from(
  { length: CURRENT_YEAR + 2 - 2021 + 1 },
  (_, i) => CURRENT_YEAR + 2 - i
);

/**
 * Structured taxonomy sent to the backend. The header title is a UI-only
 * derivation — the API receives these exact tags so nothing has to be parsed
 * back out of a concatenated string.
 */
export interface AcademicContext {
  degree: string;
  level: string;
  subject: string;
  year: number;
  term: string;
  exam: string;
}

/* ── Question model lives in @/data/questions so the bulk parser can build
   the exact same shapes without a circular import. ─────────────────────── */

/* ── Flat control styles (solid only — no alpha, no shadows) ─────────────── */
const selectClass =
  "h-8 w-full rounded-md border border-border bg-card px-2 text-[13px] text-foreground " +
  "focus:outline-none focus:border-gray-400 dark:focus:border-gray-600 transition-colors " +
  "[color-scheme:light] dark:[color-scheme:dark]";
const textInputClass =
  "h-8 w-full rounded-md border border-border bg-card px-2 text-[13px] text-foreground " +
  "placeholder:text-muted-foreground focus:outline-none focus:border-gray-400 " +
  "dark:focus:border-gray-600 transition-colors";
const primaryBtnClass =
  "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors " +
  "bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-black dark:hover:bg-white";
const secondaryBtnClass =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 " +
  "text-[12px] font-medium text-foreground hover:bg-secondary transition-colors";

export default function CreateContent() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [academicContext, setAcademicContext] = useState<AcademicContext>({
    degree: DEGREES[0],
    level: "Foundation",
    subject: "Statistics 1",
    year: CURRENT_YEAR,
    term: "Jan Term",
    exam: "Quiz 1",
  });
  const [contextOpen, setContextOpen] = useState(true);
  const [navigatorOpen, setNavigatorOpen] = useState(true);

  // PYQ reference PDF
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [showPdf, setShowPdf] = useState(false);

  // Paper state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [draft, setDraft] = useState<QuestionDraft>(blankDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  // Draft survives closing the modal *and* a page reload.
  const [bulkText, setBulkText] = useState(() => {
    try {
      return sessionStorage.getItem(BULK_DRAFT_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const nextId = useRef(1);
  const nextSubId = useRef(1);

  // Release the object URL when it is replaced or the page unmounts.
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  // Mirror the bulk draft so it survives a reload, not just a modal close.
  useEffect(() => {
    try {
      if (bulkText) sessionStorage.setItem(BULK_DRAFT_KEY, bulkText);
      else sessionStorage.removeItem(BULK_DRAFT_KEY);
    } catch {
      /* storage unavailable — in-memory state still persists for the session */
    }
  }, [bulkText]);

  const setContext = <K extends keyof AcademicContext>(key: K, value: AcademicContext[K]) =>
    setAcademicContext((prev) => ({ ...prev, [key]: value }));

  /** Date comes strictly from the Schedule Manager — no manual override. */
  const scheduledDate = useMemo(
    () =>
      findAssessmentDate(
        SCHEDULE_SEED,
        academicContext.year,
        termKeyFromLabel(academicContext.term),
        academicContext.exam
      ),
    [academicContext]
  );

  /** Quiz 1 / Quiz 2 → 1 Hour · End Term → 1.5 Hours */
  const duration = useMemo(() => {
    const e = academicContext.exam;
    if (e === "Quiz 1" || e === "Quiz 2") return "1 Hour";
    if (e === "End Term") return "1.5 Hours";
    return "—";
  }, [academicContext.exam]);

  /** Comprehension parents contribute their sub-questions, not themselves. */
  const totalQuestions = useMemo(
    () => questions.reduce((n, q) => n + countsAsQuestions(q), 0),
    [questions]
  );
  const totalMarks = useMemo(
    () => questions.reduce((sum, q) => sum + marksOf(q), 0),
    [questions]
  );
  const invalidCount = useMemo(() => questions.filter((q) => !q.isValid).length, [questions]);

  /** First non-empty line, used for the one-line summary on stream cards. */
  const firstLine = (s: string) => (s.trim().split("\n")[0] || "");

  /** Slot elements, so the navigator can scroll a question into view. */
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);

  // Scroll after the inline editor has expanded, so we land on its real position.
  useEffect(() => {
    if (!pendingScrollId) return;
    const el = itemRefs.current[pendingScrollId];
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    setPendingScrollId(null);
  }, [pendingScrollId]);

  /** Issues attached to the block currently open in the editor. */
  const editingIssues = editingId
    ? questions.find((q) => q.id === editingId)?.issues ?? []
    : [];

  const handlePdf = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // The effect cleanup revokes the previous URL when this value changes.
    setPdfUrl(URL.createObjectURL(file));
    setPdfName(file.name);
    setShowPdf(true);
  };

  /* ── Editor helpers ───────────────────────────────────────────────────── */
  const setDraftField = <K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  /**
   * Bidirectional sync. The structured fields are authoritative while the Form
   * View is active — this mirrors them into `latex` so the LaTeX View is never
   * stale. `latex` is not a dependency, so writing it cannot re-trigger.
   */
  useEffect(() => {
    if (draft.inputMode !== "form") return;
    const next = serializeBlock(draft);
    setDraft((prev) => (prev.latex === next ? prev : { ...prev, latex: next }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draft.inputMode, draft.type, draft.stem, draft.marks, draft.passage,
    draft.options, draft.correct, draft.numericalAnswer, draft.subQuestions,
  ]);

  /**
   * The other direction: editing raw source re-parses into the structured
   * fields, so switching back to Form View shows the edit. A block that does
   * not parse (mid-keystroke) keeps the text without destroying the fields.
   */
  const setLatexSource = (src: string) =>
    setDraft((prev) => {
      const parsed = parseBulkPaper(src).blocks[0];
      if (!parsed) return { ...prev, latex: src };
      const { isValid: _v, issues: _i, inputMode: _m, latex: _l, ...fields } = parsed;
      return { ...prev, ...fields, latex: src };
    });

  const setOption = (i: number, val: string) =>
    setDraft((prev) => ({ ...prev, options: prev.options.map((o, idx) => (idx === i ? val : o)) }));

  const toggleCorrect = (i: number) =>
    setDraft((prev) => ({
      ...prev,
      correct: isSingleAnswer(prev.type)
        ? [i]
        : prev.correct.includes(i)
        ? prev.correct.filter((x) => x !== i)
        : [...prev.correct, i],
    }));

  const changeType = (type: QType) =>
    setDraft((prev) => ({
      ...prev,
      type,
      correct: [],
      // Seed the first sub-question so a new comprehension block isn't empty.
      subQuestions:
        type === "comprehension" && prev.subQuestions.length === 0
          ? [blankSubQuestion(`sq-${nextSubId.current++}`)]
          : prev.subQuestions,
    }));

  /* ── Sub-question helpers (comprehension children) ────────────────────── */
  const addSubQuestion = () =>
    setDraft((prev) => ({
      ...prev,
      subQuestions: [...prev.subQuestions, blankSubQuestion(`sq-${nextSubId.current++}`)],
    }));

  const removeSubQuestion = (id: string) =>
    setDraft((prev) => ({ ...prev, subQuestions: prev.subQuestions.filter((s) => s.id !== id) }));

  const updateSubQuestion = (id: string, patch: Partial<SubQuestion>) =>
    setDraft((prev) => ({
      ...prev,
      subQuestions: prev.subQuestions.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));

  const setSubOption = (id: string, i: number, val: string) =>
    setDraft((prev) => ({
      ...prev,
      subQuestions: prev.subQuestions.map((s) =>
        s.id === id ? { ...s, options: s.options.map((o, idx) => (idx === i ? val : o)) } : s
      ),
    }));

  const toggleSubCorrect = (id: string, i: number) =>
    setDraft((prev) => ({
      ...prev,
      subQuestions: prev.subQuestions.map((s) => {
        if (s.id !== id) return s;
        return {
          ...s,
          correct: isSubSingle(s.type)
            ? [i]
            : s.correct.includes(i)
            ? s.correct.filter((x) => x !== i)
            : [...s.correct, i],
        };
      }),
    }));

  const changeSubType = (id: string, type: SubQType) =>
    setDraft((prev) => ({
      ...prev,
      subQuestions: prev.subQuestions.map((s) => (s.id === id ? { ...s, type, correct: [] } : s)),
    }));

  const resetEditor = () => {
    setDraft(blankDraft());
    setEditingId(null);
  };

  const loadQuestion = (q: Question, scrollTo = false) => {
    const { id, ...rest } = q;
    setDraft({
      ...rest,
      options: [...rest.options],
      correct: [...rest.correct],
      subQuestions: rest.subQuestions.map((s) => ({ ...s, options: [...s.options], correct: [...s.correct] })),
    });
    setEditingId(id);
    if (scrollTo) setPendingScrollId(id);
  };

  const validateDraft = (): string | null => {
    if (draft.inputMode === "latex") {
      if (draft.marks <= 0) return "Marks must be greater than zero.";
      return draft.latex.trim() ? null : "Add the LaTeX source for this question.";
    }

    // Comprehension is a container: passage + at least one sub-question.
    if (draft.type === "comprehension") {
      if (!draft.passage.trim()) return "Add the comprehension passage.";
      if (draft.subQuestions.length === 0) return "Add at least one sub-question.";
      for (let i = 0; i < draft.subQuestions.length; i++) {
        const s = draft.subQuestions[i];
        const at = `Sub-question ${i + 1}: `;
        if (s.marks <= 0) return at + "marks must be greater than zero.";
        if (!s.stem.trim()) return at + "add the question stem.";
        if (isSubChoice(s.type)) {
          // Papers legitimately carry 2–4 options; only require the ones present.
          if (s.options.filter((o) => o.trim()).length < 2) return at + "add at least two options.";
          if (s.correct.length === 0) return at + "mark at least one correct option.";
          if (s.correct.some((i) => !s.options[i]?.trim()))
            return at + "a correct answer points to an empty option.";
        } else if (!s.numericalAnswer.trim()) {
          return at + "add the numerical answer.";
        }
      }
      return null;
    }

    if (draft.marks <= 0) return "Marks must be greater than zero.";
    if (!draft.stem.trim()) return "Add the question stem.";
    if (isChoiceType(draft.type)) {
      // Papers legitimately carry 2–4 options; only require the ones present.
      if (draft.options.filter((o) => o.trim()).length < 2) return "Add at least two options.";
      if (draft.correct.length === 0) return "Mark at least one correct option.";
      if (draft.correct.some((i) => !draft.options[i]?.trim()))
        return "A correct answer points to an empty option.";
    } else if (!draft.numericalAnswer.trim()) {
      return "Add the numerical answer.";
    }
    return null;
  };

  const saveQuestion = () => {
    const error = validateDraft();
    if (error) {
      toast({ title: "Incomplete question", description: error, variant: "destructive" });
      return;
    }
    // Passing validateDraft clears any parser-flagged issues on this block.
    if (editingId) {
      setQuestions((prev) =>
        prev.map((q) => (q.id === editingId ? { ...draft, id: editingId, isValid: true, issues: [] } : q))
      );
      toast({ title: "Question updated" });
    } else {
      setQuestions((prev) => [
        ...prev,
        { ...draft, id: `q-${nextId.current++}`, isValid: true, issues: [] },
      ]);
      toast({ title: "Question added to paper" });
    }
    resetEditor();
  };

  /** Run the bulk parser and append the parsed blocks to the paper. */
  const processBulk = () => {
    const { blocks, errors } = parseBulkPaper(bulkText);
    if (blocks.length === 0) {
      toast({
        title: "Nothing parsed",
        description: errors[0] ?? "No recognisable blocks found.",
        variant: "destructive",
      });
      return;
    }

    const parsed: Question[] = blocks.map((b) => ({ ...b, id: `q-${nextId.current++}` }));
    setQuestions((prev) => [...prev, ...parsed]);

    const invalid = parsed.filter((q) => !q.isValid).length;
    // Keep the pasted source — reopening the modal shows exactly what was sent.
    setBulkOpen(false);
    toast({
      title: `Parsed ${parsed.length} block${parsed.length === 1 ? "" : "s"}`,
      description: invalid
        ? `${invalid} need${invalid === 1 ? "s" : ""} review — highlighted in red in the navigator.`
        : "All blocks validated cleanly.",
      variant: invalid ? "destructive" : undefined,
    });
  };

  const removeQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    if (editingId === id) resetEditor();
  };

  /**
   * Hand the built paper to the real exam runner so it can be sat exactly as a
   * student would see it — same palette, timer, and answer controls.
   */
  const openInRunner = (mode: "practice" | "exam") => {
    const examQuestions = toExamQuestions(questions);
    if (examQuestions.length === 0) {
      toast({
        title: "Nothing to preview",
        description: "Add at least one question before running the paper.",
        variant: "destructive",
      });
      return;
    }
    storePreviewPaper({
      subject: academicContext.subject,
      examLabel: academicContext.exam,
      durationMinutes: durationToMinutes(duration),
      totalMarks,
      questions: examQuestions,
    });
    const params = new URLSearchParams({
      mode,
      exam: academicContext.exam,
      preview: "1",
    });
    navigate(
      `/${slugify(academicContext.degree)}/${slugify(academicContext.subject)}/exam?${params}`
    );
  };

  const publishPaper = () => {
    if (questions.length === 0) {
      toast({ title: "Empty paper", description: "Add at least one question before publishing.", variant: "destructive" });
      return;
    }
    const payload = {
      academicContext,
      examDate: scheduledDate,
      durationLabel: duration,
      totalMarks,
      sourcePdf: pdfName,
      questions: questions.map((q, i) => {
        // Comprehension parents carry a passage + nested children, no own marks.
        if (q.inputMode === "form" && q.type === "comprehension") {
          return {
            order: i + 1,
            type: "comprehension" as const,
            inputMode: q.inputMode,
            passage: q.passage.trim(),
            subQuestions: q.subQuestions.map((s) => ({
              type: s.type,
              marks: s.marks,
              stem: s.stem.trim(),
              options: isSubChoice(s.type) ? s.options.map((o) => o.trim()) : [],
              correctOptions: isSubChoice(s.type) ? s.correct : [],
              numericalAnswer: isSubChoice(s.type) ? null : s.numericalAnswer.trim(),
            })),
          };
        }
        // Both views are kept in sync, so `inputMode` is only a view preference:
        // always emit the structured fields *and* the raw source.
        return {
          order: i + 1,
          type: q.type,
          inputMode: q.inputMode,
          marks: q.marks,
          latex: q.latex.trim() || null,
          stem: q.stem.trim() || null,
          options: isChoiceType(q.type) ? q.options.map((o) => o.trim()).filter(Boolean) : [],
          correctOptions: isChoiceType(q.type) ? q.correct : [],
          numericalAnswer: isChoiceType(q.type) ? null : q.numericalAnswer.trim() || null,
        };
      }),
    };

    setPublishing(true);
    setTimeout(() => {
      setPublishing(false);
      toast({
        title: "Paper published",
        description: `${totalQuestions} question${totalQuestions === 1 ? "" : "s"} · ${totalMarks} marks`,
      });
      navigate("/admin/bank");
    }, 600);
  };

  const headerLine2 = `${academicContext.exam} | ${academicContext.term} - ${academicContext.year}`;

  /* The editor is one element rendered either inline in a stream slot
     or as the trailing composer — never both at once. */
  const editorEl = (
                  <div className="border border-border rounded-md bg-card">
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border">
                      <p className="text-[13px] font-medium">
                        {editingId
                          ? `Editing Question ${questions.findIndex((q) => q.id === editingId) + 1}`
                          : `New Question ${questions.length + 1}`}
                      </p>

                      {/* Per-block view toggle */}
                      <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5 shrink-0">
                        {([
                          { key: "form", label: "Form View" },
                          { key: "latex", label: "LaTeX View" },
                        ] as { key: InputMode; label: string }[]).map((m) => {
                          const active = draft.inputMode === m.key;
                          return (
                            <button key={m.key} onClick={() => setDraftField("inputMode", m.key)}
                              className={`rounded px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                                active
                                  ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-black"
                                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                              }`}>
                              {m.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Parser findings for the block being repaired */}
                    {editingIssues.length > 0 && (
                      <div className="px-4 py-3 border-b border-border">
                        <div className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-[#1A0F0F] rounded-md px-3 py-2">
                          <p className="flex items-center gap-1.5 text-[12px] font-medium text-red-600 dark:text-red-400 mb-1">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Needs review — {editingIssues.length} issue{editingIssues.length === 1 ? "" : "s"} from bulk import
                          </p>
                          <ul className="list-disc pl-5 space-y-0.5">
                            {editingIssues.map((issue, i) => (
                              <li key={i} className="text-[12px] text-red-600 dark:text-red-400">{issue}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}

                    {/* Block metadata: type + marks (shared by both views) */}
                    <div className="px-4 py-3 border-b border-border flex flex-wrap items-end gap-4">
                      <div className="min-w-0">
                        <p className="text-[12px] text-muted-foreground mb-2">Question Type</p>
                        <div className="flex flex-wrap gap-2">
                          {TYPES.map((t) => {
                            const active = draft.type === t.key;
                            return (
                              <button key={t.key} onClick={() => changeType(t.key)}
                                className={`rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                                  active
                                    ? "border-emerald-500 bg-emerald-500 text-white"
                                    : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
                                }`}>
                                {t.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {/* A comprehension parent has no marks of its own — each
                          sub-question carries them. */}
                      {!(draft.inputMode === "form" && draft.type === "comprehension") && (
                        <div className="space-y-1">
                          <label htmlFor="q-marks" className="block text-[12px] text-muted-foreground">Marks</label>
                          <input id="q-marks" type="number" min={1} max={100} value={draft.marks}
                            onChange={(e) => setDraftField("marks", Number(e.target.value))}
                            className={`${textInputClass} w-20`} />
                        </div>
                      )}
                    </div>

                    {draft.inputMode === "latex" ? (
                      /* ── LaTeX view ─────────────────────────────── */
                      <div className="px-4 py-3 border-b border-border space-y-1">
                        <label htmlFor="q-latex" className="block text-[12px] text-muted-foreground">
                          LaTeX / raw source
                        </label>
                        <textarea id="q-latex" value={draft.latex}
                          onChange={(e) => setLatexSource(e.target.value)}
                          rows={14} spellCheck={false}
                          placeholder={"\\begin{question}\n  What is the median of $4, 8, 15, 16, 23, 42$?\n  \\begin{choices}\n    \\choice 11.5\n    \\correctchoice 15.5\n  \\end{choices}\n\\end{question}"}
                          className="w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-[12.5px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-gray-400 dark:focus:border-gray-600 transition-colors resize-y" />
                      </div>
                    ) : (
                      /* ── Form view ──────────────────────────────── */
                      draft.type === "comprehension" ? (
                        /* Comprehension is a parent block: passage + children */
                        <>
                          <div className="px-4 py-3 border-b border-border space-y-1">
                            <label className="block text-[12px] text-muted-foreground">Passage</label>
                            <MathField
                              value={draft.passage}
                              onChange={(v) => setDraftField("passage", v)}
                              multiline
                              ariaLabel="Comprehension passage"
                              placeholder="Paste the comprehension passage students will read…"
                              className="min-h-[120px] leading-relaxed"
                            />
                          </div>

                          <div className="px-4 py-3 border-b border-border">
                            <p className="text-[12px] text-muted-foreground mb-2">
                              Sub-Questions ({draft.subQuestions.length})
                            </p>

                            <div className="space-y-3">
                              {draft.subQuestions.map((sq, si) => (
                                <div key={sq.id} className="border border-border rounded-md bg-background">
                                  <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
                                    <p className="text-[12px] font-medium">Sub-Question {si + 1}</p>
                                    <button type="button" onClick={() => removeSubQuestion(sq.id)}
                                      aria-label={`Remove sub-question ${si + 1}`} title="Remove sub-question"
                                      className="h-6 w-6 inline-flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-secondary transition-colors">
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  </div>

                                  <div className="px-3 py-2.5 space-y-3">
                                    {/* Localized type + marks */}
                                    <div className="flex flex-wrap items-end gap-3">
                                      <div>
                                        <p className="text-[11px] text-muted-foreground mb-1.5">Type</p>
                                        <div className="flex flex-wrap gap-1.5">
                                          {SUB_TYPES.map((t) => (
                                            <button key={t.key} type="button" onClick={() => changeSubType(sq.id, t.key)}
                                              className={`rounded-md border px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                                                sq.type === t.key
                                                  ? "border-emerald-500 bg-emerald-500 text-white"
                                                  : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
                                              }`}>
                                              {t.label}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                      <div className="space-y-1">
                                        <label className="block text-[11px] text-muted-foreground">Marks</label>
                                        <input type="number" min={1} max={100} value={sq.marks}
                                          onChange={(e) => updateSubQuestion(sq.id, { marks: Number(e.target.value) })}
                                          aria-label={`Sub-question ${si + 1} marks`}
                                          className={`${textInputClass} w-20`} />
                                      </div>
                                    </div>

                                    {/* Stem */}
                                    <div className="space-y-1">
                                      <label className="block text-[11px] text-muted-foreground">Question Stem</label>
                                      <MathField
                                        value={sq.stem}
                                        onChange={(v) => updateSubQuestion(sq.id, { stem: v })}
                                        multiline
                                        ariaLabel={`Sub-question ${si + 1} stem`}
                                        placeholder="Type the sub-question here…"
                                        className="min-h-[72px] leading-relaxed"
                                      />
                                    </div>

                                    {/* Answers */}
                                    {isSubChoice(sq.type) ? (
                                      <div>
                                        <p className="text-[11px] text-muted-foreground mb-1.5">
                                          Options — {isSubSingle(sq.type) ? "select the one correct answer" : "select all correct answers"}
                                        </p>
                                        <div className="space-y-2">
                                          {sq.options.map((opt, i) => {
                                            const marked = sq.correct.includes(i);
                                            return (
                                              <div key={i} className="flex items-start gap-2">
                                                <button type="button" onClick={() => toggleSubCorrect(sq.id, i)}
                                                  aria-label={`Sub-question ${si + 1} mark option ${String.fromCharCode(65 + i)} correct`}
                                                  className={`shrink-0 h-6 w-6 flex items-center justify-center border text-[11px] font-medium transition-colors ${
                                                    isSubSingle(sq.type) ? "rounded-full" : "rounded"
                                                  } ${
                                                    marked
                                                      ? "border-emerald-500 bg-emerald-500 text-white"
                                                      : "border-border bg-card text-muted-foreground hover:border-emerald-500"
                                                  }`}>
                                                  {marked ? <Check className="h-3 w-3" /> : String.fromCharCode(65 + i)}
                                                </button>
                                                <div className="flex-1 min-w-0">
                                                  <MathField
                                                    value={opt}
                                                    onChange={(v) => setSubOption(sq.id, i, v)}
                                                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                                                    ariaLabel={`Sub-question ${si + 1} option ${String.fromCharCode(65 + i)}`}
                                                    className="min-h-[34px] py-1.5"
                                                  />
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="space-y-1">
                                        <label className="block text-[11px] text-muted-foreground">
                                          Correct Answer — exact value or range
                                        </label>
                                        <input value={sq.numericalAnswer}
                                          onChange={(e) => updateSubQuestion(sq.id, { numericalAnswer: e.target.value })}
                                          placeholder="e.g. 42 or 3.10 - 3.20" inputMode="decimal"
                                          aria-label={`Sub-question ${si + 1} numerical answer`}
                                          className={`${textInputClass} max-w-xs`} />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>

                            <button type="button" onClick={addSubQuestion}
                              className="mt-3 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-emerald-600 dark:text-emerald-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                              <Plus className="h-3.5 w-3.5" /> Add Sub-Question
                            </button>
                          </div>
                        </>
                      ) : (
                      <>
                        <div className="px-4 py-3 border-b border-border space-y-1">
                          <label className="block text-[12px] text-muted-foreground">Question</label>
                          <MathField
                            value={draft.stem}
                            onChange={(v) => setDraftField("stem", v)}
                            multiline
                            ariaLabel="Question stem"
                            placeholder="Type the question — wrap maths in $…$ to render it"
                            className="min-h-[96px] leading-relaxed"
                          />
                        </div>

                        {isChoiceType(draft.type) ? (
                          <div className="px-4 py-3 border-b border-border">
                            <p className="text-[12px] text-muted-foreground mb-2">
                              Options — {isSingleAnswer(draft.type) ? "select the one correct answer" : "select all correct answers"}
                            </p>
                            <div className="space-y-2">
                              {draft.options.map((opt, i) => {
                                const marked = draft.correct.includes(i);
                                return (
                                  <div key={i} className="flex items-start gap-2">
                                    <button type="button" onClick={() => toggleCorrect(i)} title="Mark correct"
                                      aria-label={`Mark option ${String.fromCharCode(65 + i)} correct`}
                                      className={`shrink-0 h-7 w-7 flex items-center justify-center border text-[11px] font-medium transition-colors ${
                                        isSingleAnswer(draft.type) ? "rounded-full" : "rounded"
                                      } ${
                                        marked
                                          ? "border-emerald-500 bg-emerald-500 text-white"
                                          : "border-border bg-card text-muted-foreground hover:border-emerald-500"
                                      }`}>
                                      {marked ? <Check className="h-3.5 w-3.5" /> : String.fromCharCode(65 + i)}
                                    </button>
                                    <div className="flex-1 min-w-0">
                                      <MathField
                                        value={opt}
                                        onChange={(v) => setOption(i, v)}
                                        placeholder={`Option ${String.fromCharCode(65 + i)}`}
                                        ariaLabel={`Option ${String.fromCharCode(65 + i)}`}
                                        className="min-h-[34px] py-1.5"
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="px-4 py-3 border-b border-border space-y-1">
                            <label htmlFor="numeric-answer" className="block text-[12px] text-muted-foreground">
                              Correct Answer — exact value or range
                            </label>
                            <input id="numeric-answer" value={draft.numericalAnswer}
                              onChange={(e) => setDraftField("numericalAnswer", e.target.value)}
                              placeholder="e.g. 42 or 3.10 - 3.20" inputMode="decimal"
                              className={`${textInputClass} max-w-xs`} />
                          </div>
                        )}
                      </>
                      )
                    )}

                    <div className="px-4 py-3 flex flex-wrap items-center gap-2">
                      <button onClick={saveQuestion} className={primaryBtnClass}>
                        <Check className="h-3.5 w-3.5" />
                        {editingId ? "Update Question" : "Save Question"}
                      </button>
                      {editingId && (
                        <button onClick={resetEditor} className={secondaryBtnClass}>
                          <Plus className="h-3.5 w-3.5" /> New Question
                        </button>
                      )}
                    </div>
                  </div>
  );

  // Rendered outside AppLayout so the global sidebar is absent entirely —
  // a focused, isolated reading environment rather than a modal over the editor.
  if (previewOpen) {
    return (
      <PaperPreview
        subject={academicContext.subject}
        headerLine={headerLine2}
        dateLabel={scheduledDate ? formatDate(scheduledDate) : "Not scheduled"}
        duration={duration}
        totalQuestions={totalQuestions}
        totalMarks={totalMarks}
        programmeLine={`${academicContext.degree} · ${academicContext.level}`}
        questions={questions}
        onBack={() => setPreviewOpen(false)}
        onRun={openInRunner}
      />
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-auto">
          {/* ── Sticky exam header ───────────────────────────────────── */}
          <div className="sticky top-0 z-20 bg-card border-b border-border px-4 md:px-6 py-3">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              {/* Identity */}
              <div className="flex items-start gap-2 min-w-0">
                <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-7 w-7 shrink-0 mt-0.5">
                  <ArrowLeft className="h-3.5 w-3.5" />
                </Button>
                <div className="min-w-0">
                  <p className="text-base font-semibold truncate">{academicContext.subject}</p>
                  <p className="text-[13px] text-foreground/80 truncate">{headerLine2}</p>
                  <p className="text-[12px] text-muted-foreground truncate">
                    Date: {scheduledDate ? formatDate(scheduledDate) : "Not scheduled in Schedule Manager"}
                  </p>
                </div>
              </div>

              {/* Live stats */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <span className="inline-flex items-center rounded-md border border-border bg-secondary px-2.5 py-1 text-[12px] text-foreground">
                  Total Questions: <span className="ml-1 font-semibold tabular-nums">{totalQuestions}</span>
                </span>
                <span className="inline-flex items-center rounded-md border border-border bg-secondary px-2.5 py-1 text-[12px] text-foreground">
                  Duration: <span className="ml-1 font-semibold">{duration}</span>
                </span>
                <span className="inline-flex items-center rounded-md border border-border bg-secondary px-2.5 py-1 text-[12px] text-foreground">
                  Total Marks: <span className="ml-1 font-semibold tabular-nums">{totalMarks}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 md:p-6 space-y-4 max-w-[1600px]">
            {/* ── Collapsible context settings ───────────────────────── */}
            <div className="border border-border rounded-md bg-card">
              <button
                onClick={() => setContextOpen((v) => !v)}
                aria-expanded={contextOpen}
                className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-secondary transition-colors rounded-md"
              >
                <span className="text-[13px] font-medium">Exam Context Settings</span>
                {contextOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                             : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </button>

              {contextOpen && (
                <div className="border-t border-border p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="ctx-degree" className="block text-[12px] text-muted-foreground">Degree</label>
                      <select id="ctx-degree" value={academicContext.degree}
                        onChange={(e) => setContext("degree", e.target.value)} className={selectClass}>
                        {DEGREES.map((d) => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="ctx-level" className="block text-[12px] text-muted-foreground">Level</label>
                      <select id="ctx-level" value={academicContext.level}
                        onChange={(e) => setContext("level", e.target.value)} className={selectClass}>
                        {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="ctx-subject" className="block text-[12px] text-muted-foreground">Subject</label>
                      <select id="ctx-subject" value={academicContext.subject}
                        onChange={(e) => setContext("subject", e.target.value)} className={selectClass}>
                        {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="ctx-year" className="block text-[12px] text-muted-foreground">Year</label>
                      <select id="ctx-year" value={academicContext.year}
                        onChange={(e) => setContext("year", Number(e.target.value))} className={selectClass}>
                        {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="ctx-term" className="block text-[12px] text-muted-foreground">Term</label>
                      <select id="ctx-term" value={academicContext.term}
                        onChange={(e) => setContext("term", e.target.value)} className={selectClass}>
                        {TERM_LABELS.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="ctx-exam" className="block text-[12px] text-muted-foreground">Exam</label>
                      <select id="ctx-exam" value={academicContext.exam}
                        onChange={(e) => setContext("exam", e.target.value)} className={selectClass}>
                        {EXAMS.map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Paper Navigator — same collapsible card as Exam Context ── */}
            <div className="border border-border rounded-md bg-card">
              <button
                onClick={() => setNavigatorOpen((v) => !v)}
                aria-expanded={navigatorOpen}
                className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-secondary transition-colors rounded-md"
              >
                <span className="flex items-center gap-2">
                  <span className="text-[13px] font-medium">Paper Navigator</span>
                  <span className="text-[12px] text-muted-foreground">
                    {questions.length} block{questions.length === 1 ? "" : "s"}
                  </span>
                  {invalidCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-[#1A0F0F] px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
                      <AlertTriangle className="h-3 w-3" />
                      {invalidCount} need{invalidCount === 1 ? "s" : ""} review
                    </span>
                  )}
                </span>
                {navigatorOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                               : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </button>

              {navigatorOpen && (
                <div className="border-t border-border p-3">
                  {/* One full-width row box holding every listed question */}
                  <div className="border border-border rounded-md bg-background p-3">
                    {questions.length === 0 ? (
                      <p className="text-[12px] text-muted-foreground text-center py-2">
                        No blocks yet — save one or use Bulk Upload.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {questions.map((q, i) => {
                          const invalid = !q.isValid;
                          const active = editingId === q.id;
                          return (
                            <button
                              key={q.id}
                              onClick={() => loadQuestion(q, true)}
                              title={`${typeLabel(q.type)}${invalid ? ` — ${q.issues.length} issue${q.issues.length === 1 ? "" : "s"}` : ""}`}
                              aria-label={`Open block ${i + 1}${invalid ? " (needs review)" : ""}`}
                              className={`h-9 w-9 rounded border text-[12px] font-medium tabular-nums transition-colors ${
                                invalid
                                  ? `bg-red-500 text-white hover:bg-red-600 ${active ? "border-emerald-500" : "border-red-600"}`
                                  : active
                                  ? "border-emerald-500 bg-emerald-500 text-white"
                                  : "border-border bg-card text-foreground hover:bg-secondary"
                              }`}
                            >
                              {i + 1}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Workspace toolbar ──────────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setShowPdf((v) => !v)} className={primaryBtnClass}>
                  {showPdf ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
                  {showPdf ? "Hide PDF" : "Show PDF"}
                </button>
                <button onClick={() => setBulkOpen(true)} className={secondaryBtnClass}>
                  <FileCode className="h-3.5 w-3.5" /> Bulk Upload (LaTeX)
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => setPreviewOpen(true)} className={secondaryBtnClass}>
                  <Eye className="h-3.5 w-3.5" /> Preview Paper
                </button>
                <button onClick={publishPaper} disabled={publishing}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
                  {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Publish Paper
                </button>
              </div>
            </div>

            {/* ── Split-screen workspace ─────────────────────────────── */}
            {/* Two-column workspace. `items-stretch` makes both columns share
                one height, so the PDF pane always matches the question stream
                and grows as more questions are added. Widths only change when
                the PDF is toggled — never when questions are imported. */}
            <div className={`flex flex-col lg:flex-row items-stretch ${showPdf ? "gap-4" : "gap-0"}`}>
              {/* Left column: full width on its own, 60% alongside the PDF */}
              <div className={`w-full min-w-0 transition-[width] duration-300 ease-out ${showPdf ? "lg:w-3/5" : "lg:w-full"}`}>
                <div className="space-y-3">
                  {/* Question stream — each slot shows a summary card, or
                      expands into the inline editor for that question. */}
                  {questions.map((q, i) => {
                    const isEditing = editingId === q.id;
                    // Prefer the readable stem — the views are in sync, so a
                    // block saved from LaTeX View still has one.
                    const summary = q.type === "comprehension"
                      ? (firstLine(q.passage) || "Comprehension passage")
                      : (firstLine(q.stem) || firstLine(q.latex) || "Untitled question");
                    return (
                      <div key={q.id} ref={(el) => { itemRefs.current[q.id] = el; }} className="scroll-mt-4">
                        {isEditing ? editorEl : (
                          <div className={`border rounded-md bg-card ${!q.isValid ? "border-red-500" : "border-border"}`}>
                            <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className={`shrink-0 h-6 w-6 rounded border flex items-center justify-center text-[11px] font-medium tabular-nums ${!q.isValid ? "border-red-600 bg-red-500 text-white" : "border-border bg-secondary"}`}>
                                  {i + 1}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-[13px] truncate">{summary}</p>
                                  <p className="text-[11px] text-muted-foreground">
                                    {typeLabel(q.type)}
                                    {q.inputMode === "form" && q.type === "comprehension"
                                      ? ` · ${q.subQuestions.length} sub-question${q.subQuestions.length === 1 ? "" : "s"} · ${marksOf(q)} marks`
                                      : ` · ${q.marks} mark${q.marks === 1 ? "" : "s"}`}
                                    {q.inputMode === "latex" && " · LaTeX"}
                                    {!q.isValid && ` · ${q.issues.length} issue${q.issues.length === 1 ? "" : "s"}`}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => loadQuestion(q)} title="Edit question"
                                  className="inline-flex items-center gap-1 rounded px-2 py-1 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                                  <Pencil className="h-3 w-3" /> Edit
                                </button>
                                <button onClick={() => removeQuestion(q.id)} title="Remove question"
                                  aria-label={`Remove question ${i + 1}`}
                                  className="h-7 w-7 inline-flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-secondary transition-colors">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Composer for the next question — hidden while one is being edited inline */}
                  {editingId === null && editorEl}
                </div>
              </div>

              {/* Right column: PDF reference (40%). Unmounted entirely when
                  hidden, so the stream reclaims the full width. */}
              {showPdf && (
                <div className="w-full lg:w-2/5 shrink-0 flex">
                <div className="border border-border rounded-md bg-card w-full flex flex-col">
                  <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border shrink-0">
                    <p className="text-[13px] font-medium truncate">
                      {pdfName ?? "PYQ Reference PDF"}
                    </p>
                    <label htmlFor="pyq-pdf"
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary hover:bg-muted px-2.5 py-1 text-[12px] font-medium cursor-pointer transition-colors">
                      <Upload className="h-3.5 w-3.5" /> {pdfUrl ? "Replace" : "Choose PDF"}
                    </label>
                    <input id="pyq-pdf" type="file" accept="application/pdf" className="hidden" onChange={handlePdf} />
                  </div>

                  {pdfUrl ? (
                    // #toolbar=0&navpanes=0 hides the built-in Chrome/Edge PDF
                    // chrome (print, download, kebab menu, side panel).
                    // Fills whatever height the column inherits from the stream;
                    // the min-height only keeps it usable for very short papers.
                    <div className="ghost-scroll flex-1 min-h-[320px] bg-card">
                      <iframe
                        src={`${pdfUrl}#toolbar=0&navpanes=0`}
                        title="PYQ reference PDF"
                        className="w-full h-full border-0 bg-card"
                      />
                    </div>
                  ) : (
                    <div className="flex-1 min-h-[320px] flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <p className="text-[13px] font-medium">No PDF loaded</p>
                      <p className="text-[12px] text-muted-foreground">
                        Upload a previous-year paper to reference while typing questions.
                      </p>
                    </div>
                  )}
                </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bulk LaTeX upload modal ──────────────────────────────────────── */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        {/* hideClose: the header below supplies the only close affordance */}
        <DialogContent hideClose className="max-w-none w-screen h-screen rounded-none sm:rounded-none p-0 gap-0 bg-background border-0">
          {/* Radix requires a title for screen readers; the visible heading
              below is styled separately. */}
          <DialogTitle className="sr-only">Bulk Upload (LaTeX)</DialogTitle>
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between gap-3 px-4 md:px-6 h-12 border-b border-border bg-card shrink-0">
              <p className="text-[13px] font-medium truncate">Bulk Upload (LaTeX)</p>
              {/* Single close affordance: icon only (DialogContent's own X is suppressed) */}
              <button
                onClick={() => setBulkOpen(false)}
                aria-label="Close bulk upload"
                title="Close"
                className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-secondary transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto">
              <div className="mx-auto max-w-5xl px-4 md:px-6 py-5 h-full flex flex-col">
                <p className="text-[12px] text-muted-foreground mb-3">
                  Paste the full paper below. Supported blocks:{" "}
                  <code className="font-mono">{"\\begin{question}{MCQ|MSQ|NUM}"}</code> with{" "}
                  <code className="font-mono">{"\\marks{} \\stem \\options"}</code> (<code className="font-mono">+</code> marks
                  the correct choice) or <code className="font-mono">{"\\answer{}"}</code>, and{" "}
                  <code className="font-mono">{"\\begin{comprehension}"}</code> with{" "}
                  <code className="font-mono">{"\\passage"}</code> plus nested{" "}
                  <code className="font-mono">{"\\begin{subquestion}{…}"}</code>.
                </p>

                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  spellCheck={false}
                  aria-label="Bulk LaTeX source"
                  placeholder={
                    "\\begin{question}{MCQ}\n" +
                    "\\marks{4}\n" +
                    "\\stem\n" +
                    "What is the median of $4, 8, 15, 16, 23, 42$?\n" +
                    "\\options\n" +
                    "- 11.5\n" +
                    "+ 15.5\n" +
                    "- 16\n" +
                    "- 23\n" +
                    "\\end{question}\n\n" +
                    "\\begin{comprehension}\n" +
                    "\\passage\n" +
                    "A survey of 120 students reported a mean of 14.2 hours.\n" +
                    "\\begin{subquestion}{NUM}\n" +
                    "\\marks{5}\n" +
                    "\\stem\n" +
                    "State the variance (2 dp).\n" +
                    "\\answer{12.96}\n" +
                    "\\end{subquestion}\n" +
                    "\\end{comprehension}"
                  }
                  className="ghost-scroll flex-1 min-h-[45vh] w-full rounded-md border border-border bg-gray-100 dark:bg-gray-900 px-3 py-2 font-mono text-[12.5px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-gray-400 dark:focus:border-gray-600 transition-colors resize-none"
                />

                <div className="flex items-center justify-between gap-3 pt-4 shrink-0">
                  <p className="text-[12px] text-muted-foreground">
                    Source is kept after processing — processing again appends another copy.
                  </p>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setBulkText("")}
                      disabled={!bulkText}
                      className={`${secondaryBtnClass} disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      <X className="h-3.5 w-3.5" /> Clear
                    </button>
                    <button onClick={processBulk} className={primaryBtnClass}>
                      <FileCode className="h-3.5 w-3.5" /> Process &amp; Validate Engine
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </AppLayout>
  );
}
