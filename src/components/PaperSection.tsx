import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Check, Eye, Send, Plus, X, Trash2, Sun, Moon,
  ChevronDown, ChevronRight, ChevronLeft, FileText, PanelRightClose, PanelRightOpen,
  Pencil, AlertTriangle,
} from "lucide-react";
import {
  type InputMode, type QType, type Question, type QuestionDraft,
  type SubQType, type SubQuestion,
  TYPES, SUB_TYPES, blankDraft, blankSubQuestion,
  isChoiceType, isSingleAnswer, isSubChoice, isSubSingle,
  typeLabel, countsAsQuestions, marksOf,
} from "@/data/questions";
import { parseBulkPaper, serializeBlock } from "@/lib/parse-bulk-paper";
import { MathField } from "@/components/MathField";
import { QuestionBlock } from "@/components/QuestionBlock";
import { storePreviewPaper, toExamQuestions, durationToMinutes } from "@/data/preview-paper";
import { slugify } from "@/lib/utils";
import { publishAuthoredPaper, type CourseLevel } from "@/lib/pyq-publish";
import { LEVELS, SUBJECTS, EXAM_TYPE_BY_LABEL } from "@/pages/paper-builder-taxonomy";
import { selectClass, textInputClass, primaryBtnClass, secondaryBtnClass } from "@/pages/paper-builder-styles";

/**
 * One subject's paper, fully self-contained: its own question stream, its
 * own inline editor, its own PDF reference pane.
 *
 * A single PDF import routinely carries several courses at once, and each is
 * a genuinely separate paper — its own questions, its own PDF page range to
 * reference, its own publish action — so each becomes one of these rather
 * than all of them sharing one flat `questions` array the way a single-paper
 * builder only ever needed. Subject and level are the two fields that
 * legitimately differ per course within one sitting, so they are controlled
 * from the parent (which needs the current subject text for the search bar);
 * everything else — the question list, the open editor, the reference PDF —
 * has no reason to be visible outside this one section, so it stays local.
 */

export interface UniversalContext {
  degree: string;
  term: string;
  exam: string;
  shift: "FN" | "AN";
  examCode: string;
  /** ISO "YYYY-MM-DD", typed in directly in Exam Context Settings. */
  examDate: string | null;
  duration: string;
}

export interface PreviewRequest {
  subject: string;
  level: string;
  questions: Question[];
  totalQuestions: number;
  totalMarks: number;
  /**
   * "Begin Exam"/"Begin Practice" is clicked from the full-screen preview,
   * which the parent renders (it has to bypass AppLayout entirely, the way
   * the single-paper builder always did) — but running a paper needs this
   * section's own degree/subject/duration and its questions, so the section
   * hands over its own handler rather than the parent reconstructing it.
   */
  onRun: (mode: "practice" | "exam") => void;
}

export interface PaperSectionProps {
  subject: string;
  level: string;
  onSubjectChange: (subject: string) => void;
  onLevelChange: (level: string) => void;
  initialQuestions?: Question[];
  /** The PDF this section's questions were actually extracted from — a
   *  `Blob`, not a ready-made URL, so this component mints and owns its own
   *  object URL rather than inheriting one whose lifecycle it doesn't control. */
  initialPdfBlob?: Blob;
  initialPdfName?: string;
  /** 1-based page where this course's own heading appears in the PDF. */
  initialPdfStartPage?: number;
  /** 1-based PDF page for each entry in `initialQuestions`, same order. */
  initialQuestionPages?: (number | undefined)[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onRemove: () => void;
  universal: UniversalContext;
  onPreview: (req: PreviewRequest) => void;
}

export function PaperSection({
  subject,
  level,
  onSubjectChange,
  onLevelChange,
  initialQuestions,
  initialPdfBlob,
  initialPdfName,
  initialPdfStartPage,
  initialQuestionPages,
  collapsed,
  onToggleCollapsed,
  onRemove,
  universal,
  onPreview,
}: PaperSectionProps) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  /** Forces this section's own content light or dark, independent of the
   *  site's real theme — starts matching whatever that already is, so
   *  toggling it is the only thing that ever changes how it looks. */
  const [previewLight, setPreviewLight] = useState(
    () => typeof document !== "undefined" && !document.documentElement.classList.contains("dark")
  );

