import { describe, expect, it } from "vitest";
import fixture from "./fixtures/tcs-ion-sample.json";
import {
  parseTcsIonPaper,
  attachAssets,
  narrowToCourse,
  type TcsIonPaper,
} from "@/lib/parse-tcs-ion";
import { parseBulkPaper, serializeBlock } from "@/lib/parse-bulk-paper";
import type { PdfExtract } from "@/lib/pdf-extract";

/**
 * Regression net for the TCS iON importer.
 *
 * The fixture is the real line stream `@/lib/pdf-extract` produces for
 * "IIT M DEGREE AN EXAM QDB2 26 Oct 2025" (143 pages, 15 courses), recorded once
 * so the tests never need the 10 MB PDF. Every expected number below was
 * established independently, by extracting the same paper with PyMuPDF.
 */

const extract = fixture as unknown as PdfExtract;
const paper: TcsIonPaper = parseTcsIonPaper(extract, "QDB2 26 Oct 2025");

const allQuestions = paper.courses.flatMap((c) => c.questions);

describe("parseTcsIonPaper — course segmentation", () => {
  it("splits the paper into its 15 courses", () => {
    expect(paper.courses).toHaveLength(15);
  });

  it("names courses from the heading above each Section Id", () => {
    expect(paper.courses.map((c) => c.name)).toEqual([
      "Corporate Finance",
      "Financial Forensics",
      "Deep Learning",
      "Game Theory and Strategy",
      "DLP",
      "Programming in C",
      "PSOSM",
      "DVD",
      "AI",
      "LLM",
      "Computer System Design",
      "Industry 4.0",
      "DL(CV)",
      "RL",
      "Mathematical Foundations of Generative AI",
    ]);
  });

  it("gives every course a section id", () => {
    for (const c of paper.courses) expect(c.sectionId).toMatch(/^\d+$/);
  });
});

describe("parseTcsIonPaper — question counts", () => {
  it("reads every block in the paper", () => {
    expect(paper.stats.blocks).toBe(302);
  });

  it("drops the per-section declaration prompt", () => {
    // One zero-mark "THIS IS QUESTION…" consent item opens each of the 15 sections.
    expect(paper.stats.declarations).toBe(15);
  });

  it("produces 211 top-level questions, absorbing comprehension children", () => {
    // 302 blocks − 15 declarations = 287 real; 76 of those are sub-questions
    // owned by the 23 comprehension parents, leaving 211 at the top level.
    expect(paper.stats.questions).toBe(211);
    expect(allQuestions).toHaveLength(211);
  });

  it("maps the four source types onto the builder's model", () => {
    expect(paper.stats.byType).toEqual({ MCQ: 131, MSQ: 25, SA: 32, COMPREHENSION: 23 });

    const byQType = allQuestions.reduce<Record<string, number>>((acc, q) => {
      acc[q.type] = (acc[q.type] ?? 0) + 1;
      return acc;
    }, {});
    expect(byQType).toEqual({ single: 131, multi: 25, numerical: 32, comprehension: 23 });
  });

  it("accounts for every question in the paper", () => {
    const subs = allQuestions.reduce((n, q) => n + q.subQuestions.length, 0);
    expect(paper.stats.questions + subs + paper.stats.declarations).toBe(paper.stats.blocks);
  });
});

