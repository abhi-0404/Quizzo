import { useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ChevronDown, ChevronRight, Clock, FileUp, RotateCcw, Trash2, X } from "lucide-react";
import { formatDate } from "@/data/schedule";
import type { Question } from "@/data/questions";
import { PaperPreview } from "@/components/PaperPreview";
import { PyqImport, type BuilderCourse } from "@/components/PyqImport";
import { PaperSection, type PreviewRequest, type UniversalContext } from "@/components/PaperSection";
import {
  DEGREES, TERM_LABELS, EXAMS, SHIFTS,
} from "@/pages/paper-builder-taxonomy";
import { selectClass, textInputClass, primaryBtnClass } from "@/pages/paper-builder-styles";
import {
  useDraft,
  type DraftGroupState as GroupState,
  type DraftSectionState as SectionState,
  type DraftGroupUniversal as GroupUniversal,
} from "@/hooks/use-draft";

let nextSectionId = 1;
let nextGroupId = 1;

function blankUniversal(): GroupUniversal {
  return { degree: "", term: "", exam: "", shift: "", examDate: "", examCode: "" };
}

function groupDuration(exam: string): string {
  if (exam === "Quiz 1" || exam === "Quiz 2") return "1 Hour";
  if (exam === "End Term") return "1.5 Hours";
  return "—";
}