  // The PDF this section's questions were imported from — handed off once by
  // the importer, not re-uploaded here. A section has no other way to get
  // one (sections only ever come from an import), so there is nothing left
  // to pick: just show it, or hide it. Minted once, from a Blob this
  // component alone owns the URL lifecycle of — nothing else can revoke it
  // out from under an already-mounted section.
  const [pdfName] = useState<string | null>(initialPdfName ?? null);
  const [pdfUrl] = useState<string | null>(() => (initialPdfBlob ? URL.createObjectURL(initialPdfBlob) : null));
  const [showPdf, setShowPdf] = useState(false);
  /** 1-based page the reference pane is currently opened to. Starts on this
   *  course's own section heading rather than page 1 of a possibly
   *  hundred-page bulk export. */
  const [pdfPage, setPdfPage] = useState(initialPdfStartPage ?? 1);

  // Paper state — seeded once from whatever this section was created with
  // (a PDF import's questions, or nothing for a hand-authored one). A later
  // change to `initialQuestions` deliberately does NOT resync: once a section
  // exists, its content is this component's own, not a mirror of its seed.
  const [questions, setQuestions] = useState<Question[]>(() => initialQuestions ?? []);
  const [draft, setDraft] = useState<QuestionDraft>(blankDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  /** The question currently expanded read-only in the stream, in place of its
   *  summary card — no pop-up, same inline-expand pattern editing already uses. */
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const nextId = useRef(1);
  const nextSubId = useRef(1);

  /** Question id → its PDF page, fixed at import time — keyed by id (not
   *  index) so it survives later reordering, edits or removals just fine. */
  const pageByQuestionId = useRef(
    new Map((initialQuestions ?? []).map((q, i) => [q.id, initialQuestionPages?.[i]] as const))
  ).current;

  /** Opens (or moves) the read-only preview for a question, and — when its
   *  page is known — brings the reference pane to that page along with it. */
  const previewQuestionAt = (id: string) => {
    setPreviewId(id);
    const page = pageByQuestionId.get(id);
    if (page) {
      setPdfPage(page);
      if (pdfUrl) setShowPdf(true);
    }
  };

  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  /** Quiz 1 / Quiz 2 → 1 Hour · End Term → 1.5 Hours */
  const duration = universal.duration;

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

  /**
   * The number a block actually carries in the published paper — not its
   * position in `questions`. A comprehension block is one entry here but
   * several real questions once published (each sub-question flattened out
   * on its own), so a block after it starts several numbers ahead of its own
   * array index. Navigator chips, "Question N" headers and summary badges
   * were all showing the raw index instead, which drifted from the real
   * numbering — and from each other — the moment any comprehension block
   * appeared earlier in the paper.
   */
  const questionNumberAt = (index: number) =>
    questions.slice(0, index).reduce((n, q) => n + countsAsQuestions(q), 0) + 1;

  /** Single number, or a "start–end" range for a comprehension block's span. */
  const questionLabelAt = (index: number, q: Question) => {
    const start = questionNumberAt(index);
    const span = countsAsQuestions(q);
    return span > 1 ? `${start}–${start + span - 1}` : `${start}`;
  };

  /**
   * First readable line, for the one-line summary in the question stream.
   *
   * Figure references are markdown, so an imported question whose stem is only
   * a diagram would otherwise be listed as `![Question figure](asset-f3)`.
   * They collapse to their alt text instead, which is what the block actually is.
   */
  const firstLine = (s: string) =>
    s
      .replace(/!\[([^\]]*)\]\(asset-[A-Za-z0-9]+\)/g, (_, alt) => alt || "Figure")
      .trim()
      .split("\n")
      .find((l) => l.trim()) ?? "";

