import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, Search, LayoutGrid, List, Moon, Sun, Clock } from "lucide-react";

import { useTheme } from "next-themes";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell,
  PieChart, Pie, LineChart, Line, AreaChart, Area, Tooltip, ResponsiveContainer,
} from "recharts";
import { NeonPatternDefs, neonPatternId } from "@/components/NeonPatternDefs";
import { useQuery } from "@tanstack/react-query";
import { loadAttempt } from "@/lib/pyq-read";
import { QuizzoLoader } from "@/components/QuizzoLoader";

function ThemeButton() {
  const { theme, setTheme } = useTheme();
  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="p-2 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

// Brand palette only (see BRAND in src/lib/admin-stats.ts).
const STATUS_COLORS = {
  correct: "hsl(var(--success))",
  incorrect: "hsl(var(--destructive))",
  skipped: "hsl(var(--muted-foreground))",
  marked: "hsl(var(--primary))",
};
const SECTION_COLORS = ["hsl(var(--primary))", "hsl(var(--success))", "hsl(var(--warning))"];
const LINE_COLOR = "hsl(var(--primary))";
const AREA_COLOR = "hsl(var(--success))";

interface Row {
  qno: number;
  type: string;
  status: "correct" | "incorrect" | "skipped";
  marks: number;
  time: number;
}

/**
 * The report used to call a generator that returned the same 30 rows for every
 * course, mode and attempt. It now renders what was actually stored — an
 * attempt id arrives in the URL when a graded paper is submitted.
 */
const KIND_LABEL: Record<string, string> = {
  single: "Single Correct",
  multi: "Multi Correct",
  numerical: "Numerical",
  comprehension: "Comprehension",
};

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-md p-4 bg-card">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mb-4">{subtitle}</p>
      <div className="h-[240px] w-full">
        <ResponsiveContainer>{children as React.ReactElement}</ResponsiveContainer>
      </div>
    </div>
  );
}

