import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FilePlus2, Search } from "lucide-react";

type Difficulty = "Easy" | "Medium" | "Hard";

interface Question {
  id: string;
  subject: string;
  snippet: string;
  difficulty: Difficulty;
  createdAt: string;
}

const SUBJECTS = [
  "Statistics I", "Mathematics II", "Programming in Python",
  "Database Management Systems", "Machine Learning Foundations", "Business Analytics",
];

// Static question bank until a questions table exists.
const QUESTIONS: Question[] = [
  { id: "Q-10231", subject: "Statistics I", snippet: "Compute the variance of the given discrete distribution and identify…", difficulty: "Medium", createdAt: "21 Jul 2025" },
  { id: "Q-10230", subject: "Programming in Python", snippet: "What is the output of the following list comprehension with nested…", difficulty: "Easy", createdAt: "21 Jul 2025" },
  { id: "Q-10229", subject: "Machine Learning Foundations", snippet: "Derive the gradient of the logistic loss with respect to the weight…", difficulty: "Hard", createdAt: "20 Jul 2025" },
  { id: "Q-10228", subject: "Database Management Systems", snippet: "Given the schema below, write the relational algebra expression for…", difficulty: "Medium", createdAt: "20 Jul 2025" },
  { id: "Q-10227", subject: "Mathematics II", snippet: "Evaluate the double integral over the region bounded by the curves…", difficulty: "Hard", createdAt: "19 Jul 2025" },
  { id: "Q-10226", subject: "Business Analytics", snippet: "Interpret the coefficient of the categorical predictor in the fitted…", difficulty: "Easy", createdAt: "19 Jul 2025" },
  { id: "Q-10225", subject: "Statistics I", snippet: "A fair die is rolled twice. What is the probability that the sum…", difficulty: "Easy", createdAt: "18 Jul 2025" },
  { id: "Q-10224", subject: "Programming in Python", snippet: "Identify the time complexity of the recursive function shown and…", difficulty: "Medium", createdAt: "18 Jul 2025" },
];

function DifficultyBadge({ level }: { level: Difficulty }) {
  const cls =
    level === "Easy"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-[#0F1A14] dark:text-emerald-400"
      : level === "Medium"
      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-[#1E1707] dark:text-amber-400"
      : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-[#1A0F0F] dark:text-rose-400";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {level}
    </span>
  );
}

export default function QuestionBank() {
  const [search, setSearch] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return QUESTIONS.filter((row) => {
      const matchesSearch =
        row.subject.toLowerCase().includes(q) ||
        row.snippet.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q);
      const matchesSubject = subjectFilter === "all" || row.subject === subjectFilter;
      const matchesDifficulty = difficultyFilter === "all" || row.difficulty === difficultyFilter;
      return matchesSearch && matchesSubject && matchesDifficulty;
    });
  }, [search, subjectFilter, difficultyFilter]);

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
              placeholder="Search by subject, ID or text…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-7 text-[13px] border-none shadow-none focus-visible:ring-0"
            />
          </div>
          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger className="w-[150px] h-7 text-[12px]"><SelectValue placeholder="Subject" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subjects</SelectItem>
              {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={difficultyFilter} onValueChange={setDifficultyFilter}>
            <SelectTrigger className="w-[120px] h-7 text-[12px]"><SelectValue placeholder="Difficulty" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="Easy">Easy</SelectItem>
              <SelectItem value="Medium">Medium</SelectItem>
              <SelectItem value="Hard">Hard</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10 border-b border-border bg-card">
              <tr className="border-b border-border">
                <th className="text-left font-medium text-muted-foreground px-4 md:px-6 py-2 w-[110px]">ID</th>
                <th className="text-left font-medium text-muted-foreground px-3 py-2 w-[190px]">Subject Tag</th>
                <th className="text-left font-medium text-muted-foreground px-3 py-2">Question Snippet</th>
                <th className="text-left font-medium text-muted-foreground px-3 py-2 w-[110px]">Difficulty</th>
                <th className="text-left font-medium text-muted-foreground px-3 py-2 w-[130px]">Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-10 text-muted-foreground text-[13px]">No questions match your filters</td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted transition-colors">
                    <td className="px-4 md:px-6 py-2.5 text-muted-foreground font-mono text-[12px]">{row.id}</td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-foreground">
                        {row.subject}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-foreground/90 max-w-0 truncate">{row.snippet}</td>
                    <td className="px-3 py-2.5"><DifficultyBadge level={row.difficulty} /></td>
                    <td className="px-3 py-2.5 text-muted-foreground text-[12px] whitespace-nowrap">{row.createdAt}</td>
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
