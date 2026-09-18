import { useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ChevronDown, ChevronRight, FileUp } from "lucide-react";
import { formatDate } from "@/data/schedule";
import type { Question } from "@/data/questions";
import { PaperPreview } from "@/components/PaperPreview";
import { PyqImport, type BuilderCourse } from "@/components/PyqImport";
import { PaperSection, type PreviewRequest } from "@/components/PaperSection";
import {
  DEGREES, TERM_LABELS, EXAMS, SHIFTS,
} from "@/pages/paper-builder-taxonomy";
import { selectClass, textInputClass, primaryBtnClass } from "@/pages/paper-builder-styles";

/**
 * Fields that describe the whole sitting rather than any one course in it —
 * one PDF import routinely carries several courses, and a degree/term/shift/
 * date cannot differ between them within a single sitting. Level and subject
 * are the two fields that genuinely differ per course, so they live on each
 * [[PaperSection]] instead.
 *
 * No separate `year` field — the exam date is the thing actually typed in,
 * and a year is just its first four characters; keeping a second field for
 * it only invited the two to disagree.
 */
interface Universal {
  degree: string;
  term: string;
  exam: string;
  shift: "FN" | "AN";
  /** ISO "YYYY-MM-DD", typed in directly — nothing derives it any more. */
  examDate: string;
}

/** One subject's paper. `collapsed` and identity live here; everything else lives inside PaperSection. */
interface SectionState {
  id: string;
  subject: string;
  level: string;
  initialQuestions?: Question[];
  initialPdfBlob?: Blob;
  initialPdfName?: string;
  initialPdfStartPage?: number;
  initialQuestionPages?: (number | undefined)[];
  collapsed: boolean;
}

let nextSectionId = 1;

