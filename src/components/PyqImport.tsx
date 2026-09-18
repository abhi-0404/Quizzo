import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileUp, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { extractPdf, PageRenderer } from "@/lib/pdf-extract";
import { attachAssets, parseTcsIonPaper, type TcsIonPaper } from "@/lib/parse-tcs-ion";
import {
  headingsOf,
  manualPaperFilename,
  mergeSitting,
  parsePaperFilename,
  parsePaperMetaFromText,
  sittingDateConflict,
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

type Phase = "idle" | "reading" | "meta" | "review";

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

const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 " +
  "text-[12px] font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50";
const primary =
  "inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[12px] " +
  "font-medium text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors";
const field =
  "h-8 rounded-md border border-border bg-background px-2 text-[12px] text-foreground";

const PROGRAMMES: { value: Programme; label: string }[] = [
  { value: "foundation", label: "Foundation" },
  { value: "diploma", label: "Diploma" },
  { value: "degree", label: "Degree" },
  { value: "improvement", label: "Improvement" },
];
const SLOTS: { value: Slot; label: string }[] = [
  { value: "fn", label: "Forenoon" },
  { value: "an", label: "Afternoon" },
];

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

  // Files read but not yet turned into MergeInputs — held here between the
  // "reading" and "meta" phases so a filename that failed to parse can be
  // filled in by hand instead of the whole file being discarded.
  const [pending, setPending] = useState<PendingFile[]>([]);
  // Blank, not a guessed default: the PDF gives no evidence for any of these
  // three, so nothing is pre-selected unless a sibling file in the same batch
  // actually states it — an admin who does not look at this form must not be
  // able to publish a paper tagged with a programme/slot/date it never had.
  const [manualProgramme, setManualProgramme] = useState<Programme | "">("");
  const [manualSlot, setManualSlot] = useState<Slot | "">("");
  const [manualDate, setManualDate] = useState("");
  /** Per-file exam code, keyed by file name — optional, unlike the rest. */
  const [manualCodes, setManualCodes] = useState<Record<string, string>>({});

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
    setManualCodes({});
    setManualDate("");
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

      const unresolved = items.filter((it) => it.meta === null);
      if (unresolved.length > 0) {
        // A per-course split ("MLT.pdf") carries none of the convention's
        // fields. Pre-fill the shared ones from whichever file in this batch
        // DID parse, so a mixed batch does not make the admin retype what one
        // of its own files already states.
        const known = items.find((it) => it.meta)?.meta;
        setManualProgramme(known?.programme ?? "");
        setManualSlot(known?.slot ?? "");
        setManualDate(known?.date ?? "");
        setPhase("meta");
        return;
      }

      await finalizeInputs(items.map((it) => ({ file: it.meta as PaperFilename, paper: it.paper })));
    } catch (e) {
      // `items` never reached `setPending` if a later file in the batch threw,
      // so its object URLs have no owner to revoke them on the next reset —
      // do it here instead of leaking them.
      for (const it of items) URL.revokeObjectURL(it.url);
      setError(e instanceof Error ? e.message : "Could not read those PDFs.");
      setPhase("idle");
    }
  };

  /** Merge + course-match, shared by the direct path and the manual-meta path. */
  const finalizeInputs = async (collected: MergeInput[]) => {
    try {
      const dates = sittingDateConflict(collected);
      if (dates.length > 1) {
        setError(
          `Those PDFs span more than one date (${dates.join(", ")}). A sitting is a single date — import them separately.`
        );
        setPhase("idle");
        return;
      }

      inputs.current = collected;

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

  /**
   * The admin has typed in whatever this batch's filenames couldn't supply.
   *
   * Only the date actually blocks continuing — it is the one thing this
   * dialog cannot proceed without (a sitting is keyed by date, and there is
   * no PDF content to fall back on for it). Programme and slot are still
   * offered because they help sort cohorts and seed a level guess, but an
   * admin who doesn't know them yet isn't stuck here: they default to
   * "degree"/"fn" and can be corrected per-subject once the paper is open in
   * the builder, the same as any other level or subject mistake.
   */
  const submitManualMeta = () => {
    setError(null);
    if (!manualDate) {
      setError("Fill in the required field.");
      return;
    }
    try {
      const programme = manualProgramme || "degree";
      const slot = manualSlot || "fn";
      const collected: MergeInput[] = pending.map((it) => ({
        file:
          it.meta ??
          manualPaperFilename({
            programme,
            slot,
            code: manualCodes[it.name] ?? "",
            date: manualDate,
          }),
        paper: it.paper,
      }));
      setPhase("reading");
      setNote("Matching courses");
      void finalizeInputs(collected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply that date.");
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

        {phase === "meta" && (
          <div className="space-y-3">
            <p className="text-[13px] text-muted-foreground">
              {pending.length === 1
                ? "This PDF's own content and filename didn't have the exam date. Programme and slot help but aren't required — leave them if you don't know."
                : `${pending.filter((it) => it.meta === null).length} of ${pending.length} files did not carry the exam date. Programme and slot help but aren't required — leave them if you don't know. They apply to every file that needs them, a per-course split is normally all from the same sitting.`}
            </p>

            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                Exam date
                <input
                  type="date"
                  className={field}
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                Programme (optional)
                <select
                  className={field}
                  value={manualProgramme}
                  onChange={(e) => setManualProgramme(e.target.value as Programme | "")}
                >
                  <option value="">— select —</option>
                  {PROGRAMMES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] text-muted-foreground">
                Slot (optional)
                <select
                  className={field}
                  value={manualSlot}
                  onChange={(e) => setManualSlot(e.target.value as Slot | "")}
                >
                  <option value="">— select —</option>
                  {SLOTS.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </label>
            </div>

            {pending.length === 1 ? (
              // One file — a whole table is a lot of chrome around a single
              // row; the same information reads fine as a plain inline field.
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2">
                <span className="text-[13px] font-medium truncate">{pending[0].name}</span>
                {pending[0].meta ? (
                  <span className="text-[11px] text-muted-foreground">
                    read from the file — {pending[0].meta.date} · {pending[0].meta.programme} · {pending[0].meta.code}
                  </span>
                ) : (
                  <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    Exam code (optional)
                    <input
                      className={`${field} w-32`}
                      placeholder="e.g. QDB1"
                      value={manualCodes[pending[0].name] ?? ""}
                      onChange={(e) =>
                        setManualCodes((m) => ({ ...m, [pending[0].name]: e.target.value.toUpperCase() }))
                      }
                    />
                  </label>
                )}
              </div>
            ) : (
              <div className="ghost-scroll max-h-[280px] overflow-y-auto rounded-md border border-border">
                <table className="w-full border-collapse text-[13px]">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="border-b border-border px-3 py-2 text-left font-medium">File</th>
                      <th className="border-b border-border px-3 py-2 text-left font-medium">Status</th>
                      <th className="border-b border-border px-3 py-2 text-left font-medium">
                        Exam code <span className="font-normal text-muted-foreground">(optional)</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((it) => (
                      <tr key={it.name}>
                        <td className="border-b border-border px-3 py-1.5">{it.name}</td>
                        <td className="border-b border-border px-3 py-1.5">
                          {it.meta ? (
                            <span className="text-[11px] text-muted-foreground">
                              read from file — {it.meta.date} · {it.meta.programme} · {it.meta.code}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                              uses the fields above
                            </span>
                          )}
                        </td>
                        <td className="border-b border-border px-3 py-1.5">
                          <input
                            className={`${field} w-32`}
                            placeholder="e.g. QDB1"
                            disabled={!!it.meta}
                            value={it.meta ? it.meta.code : manualCodes[it.name] ?? ""}
                            onChange={(e) =>
                              setManualCodes((m) => ({ ...m, [it.name]: e.target.value.toUpperCase() }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <button className={btn} onClick={reset}>Start over</button>
              <button
                className={primary}
                disabled={!manualDate}
                onClick={submitManualMeta}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {phase === "review" && sitting && catalog && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
              <span>{sitting.date}</span>
              <span>{sitting.stats.files} PDF{sitting.stats.files === 1 ? "" : "s"}</span>
              <span>{sitting.papers.length} papers</span>
              {sitting.stats.duplicates > 0 && <span>{sitting.stats.duplicates} duplicates collapsed</span>}
              {sitting.stats.variants > 0 && <span>{sitting.stats.variants} variants kept</span>}
            </div>

            <div className="ghost-scroll max-h-[380px] overflow-y-auto rounded-md border border-border">
              <table className="w-full border-collapse text-[13px]">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="border-b border-border px-2 py-2 w-8" />
                    <th className="border-b border-border px-3 py-2 text-left font-medium">Heading</th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">Level</th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">Course</th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">Cohort</th>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">Codes</th>
                    <th className="border-b border-border px-3 py-2 text-right font-medium">Q</th>
                    <th className="border-b border-border px-3 py-2 text-right font-medium">Marks</th>
                  </tr>
                </thead>
                <tbody>
                  {sitting.papers.map((p) => {
                    const on = selected.has(p.normalisedHeading);
                    const courseId = mapping[p.normalisedHeading] ?? "";
                    const level = levelByHeading[p.normalisedHeading] ?? "Foundation";
                    const levelKey = level.toLowerCase() as CourseLevel;
                    // Only offer courses at the level just chosen — picking
                    // Foundation should never turn up a degree elective.
                    const coursesAtLevel = catalog.courses.filter((c) => c.level === levelKey);
                    const rowKey = `${p.normalisedHeading}-${p.programme}-${p.contentHash}`;
                    return (
                      <tr key={rowKey}>
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
                          {p.orphan && (
                            <span
                              title="No section header precedes these questions in the PDF — likely the tail of the previous subject, not this one. Left unchecked; verify before including it."
                              className="ml-1.5 inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:border-amber-900 dark:bg-[#1E1707] dark:text-amber-400"
                            >
                              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                              unattributed
                            </span>
                          )}
                        </td>
                        <td className="border-b border-border px-3 py-1.5">
                          <select
                            className={`${field} w-full`}
                            value={level}
                            onChange={(e) => {
                              const nextLevel = e.target.value;
                              setLevelByHeading((m) => ({ ...m, [p.normalisedHeading]: nextLevel }));
                              // The mapped course may not exist at the new level — drop it
                              // rather than silently keep a Foundation course under Degree.
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
                        <td className="border-b border-border px-3 py-1.5">
                          <select
                            className={`${field} w-full`}
                            value={courseId}
                            onChange={(e) => {
                              if (e.target.value === "__new__") {
                                void createCourse(p.normalisedHeading, p.sourceHeading, levelKey);
                              } else if (e.target.value) {
                                void chooseCourse(p.normalisedHeading, e.target.value);
                              }
                            }}
                          >
                            <option value="">— pick a course —</option>
                            {coursesAtLevel.map((c) => (
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-end">
              <button
                className={primary}
                disabled={!onLoadIntoBuilder || publishable.length === 0}
                onClick={() => {
                  if (!onLoadIntoBuilder) return;
                  onLoadIntoBuilder(
                    publishable.map((p) => {
                      const source = pending[p.sourceFileIndex];
                      return {
                        questions: p.questions,
                        courseName: p.sourceHeading,
                        level: levelByHeading[p.normalisedHeading] ?? programmeToLevel(p.programme),
                        pdfBlob: source?.blob,
                        pdfName: source?.name,
                        pdfStartPage: p.startPage,
                        questionPages: p.questionPages,
                      };
                    })
                  );
                  onOpenChange(false);
                }}
              >
                Open {publishable.length} paper{publishable.length === 1 ? "" : "s"} in builder
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
