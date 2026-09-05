import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, FileUp, Loader2, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { extractPdf, PageRenderer } from "@/lib/pdf-extract";
import {
  attachAssets,
  narrowToCourse,
  parseTcsIonPaper,
  type ImportedCourse,
  type TcsIonPaper,
} from "@/lib/parse-tcs-ion";
import type { Question } from "@/data/questions";

/**
 * Import a TCS iON exam paper straight into the paper builder.
 *
 * A master PDF holds every course sat in one session, so the flow is: read the
 * whole document once, show what was found, then let the admin pull in one
 * course at a time. Figures are only cropped for the course actually chosen —
 * rendering pages is the expensive part and a full paper spans ~140 of them.
 *
 * Everything happens in the browser. No upload, no OCR service, no API key.
 */

type Phase = "idle" | "reading" | "choosing" | "cropping";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Receives one course's questions, ready to append to the paper. */
  onImport: (questions: Question[], course: ImportedCourse, paperName: string) => void;
}

const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 " +
  "text-[12px] font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50";

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

export function PyqImport({ open, onOpenChange, onImport }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [paper, setPaper] = useState<TcsIonPaper | null>(null);
  const bufferRef = useRef<ArrayBuffer | null>(null);

  const reset = useCallback(() => {
    setPhase("idle");
    setProgress(0);
    setNote("");
    setError(null);
    setPaper(null);
    bufferRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const readFile = async (file: File) => {
    setError(null);
    setPhase("reading");
    setNote(`Reading ${file.name}`);
    setProgress(0);
    try {
      const buf = await file.arrayBuffer();
      bufferRef.current = buf;
      const extract = await extractPdf(buf, (done, total) => {
        setProgress(done / total);
        setNote(`Reading page ${done} of ${total}`);
      });
      const parsed = parseTcsIonPaper(extract, file.name.replace(/\.pdf$/i, ""));
      if (parsed.courses.length === 0) {
        setError(
          "No course sections found. This importer expects a TCS iON exam paper — the kind with " +
            "“Question Id” and “Section Id” rows and the answer key shown in green."
        );
        setPhase("idle");
        return;
      }
      setPaper(parsed);
      setPhase("choosing");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that PDF.");
      setPhase("idle");
    }
  };

  const importCourse = async (index: number) => {
    if (!paper || !bufferRef.current) return;
    const single = narrowToCourse(paper, index);
    const course = single.courses[0];
    const figures = Object.keys(single.regions).length;

    setPhase("cropping");
    setProgress(0);
    setNote(figures ? `Extracting ${figures} figure${figures === 1 ? "" : "s"}` : "Preparing questions");

    const renderer = new PageRenderer(bufferRef.current);
    try {
      await attachAssets(single, renderer, (done, total) => {
        setProgress(total ? done / total : 1);
        setNote(`Extracting figure ${done} of ${total}`);
      });
      onImport(course.questions, course, paper.paperName);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not extract the figures.");
      setPhase("choosing");
    } finally {
      await renderer.destroy();
    }
  };

  const busy = phase === "reading" || phase === "cropping";

  return (
    <Dialog open={open} onOpenChange={busy ? () => undefined : onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogTitle className="text-[15px] font-semibold">Import PYQ from exam PDF</DialogTitle>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 dark:border-amber-900 dark:bg-[#1E1707] dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {phase === "idle" && (
          <div className="space-y-3">
            <p className="text-[13px] text-muted-foreground">
              Reads a TCS iON master paper, splits it by course, and pulls out every question with
              its options, answer key and figures. Nothing leaves the browser.
            </p>
            <label
              htmlFor="pyq-import-file"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-card px-4 py-10 text-center hover:bg-secondary transition-colors"
            >
              <FileUp className="h-5 w-5 text-muted-foreground" />
              <span className="text-[13px] font-medium">Choose exam PDF</span>
              <span className="text-[11px] text-muted-foreground">
                The master paper containing all courses
              </span>
            </label>
            <input
              id="pyq-import-file"
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                // Reset so picking the same file twice still fires a change.
                e.target.value = "";
                if (f) void readFile(f);
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
                ? "Large papers take a few seconds — every page is scanned for text and colour."
                : "Each figure is cropped from its page and made background-transparent."}
            </p>
          </div>
        )}

        {phase === "choosing" && paper && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
              <span>{paper.courses.length} courses</span>
              <span>{paper.stats.questions} questions</span>
              <span>{paper.stats.figures} figures</span>
              {paper.stats.declarations > 0 && (
                <span>{paper.stats.declarations} declaration items skipped</span>
              )}
              {paper.stats.flagged > 0 && (
                <span className="text-amber-700 dark:text-amber-400">
                  {paper.stats.flagged} need review
                </span>
              )}
            </div>

            <div className="ghost-scroll max-h-[320px] overflow-y-auto rounded-md border border-border">
              <table className="w-full border-collapse text-[13px]">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="border-b border-border px-3 py-2 text-left font-medium">Course</th>
                    <th className="border-b border-border px-3 py-2 text-right font-medium">Questions</th>
                    <th className="border-b border-border px-3 py-2 text-right font-medium">Marks</th>
                    <th className="border-b border-border px-3 py-2 text-right font-medium">Review</th>
                    <th className="border-b border-border px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {paper.courses.map((c, i) => {
                    const marks = c.questions.reduce(
                      (n, q) =>
                        n +
                        (q.type === "comprehension"
                          ? q.subQuestions.reduce((m, s) => m + s.marks, 0)
                          : q.marks),
                      0
                    );
                    const flagged = c.questions.filter((q) => !q.isValid).length;
                    return (
                      <tr key={c.sectionId || c.name}>
                        <td className="border-b border-border px-3 py-2">{c.name}</td>
                        <td className="border-b border-border px-3 py-2 text-right tabular-nums">
                          {c.questions.length}
                        </td>
                        <td className="border-b border-border px-3 py-2 text-right tabular-nums">
                          {marks}
                        </td>
                        <td className="border-b border-border px-3 py-2 text-right tabular-nums">
                          {flagged ? (
                            <span className="text-amber-700 dark:text-amber-400">{flagged}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="border-b border-border px-3 py-2 text-right">
                          <button className={btn} onClick={() => void importCourse(i)}>
                            <Upload className="h-3.5 w-3.5" /> Import
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Importing appends that course's questions to the paper you are building. Anything
              marked for review is flagged in the navigator with the reason attached.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
