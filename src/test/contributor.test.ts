import { describe, expect, it } from "vitest";
import {
  MAX_SOLUTION_BYTES,
  computeStats,
  extensionForMime,
  formatBytes,
  formatKey,
  formatWhen,
  papersInProgress,
  progressPct,
  reviewPayload,
  reviewState,
  validateReview,
  validateSolutionFile,
} from "@/lib/contributor-helpers";

describe("solution file validation", () => {
  const ok = { name: "solution.pdf", type: "application/pdf", size: 120_000 };

  it("accepts a PDF and the common image types", () => {
    expect(validateSolutionFile(ok)).toBeNull();
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(validateSolutionFile({ ...ok, name: "a", type })).toBeNull();
    }
  });

  it("rejects other types, including ones the bucket would refuse", () => {
    expect(validateSolutionFile({ ...ok, type: "image/gif" })).toMatch(/PDF, PNG, JPEG or WebP/);
    expect(validateSolutionFile({ ...ok, type: "image/svg+xml" })).toMatch(/PDF, PNG, JPEG or WebP/);
    expect(validateSolutionFile({ ...ok, type: "application/zip" })).toMatch(/PDF, PNG, JPEG or WebP/);
    expect(validateSolutionFile({ ...ok, type: "" })).toMatch(/PDF, PNG, JPEG or WebP/);
  });

  it("rejects empty and oversized files, and allows exactly the limit", () => {
    expect(validateSolutionFile({ ...ok, size: 0 })).toMatch(/empty/);
    expect(validateSolutionFile({ ...ok, size: MAX_SOLUTION_BYTES + 1 })).toMatch(/limit is 10 MB/);
    expect(validateSolutionFile({ ...ok, size: MAX_SOLUTION_BYTES })).toBeNull();
  });

  it("maps mime types to the extensions used in storage paths", () => {
    expect(extensionForMime("application/pdf")).toBe("pdf");
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(extensionForMime("image/webp")).toBe("webp");
    expect(extensionForMime("text/html")).toBeNull();
  });

  it("formats sizes for people", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});

describe("review validation", () => {
  it("lets a confirmation through with no suggestion", () => {
    expect(validateReview({ verdict: "correct" })).toBeNull();
  });

  it("requires exactly one option for a single-correct flag", () => {
    expect(validateReview({ verdict: "incorrect", kind: "single", suggestedCorrect: [] })).toMatch(/one option/);
    expect(validateReview({ verdict: "incorrect", kind: "single", suggestedCorrect: [0, 1] })).toMatch(/one option/);
    expect(validateReview({ verdict: "incorrect", kind: "single", suggestedCorrect: [2], optionCount: 4 })).toBeNull();
  });

  it("requires at least one option for multi and rejects duplicates", () => {
    expect(validateReview({ verdict: "incorrect", kind: "multi", suggestedCorrect: [] })).toMatch(/Pick every option/);
    expect(validateReview({ verdict: "incorrect", kind: "multi", suggestedCorrect: [0, 2] })).toBeNull();
    expect(validateReview({ verdict: "incorrect", kind: "multi", suggestedCorrect: [1, 1] })).toMatch(/twice/);
  });

  it("rejects an option that does not exist", () => {
    expect(validateReview({ verdict: "incorrect", kind: "single", suggestedCorrect: [4], optionCount: 4 })).toMatch(/does not exist/);
    expect(validateReview({ verdict: "incorrect", kind: "multi", suggestedCorrect: [-1] })).toMatch(/not valid/);
  });

  it("accepts the numeric shapes the grader understands and nothing else", () => {
    for (const v of ["3", "-2.5", "80 to 81", "0.5to1"]) {
      expect(validateReview({ verdict: "incorrect", kind: "numerical", suggestedNumerical: v })).toBeNull();
    }
    expect(validateReview({ verdict: "incorrect", kind: "numerical", suggestedNumerical: "" })).toMatch(/Enter the answer/);
    expect(validateReview({ verdict: "incorrect", kind: "numerical", suggestedNumerical: "abc" })).toMatch(/number/);
    expect(validateReview({ verdict: "incorrect", kind: "numerical", suggestedNumerical: "1e5" })).toMatch(/number/);
  });

  it("matches the table's CHECK when the question shape is unknown", () => {
    expect(validateReview({ verdict: "incorrect" })).toMatch(/correct answer/);
    expect(validateReview({ verdict: "incorrect", suggestedCorrect: [1] })).toBeNull();
  });

  it("caps the note length", () => {
    expect(validateReview({ verdict: "correct", note: "x".repeat(1001) })).toMatch(/1000/);
    expect(validateReview({ verdict: "correct", note: "x".repeat(1000) })).toBeNull();
  });

  it("builds the stored columns: a confirmation carries no suggestion", () => {
    expect(reviewPayload({ verdict: "correct", suggestedCorrect: [1], suggestedNumerical: "4", note: " ok " })).toEqual({
      verdict: "correct",
      suggested_correct: null,
      suggested_numerical: null,
      note: "ok",
    });
  });

  it("sorts and de-duplicates option picks, and stores numerics only for numerical questions", () => {
    expect(reviewPayload({ verdict: "incorrect", kind: "multi", suggestedCorrect: [2, 0, 2], note: "" })).toMatchObject({
      suggested_correct: [0, 2],
      suggested_numerical: null,
    });
    expect(reviewPayload({ verdict: "incorrect", kind: "numerical", suggestedCorrect: [1], suggestedNumerical: " 12 " })).toMatchObject({
      suggested_correct: null,
      suggested_numerical: "12",
    });
  });
});

