import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilePlus2, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { examTypeLabel, listQuestionBank, type BankQuestion } from "@/lib/pyq-read";
import { formatDate } from "@/data/schedule";

const KIND_LABEL: Record<BankQuestion["kind"], string> = {
  single: "Single",
  multi: "Multi",
  numerical: "Numerical",
  comprehension: "Comprehension",
};

/** Imported questions carry review notes; flag those rather than a made-up difficulty. */
function KindBadge({ kind }: { kind: BankQuestion["kind"] }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground">
      {KIND_LABEL[kind] ?? kind}
    </span>
  );
}

export default function QuestionBank() {
  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["question-bank"],
    queryFn: () => listQuestionBank(),
  });

  const courses = useMemo(
    () => [...new Set(rows.map((r) => r.courseName))].sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter((row) => {
      const matchesSearch =
        !q ||
        row.courseName.toLowerCase().includes(q) ||
        row.stem.toLowerCase().includes(q);
      const matchesCourse = courseFilter === "all" || row.courseName === courseFilter;
      const matchesKind = kindFilter === "all" || row.kind === kindFilter;
      return matchesSearch && matchesCourse && matchesKind;
    });
  }, [rows, search, courseFilter, kindFilter]);

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 h-11 border-b border-border shrink-0">
          <h1 className="text-[13px] font-medium">Question Bank</h1>
          <Button asChild size="sm" className="h-7 text-[12px] gap-1.5">
            <Link to="/admin/create">
              <FilePlus2 className="h-3.5 w-3.5" /> Add Question
            </Link>
          </Button>
        </div>

        {/* Filters bar */}
        <div className="flex items-center gap-2 px-4 md:px-6 h-10 border-b border-border shrink-0">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by course or question text…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-7 text-[13px] border-none shadow-none focus-visible:ring-0"
            />
          </div>
          <Select value={courseFilter} onValueChange={setCourseFilter}>
            <SelectTrigger className="w-[180px] h-7 text-[12px]"><SelectValue placeholder="Course" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Courses</SelectItem>
              {courses.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="w-[140px] h-7 text-[12px]"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="single">Single</SelectItem>
              <SelectItem value="multi">Multi</SelectItem>
              <SelectItem value="numerical">Numerical</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10 border-b border-border bg-card">
              <tr className="border-b border-border">
                <th className="text-left font-medium text-muted-foreground px-4 md:px-6 py-2 w-[190px]">Course</th>
                <th className="text-left font-medium text-muted-foreground px-3 py-2">Question</th>
                <th className="text-left font-medium text-muted-foreground px-3 py-2 w-[120px]">Type</th>
                <th className="text-left font-medium text-muted-foreground px-3 py-2 w-[70px]">Marks</th>
                <th className="text-left font-medium text-muted-foreground px-3 py-2 w-[150px]">Paper</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-muted-foreground text-[13px]">Loading questions…</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-muted-foreground text-[13px]">
                    {rows.length === 0
                      ? "No questions yet — import an exam sitting from the paper builder."
                      : "No questions match your filters"}
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted transition-colors">
                    <td className="px-4 md:px-6 py-2.5">
                      <span className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-foreground">
                        {row.courseName}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-foreground/90 max-w-0 truncate">
                      {/* A stem that is only a figure reads as its alt text. */}
                      {row.stem.replace(/!\[([^\]]*)\]\(asset-[^)]*\)/g, "$1") || "—"}
                      {row.issues.length > 0 && (
                        <span className="ml-2 text-[11px] text-amber-700 dark:text-amber-400">
                          needs review
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5"><KindBadge kind={row.kind} /></td>
                    <td className="px-3 py-2.5 text-muted-foreground text-[12px] tabular-nums">{row.marks}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-[12px] whitespace-nowrap">
                      {examTypeLabel(row.examType)} · {formatDate(row.examDate)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}
