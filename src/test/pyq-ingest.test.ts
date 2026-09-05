import { describe, expect, it } from "vitest";
import cohorts from "./fixtures/tcs-ion-cohorts.json";
import type { Question } from "@/data/questions";
import type { TcsIonPaper } from "@/lib/parse-tcs-ion";
import {
  countOfPaper,
  courseSlug,
  durationForExamType,
  hashCoursePaper,
  headingsOf,
  inferExamType,
  marksOfPaper,
  mergeSitting,
  normaliseCourseHeading,
  parsePaperFilename,
  sittingDateConflict,
  termForDate,
  type MergeInput,
} from "@/lib/pyq-ingest";

/**
 * The fixture holds one course parsed out of four real papers:
 *
 *   quiz1-qdb2 / quiz1-qdb3   "Deep Learning" — same cohort, different exam code
 *   et-degree-qdb1 / et-diploma-qdd1  "AI" — same date and slot, different cohort
 *
 * Those two pairs are the whole basis of the dedup model, so they are asserted
 * against real extractions rather than hand-written samples.
 */
type Slice = { file: string; course: string; questions: Question[] };
const slice = (k: keyof typeof cohorts) => cohorts[k] as unknown as Slice;

describe("parsePaperFilename", () => {
  it("reads programme, slot, code and date from real filenames", () => {
    expect(parsePaperFilename("IIT M DEGREE FN EXAM QDB1 31 Aug 2025.pdf")).toEqual({
      programme: "degree",
      slot: "fn",
      code: "QDB1",
      codeFamily: "QDB",
      date: "2025-08-31",
    });

    expect(parsePaperFilename("IIT M FOUNDATION AN EXAM QDF3 03 Aug 2025.pdf")).toMatchObject({
      programme: "foundation",
      slot: "an",
      code: "QDF3",
      date: "2025-08-03",
    });

    // Full month name, as the Quiz 1 batch is written.
    expect(parsePaperFilename("IIT M DEGREE AN EXAM QDB2 13 July 2025.pdf")).toMatchObject({
      code: "QDB2",
      date: "2025-07-13",
    });

    expect(parsePaperFilename("IIT M IMPROVEMENT AN EXAM QIC3 31 Aug 2025.pdf")).toMatchObject({
      programme: "improvement",
      codeFamily: "QIC",
    });
  });

  it("treats the trailing digit as a variant of one cohort code", () => {
    const a = parsePaperFilename("IIT M DEGREE FN EXAM QDB1 31 Aug 2025.pdf")!;
    const b = parsePaperFilename("IIT M DEGREE FN EXAM QDB2 31 Aug 2025.pdf")!;
    expect(a.codeFamily).toBe(b.codeFamily);
    expect(a.code).not.toBe(b.code);
  });

  it("returns null rather than guessing at an unknown name", () => {
    expect(parsePaperFilename("some-random-paper.pdf")).toBeNull();
    expect(parsePaperFilename("IIT M DEGREE XX EXAM QDB1 31 Aug 2025.pdf")).toBeNull();
  });
});

describe("normaliseCourseHeading", () => {
  it("collapses the semester prefix that some papers add and others do not", () => {
    expect(normaliseCourseHeading("Sem2 Maths2")).toBe("maths2");
    expect(normaliseCourseHeading("Maths2")).toBe("maths2");
    expect(normaliseCourseHeading("Sem1 Statistics1")).toBe("statistics1");
    expect(normaliseCourseHeading("Sem2 Intro to Python")).toBe("intro to python");
    expect(normaliseCourseHeading("Intro to Python")).toBe("intro to python");
  });

  it("lowercases and tidies whitespace without mangling the name", () => {
    expect(normaliseCourseHeading("  Sw   Engg ")).toBe("sw engg");
    expect(normaliseCourseHeading("DL(CV)")).toBe("dl(cv)");
  });
});

describe("courseSlug", () => {
  it("matches the app's existing slug shape", () => {
    expect(courseSlug("Machine Learning Foundations")).toBe("machine-learning-foundations");
    expect(courseSlug("DL(CV)")).toBe("dlcv");
    expect(courseSlug("Statistics I")).toBe("statistics-i");
  });
});

