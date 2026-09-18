import type { ExamType } from "@/lib/pyq-ingest";

/* ── Exam context taxonomy — shared by the page and each per-subject section ── */

export const DEGREES = [
  "BS in Data Science and Applications",
  "BS in Electronic Systems",
  "Management and Data Science",
  "Aeronautics and Space Technology",
];
export const LEVELS = ["Foundation", "Diploma", "Degree"];
/**
 * Exact names from the seeded course catalog (supabase/migrations
 * ..._b7d2f9a1...sql), not abbreviations — publishing resolves a course by
 * slugifying this string, so anything else creates a second, duplicate course
 * row instead of joining the real one.
 */
export const SUBJECTS = [
  "Statistics I", "Statistics II", "Mathematics I", "Mathematics II",
  "Programming in Python", "Computational Thinking", "English I", "English II",
  "Database Management Systems", "Data Structures and Algorithms", "Programming in Java", "System Commands",
  "Modern Application Development I", "Modern Application Development II", "Business Data Management", "Business Analytics",
  "Machine Learning Foundations", "Machine Learning Techniques",
  "Deep Learning", "Big Data Analytics", "Natural Language Processing",
];
export const TERM_LABELS = ["Jan Term", "May Term", "Sept Term"];
export const EXAMS = ["Quiz 1", "Quiz 2", "End Term"];
export const EXAM_TYPE_BY_LABEL: Record<string, ExamType> = {
  "Quiz 1": "quiz_1",
  "Quiz 2": "quiz_2",
  "End Term": "end_term",
};
/** Forenoon / Afternoon — the same slot vocabulary the PDF importer uses. */
export const SHIFTS: { value: "FN" | "AN"; label: string }[] = [
  { value: "FN", label: "FN — Forenoon" },
  { value: "AN", label: "AN — Afternoon" },
];
