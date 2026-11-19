import { supabase } from "@/integrations/supabase/client";

/**
 * Admin aggregates. Both RPCs are admin-only and return totals computed in the
 * database, so no other student's attempt rows ever reach the browser.
 */

export interface OverviewStats {
  students: number;
  published_papers: number;
  questions: number;
  attempts_30d: number;
  avg_pct_30d: number | null;
  open_reports: number;
  daily: { day: string; attempts: number }[];
  by_course: { name: string; attempts: number }[];
  recent_papers: {
    paper_id: string;
    course: string;
    exam_type: "quiz_1" | "quiz_2" | "end_term";
    term: string;
    year: number;
    programme: string;
    attempts: number;
    avg_pct: number | null;
  }[];
  reports: {
    id: string;
    reason: ReportReason;
    note: string;
    created_at: string;
    course: string;
    position: number;
    snippet: string;
  }[];
}

export interface PerformanceStats {
  pass_mark_pct: number;
  attempts: number;
  avg_pct: number | null;
  pass_count: number;
  fail_count: number;
  active_students_30d: number;
  by_course: { course: string; avg_pct: number | null; attempts: number }[];
  by_term: { term: string; year: number; avg_pct: number | null; attempts: number }[];
  accuracy_by_kind: { course: string; kind: string; accuracy: number | null; attempted: number }[];
}

export type ReportReason = "typo" | "wrong_answer" | "missing_image" | "unclear" | "other";

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  typo: "Typo",
  wrong_answer: "Wrong answer",
  missing_image: "Missing image",
  unclear: "Unclear question",
  other: "Other",
};

export async function loadOverview(): Promise<OverviewStats> {
  const { data, error } = await supabase.rpc("admin_overview");
  if (error) throw error;
  return data as unknown as OverviewStats;
}

export async function loadPerformance(): Promise<PerformanceStats> {
  const { data, error } = await supabase.rpc("admin_performance");
  if (error) throw error;
  return data as unknown as PerformanceStats;
}

export async function resolveReport(id: string): Promise<void> {
  const { error } = await supabase.from("question_reports").update({ status: "resolved" }).eq("id", id);
  if (error) throw error;
}

/** File a report on a question. A repeat of the same report is not an error. */
export async function reportQuestion(questionId: string, reason: ReportReason, note: string): Promise<"filed" | "duplicate"> {
  const { error } = await supabase
    .from("question_reports")
    .insert({ question_id: questionId, reason, note: note.trim().slice(0, 500) });
  if (!error) return "filed";
  if (error.code === "23505") return "duplicate";
  throw error;
}

/**
 * The brand palette for charts: blue, green, amber, red and grey only (plus
 * lighter shades of blue), read from the theme tokens so light and dark match.
 */
export const BRAND = {
  primary: "hsl(var(--primary))",
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  destructive: "hsl(var(--destructive))",
  muted: "hsl(var(--muted-foreground))",
} as const;

/** Series colours in order, for charts with one colour per course. */
const PALETTE = [
  BRAND.primary,
  BRAND.success,
  BRAND.warning,
  "hsl(var(--primary) / 0.6)",
  BRAND.destructive,
  BRAND.muted,
  "hsl(var(--success) / 0.6)",
  "hsl(var(--primary) / 0.35)",
];
export const colorAt = (i: number) => PALETTE[i % PALETTE.length];
