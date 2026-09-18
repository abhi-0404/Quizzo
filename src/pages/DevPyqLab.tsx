import { useCallback, useRef, useState } from "react";
import { AlertTriangle, FileUp, Loader2 } from "lucide-react";
import { extractPdf, PageRenderer, type PdfExtract } from "@/lib/pdf-extract";
import { attachAssets, parseTcsIonPaper, type TcsIonPaper } from "@/lib/parse-tcs-ion";
import { ExtractedQuestionList } from "@/components/ExtractedQuestionList";

/**
 * Dev-only extraction lab.
 *
 * The real importer lives behind the admin role, which makes the extraction
 * impossible to eyeball while developing it. This runs the exact same
 * client-side pipeline — extract, parse, crop — against a local PDF and shows
 * the result next to the source page images, so a regression in any stage is
 * visible rather than inferred. Routed only when `import.meta.env.DEV`.
 */

interface Stats {
  pageCount: number;
  lines: number;
  optionColours: number;
  courses: { name: string; questions: number }[];
  figuresDetected: number;
  figuresCropped: number;
  flagged: number;
  ms: number;
}

const SAMPLES = ["/samples/MLT.pdf", "/samples/Maths2.pdf"];

const btn =
  "inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 " +
  "text-[12px] font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50";

export default function DevPyqLab() {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [paper, setPaper] = useState<TcsIonPaper | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const started = useRef(0);

  const run = useCallback(async (url: string, buf: ArrayBuffer, label: string) => {
    setBusy(true);
    setError(null);
    setPaper(null);
    setStats(null);
    started.current = performance.now();

    const renderer = new PageRenderer(buf);
    try {
      setNote(`Extracting text and answer-key colours from ${label}`);
      // pdf.js detaches the buffer it is given, so the cropper gets its own copy.
      const extract: PdfExtract = await extractPdf(buf.slice(0), (done, total) =>
        setNote(`Reading page ${done} of ${total}`)
      );

      setNote("Parsing the TCS iON grammar");
      const parsed = parseTcsIonPaper(extract, label);
      const detected = Object.keys(parsed.regions).length;

      setNote(`Cropping ${detected} figures`);
      const cropped = await attachAssets(parsed, renderer, (done, total) =>
        setNote(`Cropping figure ${done} of ${total}`)
      );

      setPdfUrl(url);
      setPaper(parsed);
      setStats({
        pageCount: extract.pageCount,
        lines: extract.lines.length,
        optionColours: Object.keys(extract.optionColour).length,
        courses: parsed.courses.map((c) => ({ name: c.name, questions: c.questions.length })),
        figuresDetected: detected,
        figuresCropped: cropped,
        flagged: parsed.courses.reduce(
          (n, c) => n + c.questions.filter((q) => !q.isValid).length,
          0
        ),
        ms: Math.round(performance.now() - started.current),
      });
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e));
    } finally {
      await renderer.destroy().catch(() => undefined);
      setBusy(false);
    }
  }, []);

  const loadSample = useCallback(
    async (url: string) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
        await run(url, await res.arrayBuffer(), url.split("/").pop() ?? url);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [run]
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold">PYQ extraction lab</span>
          <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
            dev only
          </span>
          <div className="mx-2 h-4 w-px bg-border" />
          {SAMPLES.map((s) => (
            <button key={s} className={btn} disabled={busy} onClick={() => void loadSample(s)}>
              <FileUp className="h-3.5 w-3.5" />
              {s.split("/").pop()}
            </button>
          ))}
          <label className={`${btn} cursor-pointer`}>
            <FileUp className="h-3.5 w-3.5" />
            Choose a PDF…
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                void f
                  .arrayBuffer()
                  .then((b) => run(URL.createObjectURL(f), b, f.name));
              }}
            />
          </label>
          {busy && (
            <span className="ml-2 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {note}
            </span>
          )}
        </div>

        {stats && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span>{stats.pageCount} pages</span>
            <span>{stats.lines} text lines</span>
            <span>{stats.optionColours} option colours</span>
            <span>
              figures {stats.figuresCropped}/{stats.figuresDetected} cropped
            </span>
            <span>{stats.ms} ms</span>
            <span className={stats.flagged ? "text-amber-600 dark:text-amber-400" : undefined}>
              {stats.flagged} flagged
            </span>
            <span>
              courses:{" "}
              {stats.courses.map((c) => `${c.name || "(unnamed)"} (${c.questions})`).join(", ")}
            </span>
          </div>
        )}
      </header>

      {error && (
        <div className="m-4 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 dark:border-amber-900 dark:bg-[#1E1707] dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <pre className="ghost-scroll overflow-x-auto whitespace-pre-wrap font-mono text-[11px]">
            {error}
          </pre>
        </div>
      )}

      {paper && (
        <div className="flex flex-col lg:h-[calc(100vh-88px)] lg:flex-row">
          {/* Source, for scroll-matching against what was extracted. */}
          <div className="min-h-[420px] border-b border-border lg:h-full lg:w-1/2 lg:border-b-0 lg:border-r">
            {pdfUrl && <iframe src={pdfUrl} title="Source PDF" className="h-full w-full" />}
          </div>
          <div className="ghost-scroll min-w-0 overflow-y-auto p-4 lg:h-full lg:w-1/2">
            <ExtractedQuestionList courses={paper.courses} />
          </div>
        </div>
      )}

      {!paper && !busy && !error && (
        <p className="p-6 text-[13px] text-muted-foreground">
          Pick a PDF above. Everything runs in the browser — nothing is uploaded.
        </p>
      )}
    </div>
  );
}
