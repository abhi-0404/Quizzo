import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileUp, Loader2, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { extractPdf, PageRenderer } from "@/lib/pdf-extract";
import { attachAssets, narrowToCourse, parseTcsIonPaper } from "@/lib/parse-tcs-ion";
import {
  durationForExamType,
  headingsOf,
  inferExamType,
  mergeSitting,
  parsePaperFilename,
  sittingDateConflict,
  termForDate,
  type ExamType,
  type MergedSitting,
  type MergeInput,
} from "@/lib/pyq-ingest";
import {
  createCourseForHeading,
  loadCourseCatalog,
  mapHeadingToCourse,
  publishSitting,
  type CourseCatalog,
  type CourseLevel,
} from "@/lib/pyq-publish";
import { SCHEDULE_SEED } from "@/data/schedule";
import type { Question } from "@/data/questions";

/**
 * Import a whole exam sitting from its TCS iON PDFs.
 *
 * One PDF only ever holds one cohort's slice of a sitting, and several exam
 * codes of the same cohort are duplicates of each other, so the flow is: drop
 * every PDF for the date, union the courses, collapse duplicates, and publish.
 *
 * Parsing, cropping and hashing all happen in the browser — no upload of the
 * source PDF, no OCR service, no API key. Only the extracted questions and
 * figures reach the database.
 */

type Phase = "idle" | "reading" | "review" | "publishing" | "done";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Also allows loading one course into the builder for hand-editing. */
  onLoadIntoBuilder?: (questions: Question[], courseName: string) => void;
}

const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 " +
  "text-[12px] font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50";
const primary =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[12px] " +
  "font-medium text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors";
const field =
  "h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground";

/** The seeded academic calendar, flattened for date-based exam-type inference. */
const SCHEDULE = SCHEDULE_SEED.flatMap((entry) =>
  entry.assessments
    .filter((a) => a.date)
    .map((a) => ({
      examType: (/end/i.test(a.name) ? "end_term" : /2/.test(a.name) ? "quiz_2" : "quiz_1") as ExamType,
      date: a.date,
    }))
);

const EXAM_TYPES: { value: ExamType; label: string }[] = [
  { value: "quiz_1", label: "Quiz 1" },
  { value: "quiz_2", label: "Quiz 2" },
  { value: "end_term", label: "End Term" },
];
const LEVELS: CourseLevel[] = ["foundation", "diploma", "degree"];

function Bar({ value }: { value: number }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded bg-muted">
      <div
        className="h-full bg-foreground transition-[width] duration-150"
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  );
}

