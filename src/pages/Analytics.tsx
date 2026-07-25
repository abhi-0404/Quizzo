import { useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useNeonCharts } from "@/hooks/use-neon-charts";
import { NeonPatternDefs, neonPatternId } from "@/components/NeonPatternDefs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell,
  AreaChart, Area,
} from "recharts";

const PASS_COLOR = "hsl(142, 70%, 40%)";
const FAIL_COLOR = "hsl(0, 72%, 51%)";
const SCORE_COLOR = "hsl(234, 55%, 60%)";

// ── Static academic analytics data ──────────────────────────────────────────
const STATS = [
  { label: "Overall Pass Rate", value: "78%", hint: "Across all subjects" },
  { label: "Average Score", value: "68%", hint: "Platform-wide mean" },
  { label: "Exams Conducted", value: "342", hint: "This academic year" },
  { label: "Active Cohorts", value: "6", hint: "Data Science program" },
];

const SUBJECT_PERF = [
  { subject: "Statistics", avg: 71, fill: "hsl(199, 89%, 48%)" },
  { subject: "Mathematics", avg: 64, fill: "hsl(234, 55%, 60%)" },
  { subject: "Python", avg: 82, fill: "hsl(142, 70%, 40%)" },
  { subject: "DBMS", avg: 59, fill: "hsl(38, 92%, 50%)" },
  { subject: "ML", avg: 66, fill: "hsl(280, 60%, 55%)" },
];

const PASS_FAIL = [
  { name: "Pass", value: 78, fill: PASS_COLOR },
  { name: "Fail", value: 22, fill: FAIL_COLOR },
];

const SCORE_BY_SEMESTER = [
  { term: "Sep 23", score: 61 },
  { term: "Jan 24", score: 64 },
  { term: "May 24", score: 63 },
  { term: "Sep 24", score: 69 },
  { term: "Jan 25", score: 72 },
  { term: "May 25", score: 68 },
];

// Subject × difficulty accuracy heatmap (0–100).
const HEATMAP_SUBJECTS = ["Statistics", "Mathematics", "Python", "DBMS", "ML"];
const HEATMAP_LEVELS = ["Easy", "Medium", "Hard"];
const HEATMAP: number[][] = [
  [88, 70, 52], // Statistics
  [84, 63, 44], // Mathematics
  [93, 81, 66], // Python
  [80, 58, 40], // DBMS
  [86, 67, 49], // ML
];

function heatColor(v: number) {
  // Solid green→amber→red steps by accuracy band (no alpha).
  if (v >= 80) return "bg-emerald-500 text-white";
  if (v >= 65) return "bg-lime-500 text-black";
  if (v >= 55) return "bg-amber-500 text-black";
  if (v >= 45) return "bg-orange-500 text-white";
  return "bg-rose-500 text-white";
}

function Panel({ title, subtitle, children, className = "" }: { title: string; subtitle: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-card p-4 ${className}`}>
      <p className="text-[13px] font-medium mb-1">{title}</p>
      <p className="text-[12px] text-muted-foreground mb-4">{subtitle}</p>
      {children}
    </div>
  );
}

export default function Performance() {
  const { getFill } = useNeonCharts();

  const subjectConfig: ChartConfig = useMemo(
    () => Object.fromEntries(SUBJECT_PERF.map((s) => [s.subject, { label: s.subject, color: s.fill }])),
    []
  );
  const passFailConfig: ChartConfig = { Pass: { label: "Pass", color: PASS_COLOR }, Fail: { label: "Fail", color: FAIL_COLOR } };
  const scoreConfig: ChartConfig = { score: { label: "Avg Score", color: SCORE_COLOR } };

  const allColors = [...SUBJECT_PERF.map((s) => s.fill), PASS_COLOR, FAIL_COLOR, SCORE_COLOR];

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-4 md:px-6 h-11 border-b border-border flex items-center shrink-0">
          <h1 className="text-[13px] font-medium">Performance</h1>
        </div>

        <div className="flex-1 overflow-auto">
          <NeonPatternDefs colors={allColors} />
          <div className="p-4 md:p-6 space-y-6 max-w-[1400px]">
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-px border border-border bg-border rounded-md overflow-hidden">
              {STATS.map((s) => (
                <div key={s.label} className="bg-card p-4">
                  <p className="text-[12px] text-muted-foreground">{s.label}</p>
                  <p className="text-2xl font-medium mt-1">{s.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{s.hint}</p>
                </div>
              ))}
            </div>

            {/* Subject performance + Pass/Fail */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-px border border-border bg-border rounded-md overflow-hidden">
              <Panel title="Subject-wise average" subtitle="Mean score per subject (%)" className="lg:col-span-2">
                <ChartContainer config={subjectConfig} className="h-[220px] w-full">
                  <BarChart data={SUBJECT_PERF}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="subject" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="avg" radius={0}>
                      {SUBJECT_PERF.map((e, i) => <Cell key={i} {...getFill(e.fill)} />)}
                    </Bar>
                  </BarChart>
                </ChartContainer>
              </Panel>
              <Panel title="Pass / Fail ratio" subtitle="Across all exams">
                <ChartContainer config={passFailConfig} className="h-[220px] w-full">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Pie data={PASS_FAIL} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {PASS_FAIL.map((e, i) => <Cell key={i} {...getFill(e.fill)} />)}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              </Panel>
            </div>

            {/* Score over semesters */}
            <div className="grid grid-cols-1 gap-px border border-border bg-border rounded-md overflow-hidden">
              <Panel title="Average score across semesters" subtitle="Trend over the last six terms">
                <ChartContainer config={scoreConfig} className="h-[220px] w-full">
                  <AreaChart data={SCORE_BY_SEMESTER}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="term" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      type="monotone"
                      dataKey="score"
                      stroke={SCORE_COLOR}
                      strokeWidth={1.5}
                      fill={`url(#${neonPatternId(SCORE_COLOR)})`}
                      fillOpacity={1}
                    />
                  </AreaChart>
                </ChartContainer>
              </Panel>
            </div>

            {/* Subject × difficulty heatmap */}
            <div className="border border-border rounded-md p-4 bg-card">
              <p className="text-[13px] font-medium mb-1">Accuracy heatmap</p>
              <p className="text-[12px] text-muted-foreground mb-4">Average accuracy by subject and difficulty (%)</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] min-w-[420px]">
                  <thead>
                    <tr>
                      <th className="text-left font-medium text-muted-foreground px-2 py-1.5" />
                      {HEATMAP_LEVELS.map((lvl) => (
                        <th key={lvl} className="text-center font-medium text-muted-foreground px-2 py-1.5">{lvl}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {HEATMAP_SUBJECTS.map((subject, r) => (
                      <tr key={subject}>
                        <td className="px-2 py-1.5 text-foreground whitespace-nowrap">{subject}</td>
                        {HEATMAP[r].map((v, c) => (
                          <td key={c} className="px-1 py-1">
                            <div className={`h-9 rounded flex items-center justify-center font-medium ${heatColor(v)}`}>
                              {v}
                            </div>
                          </td>
                        ))}
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