export default function ExamReport() {
  const { slug, courseSlug } = useParams();
  const [searchParams] = useSearchParams();
  const sessionMode: "exam" | "practice" =
    searchParams.get("mode") === "practice" ? "practice" : "exam";
  const isPractice = sessionMode === "practice";
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");

  const attemptId = searchParams.get("attempt");
  const { data: attempt, isLoading } = useQuery({
    queryKey: ["attempt", attemptId],
    queryFn: () => loadAttempt(attemptId!),
    enabled: !!attemptId,
  });

  const rows: Row[] = useMemo(
    () =>
      (attempt?.answers ?? []).map((a) => ({
        qno: a.position,
        type: KIND_LABEL[a.kind] ?? a.kind,
        status: a.status,
        marks: a.marksAwarded,
        time: a.timeSeconds,
      })),
    [attempt]
  );

  const subject =
    attempt?.courseName ??
    (courseSlug ?? "subject").split("-").map((s) => s[0]?.toUpperCase() + s.slice(1)).join(" ");

  const totals = useMemo(() => {
    const correct = rows.filter(r => r.status === "correct").length;
    const incorrect = rows.filter(r => r.status === "incorrect").length;
    const skipped = rows.filter(r => r.status === "skipped").length;
    const attempted = correct + incorrect;
    const score = rows.reduce((a, r) => a + r.marks, 0);
    const totalTime = rows.reduce((a, r) => a + r.time, 0);
    const mm = Math.floor(totalTime / 60).toString().padStart(2, "0");
    const ss = (totalTime % 60).toString().padStart(2, "0");
    const acc = attempted ? Math.round((correct / attempted) * 100) : 0;
    const stored = attempt
      ? {
          mm: Math.floor(attempt.durationSeconds / 60).toString().padStart(2, "0"),
          ss: (attempt.durationSeconds % 60).toString().padStart(2, "0"),
        }
      : null;
    return {
      correct,
      incorrect,
      skipped,
      attempted,
      score: attempt ? attempt.score : score,
      // Per-question timing is not recorded yet, so the session length is used.
      timeStr: stored ? `${stored.mm}:${stored.ss}` : `${mm}:${ss}`,
      acc,
      totalMarks: attempt?.totalMarks ?? rows.length * 4,
      totalQuestions: rows.length,
    };
  }, [rows, attempt]);

  const statusData = [
    { name: "Correct", value: totals.correct, color: STATUS_COLORS.correct },
    { name: "Incorrect", value: totals.incorrect, color: STATUS_COLORS.incorrect },
    { name: "Skipped", value: totals.skipped, color: STATUS_COLORS.skipped },
  ];

  // Was three hardcoded numbers; now the real distribution of question types.
  const sectionData = useMemo(() => {
    const byType = new Map<string, number>();
    for (const r of rows) byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
    return [...byType.entries()].map(([name, value], i) => ({
      name,
      value,
      color: SECTION_COLORS[i % SECTION_COLORS.length],
    }));
  }, [rows]);

  const timeData = rows.map(r => ({ q: `Q${r.qno}`, time: r.time }));

  const cumulative = useMemo(() => {
    let s = 0;
    return rows.map(r => {
      s += Math.max(0, r.marks);
      return { q: `Q${r.qno}`, score: s };
    });
  }, [rows]);

  const filtered = rows.filter(r =>
    r.qno.toString().includes(search) ||
    r.type.toLowerCase().includes(search.toLowerCase()) ||
    r.status.includes(search.toLowerCase())
  );

  const allColors = [
    ...Object.values(STATUS_COLORS),
    ...SECTION_COLORS,
    AREA_COLOR,
    LINE_COLOR,
  ];

  if (attemptId && isLoading) {
    return <QuizzoLoader fullscreen label="Loading your report" />;
  }

  // Reached without an attempt id — a preview or sample run, which records
  // nothing. Better to say so than to invent a score.
  if (!attemptId || !attempt) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <p>No saved attempt for this session.</p>
        <p className="text-sm">Sit a published paper while signed in to get a scored report.</p>
        <Link to={`/${slug}/${courseSlug}`} className="underline underline-offset-2">
          Back to the course
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <NeonPatternDefs colors={allColors} />

      {/* Header */}
      <header className="bg-card border-b border-border px-4 md:px-6 h-14 flex items-center justify-between">
        <Link
          to={`/${slug}/${courseSlug}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft size={16} /> Back to {subject}
        </Link>
        <div className="text-sm font-semibold">
          {isPractice ? "Practice Session Report" : "Exam Performance Report"}
        </div>
        <div className="flex items-center gap-2">
          <ThemeButton />
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto p-4 md:p-6 space-y-6">
        {/* Title */}
        <div>
          <h1 className="text-2xl font-semibold">
            {isPractice ? "Practice Session Report" : "Exam Performance Report"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isPractice ? "Post-practice review and summary" : "Post-exam performance summary"}
          </p>
        </div>

        {/* Metrics */}
        <div className="flex flex-wrap border border-border rounded-md overflow-hidden">
          {[
            { label: "Total Score", value: `${totals.score} / ${totals.totalMarks}`, subtitle: "Marks scored" },
            { label: "Accuracy", value: `${totals.acc}%`, subtitle: "Correct vs attempted" },
            { label: "Time Taken", value: totals.timeStr, subtitle: isPractice ? "Total elapsed time" : "Time in session" },
            { label: "Questions Attempted", value: `${totals.attempted} / ${totals.totalQuestions}`, subtitle: `Attempted out of ${totals.totalQuestions}` },
          ].map((m, i) => (
            <div
              key={m.label}
              className={`flex-1 min-w-[160px] p-5 ${i > 0 ? "border-l border-border" : ""}`}
            >
              <p className="text-sm text-muted-foreground">{m.label}</p>
              <p className="text-3xl font-bold mt-1">{m.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{m.subtitle}</p>
            </div>
          ))}
        </div>

        {/* Row 2: Distributions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="Questions by status" subtitle="Distribution across exam states">
            <BarChart data={statusData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="currentColor" />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="currentColor" />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Bar dataKey="value" radius={0}>
                {statusData.map((e, i) => (
                  <Cell key={i} fill={`url(#${neonPatternId(e.color)})`} stroke={e.color} strokeWidth={1.5} />
                ))}
              </Bar>
            </BarChart>
          </Panel>

          <Panel title="Section distribution" subtitle="Score breakdown by subject">
            <PieChart>
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Pie data={sectionData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={2}>
                {sectionData.map((e, i) => (
                  <Cell key={i} fill={`url(#${neonPatternId(e.color)})`} stroke={e.color} strokeWidth={1.5} />
                ))}
              </Pie>
            </PieChart>
          </Panel>
        </div>

        {/* Row 3: Trends */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="Time per question" subtitle="Seconds spent on each question">
            <LineChart data={timeData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="q" tick={{ fontSize: 10 }} interval={2} stroke="currentColor" />
              <YAxis tick={{ fontSize: 11 }} stroke="currentColor" />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Line type="linear" dataKey="time" stroke={LINE_COLOR} strokeWidth={1.5} dot={{ r: 2.5, fill: LINE_COLOR }} />
            </LineChart>
          </Panel>

          <Panel title="Score progression" subtitle="Cumulative marks over time">
            <AreaChart data={cumulative}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="q" tick={{ fontSize: 10 }} interval={2} stroke="currentColor" />
              <YAxis tick={{ fontSize: 11 }} stroke="currentColor" />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Area
                type="linear"
                dataKey="score"
                stroke={AREA_COLOR}
                strokeWidth={1.5}
                fill={`url(#${neonPatternId(AREA_COLOR)})`}
                fillOpacity={1}
              />
            </AreaChart>
          </Panel>
        </div>

        {/* Row 4: Question Log */}
        <div className="space-y-3">
          <div className="bg-card border border-border rounded-md p-2 flex items-center gap-2">
            <div className="flex-1 flex items-center gap-2 px-2">
              <Search size={14} className="text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search questions..."
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
              />
            </div>
            <button
              onClick={() => setView("list")}
              className={`p-2 rounded transition-colors ${
                view === "list"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label="List view"
            >
              <List size={14} />
            </button>
            <button
              onClick={() => setView("grid")}
              className={`p-2 rounded transition-colors ${
                view === "grid"
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label="Grid view"
            >
              <LayoutGrid size={14} />
            </button>
          </div>

          {view === "list" ? (
            <div className="border border-border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground border-b border-border">
                    <th className="px-4 py-3 font-medium">Q.No</th>
                    <th className="px-4 py-3 font-medium">Question Type</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Marks</th>
                    <th className="px-4 py-3 font-medium">Time Spent</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const dot =
                      r.status === "correct"
                        ? "bg-success"
                        : r.status === "incorrect"
                        ? "bg-destructive"
                        : "bg-muted-foreground/50";
                    const label = r.status[0].toUpperCase() + r.status.slice(1);
                    const markClass =
                      r.marks > 0
                        ? "text-success"
                        : r.marks < 0
                        ? "text-destructive"
                        : "text-muted-foreground";
                    return (
                      <tr
                        key={r.qno}
                        className="border-b border-border hover:bg-muted"
                      >
                        <td className="px-4 py-3">{r.qno}</td>
                        <td className="px-4 py-3 text-foreground/80">{r.type}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${dot}`} /> {label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium ${markClass}`}>
                            {r.marks > 0 ? `+${r.marks}` : r.marks}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-foreground/80">{r.time}s</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map((r) => {
                const dot =
                  r.status === "correct"
                    ? "bg-success"
                    : r.status === "incorrect"
                    ? "bg-destructive"
                    : "bg-muted-foreground/50";
                const label = r.status[0].toUpperCase() + r.status.slice(1);
                const markClass =
                  r.marks > 0
                    ? "text-success"
                    : r.marks < 0
                    ? "text-destructive"
                    : "text-muted-foreground";
                return (
                  <div
                    key={r.qno}
                    className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3 shadow-none"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">Q. {r.qno}</span>
                      <span className="bg-muted text-xs text-foreground px-2 py-1 rounded">
                        {r.type}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-2 text-sm text-foreground/80">
                        <span className={`h-2 w-2 rounded-full ${dot}`} /> {label}
                      </span>
                      <span className={`text-sm font-medium ${markClass}`}>
                        {r.marks > 0 ? `+${r.marks}` : r.marks}
                      </span>
                    </div>
                    <div className="border-t border-border pt-2 mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Clock size={14} />
                      <span>{r.time}s</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