export function PyqImport({ open, onOpenChange, onLoadIntoBuilder }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [sitting, setSitting] = useState<MergedSitting | null>(null);
  const [examType, setExamType] = useState<ExamType>("quiz_1");
  const [catalog, setCatalog] = useState<CourseCatalog | null>(null);
  /** Normalised heading → course id chosen for it. */
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<string | null>(null);

  const buffers = useRef<ArrayBuffer[]>([]);
  const inputs = useRef<MergeInput[]>([]);

  const reset = useCallback(() => {
    setPhase("idle");
    setProgress(0);
    setNote("");
    setError(null);
    setSitting(null);
    setCatalog(null);
    setMapping({});
    setSelected(new Set());
    setSummary(null);
    buffers.current = [];
    inputs.current = [];
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  /* ── Read ──────────────────────────────────────────────────────────────── */

  const readFiles = async (files: File[]) => {
    setError(null);
    setPhase("reading");
    setProgress(0);

    const unnamed: string[] = [];
    const collected: MergeInput[] = [];
    const bufs: ArrayBuffer[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const meta = parsePaperFilename(file.name);
        if (!meta) {
          unnamed.push(file.name);
          continue;
        }
        setNote(`Reading ${file.name} (${i + 1} of ${files.length})`);
        const buf = await file.arrayBuffer();
        const extract = await extractPdf(buf, (done, total) => {
          setProgress((i + done / total) / files.length);
        });
        collected.push({ file: meta, paper: parseTcsIonPaper(extract, file.name) });
        bufs.push(buf);
      }

      if (collected.length === 0) {
        setError(
          unnamed.length
            ? `None of those filenames follow the expected pattern, for example "IIT M DEGREE FN EXAM QDB1 31 Aug 2025.pdf". Unrecognised: ${unnamed.join(", ")}`
            : "No PDFs selected."
        );
        setPhase("idle");
        return;
      }

      const dates = sittingDateConflict(collected);
      if (dates.length > 1) {
        setError(
          `Those PDFs span more than one date (${dates.join(", ")}). A sitting is a single date — import them separately.`
        );
        setPhase("idle");
        return;
      }

      inputs.current = collected;
      buffers.current = bufs;

      const merged = mergeSitting(collected);
      setSitting(merged);
      setExamType(inferExamType(merged.date, SCHEDULE) ?? "quiz_1");
      setSelected(new Set(merged.papers.map((p) => p.normalisedHeading)));

      setNote("Matching courses");
      const cat = await loadCourseCatalog();
      setCatalog(cat);
      const initial: Record<string, string> = {};
      for (const h of headingsOf(merged)) {
        const hit = cat.byAlias.get(h);
        if (hit) initial[h] = hit.id;
      }
      setMapping(initial);

      if (unnamed.length) {
        setError(`Skipped ${unnamed.length} file(s) whose name did not parse: ${unnamed.join(", ")}`);
      }
      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read those PDFs.");
      setPhase("idle");
    }
  };

  /* ── Course mapping ────────────────────────────────────────────────────── */

  const chooseCourse = async (heading: string, courseId: string) => {
    setMapping((m) => ({ ...m, [heading]: courseId }));
    try {
      // Remember it, so the next paper using this abbreviation resolves itself.
      await mapHeadingToCourse(heading, courseId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that course mapping.");
    }
  };

  const createCourse = async (heading: string, name: string, level: CourseLevel) => {
    try {
      const course = await createCourseForHeading(heading, name, level);
      setCatalog((c) => (c ? { ...c, courses: [...c.courses, course].sort((a, b) => a.name.localeCompare(b.name)) } : c));
      setMapping((m) => ({ ...m, [heading]: course.id }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create that course.");
    }
  };

  /* ── Publish ───────────────────────────────────────────────────────────── */

  const publish = async () => {
    if (!sitting) return;
    setPhase("publishing");
    setError(null);
    setProgress(0);

    const renderers = buffers.current.map((b) => new PageRenderer(b));
    try {
      // Crop each selected paper's figures from the PDF it came from.
      const wanted = sitting.papers.filter((p) => selected.has(p.normalisedHeading) && mapping[p.normalisedHeading]);
      for (let i = 0; i < wanted.length; i++) {
        const paper = wanted[i];
        setNote(`Extracting figures for ${paper.sourceHeading}`);
        setProgress(i / Math.max(1, wanted.length) / 2);

        const source = inputs.current[paper.sourceFileIndex];
        const courseIndex = source.paper.courses.findIndex((c) => c.name === paper.sourceHeading);
        if (courseIndex < 0) continue;
        const narrowed = narrowToCourse(source.paper, courseIndex);
        await attachAssets(narrowed, renderers[paper.sourceFileIndex]);
        paper.questions = narrowed.courses[0].questions;
      }

      setNote("Publishing");
      const result = await publishSitting({
        sitting,
        examType,
        courseByHeading: new Map(Object.entries(mapping)),
        selected,
        onProgress: (done, total, label) => {
          setProgress(0.5 + (total ? done / total : 1) / 2);
          setNote(`Publishing ${label}`);
        },
      });

      setSummary(
        `Published ${result.publishedCourses} paper${result.publishedCourses === 1 ? "" : "s"} ` +
          `with ${result.figures} figure${result.figures === 1 ? "" : "s"}.` +
          (result.skipped.length ? ` Skipped ${result.skipped.length} unmapped.` : "")
      );
      setPhase("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publishing failed.");
      setPhase("review");
    } finally {
      await Promise.all(renderers.map((r) => r.destroy().catch(() => undefined)));
    }
  };

  /* ── Render ────────────────────────────────────────────────────────────── */

  const busy = phase === "reading" || phase === "publishing";
  const headings = sitting ? headingsOf(sitting) : [];
  const unmapped = headings.filter((h) => !mapping[h]);
  const publishable = useMemo(
    () => (sitting ? sitting.papers.filter((p) => selected.has(p.normalisedHeading) && mapping[p.normalisedHeading]) : []),
    [sitting, selected, mapping]
  );

  return (
    <Dialog open={open} onOpenChange={busy ? () => undefined : onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogTitle className="text-[15px] font-semibold">Import an exam sitting</DialogTitle>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 dark:border-amber-900 dark:bg-[#1E1707] dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {phase === "idle" && (
          <div className="space-y-3">
            <p className="text-[13px] text-muted-foreground">
              Select every PDF for one exam date — all cohorts and all exam codes. Duplicate codes are
              collapsed automatically; different cohorts are kept as separate papers, because they
              genuinely differ. Nothing is uploaded but the extracted questions and figures.
            </p>
            <label
              htmlFor="pyq-import-files"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-card px-4 py-10 text-center hover:bg-secondary transition-colors"
            >
              <FileUp className="h-5 w-5 text-muted-foreground" />
              <span className="text-[13px] font-medium">Choose exam PDFs</span>
              <span className="text-[11px] text-muted-foreground">
                Named like &ldquo;IIT M DEGREE FN EXAM QDB1 31 Aug 2025.pdf&rdquo;
              </span>
            </label>
            <input
              id="pyq-import-files"
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length) void readFiles(files);
              }}
            />
          </div>
        )}

        {busy && (
          <div className="space-y-3 py-6">
            <div className="flex items-center gap-2 text-[13px]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{note}</span>
            </div>
            <Bar value={progress} />
            <p className="text-[11px] text-muted-foreground">
              {phase === "reading"
                ? "Every page is scanned for text and for the colour that carries the answer key."
                : "Figures are cropped from their page, then the papers are written and published."}
            </p>
          </div>
        )}

        {phase === "review" && sitting && catalog && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                Exam date
                <input className={field} value={sitting.date} readOnly />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                Exam type
                <select
                  className={field}
                  value={examType}
                  onChange={(e) => setExamType(e.target.value as ExamType)}
                >
                  {EXAM_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                Term
                <input className={field} value={termForDate(sitting.date).term} readOnly />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                Duration / course
                <input className={field} value={`${durationForExamType(examType)} min`} readOnly />
              </label>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
              <span>{sitting.stats.files} PDFs</span>
              <span>{sitting.papers.length} papers</span>
              <span>{sitting.stats.duplicates} duplicate codes collapsed</span>
              {sitting.stats.variants > 0 && <span>{sitting.stats.variants} variants kept</span>}
              {unmapped.length > 0 && (
                <span className="text-amber-700 dark:text-amber-400">{unmapped.length} unmapped courses</span>
              )}
            </div>

            <div className="ghost-scroll max-h-[380px] overflow-y-auto rounded-md border border-border">
              <table className="w-full border-collapse text-[13px]">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="border-b border-border px-2 py-2 w-8" />
                    <th className="border-b border-border px-3 py-2 text-left font-medium">Heading</th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">Course</th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">Cohort</th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">Codes</th>
                    <th className="border-b border-border px-3 py-2 text-right font-medium">Q</th>
                    <th className="border-b border-border px-3 py-2 text-right font-medium">Marks</th>
                    <th className="border-b border-border px-3 py-2 text-right font-medium">Review</th>
                  </tr>
                </thead>
                <tbody>
                  {sitting.papers.map((p) => {
                    const on = selected.has(p.normalisedHeading);
                    const courseId = mapping[p.normalisedHeading] ?? "";
                    return (
                      <tr key={`${p.normalisedHeading}-${p.programme}-${p.contentHash}`}>
                        <td className="border-b border-border px-2 py-1.5">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) =>
                              setSelected((s) => {
                                const next = new Set(s);
                                if (e.target.checked) next.add(p.normalisedHeading);
                                else next.delete(p.normalisedHeading);
                                return next;
                              })
                            }
                          />
                        </td>
                        <td className="border-b border-border px-3 py-1.5">
                          {p.sourceHeading}
                          {p.variantLabel && (
                            <span className="ml-1.5 text-[11px] text-muted-foreground">{p.variantLabel}</span>
                          )}
                        </td>
                        <td className="border-b border-border px-3 py-1.5">
                          <select
                            className={`${field} w-full`}
                            value={courseId}
                            onChange={(e) => {
                              if (e.target.value === "__new__") {
                                void createCourse(p.normalisedHeading, p.sourceHeading, "degree");
                              } else if (e.target.value) {
                                void chooseCourse(p.normalisedHeading, e.target.value);
                              }
                            }}
                          >
                            <option value="">— pick a course —</option>
                            {catalog.courses.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                            <option value="__new__">+ create &ldquo;{p.sourceHeading}&rdquo;</option>
                          </select>
                        </td>
                        <td className="border-b border-border px-3 py-1.5 capitalize">
                          {p.programme} · {p.slot.toUpperCase()}
                        </td>
                        <td className="border-b border-border px-3 py-1.5 text-[12px] text-muted-foreground">
                          {p.sourceCodes.join(", ")}
                        </td>
                        <td className="border-b border-border px-3 py-1.5 text-right tabular-nums">
                          {p.questionCount}
                        </td>
                        <td className="border-b border-border px-3 py-1.5 text-right tabular-nums">
                          {p.totalMarks}
                        </td>
                        <td className="border-b border-border px-3 py-1.5 text-right tabular-nums">
                          {p.flagged ? (
                            <span className="text-amber-700 dark:text-amber-400">{p.flagged}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground">
                New courses are created unconfirmed — set the right name and level afterwards. A course
                you pick here is remembered as an alias, so the next paper resolves it on its own.
              </p>
              <div className="flex shrink-0 items-center gap-2">
                {onLoadIntoBuilder && publishable.length === 1 && (
                  <button
                    className={btn}
                    onClick={() => {
                      onLoadIntoBuilder(publishable[0].questions, publishable[0].sourceHeading);
                      onOpenChange(false);
                    }}
                  >
                    Open in builder
                  </button>
                )}
                <button className={primary} disabled={publishable.length === 0} onClick={() => void publish()}>
                  <Upload className="h-3.5 w-3.5" />
                  Publish {publishable.length} paper{publishable.length === 1 ? "" : "s"}
                </button>
              </div>
            </div>

            {LEVELS.length === 0 && <span />}
          </div>
        )}

        {phase === "done" && (
          <div className="space-y-3 py-6">
            <p className="text-[13px]">{summary}</p>
            <button className={btn} onClick={() => onOpenChange(false)}>Close</button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
