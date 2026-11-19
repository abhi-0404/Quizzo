import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { AdminError, AdminLoading } from "@/components/AdminState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import { examTypeLabel } from "@/lib/pyq-read";
import { formatDate } from "@/data/schedule";
import { contributorKeys, listReviewPapers, progressPct } from "@/lib/contributor";

export default function ContributorPapers() {
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [examFilter, setExamFilter] = useState("all");

  const { data: rows = [], isLoading, error, refetch } = useQuery({
    queryKey: contributorKeys.papers,
    queryFn: listReviewPapers,
  });

  const courses = useMemo(() => [...new Set(rows.map((r) => r.course))].sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const hay = `${r.course} ${r.term} ${r.year} ${r.programme} ${r.variant_label}`.toLowerCase();
      return (
        (!q || hay.includes(q)) &&
        (courseFilter === "all" || r.course === courseFilter) &&
        (examFilter === "all" || r.exam_type === examFilter)
      );
    });
  }, [rows, search, courseFilter, examFilter]);

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 md:px-6 h-11 border-b border-border shrink-0">
          <h1 className="text-[13px] font-medium">Papers to review</h1>
          <span className="text-[12px] text-muted-foreground">{rows.length} published</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 md:px-6 min-h-10 py-1 border-b border-border shrink-0">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              aria-label="Search papers"
              placeholder="Search by course, term or year…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-7 text-[13px] border-none shadow-none focus-visible:ring-0"
            />
          </div>
          <Select value={courseFilter} onValueChange={setCourseFilter}>
            <SelectTrigger aria-label="Course" className="w-[180px] h-7 text-[12px]"><SelectValue placeholder="Course" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All courses</SelectItem>
              {courses.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={examFilter} onValueChange={setExamFilter}>
            <SelectTrigger aria-label="Exam type" className="w-[140px] h-7 text-[12px]"><SelectValue placeholder="Exam" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All exams</SelectItem>
              <SelectItem value="quiz_1">Quiz 1</SelectItem>
              <SelectItem value="quiz_2">Quiz 2</SelectItem>
              <SelectItem value="end_term">End Term</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-auto">
          {error ? (
            <AdminError message={error instanceof Error ? error.message : "Unknown error"} onRetry={() => void refetch()} />
          ) : isLoading ? (
            <AdminLoading />
          ) : (
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 z-10 border-b border-border bg-card">
                <tr className="border-b border-border">
                  <th className="text-left font-medium text-muted-foreground px-4 md:px-6 py-2">Course</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2">Sitting</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2 w-[210px]">Reviewed</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2 w-[70px]">Flags</th>
                  <th className="text-left font-medium text-muted-foreground px-3 py-2 w-[110px]">Solutions</th>
                  <th className="px-3 py-2 w-[90px]" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-10 text-muted-foreground text-[13px]">
                      {rows.length === 0
                        ? "No papers are published yet. They will appear here once an admin publishes one."
                        : "No papers match your filters"}
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => {
                    const pct = progressPct(r.my_reviews, r.question_count);
                    return (
                      <tr key={r.paper_id} className="border-b border-border last:border-0 hover:bg-muted transition-colors">
                        <td className="px-4 md:px-6 py-2.5">
                          <Link to={`/contributor/papers/${r.paper_id}`} className="font-medium hover:underline underline-offset-2">
                            {r.course}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-[12px]">
                          <span className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-foreground">
                            {examTypeLabel(r.exam_type)} · {r.term} {r.year}
                          </span>
                          <span className="ml-2 text-muted-foreground">
                            {formatDate(r.exam_date)} · {r.programme}
                            {r.slot ? ` · ${r.slot.toUpperCase()}` : ""}
                            {r.variant_label ? ` · ${r.variant_label}` : ""}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-border" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${r.course} reviewed`}>
                              <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                              {r.my_reviews}/{r.question_count}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums">{r.my_flags}</td>
                        <td className="px-3 py-2.5 text-[12px] text-muted-foreground tabular-nums whitespace-nowrap">
                          {r.my_solutions} mine · {r.approved_solutions} live
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Button asChild size="sm" variant="outline" className="h-7 text-[12px]">
                            <Link to={`/contributor/papers/${r.paper_id}`}>{r.my_reviews > 0 ? "Continue" : "Review"}</Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