describe("review state and key formatting", () => {
  it("classifies a question from my review", () => {
    expect(reviewState(undefined)).toBe("unreviewed");
    expect(reviewState(null)).toBe("unreviewed");
    expect(reviewState({ verdict: "correct" })).toBe("confirmed");
    expect(reviewState({ verdict: "incorrect" })).toBe("flagged");
  });

  it("shows option letters in order, or the numeric answer", () => {
    expect(formatKey([2, 0], "", "multi")).toBe("A, C");
    expect(formatKey([1], "", "single")).toBe("B");
    expect(formatKey([], "", "single")).toBe("—");
    expect(formatKey([], " 80 to 81 ", "numerical")).toBe("80 to 81");
    expect(formatKey([], "", "numerical")).toBe("—");
  });
});

describe("progress and stats", () => {
  it("computes a clamped whole percentage", () => {
    expect(progressPct(0, 30)).toBe(0);
    expect(progressPct(15, 30)).toBe(50);
    expect(progressPct(1, 3)).toBe(33);
    expect(progressPct(31, 30)).toBe(100);
    expect(progressPct(5, 0)).toBe(0);
    expect(progressPct(-2, 10)).toBe(0);
  });

  it("counts only what the contributor actually did", () => {
    const stats = computeStats(
      [{ paper_id: "a" }, { paper_id: "b" }],
      [
        { verdict: "correct", status: "pending" },
        { verdict: "correct", status: "pending" },
        { verdict: "incorrect", status: "pending" },
        { verdict: "incorrect", status: "accepted" },
        { verdict: "incorrect", status: "rejected" },
      ],
      [{ status: "pending" }, { status: "approved" }, { status: "approved" }, { status: "rejected" }]
    );
    expect(stats).toEqual({
      papersAvailable: 2,
      questionsReviewed: 5,
      confirmed: 2,
      flagsRaised: 3,
      flagsPending: 1,
      flagsAccepted: 1,
      flagsRejected: 1,
      solutionsSubmitted: 4,
      solutionsPending: 1,
      solutionsApproved: 2,
      solutionsRejected: 1,
    });
  });

  it("reports zeros, not invented numbers, for a brand-new contributor", () => {
    expect(computeStats([], [], [])).toEqual({
      papersAvailable: 0,
      questionsReviewed: 0,
      confirmed: 0,
      flagsRaised: 0,
      flagsPending: 0,
      flagsAccepted: 0,
      flagsRejected: 0,
      solutionsSubmitted: 0,
      solutionsPending: 0,
      solutionsApproved: 0,
      solutionsRejected: 0,
    });
  });

  it("lists started-but-unfinished papers, nearest to done first", () => {
    const papers = [
      { paper_id: "none", question_count: 30, my_reviews: 0 },
      { paper_id: "done", question_count: 30, my_reviews: 30 },
      { paper_id: "low", question_count: 30, my_reviews: 3 },
      { paper_id: "high", question_count: 30, my_reviews: 27 },
    ];
    expect(papersInProgress(papers).map((p) => p.paper_id)).toEqual(["high", "low"]);
    expect(papersInProgress(papers, 1).map((p) => p.paper_id)).toEqual(["high"]);
  });

  it("formats dates and tolerates bad input", () => {
    expect(formatWhen("2026-05-14T09:30:00Z")).toMatch(/14 May 2026/);
    expect(formatWhen(null)).toBe("—");
    expect(formatWhen("not a date")).toBe("—");
  });
});
