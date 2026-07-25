import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { FilePlus2, GraduationCap, ClipboardList, Library, Target } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { NeonPatternDefs } from "@/components/NeonPatternDefs";
import { useNeonCharts } from "@/hooks/use-neon-charts";

// ── Static Quizo platform data (no backend yet — stable UI state) ────────────
const STATS = [
  { label: "Total Students", value: "1,284", icon: GraduationCap, hint: "Registered across all programs" },
  { label: "Active Exams", value: "18", icon: ClipboardList, hint: "Currently open for attempts" },
  { label: "Questions in Bank", value: "3,540", icon: Library, hint: "Across every subject" },
  { label: "Avg. Accuracy", value: "72%", icon: Target, hint: "Platform-wide, last 30 days" },
];

// Exams taken over the last 14 days.
const EXAMS_OVER_TIME = [
  { day: "Jul 08", exams: 42 }, { day: "Jul 09", exams: 55 }, { day: "Jul 10", exams: 48 },
  { day: "Jul 11", exams: 63 }, { day: "Jul 12", exams: 71 }, { day: "Jul 13", exams: 38 },
  { day: "Jul 14", exams: 29 }, { day: "Jul 15", exams: 66 }, { day: "Jul 16", exams: 74 },
  { day: "Jul 17", exams: 82 }, { day: "Jul 18", exams: 69 }, { day: "Jul 19", exams: 45 },
  { day: "Jul 20", exams: 58 }, { day: "Jul 21", exams: 77 },
];

const SUBJECT_COLORS: Record<string, string> = {
  "Statistics": "hsl(199, 89%, 48%)",
  "Mathematics": "hsl(234, 55%, 60%)",
  "Python": "hsl(142, 70%, 40%)",
  "DBMS": "hsl(38, 92%, 50%)",
  "Machine Learning": "hsl(280, 60%, 55%)",
};
const ATTEMPTS_BY_SUBJECT = [
  { name: "Statistics", value: 320, fill: SUBJECT_COLORS["Statistics"] },
  { name: "Mathematics", value: 280, fill: SUBJECT_COLORS["Mathematics"] },
  { name: "Python", value: 410, fill: SUBJECT_COLORS["Python"] },
  { name: "DBMS", value: 190, fill: SUBJECT_COLORS["DBMS"] },
  { name: "Machine Learning", value: 240, fill: SUBJECT_COLORS["Machine Learning"] },
];

const RECENT_EXAMS = [
  { id: "EX-2041", title: "Statistics I — Quiz 2", subject: "Statistics", attempts: 214, avg: "68%" },
  { id: "EX-2040", title: "Programming in Python — End Term", subject: "Python", attempts: 342, avg: "74%" },
  { id: "EX-2039", title: "Mathematics II — Quiz 1", subject: "Mathematics", attempts: 188, avg: "71%" },
  { id: "EX-2038", title: "DBMS — Midterm", subject: "DBMS", attempts: 156, avg: "63%" },
  { id: "EX-2037", title: "Machine Learning Foundations — Quiz 2", subject: "Machine Learning", attempts: 201, avg: "70%" },
];

export default function Overview() {
  const { getFill } = useNeonCharts();

  const examsChartConfig: ChartConfig = { exams: { label: "Exams", color: "hsl(234, 55%, 60%)" } };
  const subjectChartConfig: ChartConfig = useMemo(
    () => Object.fromEntries(ATTEMPTS_BY_SUBJECT.map((s) => [s.name, { label: s.name, color: s.fill }])),
    []
  );

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 md:px-6 h-11 border-b border-border shrink-0">
          <h1 className="text-[13px] font-medium">Overview</h1>
          <Button asChild size="sm" className="h-7 text-[12px] gap-1.5">
            <Link to="/admin/create">
              <FilePlus2 className="h-3.5 w-3.5" /> Create Content
            </Link>
          </Button>
        </div>

        <div className="flex-1 overflow-auto">
          <div className="p-4 md:p-6 space-y-6 max-w-[1400px]">
            <NeonPatternDefs colors={[...Object.values(SUBJECT_COLORS), "hsl(234, 55%, 60%)"]} />

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-px border border-border bg-border rounded-md overflow-hidden">
              {STATS.map((stat) => (
                <div key={stat.label} className="bg-card p-4">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <stat.icon className="h-3.5 w-3.5" />
                    <p className="text-[12px]">{stat.label}</p>
                  </div>
                  <p className="text-2xl font-medium mt-1">{stat.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{stat.hint}</p>
                </div>
              ))}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-px border border-border bg-border rounded-md overflow-hidden">
              <div className="bg-card p-4 lg:col-span-2">
                <p className="text-[13px] font-medium mb-1">Exams taken over time</p>
                <p className="text-[12px] text-muted-foreground mb-4">Attempts per day · last 14 days</p>
                <ChartContainer config={examsChartConfig} className="h-[200px] w-full">
                  <BarChart data={EXAMS_OVER_TIME}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" tick={{ fontSize: 10 }} interval={1} stroke="hsl(var(--muted-foreground))" />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="exams" radius={0}>
                      {EXAMS_OVER_TIME.map((_, i) => <Cell key={i} {...getFill("hsl(234, 55%, 60%)")} />)}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </div>
              <div className="bg-card p-4">
                <p className="text-[13px] font-medium mb-1">Attempts by subject</p>
                <p className="text-[12px] text-muted-foreground mb-4">Share of total attempts</p>
                <ChartContainer config={subjectChartConfig} className="h-[200px] w-full">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Pie data={ATTEMPTS_BY_SUBJECT} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {ATTEMPTS_BY_SUBJECT.map((entry, i) => <Cell key={i} {...getFill(entry.fill)} />)}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              </div>
            </div>

            {/* Recent exams table */}
            <div>
              <p className="text-[13px] font-medium mb-2">Recent exams</p>
              <div className="border border-border rounded-md overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border bg-muted">
                      <th className="text-left font-medium text-muted-foreground px-3 py-2">ID</th>
                      <th className="text-left font-medium text-muted-foreground px-3 py-2">Exam</th>
                      <th className="text-left font-medium text-muted-foreground px-3 py-2">Subject</th>
                      <th className="text-left font-medium text-muted-foreground px-3 py-2">Attempts</th>
                      <th className="text-left font-medium text-muted-foreground px-3 py-2">Avg. Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {RECENT_EXAMS.map((ex) => (
                      <tr key={ex.id} className="border-b border-border last:border-0 hover:bg-muted transition-colors">
                        <td className="px-3 py-2 text-muted-foreground font-mono text-[12px]">{ex.id}</td>
                        <td className="px-3 py-2 font-medium">{ex.title}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-foreground">
                            {ex.subject}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground tabular-nums">{ex.attempts}</td>
                        <td className="px-3 py-2 tabular-nums">{ex.avg}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