describe("parseTcsIonPaper — answer keys", () => {
  const choice = allQuestions.filter((q) => q.type === "single" || q.type === "multi");

  it("recovers a correct option for every choice question", () => {
    const missing = choice.filter((q) => q.correct.length === 0);
    expect(missing).toHaveLength(0);
  });

  it("marks exactly one answer on every single-correct question", () => {
    const single = allQuestions.filter((q) => q.type === "single");
    expect(single).toHaveLength(131);
    for (const q of single) expect(q.correct).toHaveLength(1);
  });

  it("recovers a correct option for every sub-question too", () => {
    const subs = allQuestions
      .flatMap((q) => q.subQuestions)
      .filter((s) => s.type !== "numerical");
    expect(subs).toHaveLength(38);
    for (const s of subs) expect(s.correct.length).toBeGreaterThan(0);
  });

  it("allows multi-correct questions more than one answer", () => {
    const multi = allQuestions.filter((q) => q.type === "multi");
    const counts = multi.map((q) => q.correct.length).sort((a, b) => a - b);
    expect(counts[0]).toBeGreaterThanOrEqual(1);
    expect(counts[counts.length - 1]).toBeGreaterThan(1);
  });

  it("keeps the correct indices inside the option list", () => {
    for (const q of choice) {
      for (const i of q.correct) {
        expect(i).toBeGreaterThanOrEqual(0);
        expect(q.options[i]).toBeDefined();
      }
    }
  });

  it("gives every numerical question an answer", () => {
    const num = allQuestions.filter((q) => q.type === "numerical");
    expect(num).toHaveLength(32);
    for (const q of num) expect(q.numericalAnswer).not.toBe("");

    const subNum = allQuestions.flatMap((q) => q.subQuestions).filter((s) => s.type === "numerical");
    expect(subNum).toHaveLength(38);
    for (const s of subNum) expect(s.numericalAnswer).not.toBe("");
  });

  it("keeps a `Range` answer verbatim", () => {
    const ranges = allQuestions
      .flatMap((q) => [q, ...q.subQuestions])
      .filter((q) => /^-?[\d.]+ to -?[\d.]+$/.test(q.numericalAnswer));
    expect(ranges.length).toBeGreaterThan(0);
  });
});

describe("parseTcsIonPaper — review flags", () => {
  it("flags only the two known fidelity gaps, on 5 questions", () => {
    expect(paper.stats.flagged).toBe(5);
    const issues = allQuestions.flatMap((q) => q.issues);
    for (const i of issues) {
      expect(i).toMatch(/only the first is stored|not numeric/);
    }
  });

  it("names every alternative answer it could not store", () => {
    // `Answers Type : Set` accepts several strings; `\answer{}` holds one, so
    // the rest have to be visible to the admin rather than silently dropped.
    const multi = allQuestions.flatMap((q) => q.issues).filter((i) => i.includes("only the first"));
    expect(multi).toHaveLength(4);
    expect(multi.join("\n")).toContain("DE,120, ED,120");
    expect(multi.join("\n")).toContain("high, higher, large, largest");
  });

  it("warns where an alphanumeric answer meets the numeric keypad", () => {
    const alpha = allQuestions.flatMap((q) => q.issues).filter((i) => i.includes("not numeric"));
    expect(alpha).toHaveLength(17);
  });

  it("marks a question invalid exactly when it has issues", () => {
    for (const q of allQuestions) expect(q.isValid).toBe(q.issues.length === 0);
  });
});

describe("parseTcsIonPaper — comprehension", () => {
  const comp = allQuestions.filter((q) => q.type === "comprehension");

  it("finds all 23 comprehension groups", () => {
    expect(comp).toHaveLength(23);
  });

  it("attaches all 76 sub-questions to their parents", () => {
    const total = comp.reduce((n, q) => n + q.subQuestions.length, 0);
    expect(total).toBe(76);
  });

  it("gives every group a passage and at least one sub-question", () => {
    for (const q of comp) {
      expect(q.passage.length).toBeGreaterThan(0);
      expect(q.subQuestions.length).toBeGreaterThan(0);
    }
  });

  it("resolves every sub-question to a concrete type", () => {
    for (const q of comp) {
      for (const sq of q.subQuestions) {
        expect(["single_correct", "multi_correct", "numerical"]).toContain(sq.type);
      }
    }
  });
});

