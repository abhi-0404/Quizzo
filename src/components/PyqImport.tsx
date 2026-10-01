import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileUp, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { extractPdf, PageRenderer } from "@/lib/pdf-extract";
import { attachAssets, parseTcsIonPaper, type TcsIonPaper } from "@/lib/parse-tcs-ion";
import {
  mergeSitting,
  parsePaperFilename,
  parsePaperMetaFromText,
  type MergedSitting,
  type MergeInput,
  type PaperFilename,
  type Programme,
  type Slot,
} from "@/lib/pyq-ingest";
import {
  createCourseForHeading,
  loadCourseCatalog,
  mapHeadingToCourse,
  type CourseCatalog,
  type CourseLevel,
} from "@/lib/pyq-publish";
import type { Question } from "@/data/questions";
import { LEVELS } from "@/pages/paper-builder-taxonomy";

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

type Phase = "idle" | "reading" | "review";

/** One PDF, parsed and fully imaged, waiting for a filename or a typed-in date. */
interface PendingFile {
  name: string;
  url: string;
  /** Kept alongside `url` so the builder can be handed an *independent* object
   *  URL of its own at hand-off — `url` itself is revoked by `reset()` as soon
   *  as this dialog closes, which happens right after handing courses off. */
  blob: Blob;
  /** Present when the filename itself follows the naming convention. */
  meta: PaperFilename | null;
  paper: TcsIonPaper;
}

/** One course handed to the builder, ready to become its own paper section. */
export interface BuilderCourse {
  questions: Question[];
  courseName: string;
  level: string;
  /** The source PDF this course was extracted from, so the builder can show
   *  it as a reference without asking the admin to upload it a second time.
   *  A `Blob`, not a ready-made object URL — the builder mints its own URL
   *  from it at mount and owns that URL's whole lifecycle, so nothing this
   *  dialog does on close (it revokes every URL it made) can invalidate it. */
  pdfBlob?: Blob;
  pdfName?: string;
  /** 1-based page where this course's own "Section Id" heading appears in
   *  the source PDF, so the reference pane can open already on that page
   *  instead of page 1 of a possibly 100+ page bulk export. */
  pdfStartPage?: number;
  /** 1-based PDF page for each entry in `questions`, same order, where known
   *  — undefined entries have no page (nothing in the source pinpoints one). */
  questionPages?: (number | undefined)[];
  /** Sitting-level metadata extracted from the PDF — present only when the
   *  PDF or its filename carried it. Undefined means "not found; leave blank". */
  examDate?: string;
  /** "FN" | "AN" — maps to Shift in the builder's Exam Context Settings. */
  shift?: "FN" | "AN";
  /** First exam code seen for this paper (e.g. "QDB1"). */
  examCode?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Also allows loading the selected courses into the builder for hand-editing. */
  onLoadIntoBuilder?: (courses: BuilderCourse[]) => void;
}

/**
 * A TCS iON `Programme` has no "Improvement" counterpart in the builder's own
 * Level taxonomy (Foundation/Diploma/Degree) — an improvement paper is always
 * a redo of a Foundation-level course in this catalog, so that's the safe
 * fallback rather than inventing a fourth level nothing else recognises.
 */
function programmeToLevel(programme: Programme): string {
  switch (programme) {
    case "diploma": return "Diploma";
    case "degree": return "Degree";
    default: return "Foundation";
  }
}

const primary =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[12px] " +
  "font-medium text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors";
