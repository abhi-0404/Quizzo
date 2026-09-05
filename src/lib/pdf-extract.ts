/**
 * pdf.js access layer for the PYQ importer.
 *
 * Everything the TCS iON parser needs is pulled out here so that
 * `@/lib/parse-tcs-ion` stays a pure function over plain data and can be unit
 * tested from a recorded fixture instead of a 10 MB PDF.
 *
 * Three things are extracted, each from the cheapest source that carries it:
 *
 *   text + geometry  `getTextContent()`, normalised to top-left device space
 *   answer key       `getOperatorList()` — the key is encoded as *fill colour*
 *                    (green = correct) and `getTextContent()` does not expose it
 *   figures          rendered page canvas, cropped to the gaps between text lines
 *
 * pdf.js is imported dynamically so this module can be referenced from code
 * that also runs under Vitest/jsdom without dragging in the worker.
 */

/** A single text run within a line, kept because column position carries meaning. */
export interface PdfPiece {
  x: number;
  x2: number;
  text: string;
}

/** One visual line of text, in top-left device space at scale 1. */
export interface PdfLine {
  /** 0-based page index. */
  page: number;
  x: number;
  /** Top edge. y grows downward, unlike PDF user space. */
  y: number;
  x2: number;
  y2: number;
  text: string;
  /**
   * The runs this line was assembled from, left to right. An option row is
   * `["6406535108797. ", " ", …]`, and the x of the run after the id marks where
   * the option's content column starts — needed to crop a figure out of the row
   * without dragging in the correct/incorrect tick icon sitting to its left.
   */
  pieces: PdfPiece[];
}

export interface PdfExtract {
  lines: PdfLine[];
  /** Option id → `#rrggbb` of the glyphs that drew it. */
  optionColour: Record<string, string>;
  pageCount: number;
  /** Page height in the same units as `PdfLine`, per page. */
  pageHeight: number[];
  pageWidth: number[];
}

export const CORRECT_COLOUR = "#008000";
export const INCORRECT_COLOUR = "#ff0000";

/** Items on the same baseline within this many units belong to one line. */
const LINE_TOLERANCE = 3;

type PdfjsModule = typeof import("pdfjs-dist");

let pdfjsPromise: Promise<PdfjsModule> | null = null;

/** Load pdf.js and point it at a worker bundled by Vite. */
async function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist");
      // A worker configured by the host wins — outside a Vite bundle (tests,
      // SSR) the `?url` specifier resolves to something pdf.js cannot import.
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      }
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

const hex = (rgb: ArrayLike<number>) =>
  "#" + Array.from(rgb).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/**
 * Walk a page's operator list, tracking the current fill colour, and record the
 * colour of every option id (`6406535108621.`) it draws.
 *
 * Option ids are globally unique 10+ digit tokens, so tagging them by id avoids
 * having to align the operator stream with the text-content stream positionally.
 */
function collectOptionColours(
  ops: { fnArray: number[]; argsArray: unknown[] },
  OPS: Record<string, number>,
  into: Record<string, string>
): void {
  let fill: string | null = null;
  let runText = "";
  let runFill: string | null = null;

  const flush = () => {
    if (runFill && runText) {
      for (const m of runText.matchAll(/(\d{10,})\./g)) {
        if (into[m[1]] === undefined) into[m[1]] = runFill;
      }
    }
    runText = "";
  };

  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];

    if (fn === OPS.setFillRGBColor) {
      flush();
      fill = hex(ops.argsArray[i] as ArrayLike<number>);
      runFill = fill;
      continue;
    }
    if (fn === OPS.setFillGray) {
      flush();
      const g = Math.round(((ops.argsArray[i] as number[])[0] ?? 0) * 255);
      fill = hex([g, g, g]);
      runFill = fill;
      continue;
    }
    if (fn !== OPS.showText) continue;

    const glyphs = (ops.argsArray[i] as unknown[])[0] as unknown[] | undefined;
    if (!glyphs) continue;
    let s = "";
    for (const g of glyphs) {
      // Numbers in the glyph array are kerning adjustments, not characters.
      if (typeof g === "number") continue;
      s += (g as { unicode?: string })?.unicode ?? "";
    }
    if (!s) continue;
    if (runFill !== fill) {
      flush();
      runFill = fill;
    }
    runText += s;
  }
  flush();
}

