import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { AdminError, AdminLoading, EmptyChart } from "@/components/AdminState";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { useNeonCharts } from "@/hooks/use-neon-charts";
import { NeonPatternDefs, neonPatternId } from "@/components/NeonPatternDefs";
import { BRAND, colorAt, loadPerformance } from "@/lib/admin-stats";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell,
  AreaChart, Area,
} from "recharts";

const PASS_COLOR = BRAND.success;
const FAIL_COLOR = BRAND.destructive;
const SCORE_COLOR = BRAND.primary;

const KIND_LABEL: Record<string, string> = {
  single: "Single correct",
  multi: "Multi correct",
  numerical: "Numerical",
  comprehension: "Comprehension",
};

const fmtPct = (n: number | null | undefined) => (n == null ? "—" : `${n}%`);

function heatColor(v: number) {
  // Brand colours only: green for strong, amber for middling, red for weak.
  if (v >= 80) return "bg-success text-success-foreground";
  if (v >= 65) return "bg-success/40 text-foreground";
  if (v >= 55) return "bg-warning/50 text-foreground";
  if (v >= 45) return "bg-destructive/40 text-foreground";
  return "bg-destructive text-destructive-foreground";
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
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-performance"],
    queryFn: loadPerformance,
  });

  const byCourse = useMemo(
    () => (data?.by_course ?? []).filter((c) => c.avg_pct != null).map((c, i) => ({ subject: c.course, avg: c.avg_pct as number, fill: colorAt(i) })),
    [data]
  );
  const byTerm = useMemo(
    () => (data?.by_term ?? []).filter((t) => t.avg_pct != null).map((t) => ({ term: `${t.term.split(" ")[0]} ${String(t.year).slice(2)}`, score: t.avg_pct as number })),
    [data]
  );
  const passFail = useMemo(
    () => [
      { name: "Pass", value: data?.pass_count ?? 0, fill: PASS_COLOR },
      { name: "Fail", value: data?.fail_count ?? 0, fill: FAIL_COLOR },
    ],
    [data]
  );

  // Heatmap: course × question type, from the real answers.
  const heat = useMemo(() => {
    const rows = data?.accuracy_by_kind ?? [];
    const courses = [...new Set(rows.map((r) => r.course))];
    const kinds = [...new Set(rows.map((r) => r.kind))].sort();
    const cell = new Map(rows.map((r) => [`${r.course}|${r.kind}`, r]));
    return { courses, kinds, cell };
  }, [data]);

  const subjectConfig: ChartConfig = useMemo(
    () => Object.fromEntries(byCourse.map((s) => [s.subject, { label: s.subject, color: s.fill }])),
    [byCourse]
  );
  const passFailConfig: ChartConfig = { Pass: { label: "Pass", color: PASS_COLOR }, Fail: { label: "Fail", color: FAIL_COLOR } };
  const scoreConfig: ChartConfig = { score: { label: "Avg score", color: SCORE_COLOR } };
  const allColors = [...byCourse.map((s) => s.fill), PASS_COLOR, FAIL_COLOR, SCORE_COLOR];

  const stats = data
    ? [
        { label: "Pass rate", value: data.attempts ? fmtPct(Math.round((100 * data.pass_count) / data.attempts)) : "—", hint: `Attempts scoring ${data.pass_mark_pct}% or more` },
        { label: "Average score", value: fmtPct(data.avg_pct), hint: "Across all submitted attempts" },
        { label: "Attempts", value: data.attempts.toLocaleString("en-IN"), hint: "Submitted, all time" },
        { label: "Active students", value: data.active_students_30d.toLocaleString("en-IN"), hint: "Attempted in the last 30 days" },
      ]
    : [];

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="px-4 md:px-6 h-11 border-b border-border flex items-center shrink-0">
          <h1 className="text-[13px] font-medium">Performance</h1>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading && <AdminLoading />}
          {error && <AdminError message={error instanceof Error ? error.message : "Unknown error"} onRetry={() => void refetch()} />}

          {data && (
            <>
              <NeonPatternDefs colors={allColors} />
              <div className="p-4 md:p-6 space-y-6 max-w-[1400px]">
                {/* Stats */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-px border border-border bg-border rounded-md overflow-hidden">
                  {stats.map((s) => (
                    <div key={s.label} className="bg-card p-4">
                      <p className="text-[12px] text-muted-foreground">{s.label}</p>
                      <p className="text-2xl font-medium mt-1">{s.value}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{s.hint}</p>
                    </div>
                  ))}
                </div>

                {/* Course performance + Pass/Fail */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-px border border-border bg-border rounded-md overflow-hidden">
                  <Panel title="Course-wise average" subtitle="Mean score per course (%), most-attempted courses" className="lg:col-span-2">
                    {byCourse.length > 0 ? (
                      <ChartContainer config={subjectConfig} className="h-[220px] w-full">
                        <BarChart data={byCourse}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="subject" tick={{ fontSize: 10 }} interval={0} tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} stroke="hsl(var(--muted-foreground))" />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Bar dataKey="avg" radius={0}>
                            {byCourse.map((e, i) => <Cell key={i} {...getFill(e.fill)} />)}
                          </Bar>
                        </BarChart>
                      </ChartContainer>
                    ) : (
                      <EmptyChart>No attempts yet.</EmptyChart>
                    )}
                  </Panel>
                  <Panel title="Pass / Fail" subtitle={`Pass mark ${data.pass_mark_pct}% of total marks`}>
                    {data.attempts > 0 ? (
                      <ChartContainer config={passFailConfig} className="h-[220px] w-full">
                        <PieChart>
                          <ChartTooltip content={<ChartTooltipContent />} />
                          <Pie data={passFail} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                            {passFail.map((e, i) => <Cell key={i} {...getFill(e.fill)} />)}
                          </Pie>
                        </PieChart>
                      </ChartContainer>
                    ) : (
                      <EmptyChart>No attempts yet.</EmptyChart>
                    )}
                  </Panel>
                </div>

                {/* Score over terms */}
                <div className="grid grid-cols-1 gap-px border border-border bg-border rounded-md overflow-hidden">
                  <Panel title="Average score by exam term" subtitle="Grouped by the term and year of the sitting attempted">
                    {byTerm.length > 0 ? (
                      <ChartContainer config={scoreConfig} className="h-[220px] w-full">
                        <AreaChart data={byTerm}>
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
                    ) : (
                      <EmptyChart>No attempts yet.</EmptyChart>
                    )}
                  </Panel>
                </div>

                {/* Course × question-type accuracy heatmap */}
                <div className="border border-border rounded-md p-4 bg-card">
                  <p className="text-[13px] font-medium mb-1">Accuracy by question type</p>
                  <p className="text-[12px] text-muted-foreground mb-4">Correct answers as a share of answers given (%), per course</p>
                  {heat.courses.length === 0 ? (
                    <EmptyChart>No answers recorded yet.</EmptyChart>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[12px] min-w-[420px]">
                        <thead>
                          <tr>
                            <th className="text-left font-medium text-muted-foreground px-2 py-1.5" />
                            {heat.kinds.map((k) => (
                              <th key={k} className="text-center font-medium text-muted-foreground px-2 py-1.5">{KIND_LABEL[k] ?? k}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {heat.courses.map((course) => (
                            <tr key={course}>
                              <td className="px-2 py-1.5 text-foreground whitespace-nowrap">{course}</td>
                              {heat.kinds.map((k) => {
                                const c = heat.cell.get(`${course}|${k}`);
                                return (
                                  <td key={k} className="px-1 py-1">
                                    {c && c.accuracy != null ? (
                                      <div className={`h-9 rounded flex items-center justify-center font-medium ${heatColor(c.accuracy)}`} title={`${c.attempted} answers`}>
                                        {c.accuracy}
                                      </div>
                                    ) : (
                                      <div className="h-9 rounded flex items-center justify-center text-muted-foreground border border-dashed border-border">–</div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