export default function CreateContent() {
  const { toast } = useToast();

  const [universal, setUniversal] = useState<Universal>({
    degree: DEGREES[0],
    term: "Jan Term",
    exam: "Quiz 1",
    shift: "FN",
    examDate: "",
  });
  // Free-form (exam codes like "QDB1" have nothing to validate against) and
  // not part of Universal because nothing downstream consumes it yet.
  const [examCode, setExamCode] = useState("");
  const [contextOpen, setContextOpen] = useState(false);

  // No subject pre-seeded — an admin who opens this page with nothing to
  // author yet should see nothing to author yet, not a blank "Statistics I"
  // they have to notice and either fill in or discard.
  const [sections, setSections] = useState<SectionState[]>([]);

  const [pyqOpen, setPyqOpen] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewRequest | null>(null);

  const setUniversalField = <K extends keyof Universal>(key: K, value: Universal[K]) =>
    setUniversal((prev) => ({ ...prev, [key]: value }));

  /** Quiz 1 / Quiz 2 → 1 Hour · End Term → 1.5 Hours */
  const duration = useMemo(() => {
    const e = universal.exam;
    if (e === "Quiz 1" || e === "Quiz 2") return "1 Hour";
    if (e === "End Term") return "1.5 Hours";
    return "—";
  }, [universal.exam]);

  const universalContext = useMemo(
    () => ({
      degree: universal.degree, term: universal.term, exam: universal.exam, shift: universal.shift,
      examCode, examDate: universal.examDate || null, duration,
    }),
    [universal, examCode, duration]
  );

  const updateSection = (id: string, patch: Partial<SectionState>) =>
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const removeSection = (id: string) =>
    setSections((prev) => prev.filter((s) => s.id !== id));

  /**
   * Append courses imported from a TCS iON PDF, one new section per course.
   *
   * Always appended — never replaces or auto-merges into an existing
   * section — and new sections start collapsed, so a multi-course import
   * lands as a tidy closed list the admin opens one at a time.
   */
  const importCourses = (courses: BuilderCourse[]) => {
    const created = courses.map((c) => ({
      id: `s-${nextSectionId++}`,
      subject: c.courseName,
      level: c.level,
      initialQuestions: c.questions,
      initialPdfBlob: c.pdfBlob,
      initialPdfName: c.pdfName,
      initialPdfStartPage: c.pdfStartPage,
      initialQuestionPages: c.questionPages,
      collapsed: true,
    }));
    setSections((prev) => [...prev, ...created]);

    const flagged = courses.reduce((n, c) => n + c.questions.filter((q) => !q.isValid).length, 0);
    toast({
      title: `Imported ${courses.length} paper${courses.length === 1 ? "" : "s"}`,
      description: flagged
        ? `${flagged} question${flagged === 1 ? "" : "s"} need review — open the relevant subject to see why.`
        : "Every question came through with its answer key.",
      variant: flagged ? "destructive" : undefined,
    });
  };

  // The year shown here is read straight off the date — nothing separately tracks it.
  const examYear = universal.examDate ? universal.examDate.slice(0, 4) : "";
  const headerLine = previewData
    ? `${universal.exam} | ${universal.term}${examYear ? ` - ${examYear}` : ""}`
    : "";

  // Rendered outside AppLayout so the global sidebar is absent entirely —
  // a focused, isolated reading environment rather than a modal over the editor.
  if (previewData) {
    return (
      <PaperPreview
        subject={previewData.subject}
        headerLine={headerLine}
        dateLabel={universal.examDate ? formatDate(universal.examDate) : "Not scheduled"}
        duration={duration}
        totalQuestions={previewData.totalQuestions}
        totalMarks={previewData.totalMarks}
        programmeLine={`${universal.degree} · ${previewData.level}`}
        questions={previewData.questions}
        onBack={() => setPreviewData(null)}
        onRun={previewData.onRun}
      />
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* ── Header bar — same bar Overview uses, button centred instead of
            paired with a title. ─────────────────────────────────────── */}
        <div className="flex items-center justify-center px-4 md:px-6 h-11 border-b border-border shrink-0">
          <button onClick={() => setPyqOpen(true)} className={primaryBtnClass}>
            <FileUp className="h-3.5 w-3.5" /> Import PYQ PDF
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="p-4 md:p-6 space-y-4 max-w-[1600px]">
            {/* ── Collapsible context settings — universal fields only.
                Nothing to set context FOR until a PDF has actually produced
                a subject, so this stays out of the way until then. ────── */}
            {sections.length > 0 && (
              <div className="border border-border rounded-md bg-card">
                <button
                  onClick={() => setContextOpen((v) => !v)}
                  aria-expanded={contextOpen}
                  className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-secondary transition-colors rounded-md"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-[13px] font-medium">Exam Context Settings</span>
                    <span className="text-[12px] text-muted-foreground">
                      {sections.length} paper{sections.length === 1 ? "" : "s"} · {universal.exam} · {universal.term}
                    </span>
                    {!universal.examDate && (
                      <span
                        title="Exam date is required before any paper here can be published"
                        className="inline-flex items-center gap-1 rounded border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-[#1E1707] px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
                      >
                        <AlertTriangle className="h-3 w-3" /> Exam date needed
                      </span>
                    )}
                  </span>
                  {contextOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                               : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </button>

                {contextOpen && (
                  <div className="border-t border-border p-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <label htmlFor="ctx-degree" className="block text-[12px] text-muted-foreground">Degree</label>
                        <select id="ctx-degree" value={universal.degree}
                          onChange={(e) => setUniversalField("degree", e.target.value)} className={selectClass}>
                          {DEGREES.map((d) => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="ctx-term" className="block text-[12px] text-muted-foreground">Term</label>
                        <select id="ctx-term" value={universal.term}
                          onChange={(e) => setUniversalField("term", e.target.value)} className={selectClass}>
                          {TERM_LABELS.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="ctx-exam" className="block text-[12px] text-muted-foreground">Exam</label>
                        <select id="ctx-exam" value={universal.exam}
                          onChange={(e) => setUniversalField("exam", e.target.value)} className={selectClass}>
                          {EXAMS.map((x) => <option key={x} value={x}>{x}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="ctx-shift" className="block text-[12px] text-muted-foreground">Shift</label>
                        <select id="ctx-shift" value={universal.shift}
                          onChange={(e) => setUniversalField("shift", e.target.value as "FN" | "AN")} className={selectClass}>
                          {SHIFTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="ctx-date" className="block text-[12px] text-muted-foreground">Exam Date</label>
                        <input id="ctx-date" type="date" value={universal.examDate}
                          onChange={(e) => setUniversalField("examDate", e.target.value)} className={textInputClass} />
                      </div>
                      <div className="space-y-1">
                        <label htmlFor="ctx-code" className="block text-[12px] text-muted-foreground">Exam Code</label>
                        <input id="ctx-code" value={examCode}
                          onChange={(e) => setExamCode(e.target.value.toUpperCase())}
                          placeholder="e.g. QDB1" className={textInputClass} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Per-subject sections ─────────────────────────────────── */}
            <div className="space-y-3">
              {sections.length === 0 && (
                <div className="border border-dashed border-border rounded-md py-10 text-center">
                  <p className="text-[13px] text-muted-foreground">
                    No subjects yet — import a PYQ PDF to get started.
                  </p>
                </div>
              )}
              {sections.map((s) => (
                <PaperSection
                  key={s.id}
                  subject={s.subject}
                  level={s.level}
                  onSubjectChange={(subject) => updateSection(s.id, { subject })}
                  onLevelChange={(level) => updateSection(s.id, { level })}
                  initialQuestions={s.initialQuestions}
                  initialPdfBlob={s.initialPdfBlob}
                  initialPdfName={s.initialPdfName}
                  initialPdfStartPage={s.initialPdfStartPage}
                  initialQuestionPages={s.initialQuestionPages}
                  collapsed={s.collapsed}
                  onToggleCollapsed={() => updateSection(s.id, { collapsed: !s.collapsed })}
                  onRemove={() => removeSection(s.id)}
                  universal={universalContext}
                  onPreview={setPreviewData}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── PYQ PDF importer ─────────────────────────────────────────────── */}
      <PyqImport open={pyqOpen} onOpenChange={setPyqOpen} onLoadIntoBuilder={importCourses} />
    </AppLayout>
  );
}