describe("parseTcsIonPaper — figures", () => {
  it("finds the rasterised stems and options", () => {
    // 90 image-only stems and 34 questions with image-only options in the sample.
    expect(paper.stats.figures).toBeGreaterThan(100);
  });

  it("references each asset from the text that owns it", () => {
    for (const q of allQuestions) {
      const body = [q.stem, q.passage, ...q.options].join("\n");
      for (const a of q.assets) expect(body).toContain(`asset-${a.id}`);
    }
  });

  it("registers a crop region for every referenced asset", () => {
    for (const q of allQuestions) {
      for (const a of q.assets) expect(paper.regions[a.id]).toBeDefined();
    }
  });

  it("keeps crop regions inside the page", () => {
    for (const [, r] of Object.entries(paper.regions)) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.y2).toBeGreaterThan(r.y);
      expect(r.x2).toBeGreaterThan(r.x);
      expect(r.x2).toBeLessThanOrEqual(extract.pageWidth[r.page] + 1);
    }
  });
});

describe("narrowToCourse", () => {
  it("keeps only the chosen course and the regions it uses", () => {
    const one = narrowToCourse(paper, 2);
    expect(one.courses).toHaveLength(1);
    expect(one.courses[0].name).toBe("Deep Learning");

    const used = new Set(
      one.courses[0].questions.flatMap((q) => [
        ...q.assets.map((a) => a.id),
        ...q.subQuestions.flatMap((s) => s.assets.map((a) => a.id)),
      ])
    );
    expect(Object.keys(one.regions).sort()).toEqual([...used].sort());
    expect(Object.keys(one.regions).length).toBeLessThan(Object.keys(paper.regions).length);
  });

  it("does not alias the parent paper's questions", async () => {
    const source = parseTcsIonPaper(extract);
    const one = narrowToCourse(source, 2);
    // attachAssets strips unresolved references in place; the parent must not move.
    const before = source.courses[2].questions.map((q) => q.stem);
    await attachAssets(one, { cropRegion: async () => null });
    expect(source.courses[2].questions.map((q) => q.stem)).toEqual(before);
  });
});

describe("round trip through the bulk LaTeX dialect", () => {
  it("carries figure references through serialise then parse", () => {
    // A figure can belong to the stem or to an individual option, so check both.
    const stemFigure = allQuestions.find(
      (q) => q.type !== "comprehension" && q.stem.includes("asset-")
    )!;
    const optionFigure = allQuestions.find(
      (q) => q.type !== "comprehension" && q.options.some((o) => o.includes("asset-"))
    )!;
    expect(stemFigure).toBeDefined();
    expect(optionFigure).toBeDefined();

    const reStem = parseBulkPaper(serializeBlock(stemFigure)).blocks[0];
    expect(reStem.stem).toContain("asset-");

    const reOption = parseBulkPaper(serializeBlock(optionFigure)).blocks[0];
    expect(reOption.options.join(" ")).toContain("asset-");

    const reparsed = reStem;

    /* The dialect cannot express the figure itself, so a re-parse always reports
       no assets. Anything merging this back into a question has to keep the
       original list — see `setLatexSource` in the paper builder. */
    expect(reparsed.assets).toEqual([]);
  });
});

describe("attachAssets", () => {
  it("drops assets whose region turns out to be blank, and their references", async () => {
    const fresh = parseTcsIonPaper(extract);
    const kept = await attachAssets(fresh, { cropRegion: async () => null });

    expect(kept).toBe(0);
    for (const q of fresh.courses.flatMap((c) => c.questions)) {
      expect(q.assets).toHaveLength(0);
      expect(q.stem).not.toContain("asset-");
      expect(q.passage).not.toContain("asset-");
      for (const o of q.options) expect(o).not.toContain("asset-");
    }
  });

  it("fills in the data URL of every region that renders", async () => {
    const fresh = parseTcsIonPaper(extract);
    const png = "data:image/png;base64,AAAA";
    const kept = await attachAssets(fresh, { cropRegion: async () => png });

    expect(kept).toBe(Object.keys(fresh.regions).length);
    const withAssets = fresh.courses
      .flatMap((c) => c.questions)
      .filter((q) => q.assets.length > 0);
    expect(withAssets.length).toBeGreaterThan(0);
    for (const q of withAssets) for (const a of q.assets) expect(a.src).toBe(png);
  });
});