/** Group text items into visual lines, top-to-bottom then left-to-right. */
function itemsToLines(
  items: { str: string; transform: number[]; width: number; height: number }[],
  viewportTransform: number[],
  applyTransform: (a: number[], b: number[]) => number[],
  page: number
): PdfLine[] {
  interface Piece { x: number; x2: number; top: number; bottom: number; text: string }
  const pieces: Piece[] = [];

  for (const it of items) {
    if (!it.str) continue;
    const t = applyTransform(viewportTransform, it.transform);
    // After the viewport transform, y grows downward and t[5] is the baseline.
    const bottom = t[5];
    const h = it.height || Math.hypot(t[2], t[3]) || 10;
    pieces.push({ x: t[4], x2: t[4] + (it.width || 0), top: bottom - h, bottom, text: it.str });
  }

  pieces.sort((a, b) => a.bottom - b.bottom || a.x - b.x);

  const lines: PdfLine[] = [];
  let group: Piece[] = [];

  const emit = () => {
    if (!group.length) return;
    group.sort((a, b) => a.x - b.x);
    lines.push({
      page,
      x: Math.min(...group.map((p) => p.x)),
      y: Math.min(...group.map((p) => p.top)),
      x2: Math.max(...group.map((p) => p.x2)),
      y2: Math.max(...group.map((p) => p.bottom)),
      text: group.map((p) => p.text).join(""),
      pieces: group.map((p) => ({ x: p.x, x2: p.x2, text: p.text })),
    });
    group = [];
  };

  for (const p of pieces) {
    if (group.length && Math.abs(p.bottom - group[0].bottom) > LINE_TOLERANCE) emit();
    group.push(p);
  }
  emit();

  return lines;
}

/** Read the whole document into the plain shape the parser consumes. */
export async function extractPdf(
  file: ArrayBuffer,
  onProgress?: (done: number, total: number) => void
): Promise<PdfExtract> {
  const pdfjs = await loadPdfjs();
  // pdf.js takes ownership of the buffer it is handed and detaches it, so the
  // caller's copy has to survive for the separate render pass.
  const doc = await pdfjs.getDocument({ data: new Uint8Array(file.slice(0)) }).promise;

  const lines: PdfLine[] = [];
  const optionColour: Record<string, string> = {};
  const pageHeight: number[] = [];
  const pageWidth: number[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    pageHeight.push(viewport.height);
    pageWidth.push(viewport.width);

    const [content, ops] = await Promise.all([page.getTextContent(), page.getOperatorList()]);

    lines.push(
      ...itemsToLines(
        content.items as never[],
        viewport.transform,
        pdfjs.Util.transform as never,
        p - 1
      )
    );
    collectOptionColours(
      ops as never,
      pdfjs.OPS as unknown as Record<string, number>,
      optionColour
    );

    page.cleanup();
    onProgress?.(p, doc.numPages);
  }

  const pageCount = doc.numPages;
  await doc.destroy();
  return { lines, optionColour, pageCount, pageHeight, pageWidth };
}

/* ── Figure extraction ────────────────────────────────────────────────────── */

export interface Rect { x: number; y: number; x2: number; y2: number }

/**
 * Renders pages on demand and crops regions out of them.
 *
 * Figures are located by *gap inference* — the band between the text line above
 * and the text line below — rather than by tracking image XObject placements.
 * That costs one page render but also catches vector-drawn diagrams, which have
 * no image XObject to track at all.
 */
