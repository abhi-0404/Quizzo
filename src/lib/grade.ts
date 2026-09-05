import type { Database } from "@/integrations/supabase/types";

/**
 * Scoring for a sat paper.
 *
 * Deliberately free of any Supabase import so it stays a pure function that can
 * be unit tested — and so the runner can grade a session before, or without,
 * ever writing an attempt.
 */

export type AnswerStatus = Database["public"]["Enums"]["answer_status"];
export type Response = number | number[] | string | null | undefined;

export interface Gradable {
  type: "single" | "multi" | "comprehension" | "integer";
  correct: number[];
  numericalAnswer: string;
  marks: number;
}

/**
 * Grade one response.
 *
 * Multi-correct requires the exact set: these papers award no partial credit.
 * Numerical answers compare as text first and then numerically, so "3.0"
 * matches "3", and a `Range` answer such as "80 to 81" — which the source data
 * really does contain — is satisfied by anything inside the range.
 */
export function gradeAnswer(q: Gradable, response: Response): { status: AnswerStatus; marks: number } {
  const skipped = { status: "skipped" as const, marks: 0 };
  const wrong = { status: "incorrect" as const, marks: 0 };

  if (response === null || response === undefined || response === "") return skipped;
  if (Array.isArray(response) && response.length === 0) return skipped;

  if (q.type === "integer") {
    const given = String(response).trim();
    if (!given) return skipped;
    return matchesNumeric(given, q.numericalAnswer) ? { status: "correct", marks: q.marks } : wrong;
  }

  if (q.type === "multi") {
    const given = [...(response as number[])].sort((a, b) => a - b).join(",");
    const want = [...q.correct].sort((a, b) => a - b).join(",");
    return given === want ? { status: "correct", marks: q.marks } : wrong;
  }

  return q.correct.includes(response as number) ? { status: "correct", marks: q.marks } : wrong;
}

export function matchesNumeric(given: string, expected: string): boolean {
  const want = expected.trim();
  if (!want) return false;
  if (given.trim().toLowerCase() === want.toLowerCase()) return true;

  const g = Number(given);
  const range = want.match(/^(-?[\d.]+)\s*to\s*(-?[\d.]+)$/i);
  if (range && Number.isFinite(g)) {
    const lo = Math.min(Number(range[1]), Number(range[2]));
    const hi = Math.max(Number(range[1]), Number(range[2]));
    return g >= lo && g <= hi;
  }

  const w = Number(want);
  return Number.isFinite(g) && Number.isFinite(w) && Math.abs(g - w) < 1e-9;
}

export interface ScoredSession {
  score: number;
  totalMarks: number;
  correct: number;
  incorrect: number;
  skipped: number;
}

/** Roll a set of graded answers up into the numbers the report shows. */
export function summarise(
  graded: { status: AnswerStatus; marks: number }[],
  totalMarks: number
): ScoredSession {
  return {
    score: graded.reduce((n, g) => n + g.marks, 0),
    totalMarks,
    correct: graded.filter((g) => g.status === "correct").length,
    incorrect: graded.filter((g) => g.status === "incorrect").length,
    skipped: graded.filter((g) => g.status === "skipped").length,
  };
}
