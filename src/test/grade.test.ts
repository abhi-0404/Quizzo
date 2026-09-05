import { describe, expect, it } from "vitest";
import { gradeAnswer, matchesNumeric, summarise, type Gradable } from "@/lib/grade";

const single = (correct: number[], marks = 4): Gradable => ({
  type: "single",
  correct,
  numericalAnswer: "",
  marks,
});
const multi = (correct: number[], marks = 4): Gradable => ({
  type: "multi",
  correct,
  numericalAnswer: "",
  marks,
});
const numeric = (answer: string, marks = 4): Gradable => ({
  type: "integer",
  correct: [],
  numericalAnswer: answer,
  marks,
});

describe("gradeAnswer — single correct", () => {
  it("awards full marks for the right option", () => {
    expect(gradeAnswer(single([2]), 2)).toEqual({ status: "correct", marks: 4 });
  });

  it("awards nothing for the wrong option", () => {
    expect(gradeAnswer(single([2]), 1)).toEqual({ status: "incorrect", marks: 0 });
  });

  it("treats option 0 as an answer, not as absent", () => {
    // A falsy index must not be mistaken for "no response".
    expect(gradeAnswer(single([0]), 0)).toEqual({ status: "correct", marks: 4 });
  });

  it("records no answer as skipped rather than wrong", () => {
    expect(gradeAnswer(single([2]), null)).toEqual({ status: "skipped", marks: 0 });
    expect(gradeAnswer(single([2]), undefined)).toEqual({ status: "skipped", marks: 0 });
  });
});

describe("gradeAnswer — multi correct", () => {
  it("requires the exact set", () => {
    expect(gradeAnswer(multi([0, 2]), [0, 2])).toEqual({ status: "correct", marks: 4 });
    expect(gradeAnswer(multi([0, 2]), [2, 0])).toEqual({ status: "correct", marks: 4 });
  });

  it("gives no partial credit for a subset or a superset", () => {
    expect(gradeAnswer(multi([0, 2]), [0])).toMatchObject({ status: "incorrect", marks: 0 });
    expect(gradeAnswer(multi([0, 2]), [0, 1, 2])).toMatchObject({ status: "incorrect", marks: 0 });
  });

  it("sorts numerically, not lexicographically", () => {
    // [2, 10] must not compare as "10,2".
    expect(gradeAnswer(multi([2, 10]), [10, 2])).toEqual({ status: "correct", marks: 4 });
  });

  it("counts an empty selection as skipped", () => {
    expect(gradeAnswer(multi([0, 2]), [])).toEqual({ status: "skipped", marks: 0 });
  });
});

describe("gradeAnswer — numerical", () => {
  it("accepts an exact match", () => {
    expect(gradeAnswer(numeric("261000"), "261000")).toEqual({ status: "correct", marks: 4 });
  });

  it("compares numerically so formatting does not matter", () => {
    expect(gradeAnswer(numeric("3"), "3.0")).toMatchObject({ status: "correct" });
    expect(gradeAnswer(numeric("3.0"), "3")).toMatchObject({ status: "correct" });
  });

  it("accepts anything inside a Range answer", () => {
    // The source papers really do carry answers like "80 to 81".
    expect(gradeAnswer(numeric("80 to 81"), "80.5")).toMatchObject({ status: "correct" });
    expect(gradeAnswer(numeric("80 to 81"), "80")).toMatchObject({ status: "correct" });
    expect(gradeAnswer(numeric("80 to 81"), "82")).toMatchObject({ status: "incorrect" });
  });

  it("handles a negative range", () => {
    expect(gradeAnswer(numeric("-2.72 to -2.64"), "-2.7")).toMatchObject({ status: "correct" });
    expect(gradeAnswer(numeric("-2.72 to -2.64"), "-2.9")).toMatchObject({ status: "incorrect" });
  });

  it("matches alphanumeric answers case-insensitively", () => {
    expect(gradeAnswer(numeric("DE,120"), "de,120")).toMatchObject({ status: "correct" });
  });

  it("is skipped when nothing was typed", () => {
    expect(gradeAnswer(numeric("5"), "")).toEqual({ status: "skipped", marks: 0 });
    expect(gradeAnswer(numeric("5"), "   ")).toEqual({ status: "skipped", marks: 0 });
  });

  it("never marks correct when the paper carries no answer", () => {
    expect(matchesNumeric("5", "")).toBe(false);
  });
});

describe("summarise", () => {
  it("totals marks and counts each outcome", () => {
    const graded = [
      { status: "correct" as const, marks: 4 },
      { status: "correct" as const, marks: 3 },
      { status: "incorrect" as const, marks: 0 },
      { status: "skipped" as const, marks: 0 },
    ];
    expect(summarise(graded, 20)).toEqual({
      score: 7,
      totalMarks: 20,
      correct: 2,
      incorrect: 1,
      skipped: 1,
    });
  });
});
