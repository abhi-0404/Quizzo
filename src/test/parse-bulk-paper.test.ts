import { describe, it, expect } from "vitest";
import { parseBulkPaper, serializeBlock } from "@/lib/parse-bulk-paper";

const GOOD = `
\\begin{question}{MCQ}
\\marks{4}
\\stem
What is the median of $4, 8, 15, 16, 23, 42$?
\\options
- 11.5
+ 15.5
- 16
- 23
\\end{question}

\\begin{question}{NUM}
\\marks{5}
\\stem
Compute the variance.
\\answer{12.96}
\\end{question}

\\begin{comprehension}
\\passage
A survey of 120 students reported a mean of 14.2 hours.
\\begin{subquestion}{MSQ}
\\marks{3}
\\stem
Which statements hold?
\\options
+ mean is 14.2
+ n is 120
- sd is 9
\\end{subquestion}
\\begin{subquestion}{NUM}
\\marks{6}
\\stem
State the variance.
\\answer{12.96}
\\end{subquestion}
\\end{comprehension}
`;

describe("parseBulkPaper — happy path", () => {
  const { blocks, errors } = parseBulkPaper(GOOD);

  it("parses three blocks with no document errors", () => {
    expect(errors).toEqual([]);
    expect(blocks).toHaveLength(3);
    expect(blocks.every((b) => b.isValid)).toBe(true);
  });

  it("maps MCQ to single with the + option marked", () => {
    const q = blocks[0];
    expect(q.type).toBe("single");
    expect(q.marks).toBe(4);
    expect(q.stem).toContain("median");
    expect(q.options.slice(0, 4)).toEqual(["11.5", "15.5", "16", "23"]);
    expect(q.correct).toEqual([1]);
  });

  it("maps NUM to numerical with the answer", () => {
    expect(blocks[1].type).toBe("numerical");
    expect(blocks[1].numericalAnswer).toBe("12.96");
  });

  it("nests comprehension sub-questions with their own marks/types", () => {
    const c = blocks[2];
    expect(c.type).toBe("comprehension");
    expect(c.passage).toContain("120 students");
    expect(c.subQuestions).toHaveLength(2);
    expect(c.subQuestions[0].type).toBe("multi_correct");
    expect(c.subQuestions[0].correct).toEqual([0, 1]);
    expect(c.subQuestions[0].marks).toBe(3);
    expect(c.subQuestions[1].type).toBe("numerical");
    expect(c.subQuestions[1].numericalAnswer).toBe("12.96");
    expect(c.subQuestions[1].marks).toBe(6);
  });
});

describe("parseBulkPaper — per-block LaTeX source", () => {
  const { blocks } = parseBulkPaper(GOOD);

  it("keeps each question's own source, options included", () => {
    const src = blocks[0].latex;
    expect(src.startsWith("\\begin{question}{MCQ}")).toBe(true);
    expect(src.endsWith("\\end{question}")).toBe(true);
    expect(src).toContain("\\marks{4}");
    expect(src).toContain("+ 15.5");
    expect(src).toContain("- 11.5");
    // must not bleed into the next block
    expect(src).not.toContain("Compute the variance");
  });

  it("keeps the whole comprehension source including sub-questions", () => {
    const src = blocks[2].latex;
    expect(src.startsWith("\\begin{comprehension}")).toBe(true);
    expect(src.endsWith("\\end{comprehension}")).toBe(true);
    expect(src).toContain("\\begin{subquestion}{MSQ}");
    expect(src).toContain("\\answer{12.96}");
  });

  it("still opens in Form View, with latex only backing the LaTeX tab", () => {
    expect(blocks.every((b) => b.inputMode === "form")).toBe(true);
  });
});