  /** Slot elements, so the navigator can scroll a question into view. */
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingScrollId) return;
    const el = itemRefs.current[pendingScrollId];
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    setPendingScrollId(null);
  }, [pendingScrollId]);

  const editingIssues = editingId
    ? questions.find((q) => q.id === editingId)?.issues ?? []
    : [];

  /* ── Editor helpers ───────────────────────────────────────────────────── */
  const setDraftField = <K extends keyof QuestionDraft>(key: K, value: QuestionDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  /**
   * Bidirectional sync. The structured fields are authoritative while the
   * Rich Editor is active — this mirrors them into `latex` so the LaTeX
   * Source view is never stale. `latex` is not a dependency, so writing it
   * cannot re-trigger.
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
   * fields, so switching back to the Rich Editor shows the edit. A block that
   * does not parse (mid-keystroke) keeps the text without destroying the fields.
   */
  const setLatexSource = (src: string) =>
    setDraft((prev) => {
      const parsed = parseBulkPaper(src).blocks[0];
      if (!parsed) return { ...prev, latex: src };
      const { isValid: _v, issues: _i, inputMode: _m, latex: _l, assets: _a, ...fields } = parsed;
      // A re-parsed sub-question also reports no assets; an imported
      // comprehension keeps its figures on the children, not the parent —
      // position is the only correspondence this dialect preserves.
      const subQuestions = fields.subQuestions.map((sq, i) => ({
        ...sq,
        assets: prev.subQuestions[i]?.assets ?? [],
      }));
      return { ...prev, ...fields, subQuestions, latex: src };
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

  /* ── Option add/remove for regular questions ───────────────────────────── */
  const addOption = () =>
    setDraft((prev) => ({ ...prev, options: [...prev.options, ""] }));

  const removeOption = (i: number) =>
    setDraft((prev) => ({
      ...prev,
      options: prev.options.filter((_, idx) => idx !== i),
      correct: prev.correct
        .filter((c) => c !== i)
        .map((c) => (c > i ? c - 1 : c)),
    }));

  /* ── Option add/remove for sub-questions ───────────────────────────────── */
  const addSubOption = (sqId: string) =>
    setDraft((prev) => ({
      ...prev,
      subQuestions: prev.subQuestions.map((s) =>
        s.id === sqId ? { ...s, options: [...s.options, ""] } : s
      ),
    }));

  const removeSubOption = (sqId: string, i: number) =>
    setDraft((prev) => ({
      ...prev,
      subQuestions: prev.subQuestions.map((s) => {
        if (s.id !== sqId) return s;
        return {
          ...s,
          options: s.options.filter((_, idx) => idx !== i),
          correct: s.correct
            .filter((c) => c !== i)
            .map((c) => (c > i ? c - 1 : c)),
        };
      }),
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
    setPreviewId(null);
    if (scrollTo) setPendingScrollId(id);
  };

  const validateDraft = (): string | null => {
    if (draft.inputMode === "latex") {
      if (draft.marks <= 0) return "Marks must be greater than zero.";
      return draft.latex.trim() ? null : "Add the LaTeX source for this question.";
    }

    if (draft.type === "comprehension") {
      if (!draft.passage.trim()) return "Add the comprehension passage.";
      if (draft.subQuestions.length === 0) return "Add at least one sub-question.";
      for (let i = 0; i < draft.subQuestions.length; i++) {
        const s = draft.subQuestions[i];
        const at = `Sub-question ${i + 1}: `;
        if (s.marks <= 0) return at + "marks must be greater than zero.";
        if (!s.stem.trim()) return at + "add the question stem.";
        if (isSubChoice(s.type)) {
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

  const removeQuestion = (id: string) => {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    if (editingId === id) resetEditor();
    if (previewId === id) setPreviewId(null);
  };

  /**
   * Hand this paper to the real exam runner so it can be sat exactly as a
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
      subject,
      examLabel: universal.exam,
      durationMinutes: durationToMinutes(duration),
      totalMarks,
      questions: examQuestions,
    });
    const params = new URLSearchParams({ mode, exam: universal.exam, preview: "1" });
    navigate(`/${slugify(universal.degree)}/${slugify(subject)}/exam?${params}`);
  };

  const publishPaper = async () => {
    if (questions.length === 0) {
      toast({ title: "Empty paper", description: "Add at least one question before publishing.", variant: "destructive" });
      return;
    }
    if (!universal.examDate) {
      toast({ title: "Fill in the required field.", description: "Set the exam date in Exam Context Settings before publishing.", variant: "destructive" });
      return;
    }

    setPublishing(true);
    try {
      await publishAuthoredPaper({
        subject,
        level: level.toLowerCase() as CourseLevel,
        examDate: universal.examDate,
        examType: EXAM_TYPE_BY_LABEL[universal.exam] ?? "quiz_1",
        term: universal.term,
        examCode: universal.examCode,
        slot: universal.shift.toLowerCase() as "fn" | "an",
        questions,
      });
      toast({
        title: "Paper published",
        description: `${totalQuestions} question${totalQuestions === 1 ? "" : "s"} · ${totalMarks} marks`,
      });
    } catch (e) {
      toast({
        title: "Publish failed",
        description: e instanceof Error ? e.message : "Could not publish this paper.",
        variant: "destructive",
      });
    } finally {
      setPublishing(false);
    }
  };

  /* The editor is one element rendered either inline in a stream slot
     or as the trailing composer — never both at once. */
  const editingIndex = editingId ? questions.findIndex((q) => q.id === editingId) : -1;
  const editorEl = (
    <div className="border border-border rounded-md bg-card">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border">
        <p className="text-[13px] font-medium">
          {editingIndex >= 0
            ? `Editing Question ${questionLabelAt(editingIndex, questions[editingIndex])}`
            : `New Question ${questionNumberAt(questions.length)}`}
        </p>

        <div className="flex items-center gap-1 rounded-md border border-border bg-card p-0.5 shrink-0">
          {([
            { key: "form", label: "Rich Editor" },
            { key: "latex", label: "LaTeX Source" },
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

      {editingIssues.length > 0 && (
        <div className="px-4 py-3 border-b border-border">
          <div className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-[#1A0F0F] rounded-md px-3 py-2">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-red-600 dark:text-red-400 mb-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Needs review — {editingIssues.length} issue{editingIssues.length === 1 ? "" : "s"}
            </p>
            <ul className="list-disc pl-5 space-y-0.5">
              {editingIssues.map((issue, i) => (
                <li key={i} className="text-[12px] text-red-600 dark:text-red-400">{issue}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Compact single-line row: a segmented control (same pill pattern as
          the Form/LaTeX toggle above) reads as clearly as labelled buttons
          without the label's own line, and Marks sits inline beside it
          instead of stacked under a second label. */}
      <div className="px-4 py-2 border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-card p-0.5"
          role="group" aria-label="Question type">
          {TYPES.map((t) => {
            const active = draft.type === t.key;
            return (
              <button key={t.key} type="button" onClick={() => changeType(t.key)} title={t.label}
                className={`rounded px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                  active
                    ? "bg-emerald-500 text-white"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}>
                {t.label}
              </button>
            );
          })}
        </div>
        {!(draft.inputMode === "form" && draft.type === "comprehension") && (
          <div className="flex items-center gap-1.5 shrink-0">
            <label htmlFor="q-marks" className="text-[11.5px] text-muted-foreground">Marks</label>
            <input id="q-marks" type="number" min={1} max={100} value={draft.marks}
              onChange={(e) => setDraftField("marks", Number(e.target.value))}
              className="h-7 w-14 rounded-md border border-border bg-card px-1.5 text-center text-[12px] text-foreground focus:outline-none focus:border-gray-400 dark:focus:border-gray-600 transition-colors" />
          </div>
        )}
      </div>

      {draft.inputMode === "latex" ? (
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
        draft.type === "comprehension" ? (
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
                assets={draft.assets}
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
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-card p-0.5"
                          role="group" aria-label={`Sub-question ${si + 1} type`}>
                          {SUB_TYPES.map((t) => (
                            <button key={t.key} type="button" onClick={() => changeSubType(sq.id, t.key)} title={t.label}
                              className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                sq.type === t.key
                                  ? "bg-emerald-500 text-white"
                                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                              }`}>
                              {t.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <label className="text-[11px] text-muted-foreground">Marks</label>
                          <input type="number" min={1} max={100} value={sq.marks}
                            onChange={(e) => updateSubQuestion(sq.id, { marks: Number(e.target.value) })}
                            aria-label={`Sub-question ${si + 1} marks`}
                            className="h-7 w-14 rounded-md border border-border bg-card px-1.5 text-center text-[12px] text-foreground focus:outline-none focus:border-gray-400 dark:focus:border-gray-600 transition-colors" />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-[11px] text-muted-foreground">Question Stem</label>
                        <MathField
                          value={sq.stem}
                          onChange={(v) => updateSubQuestion(sq.id, { stem: v })}
                          multiline
                          ariaLabel={`Sub-question ${si + 1} stem`}
                          placeholder="Type the sub-question here…"
                          className="min-h-[72px] leading-relaxed"
                          assets={sq.assets}
                        />
                      </div>

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
                                      assets={sq.assets}
                                    />
                                  </div>
                                  {sq.options.length > 2 && (
                                    <button type="button" onClick={() => removeSubOption(sq.id, i)}
                                      title="Remove this option"
                                      aria-label={`Sub-question ${si + 1} remove option ${String.fromCharCode(65 + i)}`}
                                      className="shrink-0 mt-1 h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                                      <X className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <button type="button" onClick={() => addSubOption(sq.id)}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                            <Plus className="h-3 w-3" /> Add option
                          </button>
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
                assets={draft.assets}
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
                            assets={draft.assets}
                          />
                        </div>
                        {draft.options.length > 2 && (
                          <button type="button" onClick={() => removeOption(i)}
                            title="Remove this option"
                            aria-label={`Remove option ${String.fromCharCode(65 + i)}`}
                            className="shrink-0 mt-1.5 h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button type="button" onClick={addOption}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  <Plus className="h-3.5 w-3.5" /> Add option
                </button>
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

  return (
    <div className="border border-border rounded-md bg-card">
      {/* ── Section header — collapses the whole subject away. The toggle
          chevron sits at the far right, same side as Exam Context Settings'
          own collapse arrow, so every collapsible card in this page reads
          the same way. Publish sits right next to the subject name so a
          paper can be published without expanding its section. ────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5">
        <button
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          className="flex flex-1 min-w-0 items-center gap-2 text-left"
        >
          <span className="text-[14px] font-semibold truncate">{subject || "Untitled subject"}</span>
          <span className="shrink-0 text-[12px] text-muted-foreground">
            {level} · {totalQuestions} question{totalQuestions === 1 ? "" : "s"} · {totalMarks} marks
          </span>
          {invalidCount > 0 && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-[#1A0F0F] px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
              <AlertTriangle className="h-3 w-3" />
              {invalidCount}
            </span>
          )}
          {!universal.examDate && (
            <span
              title="Exam date is required — set it in Exam Context Settings before publishing"
              className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-[#1E1707] px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
            >
              <AlertTriangle className="h-3 w-3" /> Exam date needed
            </span>
          )}
        </button>
        <button
          onClick={() => setPreviewLight((v) => !v)}
          title={previewLight ? "Previewing in light — switch to dark" : "Previewing in dark — switch to light"}
          aria-label="Toggle this subject's preview theme"
          className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded text-gray-400 hover:text-foreground hover:bg-secondary transition-colors"
        >
          {previewLight ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>
        <button
          onClick={onRemove}
          title="Delete this subject"
          aria-label={`Delete ${subject || "this subject"}`}
          className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-secondary transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onPreview({ subject, level, questions, totalQuestions, totalMarks, onRun: openInRunner })}
          title="Preview this paper"
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-[12px] font-medium text-foreground hover:bg-secondary transition-colors"
        >
          <Eye className="h-3.5 w-3.5" /> Preview
        </button>
        <button
          onClick={() => void publishPaper()}
          disabled={publishing}
          title="Publish this paper"
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {publishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Publish
        </button>
        <button
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? `Expand ${subject || "this subject"}` : `Collapse ${subject || "this subject"}`}
          className="h-7 w-7 shrink-0 inline-flex items-center justify-center rounded hover:bg-secondary transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
                     : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </button>
      </div>

      {!collapsed && (
        <div className={`border-t border-border p-3 space-y-4 ${previewLight ? "theme-scope-light" : "theme-scope-dark"}`}>
          {/* ── Details of Subject ──────────────────────────────────── */}
          <div className="border border-border rounded-md bg-background">
            <button
              onClick={() => setDetailsOpen((v) => !v)}
              aria-expanded={detailsOpen}
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-secondary transition-colors rounded-md"
            >
              <span className="text-[13px] font-medium">Details of Subject</span>
              {detailsOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                           : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>
            {detailsOpen && (
              <div className="border-t border-border p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[12px] text-muted-foreground shrink-0">Level</span>
                    <select value={level} onChange={(e) => onLevelChange(e.target.value)} className={selectClass}>
                      {!LEVELS.includes(level) && level && <option value={level}>{level}</option>}
                      {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
                    <span className="text-[12px] text-muted-foreground shrink-0">Subject</span>
                    <select value={subject} onChange={(e) => onSubjectChange(e.target.value)} className={`${selectClass} flex-1`}>
                      {!SUBJECTS.includes(subject) && subject && <option value={subject}>{subject}</option>}
                      {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <span className="inline-flex items-center rounded-md border border-border bg-secondary px-2.5 py-1 text-[12px] text-foreground shrink-0">
                    TQ: <span className="ml-1 font-semibold tabular-nums">{totalQuestions}</span>
                  </span>
                  <span className="inline-flex items-center rounded-md border border-border bg-secondary px-2.5 py-1 text-[12px] text-foreground shrink-0">
                    Duration: <span className="ml-1 font-semibold">{duration}</span>
                  </span>
                  <span className="inline-flex items-center rounded-md border border-border bg-secondary px-2.5 py-1 text-[12px] text-foreground shrink-0">
                    Marks: <span className="ml-1 font-semibold tabular-nums">{totalMarks}</span>
                  </span>
                  {invalidCount > 0 && (
                    <span className="inline-flex items-center rounded-md border border-red-200 dark:border-red-900 bg-red-50 dark:bg-[#1A0F0F] px-2.5 py-1 text-[12px] text-red-600 dark:text-red-400 shrink-0">
                      Flagged: <span className="ml-1 font-semibold tabular-nums">{invalidCount}</span>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Paper Navigator ──────────────────────────────────────── */}
          <div className="border border-border rounded-md bg-background">
            <button
              onClick={() => setNavigatorOpen((v) => !v)}
              aria-expanded={navigatorOpen}
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-secondary transition-colors rounded-md"
            >
              <span className="flex items-center gap-2 min-w-0 flex-wrap">
                <span className="text-[13px] font-medium shrink-0">Paper Navigator</span>
                {questions.length > 0 && (() => {
                  // Count individual questions — comprehension expands to sub-questions
                  let sc = 0, mc = 0, num = 0, cmpTotal = 0;
                  for (const q of questions) {
                    if (q.type === "comprehension") {
                      for (const sq of q.subQuestions) {
                        if (sq.type === "single_correct") sc++;
                        else if (sq.type === "multi_correct") mc++;
                        else num++;
                      }
                      cmpTotal++;
                    } else if (q.type === "single") sc++;
                    else if (q.type === "multi") mc++;
                    else num++;
                  }
                  const parts: string[] = [];
                  if (sc  > 0) parts.push(`${sc} single`);
                  if (mc  > 0) parts.push(`${mc} multi`);
                  if (num > 0) parts.push(`${num} integer`);
                  if (cmpTotal > 0) parts.push(`${cmpTotal} comprehension`);
                  return (
                    <span className="text-[12px] text-muted-foreground">
                      {parts.join(" · ")}
                    </span>
                  );
                })()}
              </span>
              {navigatorOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                             : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </button>

            {navigatorOpen && (
              <div className="border-t border-border p-3">
                <div className="border border-border rounded-md bg-card p-3">
                  {questions.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground text-center py-2">
                      No blocks yet — save one or import a PYQ PDF.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {questions.flatMap((q, i) => {
                        const qNum = questionNumberAt(i);
                        const invalid = !q.isValid;
                        const active = editingId === q.id;

                        if (q.type === "comprehension" && q.inputMode === "form" && q.subQuestions.length > 0) {
                          // Expand each sub-question into its own chip
                          return q.subQuestions.map((sq, si) => {
                            const n = qNum + si;
                            const subType = sq.type === "single_correct" ? "C-SC"
                              : sq.type === "multi_correct" ? "C-MC"
                              : "C-INT";
                            const subColor = sq.type === "single_correct"
                              ? "border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                              : sq.type === "multi_correct"
                              ? "border-purple-500/40 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20"
                              : "border-orange-500/40 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20";
                            return (
                              <button
                                key={`${q.id}-sq-${sq.id}`}
                                onClick={() => loadQuestion(q, true)}
                                title={`Q${n} · Comprehension sub-question (${subType})`}
                                aria-label={`Open comprehension block containing Q${n}`}
                                className={`h-9 min-w-[44px] px-1.5 rounded border text-[10px] font-medium transition-colors flex flex-col items-center justify-center leading-none gap-0.5 ${
                                  invalid
                                    ? `bg-red-500/20 border-red-500 text-red-400 hover:bg-red-500/30 ${active ? "ring-1 ring-emerald-500" : ""}`
                                    : active
                                    ? `ring-1 ring-emerald-500 ${subColor}`
                                    : subColor
                                }`}
                              >
                                <span className="tabular-nums text-[11px]">{n}</span>
                                <span className="opacity-80">{subType}</span>
                              </button>
                            );
                          });
                        }

                        // Regular (non-comprehension) chip
                        const typeKey = q.type as string;
                        const abbr = typeKey === "single" ? "SC"
                          : typeKey === "multi" ? "MC"
                          : typeKey === "numerical" ? "INT"
                          : "CMP";
                        const chipColor = typeKey === "single"
                          ? "border-blue-500/40 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
                          : typeKey === "multi"
                          ? "border-purple-500/40 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20"
                          : typeKey === "numerical"
                          ? "border-orange-500/40 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20"
                          : "border-teal-500/40 bg-teal-500/10 text-teal-400 hover:bg-teal-500/20";

                        return [(
                          <button
                            key={q.id}
                            onClick={() => loadQuestion(q, true)}
                            title={`Q${qNum} · ${typeLabel(q.type)}${invalid ? ` — ${q.issues.length} issue${q.issues.length === 1 ? "" : "s"}` : ""}`}
                            aria-label={`Open question ${qNum}${invalid ? " (needs review)" : ""}`}
                            className={`h-9 min-w-[44px] px-1.5 rounded border text-[10px] font-medium transition-colors flex flex-col items-center justify-center leading-none gap-0.5 ${
                              invalid
                                ? `bg-red-500/20 border-red-500 text-red-400 hover:bg-red-500/30 ${active ? "ring-1 ring-emerald-500" : ""}`
                                : active
                                ? `ring-1 ring-emerald-500 ${chipColor}`
                                : chipColor
                            }`}
                          >
                            <span className="tabular-nums text-[11px]">{qNum}</span>
                            <span className="opacity-80">{abbr}</span>
                          </button>
                        )];
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Workspace toolbar — Preview now lives in the section header,
              next to Publish, so it works without expanding the section at
              all; nothing left to duplicate here. ────────────────────── */}
          <div className="flex items-center">
            <button onClick={() => setShowPdf((v) => !v)} className={primaryBtnClass}>
              {showPdf ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
              {showPdf ? "Hide PDF" : "Show PDF"}
            </button>
          </div>

          {/* ── Split-screen workspace ───────────────────────────────── */}
          <div className={`flex flex-col lg:flex-row items-stretch ${showPdf ? "gap-4" : "gap-0"}`}>
            <div className={`w-full min-w-0 transition-[width] duration-300 ease-out ${showPdf ? "lg:w-3/5" : "lg:w-full"}`}>
              <div className="space-y-3">
                {questions.map((q, i) => {
                  const isEditing = editingId === q.id;
                  const isPreviewing = previewId === q.id;
                  const rawText = q.type === "comprehension" ? q.passage : q.stem;
                  const summary = q.type === "comprehension"
                    ? (firstLine(q.passage) || "Comprehension passage")
                    : (firstLine(q.stem) || firstLine(q.latex) || "Untitled question");
                  // A question whose stem is nothing but a figure reference reads
                  // as the same generic "Question figure" text on every row —
                  // indistinguishable at a glance. Showing the actual crop instead
                  // is what makes a long list of these actually scannable.
                  const thumb = !rawText.replace(/!\[[^\]]*\]\(asset-[A-Za-z0-9]+\)/g, "").trim()
                    ? q.assets[0]?.src
                    : undefined;
                  return (
                    <div key={q.id} ref={(el) => { itemRefs.current[q.id] = el; }} className="scroll-mt-4">
                      {isEditing ? editorEl : isPreviewing ? (
                        <div className="border border-border rounded-md bg-card">
                          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border">
                            <div className="flex items-center gap-1">
                              <button onClick={() => i > 0 && previewQuestionAt(questions[i - 1].id)}
                                disabled={i === 0} title="Previous question"
                                className="h-7 w-7 inline-flex items-center justify-center rounded text-gray-400 hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400">
                                <ChevronLeft className="h-4 w-4" />
                              </button>
                              <p className="text-[13px] font-medium">Question {questionLabelAt(i, q)}</p>
                              <button onClick={() => i < questions.length - 1 && previewQuestionAt(questions[i + 1].id)}
                                disabled={i === questions.length - 1} title="Next question"
                                className="h-7 w-7 inline-flex items-center justify-center rounded text-gray-400 hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400">
                                <ChevronRight className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => loadQuestion(q)} title="Edit question"
                                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                                <Pencil className="h-3 w-3" /> Edit
                              </button>
                              <button onClick={() => setPreviewId(null)} title="Close preview"
                                className="h-7 w-7 inline-flex items-center justify-center rounded text-gray-400 hover:text-foreground hover:bg-secondary transition-colors">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="p-4">
                            <QuestionBlock question={q} startNumber={questionNumberAt(i)} bare />
                          </div>
                        </div>
                      ) : (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => previewQuestionAt(q.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); previewQuestionAt(q.id); }
                          }}
                          title="Preview this question"
                          className={`border rounded-md bg-card transition-colors hover:bg-secondary/60 cursor-pointer ${!q.isValid ? "border-red-500" : "border-border"}`}
                        >
                          <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`shrink-0 h-6 min-w-6 px-1 rounded border flex items-center justify-center text-[11px] font-medium tabular-nums ${!q.isValid ? "border-red-600 bg-red-500 text-white" : "border-border bg-secondary"}`}>
                                {questionLabelAt(i, q)}
                              </span>
                              {thumb && (
                                <img src={thumb} alt="" aria-hidden="true"
                                  className="shrink-0 h-8 w-8 rounded border border-border object-contain bg-card p-0.5 dark:invert dark:hue-rotate-180" />
                              )}
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
                              <button onClick={(e) => { e.stopPropagation(); loadQuestion(q); }} title="Edit question"
                                className="inline-flex items-center gap-1 rounded px-2 py-1 text-[12px] text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors">
                                <Pencil className="h-3 w-3" /> Edit
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); removeQuestion(q.id); }} title="Remove question"
                                aria-label={`Remove question ${questionLabelAt(i, q)}`}
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

                {editingId === null && editorEl}
              </div>
            </div>

            {showPdf && (
              // Matches the question column's own height (via the parent's
              // `items-stretch`) rather than capping to the viewport — sticky
              // positioning could only ever show one viewport's worth, which
              // read as short next to a much taller column.
              <div className="w-full lg:w-2/5 shrink-0 flex">
                <div className="border border-border rounded-md bg-card w-full flex flex-col">
                  <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border shrink-0">
                    <p className="text-[13px] font-medium truncate">
                      {pdfName ?? "PYQ Reference PDF"}
                    </p>
                    <button onClick={() => setShowPdf(false)} title="Hide PDF"
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary hover:bg-muted px-2.5 py-1 text-[12px] font-medium transition-colors">
                      <PanelRightClose className="h-3.5 w-3.5" /> Hide
                    </button>
                  </div>

                  {pdfUrl ? (
                    <div className="ghost-scroll flex-1 min-h-[320px] bg-card">
                      {/* `#page=N` is the one thing a plain iframe embedding the
                          browser's own PDF viewer can be told from outside — it
                          jumps straight there (not an animated scroll; that
                          viewer isn't ours to animate) and leaves manual
                          scrolling and zoom to the viewer as normal. */}
                      <iframe
                        key={pdfPage}
                        src={`${pdfUrl}#page=${pdfPage}&toolbar=0&navpanes=0`}
                        title="PYQ reference PDF"
                        className="w-full h-full border-0 bg-card"
                      />
                    </div>
                  ) : (
                    <div className="flex-1 min-h-[320px] flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <p className="text-[13px] font-medium">No source PDF for this subject</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
