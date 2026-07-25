/**
 * Shared academic schedule model.
 *
 * Owned by the Academic Master Schedule page (/admin/schedule) and read by
 * Create Content (/admin/create) to auto-resolve an assessment date from the
 * selected year + term + exam. Keeping the model here means both pages agree
 * on one taxonomy and one payload shape.
 */

export type TermKey = "jan" | "may" | "sept";

export interface Assessment {
  /** Free-form label — usually one of the presets, but any string is valid. */
  name: string;
  /** ISO date, "YYYY-MM-DD". Empty string when not yet scheduled. */
  date: string;
}

export interface ScheduleEntry {
  /** Stable composite key — one entry per year+term. */
  id: string;
  year: number;
  term: TermKey;
  assessments: Assessment[];
}

export const TERMS: { key: TermKey; label: string }[] = [
  { key: "jan", label: "Jan Term" },
  { key: "may", label: "May Term" },
  { key: "sept", label: "Sept Term" },
];

export const TERM_ORDER: Record<TermKey, number> = { jan: 0, may: 1, sept: 2 };

/** Standard assessments seeded into every new term. */
export const DEFAULT_ASSESSMENT_NAMES = ["Quiz 1", "Quiz 2", "End Term Exam"];

export const entryId = (year: number, term: TermKey) => `${year}-${term}`;

export const makeEntry = (year: number, term: TermKey, dates: string[]): ScheduleEntry => ({
  id: entryId(year, term),
  year,
  term,
  assessments: DEFAULT_ASSESSMENT_NAMES.map((name, i) => ({ name, date: dates[i] ?? "" })),
});

/** Seed data — multiple years retained to demonstrate historical persistence. */
export const SCHEDULE_SEED: ScheduleEntry[] = [
  makeEntry(2026, "jan", ["2026-02-15", "2026-03-22", "2026-04-26"]),
  makeEntry(2026, "may", ["2026-06-14", "2026-07-19", "2026-08-23"]),
  makeEntry(2026, "sept", ["2026-10-11", "2026-11-15", "2026-12-20"]),
  makeEntry(2025, "jan", ["2025-02-16", "2025-03-23", "2025-04-27"]),
  makeEntry(2025, "may", ["2025-06-15", "2025-07-20", "2025-08-24"]),
  makeEntry(2025, "sept", ["2025-10-12", "2025-11-16", "2025-12-21"]),
  makeEntry(2024, "sept", ["2024-10-13", "2024-11-17", "2024-12-22"]),
  makeEntry(2023, "may", ["2023-06-18", "2023-07-23", "2023-08-27"]),
];

/** Local-safe formatting — avoids the UTC shift of `new Date("YYYY-MM-DD")`. */
export function formatDate(iso: string): string {
  if (!iso) return "Not scheduled";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "Not scheduled";
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

/** "End Term" ↔ "End Term Exam" and similar near-misses should still match. */
const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Resolve the scheduled date for an assessment.
 * Returns the ISO date, or null when that year/term/exam isn't scheduled.
 */
export function findAssessmentDate(
  schedule: ScheduleEntry[],
  year: number,
  term: TermKey,
  examLabel: string
): string | null {
  const entry = schedule.find((e) => e.year === year && e.term === term);
  if (!entry) return null;
  const target = normalize(examLabel);
  if (!target) return null;
  const hit = entry.assessments.find((a) => {
    const name = normalize(a.name);
    return name === target || name.startsWith(target) || target.startsWith(name);
  });
  return hit?.date || null;
}

/** Map a display label ("Jan Term") to its stable key ("jan"). */
export function termKeyFromLabel(label: string): TermKey {
  return TERMS.find((t) => t.label === label)?.key ?? "jan";
}
