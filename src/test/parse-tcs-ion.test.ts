import { describe, expect, it } from "vitest";
import fixture from "./fixtures/tcs-ion-sample.json";
import {
  parseTcsIonPaper,
  attachAssets,
  narrowToCourse,
  type TcsIonPaper,
} from "@/lib/parse-tcs-ion";
import { parseBulkPaper, serializeBlock } from "@/lib/parse-bulk-paper";
import { parsePaperMetaFromText } from "@/lib/pyq-ingest";
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

describe("parseTcsIonPaper — content-based metadata", () => {
  it("reads the document's own Question Paper Name row", () => {
    expect(paper.contentPaperName).toBe("IIT M DEGREE AN EXAM QDB2 26 Oct 2025");
  });

  it("that row carries the same convention parsePaperFilename expects from a filename", () => {
    const meta = parsePaperMetaFromText(paper.contentPaperName!);
    expect(meta).toEqual({
      programme: "degree",
      slot: "an",
      code: "QDB2",
      codeFamily: "QDB",
      date: "2025-10-26",
    });
  });
});

describe("parseTcsIonPaper — page tracking", () => {
  it("gives every course a 1-based start page", () => {
    for (const c of paper.courses) {
      expect(c.startPage).toBeGreaterThanOrEqual(1);
    }
  });

  it("orders course start pages the same way the courses appear in the PDF", () => {
    const pages = paper.courses.map((c) => c.startPage);
    expect(pages).toEqual([...pages].sort((a, b) => a - b));
  });

  it("gives every question a page number no earlier than its own course's start page", () => {
    for (const c of paper.courses) {
      expect(c.questionPages).toHaveLength(c.questions.length);
      for (const page of c.questionPages) {
        expect(page).toBeGreaterThanOrEqual(c.startPage);
      }
    }
  });
});