const field =
  "h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground";

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
  const [catalog, setCatalog] = useState<CourseCatalog | null>(null);
  /** Normalised heading → course id chosen for it. Optional — an admin can
   *  still open unmapped courses in the builder; this only feeds the alias
   *  catalog for next time. */
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Normalised heading → confirmed level ("Foundation"/"Diploma"/"Degree").
   *  Also what the Course column's options are filtered by. */
  const [levelByHeading, setLevelByHeading] = useState<Record<string, string>>({});

  // Parsed files — held here so the builder can receive their blobs at hand-off.
  const [pending, setPending] = useState<PendingFile[]>([]);

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
    setLevelByHeading({});
    // Functional form so this never closes over a stale `pending` from
    // whatever render defined this callback — every object URL ever created
    // must be revoked, not just the ones that existed on the first render.
    setPending((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.url);
      return [];
    });
    inputs.current = [];
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  /* ── Read ──────────────────────────────────────────────────────────────── */

  /**
   * Figures are cropped here, eagerly, for every course in every file — not
   * only the ones an admin ends up selecting. That used to happen later, only
   * for selected papers, because cropping the ones nobody picks is wasted
   * work. It moved here so the review step can actually show what a question
   * looks like, images included, before anything is published — otherwise
   * "review" is just reading `![Question figure](asset-f3)` as literal text.
   */
  const readFiles = async (files: File[]) => {
    setError(null);
    setPhase("reading");
    setProgress(0);

    const items: PendingFile[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setNote(`Reading ${file.name} (${i + 1} of ${files.length})`);
        const buf = await file.arrayBuffer();
        const extract = await extractPdf(buf, (done, total) => {
          setProgress((i + done / total / 2) / files.length);
        });
        const paper = parseTcsIonPaper(extract, file.name);

        setNote(`Extracting figures from ${file.name}`);
        const renderer = new PageRenderer(buf);
        try {
          await attachAssets(paper, renderer, (done, total) => {
            setProgress((i + 0.5 + done / total / 2) / files.length);
          });
        } finally {
          await renderer.destroy().catch(() => undefined);
        }

        const blob = new Blob([buf], { type: "application/pdf" });
        // The document's own "Question Paper Name :" row first — it survives
        // however the file was renamed — and only then the filename itself.
        const meta =
          (paper.contentPaperName && parsePaperMetaFromText(paper.contentPaperName)) ??
          parsePaperFilename(file.name);
        items.push({
          name: file.name,
          url: URL.createObjectURL(blob),
          blob,
          meta,
          paper,
        });
      }

      if (items.length === 0) {
        setError("No PDFs selected.");
        setPhase("idle");
        return;
      }

      setPending(items);

      // Use metadata from whatever file parsed successfully; fall back to safe
      // defaults so mergeSitting always gets a valid PaperFilename shape.
      const knownMeta = items.find((it) => it.meta)?.meta;
      const programme: Programme = knownMeta?.programme ?? "degree";
      const slot: Slot = knownMeta?.slot ?? "fn";
      const placeholderDate = knownMeta?.date ?? "";

      await finalizeInputs(
        items.map((it) => ({
          file: it.meta ?? {
            programme,
            slot,
            code: "",
            codeFamily: "",
            date: placeholderDate,
          },
          paper: it.paper,
        }))
      );
    } catch (e) {
      // `items` never reached `setPending` if a later file in the batch threw,
      // so its object URLs have no owner to revoke them on the next reset —
      // do it here instead of leaking them.
      for (const it of items) URL.revokeObjectURL(it.url);
      setError(e instanceof Error ? e.message : "Could not read those PDFs.");
      setPhase("idle");
    }
  };

  /** Merge + course-match. */
  const finalizeInputs = async (collected: MergeInput[]) => {
    try {
      inputs.current = collected;

      // Only validate date conflict when all files have real dates.
      const dates = [...new Set(collected.map((c) => c.file.date).filter(Boolean))];
      if (dates.length > 1) {
        setError(
          `Those PDFs span more than one date (${dates.join(", ")}). A sitting is a single date — import them separately.`
        );
        setPhase("idle");
        return;
      }

      const merged = mergeSitting(collected);
      setSitting(merged);
      // An orphan paper is real content, but from whatever section preceded
      // this PDF's first header — an unknown, possibly unrelated subject. It
      // stays visible for review, just not pre-armed to publish alongside
      // everything that legitimately belongs to this sitting.
      setSelected(new Set(merged.papers.filter((p) => !p.orphan).map((p) => p.normalisedHeading)));

      setNote("Matching courses");
      const cat = await loadCourseCatalog();
      setCatalog(cat);

      const initial: Record<string, string> = {};
      const levels: Record<string, string> = {};
      for (const p of merged.papers) {
        const h = p.normalisedHeading;
        const hit = cat.byAlias.get(h);
        if (hit) {
          // Already in the catalog — map it automatically, and take its
          // level from the course itself rather than guessing from the
          // cohort: an "Improvement" sitting retaking a degree elective is
          // still a degree course, whatever level the retake programme
          // itself would otherwise suggest.
          initial[h] = hit.id;
          levels[h] = hit.level.charAt(0).toUpperCase() + hit.level.slice(1);
        } else {
          // Not in the catalog at all — nothing to map to automatically;
          // the cohort is the only signal available until an admin picks
          // or creates the right course.
          levels[h] = programmeToLevel(p.programme);
        }
      }
      setMapping(initial);
      setLevelByHeading(levels);

      setPhase("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not process those PDFs.");
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

  /* ── Render ────────────────────────────────────────────────────────────── */

  const busy = phase === "reading";
  const publishable = useMemo(
    () => (sitting ? sitting.papers.filter((p) => selected.has(p.normalisedHeading)) : []),
    [sitting, selected]
  );

  return (
    <Dialog open={open} onOpenChange={busy ? () => undefined : onOpenChange}>
      <DialogContent
        className="max-w-5xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="text-[15px] font-semibold">Import an exam sitting</DialogTitle>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 dark:border-amber-900 dark:bg-[#1E1707] dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {phase === "idle" && (
          <div className="space-y-3">
            <label
              htmlFor="pyq-import-files"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-card px-4 py-10 text-center hover:bg-secondary transition-colors"
            >
              <FileUp className="h-5 w-5 text-muted-foreground" />
              <span className="text-[13px] font-medium">Choose exam PDFs</span>
              <span className="text-[11px] text-muted-foreground">
                The date and cohort are read from the paper itself — if that's not there, its
                filename is tried next; anything else just asks for them.
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
          </div>
        )}

        {phase === "review" && sitting && catalog && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
              {sitting.date && <span>{sitting.date}</span>}
              <span>{sitting.stats.files} PDF{sitting.stats.files === 1 ? "" : "s"}</span>
              <span>{sitting.papers.length} paper{sitting.papers.length === 1 ? "" : "s"}</span>
              {sitting.stats.duplicates > 0 && <span>{sitting.stats.duplicates} duplicates collapsed</span>}
              {sitting.stats.variants > 0 && <span>{sitting.stats.variants} variants kept</span>}
            </div>

            {sitting.papers.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-card py-10 text-center">
                <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                <p className="text-[13px] font-medium">No subjects found in this PDF</p>
                <p className="text-[11px] text-muted-foreground max-w-[380px]">
                  The PDF didn't contain recognisable section headers. Check that it's a TCS iON exam paper and try again.
                </p>
                <button
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-secondary transition-colors"
                  onClick={reset}
                >
                  Try another PDF
                </button>
              </div>
            ) : (
              <div className="ghost-scroll max-h-[380px] overflow-y-auto rounded-md border border-border">
                <table className="w-full border-collapse text-[13px]">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="border-b border-border px-2 py-2 w-8" />
                      <th className="border-b border-border px-3 py-2 text-left font-medium">Heading</th>
                      <th className="border-b border-border px-3 py-2 text-left font-medium">Course</th>
                      <th className="border-b border-border px-3 py-2 text-left font-medium">Level</th>
                      <th className="border-b border-border px-3 py-2 text-right font-medium">TQ</th>
                      <th className="border-b border-border px-3 py-2 text-right font-medium">Marks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sitting.papers.map((p) => {
                    const on = selected.has(p.normalisedHeading);
                    const courseId = mapping[p.normalisedHeading] ?? "";
                    const level = levelByHeading[p.normalisedHeading] ?? "Foundation";
                    const levelKey = level.toLowerCase() as CourseLevel;
                    const coursesAtLevel = catalog.courses.filter((c) => c.level === levelKey);
                    const rowKey = `${p.normalisedHeading}-${p.programme}-${p.contentHash}`;
                    return (
                      <tr key={rowKey} className={on ? "" : "opacity-50"}>
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
                        <td className="border-b border-border px-3 py-1.5 font-medium">
                          {p.sourceHeading}
                          {p.variantLabel && (
                            <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{p.variantLabel}</span>
                          )}
                        </td>
                        <td className="border-b border-border px-3 py-1.5">
                          <select
                            className={`${field} w-full`}
                            value={courseId}
                            onChange={(e) => {
                              if (e.target.value === "__new__") {
                                void createCourse(p.normalisedHeading, p.sourceHeading, levelKey);
                              } else if (e.target.value) {
                                void chooseCourse(p.normalisedHeading, e.target.value);
                              } else {
                                setMapping((m) => {
                                  const { [p.normalisedHeading]: _drop, ...rest } = m;
                                  return rest;
                                });
                              }
                            }}
                          >
                            <option value="">— pick a course —</option>
                            {coursesAtLevel.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                            <option value="__new__">+ create &ldquo;{p.sourceHeading}&rdquo;</option>
                          </select>
                        </td>
                        <td className="border-b border-border px-3 py-1.5">
                          <select
                            className={`${field} w-full`}
                            value={level}
                            onChange={(e) => {
                              const nextLevel = e.target.value;
                              setLevelByHeading((m) => ({ ...m, [p.normalisedHeading]: nextLevel }));
                              const nextKey = nextLevel.toLowerCase() as CourseLevel;
                              const stillValid = catalog.courses.find((c) => c.id === courseId)?.level === nextKey;
                              if (!stillValid) {
                                setMapping((m) => {
                                  const { [p.normalisedHeading]: _drop, ...rest } = m;
                                  return rest;
                                });
                              }
                            }}
                          >
                            {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                          </select>
                        </td>
                        <td className="border-b border-border px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                          {p.questionCount}
                        </td>
                        <td className="border-b border-border px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                          {p.totalMarks}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}

            {sitting.papers.length > 0 && (
            <div className="flex items-center justify-end">
              <button
                className={primary}
                disabled={!onLoadIntoBuilder || publishable.length === 0}
                onClick={() => {
                  if (!onLoadIntoBuilder) return;
                  // Sitting-level metadata — present only when the PDF/filename
                  // carried it. Slot "fn"/"an" → "FN"/"AN" for the builder.
                  const sittingDate = sitting.date || undefined;
                  const sittingShift = sitting.papers[0]?.slot
                    ? (sitting.papers[0].slot.toUpperCase() as "FN" | "AN")
                    : undefined;
                  onLoadIntoBuilder(
                    publishable.map((p) => {
                      const source = pending[p.sourceFileIndex];
                      return {
                        questions: p.questions,
                        courseName:
                          catalog.courses.find((c) => c.id === (mapping[p.normalisedHeading] ?? ""))?.name ??
                          p.sourceHeading,
                        level: levelByHeading[p.normalisedHeading] ?? programmeToLevel(p.programme),
                        pdfBlob: source?.blob,
                        pdfName: source?.name,
                        pdfStartPage: p.startPage,
                        questionPages: p.questionPages,
                        examDate: sittingDate,
                        shift: sittingShift,
                        examCode: p.sourceCodes[0] || undefined,
                      };
                    })
                  );
                  onOpenChange(false);
                }}
              >
                Open {publishable.length} paper{publishable.length === 1 ? "" : "s"} in builder
              </button>
            </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
