import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { GlobalWorkerOptions } from "pdfjs-dist";
import fixture from "./fixtures/tcs-ion-sample.json";
import { extractPdf, CORRECT_COLOUR, INCORRECT_COLOUR } from "@/lib/pdf-extract";
import { parseTcsIonPaper } from "@/lib/parse-tcs-ion";

// Vite resolves the worker for the browser build; under Node it has to be the
// real file on disk. `loadPdfjs` leaves an already-configured worker alone.
GlobalWorkerOptions.workerSrc = pathToFileURL(
  path.resolve(__dirname, "../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs")
).href;

/**
 * Proves the committed fixture is what `extractPdf` actually produces, rather
 * than something a helper script approximated. Without this, every other test
 * would be verifying the parser against a stand-in for its real input.
 *
 * Skipped unless the source PDF is present: `samples/` is gitignored to keep
 * multi-megabyte binaries out of git, so CI runs the fixture-backed tests only.
 */

const SAMPLE = path.resolve(
  __dirname,
  "../../samples/IIT M DEGREE AN EXAM QDB2 26 Oct 2025.pdf"
);
const hasSample = existsSync(SAMPLE);

describe.skipIf(!hasSample)("extractPdf against the real PDF", () => {
  it("reproduces the committed fixture", async () => {
    const buf = readFileSync(SAMPLE);
    const extract = await extractPdf(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    );

    expect(extract.pageCount).toBe(fixture.pageCount);
    expect(extract.lines).toHaveLength(fixture.lines.length);
    expect(Object.keys(extract.optionColour)).toHaveLength(
      Object.keys(fixture.optionColour).length
    );

    // The fixture stores coordinates rounded to one decimal, so a value sitting
    // on a rounding boundary may legitimately land one step either side.
    const near = (got: number, want: number) => Math.abs(Math.round(got * 10) / 10 - want) <= 0.11;
    for (let i = 0; i < extract.lines.length; i++) {
      const got = extract.lines[i];
      const want = fixture.lines[i];
      expect(got.text).toBe(want.text);
      expect(got.page).toBe(want.page);
      expect(near(got.y, want.y)).toBe(true);
      expect(near(got.x, want.x)).toBe(true);
      expect(got.pieces).toHaveLength(want.pieces.length);
    }

    expect(extract.optionColour).toEqual(fixture.optionColour);
  }, 120_000);

  it("classifies every option as correct or incorrect and nothing else", async () => {
    const buf = readFileSync(SAMPLE);
    const extract = await extractPdf(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    );
    const seen = new Set(Object.values(extract.optionColour));
    expect([...seen].sort()).toEqual([CORRECT_COLOUR, INCORRECT_COLOUR].sort());

    // And the parser reaches the same paper from the live extraction.
    const paper = parseTcsIonPaper(extract);
    expect(paper.courses).toHaveLength(15);
    expect(paper.stats.questions).toBe(211);
    expect(paper.stats.flagged).toBe(5);
  }, 120_000);
});