describe("parseTcsIonPaper — question counts", () => {
  it("reads every block in the paper", () => {
    expect(paper.stats.blocks).toBe(302);
  });

  it("drops the per-section declaration prompt", () => {
    // One zero-mark "THIS IS QUESTION…" consent item opens each of the 15 sections.
    expect(paper.stats.declarations).toBe(15);
    // None of them carries shared reference data in this paper.
    expect(paper.stats.references).toBe(0);
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
  it("flags only the known fidelity gaps and the pen-and-paper items, on 11 questions", () => {
    // 5 answer-format gaps plus 6 pen-and-paper attestations (PSOSM and DVD).
    expect(paper.stats.flagged).toBe(11);
    const issues = allQuestions.flatMap((q) => q.issues);
    for (const i of issues) {
      expect(i).toMatch(/only the first is stored|not numeric|pen-and-paper/);
    }
  });

  it("flags every pen-and-paper attestation instead of trusting its fake answer key", () => {
    // These sections are written on paper; the online item only records "I have
    // written answers on the answer sheets" (marked correct) or "Not applicable".
    const pen = allQuestions.filter((q) => q.options.includes("I have written answers on the answer sheets"));
    expect(pen.map((q) => q.id).sort()).toEqual(
      [
        "tcs-6406531525463",
        "tcs-6406531525464",
        "tcs-6406531525465",
        "tcs-6406531525467",
        "tcs-6406531525468",
        "tcs-6406531525469",
      ].sort()
    );
    for (const q of pen) {
      expect(q.isValid).toBe(false);
      expect(q.issues.join(" ")).toMatch(/pen-and-paper/);
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

/* -- Focused regressions from the QIV4 26 Oct 2025 audit ---------------------
 *
 * Built from hand-written lines that reproduce the real layout (positions as
 * pdf-extract reports them for that paper), so they run without the PDF. */

const W = 595.5;
const H = 842.25;

function row(page: number, y: number, text: string, x = 22.9) {
  const x2 = x + text.length * 6;
  return { page, x, y, x2, y2: y + 12, text, pieces: [{ x, x2, text }] };
}

/** `<id>.` then the option content, as separate pieces, the way an option row arrives. */
function option(page: number, y: number, id: string, text: string) {
  return {
    page,
    x: 23.6,
    y,
    x2: 134 + text.length * 6,
    y2: y + 12,
    text: `${id}. ${text}`,
    pieces: [
      { x: 23.6, x2: 115.9, text: `${id}.` },
      { x: 115.9, x2: 134, text: " " },
      { x: 134, x2: 134 + text.length * 6, text },
    ],
  };
}

function synthetic(lines: ReturnType<typeof row>[], correct: string[], wrong: string[]): PdfExtract {
  const optionColour: Record<string, string> = {};
  for (const id of correct) optionColour[id] = "#008000";
  for (const id of wrong) optionColour[id] = "#ff0000";
  const pages = Math.max(...lines.map((l) => l.page)) + 1;
  return {
    lines,
    optionColour,
    pageCount: pages,
    pageHeight: Array(pages).fill(H),
    pageWidth: Array(pages).fill(W),
  };
}

const heading = (y: number) => [row(0, y, "CT", 290), row(0, y + 27, "Section Id : 640653106212", 20.6)];

describe("parseTcsIonPaper - figure position (QIV4 audit)", () => {
  it("keeps a passage figure above the text that follows it", () => {
    // Statistics1 Q27-28: the data table is drawn between the label and
    // "Based on the above data", and used to be moved below that sentence.
    const extract = synthetic(
      [
        ...heading(20),
        row(0, 100, "Question Id : 6406531531106 Question Type : COMPREHENSION Sub Question Shuffling"),
        row(0, 120, "Allowed : No Group Comprehension Questions : No Question Pattern Type : NonMatrix"),
        row(0, 140, "Question Numbers : (27 to 27)"),
        row(0, 160, "Question Label : Comprehension"),
        row(0, 330, "Based on the above data, answer the given subquestions."),
        row(0, 350, "Sub questions"),
        row(0, 380, "Question Number : 27 Question Id : 6406531531107 Question Type : SA"),
        row(0, 400, "Correct Marks : 2"),
        row(0, 420, "Question Label : Short Answer Question"),
        row(0, 440, "What is the mean?"),
        row(0, 460, "Response Type : Numeric"),
        row(0, 480, "Answers Type : Equal"),
        row(0, 500, "Possible Answers :"),
        row(0, 520, "256"),
      ],
      [],
      []
    );
    const q = parseTcsIonPaper(extract).courses[0].questions[0];
    expect(q.type).toBe("comprehension");
    expect(q.passage).toBe(
      "![Question figure](asset-f1)\n\nBased on the above data, answer the given subquestions."
    );
    expect(q.subQuestions[0].numericalAnswer).toBe("256");
  });

  it("keeps a stem figure between the two lines it separates", () => {
    // English1 Q117: instruction, then the matching table, then "[1] Worldly".
    const extract = synthetic(
      [
        ...heading(20),
        row(0, 100, "Question Number : 117 Question Id : 6406531531209 Question Type : MCQ"),
        row(0, 120, "Correct Marks : 2"),
        row(0, 140, "Question Label : Multiple Choice Question"),
        row(0, 160, "Based on your reading of the text, match the adjectives to their fitting nouns."),
        row(0, 330, "[1] Worldly"),
        row(0, 350, "Options :"),
        option(0, 370, "6406535125171", "Heritage"),
        option(0, 390, "6406535125172", "Communication"),
        option(0, 410, "6406535125173", "Means"),
      ],
      ["6406535125173"],
      ["6406535125171", "6406535125172"]
    );
    const q = parseTcsIonPaper(extract).courses[0].questions[0];
    expect(q.stem).toBe(
      "Based on your reading of the text, match the adjectives to their fitting nouns.\n\n" +
        "![Question figure](asset-f1)\n\n[1] Worldly"
    );
    expect(q.correct).toEqual([2]);
  });

  it("still writes text-then-figure stems exactly as before", () => {
    const extract = synthetic(
      [
        ...heading(20),
        row(0, 100, "Question Number : 1 Question Id : 1 Question Type : MCQ"),
        row(0, 120, "Correct Marks : 1"),
        row(0, 140, "Question Label : Multiple Choice Question"),
        row(0, 160, "Match Col A with Col B:"),
        row(0, 300, "Options :"),
        option(0, 320, "6406535125455", "A"),
        option(0, 340, "6406535125456", "B"),
      ],
      ["6406535125455"],
      ["6406535125456"]
    );
    const q = parseTcsIonPaper(extract).courses[0].questions[0];
    expect(q.stem).toBe("Match Col A with Col B:\n\n![Question figure](asset-f1)");
  });
});

describe("parseTcsIonPaper - shared reference material (QIV4 audit)", () => {
  const refExtract = synthetic(
    [
      ...heading(20),
      // The declaration: dropped, and not reference material.
      row(0, 100, "Question Number : 1 Question Id : 6406531531080 Question Type : MCQ"),
      row(0, 120, "Correct Marks : 0"),
      row(0, 140, "Question Label : Multiple Choice Question"),
      row(0, 160, "THIS IS QUESTION PAPER FOR THE SUBJECT \"FOUNDATION LEVEL : COMPUTATIONAL THINKING\""),
      row(0, 180, "Options :"),
      option(0, 200, "6406535124799", "YES"),
      option(0, 220, "6406535124800", "NO"),
      // CT's "Library" dataset: a zero-mark item whose stem is the data table.
      row(0, 260, "Question Number : 2 Question Id : 6406531531081 Question Type : MCQ"),
      row(0, 280, "Correct Marks : 0"),
      row(0, 300, "Question Label : Multiple Choice Question"),
      row(0, 600, "Options :"),
      option(0, 620, "6406535124801", "Useful Data has been mentioned above."),
      option(0, 640, "6406535124802", "This data attachment is just for a reference & not for an evaluation."),
      row(0, 680, "Question Number : 3 Question Id : 6406531531086 Question Type : MCQ"),
      row(0, 700, "Correct Marks : 4"),
      row(0, 720, "Question Label : Multiple Choice Question"),
      row(0, 740, "The following pseudocode is executed using the \"Library\" dataset."),
      row(0, 760, "Options :"),
      option(0, 780, "6406535124810", "No errors"),
      option(0, 800, "6406535124811", "Line 9"),
    ],
    ["6406535124799", "6406535124801", "6406535124810"],
    ["6406535124800", "6406535124802", "6406535124811"]
  );
  const refPaper = parseTcsIonPaper(refExtract);
  const q = refPaper.courses[0].questions[0];
  const figureId = q.passage.match(/asset-(f\d+)/)?.[1] ?? "";

  it("attaches the dataset to the questions after it instead of dropping it", () => {
    expect(refPaper.stats.declarations).toBe(2);
    expect(refPaper.stats.references).toBe(1);
    expect(refPaper.stats.questions).toBe(1);
    expect(q.passage).toBe(`![Question figure](asset-${figureId})`);
    expect(q.assets.map((a) => a.id)).toContain(figureId);
    expect(refPaper.regions[figureId]).toMatchObject({ page: 0, y: 317, y2: 600 });
    expect(q.stem).toContain("Library");
    expect(q.isValid).toBe(true);
  });

  it("never turns the consent declaration into a passage", () => {
    expect(q.passage).not.toMatch(/THIS IS QUESTION PAPER/);
  });

  it("carries the dataset through narrowToCourse and attachAssets", async () => {
    const one = narrowToCourse(refPaper, 0);
    expect(one.regions[figureId]).toBeDefined();
    await attachAssets(one, { cropRegion: async () => "data:image/png;base64,AAAA" });
    const copy = one.courses[0].questions[0];
    expect(copy.passage).toContain(`asset-${figureId}`);
    expect(copy.assets.find((a) => a.id === figureId)?.src).toContain("data:");
  });
});

describe("parseTcsIonPaper - pen-and-paper items (QIV4 audit)", () => {
  it("flags an attestation item instead of publishing it as a 24-mark MCQ", () => {
    const extract = synthetic(
      [
        ...heading(20),
        row(0, 100, "Question Number : 152 Question Id : 6406531531246 Question Type : MCQ"),
        row(0, 120, "Correct Marks : 24"),
        row(0, 140, "Question Label : Multiple Choice Question"),
        row(0, 600, "Options :"),
        option(0, 620, "6406535125303", "I have written answers on the answer sheets"),
        option(0, 640, "6406535125304", "Not applicable"),
      ],
      ["6406535125303"],
      ["6406535125304"]
    );
    const p = parseTcsIonPaper(extract);
    const q = p.courses[0].questions[0];
    expect(q.isValid).toBe(false);
    expect(q.issues).toHaveLength(1);
    expect(q.issues[0]).toMatch(/pen-and-paper/);
    expect(p.stats.flagged).toBe(1);
  });
});

describe("parseTcsIonPaper - wrapped Question Paper Name (QIV4 audit)", () => {
  it("joins a value the header table wrapped around its label", () => {
    // The real layout: the value's first line sits above the label's baseline,
    // the rest below it, and the label row itself carries no value.
    const extract = synthetic(
      [
        row(0, 207, "IIT M IMPROVEMENT AN EXAM QIV4 26 Oct", 330.1),
        {
          page: 0,
          x: 20.6,
          y: 215,
          x2: 143,
          y2: 227,
          text: "Question Paper Name : ",
          pieces: [
            { x: 20.6, x2: 140, text: "Question Paper Name :" },
            { x: 140, x2: 143, text: " " },
          ],
        },
        row(0, 224, "2025", 330.1),
        row(0, 243, "Subject Name : 2025 Oct26: IIT M AN EXAM QIV4", 20.6),
      ],
      [],
      []
    );
    const p = parseTcsIonPaper(extract);
    expect(p.contentPaperName).toBe("IIT M IMPROVEMENT AN EXAM QIV4 26 Oct 2025");
    expect(parsePaperMetaFromText(p.contentPaperName!)).toEqual({
      programme: "improvement",
      slot: "an",
      code: "QIV4",
      codeFamily: "QIV",
      date: "2025-10-26",
    });
  });
});