describe("hashCoursePaper", () => {
  it("gives two exam codes of the same cohort one hash", () => {
    const a = slice("quiz1-qdb2");
    const b = slice("quiz1-qdb3");
    expect(a.questions.length).toBeGreaterThan(0);
    expect(a.questions).toHaveLength(b.questions.length);
    expect(hashCoursePaper(a.questions)).toBe(hashCoursePaper(b.questions));
  });

  it("keeps two cohorts apart even on the same date and slot", () => {
    // Degree and Diploma both sat "AI" on 31 Aug 2025 FN, but the papers differ.
    const deg = slice("et-degree-qdb1");
    const dip = slice("et-diploma-qdd1");
    expect(hashCoursePaper(deg.questions)).not.toBe(hashCoursePaper(dip.questions));
  });

  it("ignores figure ids, which are assigned per import", () => {
    const base = slice("quiz1-qdb2").questions;
    const renumbered: Question[] = JSON.parse(JSON.stringify(base));
    for (const q of renumbered) {
      q.stem = q.stem.replace(/asset-f(\d+)/g, (_, n) => `asset-f${Number(n) + 500}`);
      q.options = q.options.map((o) => o.replace(/asset-f(\d+)/g, (_, n) => `asset-f${Number(n) + 500}`));
      q.assets = q.assets.map((a) => ({ ...a, id: `f${Number(a.id.slice(1)) + 500}` }));
    }
    expect(hashCoursePaper(renumbered)).toBe(hashCoursePaper(base));
  });

  it("changes when an answer key changes", () => {
    const base = slice("quiz1-qdb2").questions;
    const tampered: Question[] = JSON.parse(JSON.stringify(base));
    const target = tampered.find((q) => q.correct.length > 0)!;
    target.correct = [(target.correct[0] + 1) % 4];
    expect(hashCoursePaper(tampered)).not.toBe(hashCoursePaper(base));
  });
});

describe("marksOfPaper / countOfPaper", () => {
  it("counts comprehension children rather than their container", () => {
    const qs = slice("quiz1-qdb2").questions;
    const comprehensions = qs.filter((q) => q.type === "comprehension");
    const expected = qs.length - comprehensions.length +
      comprehensions.reduce((n, q) => n + q.subQuestions.length, 0);
    expect(countOfPaper(qs)).toBe(expected);
    expect(marksOfPaper(qs)).toBeGreaterThan(0);
  });
});

/* ── Merging ──────────────────────────────────────────────────────────────── */

const asPaper = (name: string, questions: Question[]): TcsIonPaper => ({
  paperName: name,
  courses: [{ name, sectionId: "s1", questions }],
  regions: {},
  stats: { blocks: 0, declarations: 0, questions: questions.length, byType: {}, figures: 0, flagged: 0 },
});

const input = (filename: string, courseName: string, questions: Question[]): MergeInput => ({
  file: parsePaperFilename(filename)!,
  paper: asPaper(courseName, questions),
});