describe("serializeBlock — round-trips with the parser", () => {
  const { blocks } = parseBulkPaper(GOOD);

  it("re-parses a serialized MCQ to the same structured values", () => {
    const round = parseBulkPaper(serializeBlock(blocks[0])).blocks[0];
    expect(round.type).toBe(blocks[0].type);
    expect(round.marks).toBe(blocks[0].marks);
    expect(round.stem).toBe(blocks[0].stem);
    expect(round.options.filter(Boolean)).toEqual(blocks[0].options.filter(Boolean));
    expect(round.correct).toEqual(blocks[0].correct);
    expect(round.isValid).toBe(true);
  });

  it("re-parses a serialized NUM answer", () => {
    const round = parseBulkPaper(serializeBlock(blocks[1])).blocks[0];
    expect(round.type).toBe("numerical");
    expect(round.numericalAnswer).toBe("12.96");
    expect(round.isValid).toBe(true);
  });

  it("re-parses a serialized comprehension with its sub-questions", () => {
    const round = parseBulkPaper(serializeBlock(blocks[2])).blocks[0];
    expect(round.type).toBe("comprehension");
    expect(round.passage).toBe(blocks[2].passage);
    expect(round.subQuestions).toHaveLength(2);
    expect(round.subQuestions[0].type).toBe("multi_correct");
    expect(round.subQuestions[0].correct).toEqual([0, 1]);
    expect(round.subQuestions[1].numericalAnswer).toBe("12.96");
    expect(round.isValid).toBe(true);
  });

  it("preserves inline math through the round-trip", () => {
    const src = "\\begin{question}{MCQ}\n\\marks{4}\n\\stem\nEvaluate $O(n)$ here.\n\\options\n+ $\\frac{1}{2}$\n- two\n\\end{question}";
    const parsed = parseBulkPaper(src).blocks[0];
    const round = parseBulkPaper(serializeBlock(parsed)).blocks[0];
    expect(round.stem).toContain("$O(n)$");
    expect(round.options[0]).toBe("$\\frac{1}{2}$");
    expect(round.correct).toEqual([0]);
  });
});

describe("parseBulkPaper — validation flags", () => {
  it("flags an MCQ with no correct option", () => {
    const { blocks } = parseBulkPaper(
      `\\begin{question}{MCQ}\n\marks{4}\n\\stem\nPick one.\n\\options\n- a\n- b\n\\end{question}`
    );
    expect(blocks[0].isValid).toBe(false);
    expect(blocks[0].issues.join(" ")).toMatch(/no correct option/i);
  });

  it("flags missing marks", () => {
    const { blocks } = parseBulkPaper(
      `\\begin{question}{MCQ}\n\\stem\nPick one.\n\\options\n+ a\n- b\n\\end{question}`
    );
    expect(blocks[0].isValid).toBe(false);
    expect(blocks[0].issues.join(" ")).toMatch(/missing \\marks/i);
  });

  it("flags an unclosed block but still returns it", () => {
    const { blocks } = parseBulkPaper(
      `\\begin{question}{MCQ}\n\marks{4}\n\\stem\nOops.\n\\options\n+ a\n- b`
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0].isValid).toBe(false);
    expect(blocks[0].issues.join(" ")).toMatch(/unclosed/i);
  });

  it("flags NUM without an answer", () => {
    const { blocks } = parseBulkPaper(
      `\\begin{question}{NUM}\n\marks{4}\n\\stem\nCompute.\n\\end{question}`
    );
    expect(blocks[0].isValid).toBe(false);
    expect(blocks[0].issues.join(" ")).toMatch(/missing \\answer/i);
  });

  it("flags a single-correct with two + options", () => {
    const { blocks } = parseBulkPaper(
      `\\begin{question}{MCQ}\n\marks{4}\n\\stem\nPick.\n\\options\n+ a\n+ b\n\\end{question}`
    );
    expect(blocks[0].isValid).toBe(false);
    expect(blocks[0].issues.join(" ")).toMatch(/more than one/i);
  });

  it("flags an unknown type", () => {
    const { blocks } = parseBulkPaper(
      `\\begin{question}{TRUEFALSE}\n\marks{4}\n\\stem\nX.\n\\options\n+ a\n- b\n\\end{question}`
    );
    expect(blocks[0].isValid).toBe(false);
    expect(blocks[0].issues.join(" ")).toMatch(/unknown type/i);
  });

  it("flags comprehension with no sub-questions and reports sub issues", () => {
    const { blocks } = parseBulkPaper(
      `\\begin{comprehension}\n\\passage\nText.\n\\end{comprehension}`
    );
    expect(blocks[0].isValid).toBe(false);
    expect(blocks[0].issues.join(" ")).toMatch(/no \\begin\{subquestion\}/i);
  });

  it("prefixes sub-question issues with their index", () => {
    const { blocks } = parseBulkPaper(
      `\\begin{comprehension}\n\\passage\nText.\n\\begin{subquestion}{MCQ}\n\marks{2}\n\\stem\nQ.\n\\options\n- a\n- b\n\\end{subquestion}\n\\end{comprehension}`
    );
    expect(blocks[0].isValid).toBe(false);
    expect(blocks[0].issues.join(" ")).toMatch(/Sub-question 1:/);
  });

  it("reports an error for empty input", () => {
    const { blocks, errors } = parseBulkPaper("   ");
    expect(blocks).toHaveLength(0);
    expect(errors[0]).toMatch(/empty/i);
  });

  it("reports an error when no blocks are present", () => {
    const { blocks, errors } = parseBulkPaper("just some prose with no markup");
    expect(blocks).toHaveLength(0);
    expect(errors[0]).toMatch(/No \\begin/i);
  });
});
