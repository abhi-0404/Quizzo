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

/**
 * Items on the same baseline within this many units belong to one line.
 *
 * This has to clear a superscript's baseline shift, not just jitter. A 10pt
 * exponent on 12pt body text sits ~4 units above its own line, and at a
 * tolerance of 3 it became a line of its own — which then sorted *before* the
 * row it belonged to and was glued onto the end of the previous option, so
 * `A² = 0.` arrived as a stray `2` on one option and `A= 0.` on the next: a
 * different statement, and one that was in the answer key. Body leading here is
 * ~16-19 units, so 6 separates a shifted glyph from a genuine new line with a
 * wide margin either side. Merged pieces are ordered by x, so the exponent
 * lands back where it belongs.
 */
const LINE_TOLERANCE = 6;

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
/** Read a Blob back out as a `data:` URL. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the cropped figure."));
    reader.readAsDataURL(blob);
  });
}

/**
 * A cheap unsharp mask over just the RGB channels — a standard fixed 3x3
 * kernel, not a scale-dependent blur radius, so it stays proportionate at any
 * render scale. This is what actually earns the render scale below: a higher
 * scale alone only makes an already-soft edge *bigger*, not crisper — a real
 * TCS iON export routinely embeds a course's equations as small pre-rendered
 * bitmaps from whatever equation editor authored the paper, and re-rasterising
 * that source at a higher scale just upsamples the same soft pixels. This
 * pass is what actually recovers edge contrast, on top of the extra scale.
 * Applied to the composited "ink on white" pixels, before the alpha-keying
 * below, so the sharpened contrast also sharpens the alpha it derives from.
 */
function sharpenInk(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  // Centre weight 1.6, four orthogonal neighbours at -0.15 each: sums to 1.0,
  // so flat regions (paper, solid fills) are untouched and only edges gain contrast.
  const CENTER = 1.6;
  const SIDE = -0.15;
  for (let y = 0; y < h; y++) {
    const yUp = y > 0 ? y - 1 : y;
    const yDown = y < h - 1 ? y + 1 : y;
    for (let x = 0; x < w; x++) {
      const xLeft = x > 0 ? x - 1 : x;
      const xRight = x < w - 1 ? x + 1 : x;
      const i = (y * w + x) * 4;
      const iUp = (yUp * w + x) * 4;
      const iDown = (yDown * w + x) * 4;
      const iLeft = (y * w + xLeft) * 4;
      const iRight = (y * w + xRight) * 4;
      for (let c = 0; c < 3; c++) {
        out[i + c] =
          src[i + c] * CENTER +
          (src[iUp + c] + src[iDown + c] + src[iLeft + c] + src[iRight + c]) * SIDE;
      }
      out[i + 3] = src[i + 3];
    }
  }
  return out;
}

export class PageRenderer {
  private cache = new Map<number, OffscreenCanvas>();
  private doc: Promise<{ getPage(n: number): Promise<unknown>; destroy(): Promise<void> }>;

  // 2x read cleanly on a normal display but visibly soften once a figure is
  // stretched to fill a wide option row or the full-screen preview; 4x keeps
  // fine plot lines and small subscripts crisp at those sizes — paired with
  // the sharpen pass below and WebP output, so the extra pixels don't cost
  // proportionally more bytes on the way back down. One page render per
  // figure, cached per page, so this only costs once per page, not per crop.
  constructor(private file: ArrayBuffer, private scale = 4) {
    this.doc = loadPdfjs().then(
      (pdfjs) => pdfjs.getDocument({ data: new Uint8Array(this.file.slice(0)) }).promise as never
    );
  }

  /**
   * `OffscreenCanvas`, not a DOM `<canvas>` — a background tab's compositor
   * can defer painting a page nobody is looking at, and a plain canvas's
   * render calls rode along with that even though it was never attached to
   * the document. An import that ran for minutes with the tab focused could
   * sit for just as long, effectively paused, the moment the admin switched
   * away to do something else while it worked. `OffscreenCanvas` isn't part
   * of that paint pipeline at all, so its 2D draws proceed at full speed
   * regardless of which tab is in front.
   */
  private async canvasFor(page: number): Promise<OffscreenCanvas> {
    const hit = this.cache.get(page);
    if (hit) return hit;

    const doc = await this.doc;
    const pg = (await doc.getPage(page + 1)) as {
      getViewport(o: { scale: number }): { width: number; height: number };
      render(o: { canvasContext: unknown; viewport: unknown }): { promise: Promise<void> };
    };
    const viewport = pg.getViewport({ scale: this.scale });
    const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
    // Figures are cropped from this canvas, so start from a known background.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pg.render({ canvasContext: ctx, viewport }).promise;

    this.cache.set(page, canvas);
    return canvas;
  }

  /**
   * Crop `rect` (in scale-1 units) out of `page`, trim surrounding whitespace and
   * return a `data:` URL (WebP, or PNG on an engine without WebP encoding) — or
   * null when the region holds nothing but background.
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

    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D;
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

    // Sharpened before alpha-keying, so the recovered edge contrast also
    // sharpens the alpha (and thus the anti-aliasing) it's derived from.
    const sharp = sharpenInk(d, sw, sh);

    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const out = new OffscreenCanvas(w, h);
    const octx = out.getContext("2d") as OffscreenCanvasRenderingContext2D;
    const cropped = octx.createImageData(w, h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = ((y + minY) * sw + (x + minX)) * 4;
        const di = (y * w + x) * 4;
        const r = sharp[si], g = sharp[si + 1], b = sharp[si + 2];

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
    // WebP keeps the alpha channel this whole pipeline depends on, at a
    // fraction of PNG's bytes for the same crop — the higher render scale
    // above is what pays for the extra sharpness; this is what keeps the
    // result from costing proportionally more to download for it. Any
    // engine that doesn't support WebP encoding falls back to PNG per spec,
    // so this never produces an unreadable file, only a larger one.
    const blob = await out.convertToBlob({ type: "image/webp", quality: 0.92 });
    return blobToDataUrl(blob);
  }

  async destroy(): Promise<void> {
    this.cache.clear();
    (await this.doc).destroy();
  }
}