export default function CreateContent() {
  const { toast } = useToast();

  const [groups, setGroups] = useState<GroupState[]>([]);
  const [pyqOpen, setPyqOpen] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewRequest & { groupId: string } | null>(null);
  const [draftBannerDismissed, setDraftBannerDismissed] = useState(false);

  const { restoreChecked, hasDraft, savedAt, clearDraft } = useDraft(groups, setGroups);

  /* ── Group mutations ─────────────────────────────────────────────────── */

  const setGroupField = (groupId: string, patch: Partial<GroupUniversal>) =>
    setGroups((prev) =>
      prev.map((g) => g.id === groupId ? { ...g, universal: { ...g.universal, ...patch } } : g)
    );

  const toggleGroupContext = (groupId: string) =>
    setGroups((prev) =>
      prev.map((g) => g.id === groupId ? { ...g, contextOpen: !g.contextOpen } : g)
    );

  const removeGroup = (groupId: string) =>
    setGroups((prev) => prev.filter((g) => g.id !== groupId));

  const updateSection = (groupId: string, sectionId: string, patch: Partial<SectionState>) =>
    setGroups((prev) =>
      prev.map((g) =>
        g.id !== groupId ? g : {
          ...g,
          sections: g.sections.map((s) => s.id === sectionId ? { ...s, ...patch } : s),
        }
      )
    );

  const removeSection = (groupId: string, sectionId: string) =>
    setGroups((prev) =>
      prev.map((g) =>
        g.id !== groupId ? g : { ...g, sections: g.sections.filter((s) => s.id !== sectionId) }
      ).filter((g) => g.sections.length > 0)
    );

  /* ── Import handler ──────────────────────────────────────────────────── */

  const importCourses = (courses: BuilderCourse[]) => {
    const meta = courses[0];
    const universal: GroupUniversal = {
      degree: "",
      term: "",
      exam: "",
      shift: meta?.shift ?? "",
      examDate: meta?.examDate ?? "",
      examCode: meta?.examCode ?? "",
    };

    const sections: SectionState[] = courses.map((c) => ({
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

    const group: GroupState = {
      id: `g-${nextGroupId++}`,
      universal,
      contextOpen: true,   // open by default so admin sees the empty fields
      sections,
    };

    // Prepend — newest import on top
    setGroups((prev) => [group, ...prev]);

    const flagged = courses.reduce((n, c) => n + c.questions.filter((q) => !q.isValid).length, 0);
    toast({
      title: `Imported ${courses.length} paper${courses.length === 1 ? "" : "s"}`,
      description: flagged
        ? `${flagged} question${flagged === 1 ? "" : "s"} need review.`
        : "Every question came through with its answer key.",
      variant: flagged ? "destructive" : undefined,
    });
  };

  /* ── Preview ─────────────────────────────────────────────────────────── */

  const activeGroup = previewData
    ? groups.find((g) => g.id === previewData.groupId)
    : null;

  if (previewData && activeGroup) {
    const u = activeGroup.universal;
    const examYear = u.examDate ? u.examDate.slice(0, 4) : "";
    const headerLine = `${u.exam || "Exam"} | ${u.term || "Term"}${examYear ? ` - ${examYear}` : ""}`;
    return (
      <PaperPreview
        subject={previewData.subject}
        headerLine={headerLine}
        dateLabel={u.examDate ? formatDate(u.examDate) : "Not scheduled"}
        duration={groupDuration(u.exam)}
        totalQuestions={previewData.totalQuestions}
        totalMarks={previewData.totalMarks}
        programmeLine={`${u.degree || "—"} · ${previewData.level}`}
        questions={previewData.questions}
        onBack={() => setPreviewData(null)}
        onRun={previewData.onRun}
      />
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* ── Header bar ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-center px-4 md:px-6 h-11 border-b border-border shrink-0">
          <button onClick={() => setPyqOpen(true)} className={primaryBtnClass}>
            <FileUp className="h-3.5 w-3.5" /> Import PYQ PDF
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="p-4 md:p-6 space-y-6 max-w-[1600px]">

            {groups.length === 0 && (
              <div className="border border-dashed border-border rounded-md py-10 text-center">
                <p className="text-[13px] text-muted-foreground">
                  No subjects yet — import a PYQ PDF to get started.
                </p>
              </div>
            )}

            {groups.map((group) => {
              const u = group.universal;
              const duration = groupDuration(u.exam);
              const universalContext: UniversalContext = {
                degree: u.degree,
                term: u.term,
                exam: u.exam,
                shift: u.shift as "FN" | "AN",
                examCode: u.examCode,
                examDate: u.examDate || null,
                duration,
              };

              return (
                <div key={group.id} className="border border-border rounded-md bg-card">

                  {/* ── Group: Exam Context Settings ──────────────────── */}
                  <div className="border-b border-border">
                    <button
                      onClick={() => toggleGroupContext(group.id)}
                      aria-expanded={group.contextOpen}
                      className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-secondary transition-colors rounded-t-md"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-[13px] font-medium shrink-0">Exam Context Settings</span>
                        <span className="text-[12px] text-muted-foreground truncate">
                          {group.sections.length} paper{group.sections.length === 1 ? "" : "s"}
                          {u.exam ? ` · ${u.exam}` : ""}
                          {u.term ? ` · ${u.term}` : ""}
                        </span>
                        {!u.examDate && (
                          <span
                            title="Exam date is required before any paper here can be published"
                            className="inline-flex items-center gap-1 rounded border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-[#1E1707] px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400 shrink-0"
                          >
                            <AlertTriangle className="h-3 w-3" /> Exam date needed
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); removeGroup(group.id); }}
                          title="Remove this entire import"
                          className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        {group.contextOpen
                          ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </span>
                    </button>

                    {group.contextOpen && (
                      <div className="px-4 pb-4 pt-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <label className="block text-[12px] text-muted-foreground">Degree</label>
                            <select value={u.degree}
                              onChange={(e) => setGroupField(group.id, { degree: e.target.value })}
                              className={selectClass}>
                              <option value="">— select —</option>
                              {DEGREES.map((d) => <option key={d} value={d}>{d}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-[12px] text-muted-foreground">Term</label>
                            <select value={u.term}
                              onChange={(e) => setGroupField(group.id, { term: e.target.value })}
                              className={selectClass}>
                              <option value="">— select —</option>
                              {TERM_LABELS.map((t) => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-[12px] text-muted-foreground">Exam</label>
                            <select value={u.exam}
                              onChange={(e) => setGroupField(group.id, { exam: e.target.value })}
                              className={selectClass}>
                              <option value="">— select —</option>
                              {EXAMS.map((x) => <option key={x} value={x}>{x}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-[12px] text-muted-foreground">Shift</label>
                            <select value={u.shift}
                              onChange={(e) => setGroupField(group.id, { shift: e.target.value as "FN" | "AN" | "" })}
                              className={selectClass}>
                              <option value="">— select —</option>
                              {SHIFTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="block text-[12px] text-muted-foreground">Exam Date</label>
                            <input type="date" value={u.examDate}
                              onChange={(e) => setGroupField(group.id, { examDate: e.target.value })}
                              className={textInputClass} />
                          </div>
                          <div className="space-y-1">
                            <label className="block text-[12px] text-muted-foreground">Exam Code</label>
                            <input value={u.examCode}
                              onChange={(e) => setGroupField(group.id, { examCode: e.target.value.toUpperCase() })}
                              placeholder="e.g. QDB1" className={textInputClass} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── Group: Subject sections ────────────────────────── */}
                  <div className="divide-y divide-border">
                    {group.sections.map((s) => (
                      <PaperSection
                        key={s.id}
                        subject={s.subject}
                        level={s.level}
                        onSubjectChange={(subject) => updateSection(group.id, s.id, { subject })}
                        onLevelChange={(level) => updateSection(group.id, s.id, { level })}
                        initialQuestions={s.initialQuestions}
                        initialPdfBlob={s.initialPdfBlob}
                        initialPdfName={s.initialPdfName}
                        initialPdfStartPage={s.initialPdfStartPage}
                        initialQuestionPages={s.initialQuestionPages}
                        collapsed={s.collapsed}
                        onToggleCollapsed={() => updateSection(group.id, s.id, { collapsed: !s.collapsed })}
                        onRemove={() => removeSection(group.id, s.id)}
                        universal={universalContext}
                        onPreview={(req) => setPreviewData({ ...req, groupId: group.id })}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── PYQ PDF importer ───────────────────────────────────────────── */}
      <PyqImport open={pyqOpen} onOpenChange={setPyqOpen} onLoadIntoBuilder={importCourses} />
    </AppLayout>
  );
}