describe("mergeSitting", () => {
  it("collapses two codes of one cohort into a single paper", () => {
    const merged = mergeSitting([
      input("IIT M DEGREE AN EXAM QDB2 13 July 2025.pdf", "Deep Learning", slice("quiz1-qdb2").questions),
      input("IIT M DEGREE AN EXAM QDB3 13 July 2025.pdf", "Deep Learning", slice("quiz1-qdb3").questions),
    ]);

    expect(merged.papers).toHaveLength(1);
    expect(merged.papers[0].sourceCodes.sort()).toEqual(["QDB2", "QDB3"]);
    expect(merged.stats.duplicates).toBe(1);
    expect(merged.stats.variants).toBe(0);
    expect(merged.papers[0].variantLabel).toBe("");
  });

  it("keeps two cohorts as separate papers for the same course", () => {
    const merged = mergeSitting([
      input("IIT M DEGREE FN EXAM QDB1 31 Aug 2025.pdf", "AI", slice("et-degree-qdb1").questions),
      input("IIT M DIPLOMA FN EXAM QDD1 31 Aug 2025.pdf", "AI", slice("et-diploma-qdd1").questions),
    ]);

    expect(merged.papers).toHaveLength(2);
    expect(merged.papers.map((p) => p.programme).sort()).toEqual(["degree", "diploma"]);
    expect(merged.stats.duplicates).toBe(0);
    // Different cohorts are not variants of one another.
    expect(merged.stats.variants).toBe(0);
  });

  it("labels a genuine second version within one cohort", () => {
    const altered: Question[] = JSON.parse(JSON.stringify(slice("quiz1-qdb2").questions));
    altered[0].stem = `${altered[0].stem} (revised)`;

    const merged = mergeSitting([
      input("IIT M DEGREE AN EXAM QDB2 13 July 2025.pdf", "Deep Learning", slice("quiz1-qdb2").questions),
      input("IIT M DEGREE AN EXAM QDB3 13 July 2025.pdf", "Deep Learning", altered),
    ]);

    expect(merged.papers).toHaveLength(2);
    expect(merged.stats.variants).toBe(1);
    expect(merged.papers.map((p) => p.variantLabel).sort()).toEqual(["", "Set B"]);
  });

  it("normalises headings so Sem-prefixed and bare names are one course", () => {
    const qs = slice("quiz1-qdb2").questions;
    const merged = mergeSitting([
      input("IIT M FOUNDATION AN EXAM QDF2 03 Aug 2025.pdf", "Sem2 Maths2", qs),
      input("IIT M FOUNDATION AN EXAM QDF3 03 Aug 2025.pdf", "Maths2", qs),
    ]);
    expect(merged.papers).toHaveLength(1);
    expect(headingsOf(merged)).toEqual(["maths2"]);
  });

  it("points every paper at a file that really contains its heading", () => {
    /* `sourceFileIndex` is what the importer uses to crop figures: it looks the
       course up by heading inside `inputs[sourceFileIndex]`. If the index and
       the heading ever disagreed, figures would be cropped from the wrong PDF —
       silently, since every PDF has pages at those coordinates. */
    const inputs = [
      input("IIT M DEGREE AN EXAM QDB2 13 July 2025.pdf", "Deep Learning", slice("quiz1-qdb2").questions),
      input("IIT M DIPLOMA FN EXAM QDD1 31 Aug 2025.pdf", "AI", slice("et-diploma-qdd1").questions),
      input("IIT M DEGREE FN EXAM QDB1 31 Aug 2025.pdf", "AI", slice("et-degree-qdb1").questions),
    ];
    const merged = mergeSitting(inputs);

    expect(merged.papers.length).toBeGreaterThan(0);
    for (const paper of merged.papers) {
      const source = inputs[paper.sourceFileIndex];
      expect(source).toBeDefined();
      expect(source.paper.courses.some((c) => c.name === paper.sourceHeading)).toBe(true);
      // And the file it points at is the cohort the paper claims to be from.
      expect(source.file.programme).toBe(paper.programme);
    }
  });

  it("keeps the first file's index when a later code is deduped into it", () => {
    const inputs = [
      input("IIT M DEGREE AN EXAM QDB2 13 July 2025.pdf", "Deep Learning", slice("quiz1-qdb2").questions),
      input("IIT M DEGREE AN EXAM QDB3 13 July 2025.pdf", "Deep Learning", slice("quiz1-qdb3").questions),
    ];
    const merged = mergeSitting(inputs);

    expect(merged.papers).toHaveLength(1);
    expect(merged.papers[0].sourceFileIndex).toBe(0);
    // The surviving index must still resolve, which is the property that keeps
    // figure cropping correct after a dedup.
    const source = inputs[merged.papers[0].sourceFileIndex];
    expect(source.paper.courses.some((c) => c.name === merged.papers[0].sourceHeading)).toBe(true);
  });

  it("reports every date present so a mixed batch can be rejected", () => {
    const qs = slice("quiz1-qdb2").questions;
    const inputs = [
      input("IIT M DEGREE AN EXAM QDB2 13 July 2025.pdf", "Deep Learning", qs),
      input("IIT M DEGREE FN EXAM QDB1 31 Aug 2025.pdf", "AI", qs),
    ];
    expect(sittingDateConflict(inputs)).toEqual(["2025-07-13", "2025-08-31"]);
  });
});

/* ── Exam type and term ───────────────────────────────────────────────────── */

describe("inferExamType", () => {
  const schedule = [
    { examType: "quiz_1" as const, date: "2025-07-13" },
    { examType: "quiz_2" as const, date: "2025-08-03" },
    { examType: "end_term" as const, date: "2025-08-31" },
  ];

  it("matches the real sitting dates", () => {
    expect(inferExamType("2025-07-13", schedule)).toBe("quiz_1");
    expect(inferExamType("2025-08-03", schedule)).toBe("quiz_2");
    expect(inferExamType("2025-08-31", schedule)).toBe("end_term");
  });

  it("tolerates a date a few days off the scheduled one", () => {
    expect(inferExamType("2025-08-05", schedule)).toBe("quiz_2");
  });

  it("declines rather than guessing when nothing is close", () => {
    expect(inferExamType("2025-01-15", schedule)).toBeNull();
    expect(inferExamType("2025-08-31", [])).toBeNull();
    expect(inferExamType("", schedule)).toBeNull();
  });
});

describe("durationForExamType", () => {
  it("applies the per-course business rule, not the PDF's duration field", () => {
    expect(durationForExamType("quiz_1")).toBe(60);
    expect(durationForExamType("quiz_2")).toBe(60);
    expect(durationForExamType("end_term")).toBe(90);
  });
});

describe("termForDate", () => {
  it("maps the sample sittings onto IITM terms", () => {
    expect(termForDate("2025-07-13")).toEqual({ term: "May Term", year: 2025 });
    expect(termForDate("2025-08-31")).toEqual({ term: "May Term", year: 2025 });
    expect(termForDate("2025-10-26")).toEqual({ term: "Sept Term", year: 2025 });
    expect(termForDate("2026-02-15")).toEqual({ term: "Jan Term", year: 2026 });
  });
});