export class PageRenderer {
  private cache = new Map<number, HTMLCanvasElement>();
  private doc: Promise<{ getPage(n: number): Promise<unknown>; destroy(): Promise<void> }>;

  constructor(private file: ArrayBuffer, private scale = 2) {
    this.doc = loadPdfjs().then(
      (pdfjs) => pdfjs.getDocument({ data: new Uint8Array(this.file.slice(0)) }).promise as never
    );
  }

  private async canvasFor(page: number): Promise<HTMLCanvasElement> {
    const hit = this.cache.get(page);
    if (hit) return hit;

    const doc = await this.doc;
    const pg = (await doc.getPage(page + 1)) as {
      getViewport(o: { scale: number }): { width: number; height: number };
      render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> };
    };
    const viewport = pg.getViewport({ scale: this.scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    // Figures are cropped from this canvas, so start from a known background.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pg.render({ canvasContext: ctx, viewport }).promise;

    this.cache.set(page, canvas);
    return canvas;
  }

  /**
   * Crop `rect` (in scale-1 units) out of `page`, trim surrounding whitespace and
   * return a PNG data URL — or null when the region holds nothing but background.
   *
   * The white background is made transparent so the figure inherits the app's
   * page colour instead of stamping a white box onto the dark theme — which is
   * what the issue's 1-bit black-and-white conversion would have done. Alpha
   * keying alone is only half of it: dark ink on a dark page is still
   * invisible, so the renderer pairs this with a `dark:invert` filter. Ink keeps
   * its own colour here so that coloured plots survive the round trip.
   */
  async cropRegion(page: number, rect: Rect): Promise<string | null> {
    const canvas = await this.canvasFor(page);
    const s = this.scale;
    const sx = Math.max(0, Math.floor(rect.x * s));
    const sy = Math.max(0, Math.floor(rect.y * s));
    const sw = Math.min(canvas.width - sx, Math.ceil((rect.x2 - rect.x) * s));
    const sh = Math.min(canvas.height - sy, Math.ceil((rect.y2 - rect.y) * s));
    if (sw <= 0 || sh <= 0) return null;

    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const img = ctx.getImageData(sx, sy, sw, sh);
    const d = img.data;

    // Locate the ink so the crop is tight rather than a band of whitespace.
    let minX = sw, minY = sh, maxX = -1, maxY = -1;
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const i = (y * sw + x) * 4;
        // Anything meaningfully darker than paper counts as ink.
        if (d[i] < 240 || d[i + 1] < 240 || d[i + 2] < 240) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return null; // blank region — not a figure

    const pad = Math.round(2 * s);
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(sw - 1, maxX + pad);
    maxY = Math.min(sh - 1, maxY + pad);

    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    const octx = out.getContext("2d")!;
    const cropped = octx.createImageData(w, h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = ((y + minY) * sw + (x + minX)) * 4;
        const di = (y * w + x) * 4;
        const r = d[si], g = d[si + 1], b = d[si + 2];

        /* Luminance keys the alpha, so white paper drops out.
         *
         * The pixel that remains was ink composited onto white, so writing it
         * back unchanged leaves every anti-aliased edge a washed-out grey once
         * it sits on a transparent background. Un-premultiplying against white
         * recovers the ink's own colour — glyph edges stay crisp and coloured
         * plots keep their hue. */
        const a = Math.min(1, Math.max(0, 1 - (0.299 * r + 0.587 * g + 0.114 * b) / 255));
        const unmix = (c: number) =>
          a === 0 ? 0 : Math.round(Math.min(255, Math.max(0, (c - 255 * (1 - a)) / a)));

        cropped.data[di] = unmix(r);
        cropped.data[di + 1] = unmix(g);
        cropped.data[di + 2] = unmix(b);
        cropped.data[di + 3] = Math.round(255 * a);
      }
    }
    octx.putImageData(cropped, 0, 0);
    return out.toDataURL("image/png");
  }

  async destroy(): Promise<void> {
    this.cache.clear();
    (await this.doc).destroy();
  }
}
