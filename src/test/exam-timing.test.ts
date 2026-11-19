import { describe, expect, it } from "vitest";
import { addQuestionTime, elapsedSeconds, remainingSeconds, toSeconds } from "@/lib/exam-timing";

describe("exam clock", () => {
  const start = 1_000_000;

  it("counts whole elapsed seconds and never goes negative", () => {
    expect(elapsedSeconds(start, start + 59_999)).toBe(59);
    expect(elapsedSeconds(start, start + 60_000)).toBe(60);
    expect(elapsedSeconds(start, start - 5_000)).toBe(0);
  });

  it("derives time left from the clock, so a throttled tab cannot slow it", () => {
    // 60-minute paper; the tab was backgrounded and only ticked once at 20 minutes.
    expect(remainingSeconds(start, 3600, start + 20 * 60_000)).toBe(2400);
  });

  it("clamps to zero when the allowance is used up, and to the total when the clock is early", () => {
    expect(remainingSeconds(start, 3600, start + 61 * 60_000)).toBe(0);
    expect(remainingSeconds(start, 3600, start - 10_000)).toBe(3600);
  });
});

describe("per-question time", () => {
  it("accumulates across visits without mutating the previous tally", () => {
    const a = addQuestionTime({}, 2, 4_000);
    const b = addQuestionTime(a, 2, 1_500);
    expect(a).toEqual({ 2: 4_000 });
    expect(b).toEqual({ 2: 5_500 });
  });

  it("ignores zero and negative intervals", () => {
    const t = { 0: 1_000 };
    expect(addQuestionTime(t, 0, 0)).toBe(t);
    expect(addQuestionTime(t, 0, -50)).toBe(t);
    expect(addQuestionTime(t, 0, NaN)).toBe(t);
  });

  it("rounds milliseconds to whole seconds", () => {
    expect(toSeconds(1_499)).toBe(1);
    expect(toSeconds(1_500)).toBe(2);
    expect(toSeconds(-3)).toBe(0);
  });
});
