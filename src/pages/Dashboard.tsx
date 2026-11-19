import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { AdminError, AdminLoading, EmptyChart } from "@/components/AdminState";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { FilePlus2, GraduationCap, ClipboardList, Library, Target, Check } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { NeonPatternDefs } from "@/components/NeonPatternDefs";
import { useNeonCharts } from "@/hooks/use-neon-charts";
import { BRAND, colorAt, loadOverview, resolveReport, REPORT_REASON_LABEL } from "@/lib/admin-stats";
import { examTypeLabel } from "@/lib/pyq-read";

const BAR_COLOR = BRAND.primary;
const fmtNum = (n: number) => n.toLocaleString("en-IN");
const fmtPct = (n: number | null) => (n == null ? "—" : `${n}%`);
const shortDay = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return new Date(2000, m - 1, d).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
};

export default function Overview() {
  const { getFill } = useNeonCharts();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: loadOverview,
  });

  const resolve = useMutation({
    mutationFn: resolveReport,
    onSuccess: () => {
      toast.success("Report resolved");
      void queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not resolve the report"),
  });

  const daily = useMemo(() => (data?.daily ?? []).map((d) => ({ ...d, label: shortDay(d.day) })), [data]);
  const bySubject = useMemo(
    () => (data?.by_course ?? []).map((c, i) => ({ name: c.name, value: c.attempts, fill: colorAt(i) })),
    [data]
  );
  const subjectChartConfig: ChartConfig = useMemo(
    () => Object.fromEntries(bySubject.map((s) => [s.name, { label: s.name, color: s.fill }])),
    [bySubject]
  );
  const examsChartConfig: ChartConfig = { attempts: { label: "Attempts", color: BAR_COLOR } };

  const stats = data
    ? [
        { label: "Students", value: fmtNum(data.students), icon: GraduationCap, hint: "Registered accounts" },
        { label: "Published papers", value: fmtNum(data.published_papers), icon: ClipboardList, hint: "Open for practice" },
        { label: "Questions in bank", value: fmtNum(data.questions), icon: Library, hint: "In published papers" },
        {
          label: "Attempts · 30 days",
          value: fmtNum(data.attempts_30d),
          icon: Target,
          hint: data.attempts_30d ? `Average score ${fmtPct(data.avg_pct_30d)}` : "No attempts yet",
        },
      ]
    : [];

  const hasAttempts = (data?.daily ?? []).some((d) => d.attempts > 0);

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
          {isLoading && <AdminLoading />}
          {error && <AdminError message={error instanceof Error ? error.message : "Unknown error"} onRetry={() => void refetch()} />}

          {data && (
            <div className="p-4 md:p-6 space-y-6 max-w-[1400px]">
              <NeonPatternDefs colors={[...bySubject.map((s) => s.fill), BAR_COLOR]} />

              {/* Stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px border border-border bg-border rounded-md overflow-hidden">
                {stats.map((stat) => (
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
                  <p className="text-[13px] font-medium mb-1">Attempts over time</p>
                  <p className="text-[12px] text-muted-foreground mb-4">Submitted attempts per day · last 14 days</p>
                  {hasAttempts ? (
                    <ChartContainer config={examsChartConfig} className="h-[200px] w-full">
                      <BarChart data={daily}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} stroke="hsl(var(--muted-foreground))" />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="attempts" radius={0}>
                          {daily.map((_, i) => <Cell key={i} {...getFill(BAR_COLOR)} />)}
                        </Bar>
                      </BarChart>
                    </ChartContainer>
                  ) : (
                    <EmptyChart>No attempts in the last 14 days.</EmptyChart>
                  )}
                </div>
                <div className="bg-card p-4">
                  <p className="text-[13px] font-medium mb-1">Attempts by course</p>
                  <p className="text-[12px] text-muted-foreground mb-4">Top courses, all time</p>
                  {bySubject.length > 0 ? (
                    <ChartContainer config={subjectChartConfig} className="h-[200px] w-full">
                      <PieChart>
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Pie data={bySubject} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}>
                          {bySubject.map((entry, i) => <Cell key={i} {...getFill(entry.fill)} />)}
                        </Pie>
                      </PieChart>
                    </ChartContainer>
                  ) : (
                    <EmptyChart>No attempts yet.</EmptyChart>
                  )}
                </div>
              </div>

              {/* Open question reports */}
              <div>
                <p className="text-[13px] font-medium mb-2">
                  Open question reports
                  <span className="ml-2 text-[12px] font-normal text-muted-foreground">{data.open_reports} open</span>
                </p>
                <div className="border border-border rounded-md overflow-hidden">
                  {data.reports.length === 0 ? (
                    <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                      Nothing reported. Students can flag a question from the exam screen.
                    </p>
                  ) : (
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-b border-border bg-muted">
                          <th className="text-left font-medium text-muted-foreground px-3 py-2">Question</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2">Issue</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 hidden md:table-cell">Note</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {data.reports.map((r) => (
                          <tr key={r.id} className="border-b border-border last:border-0 align-top">
                            <td className="px-3 py-2">
                              <p className="font-medium">{r.course} · Q{r.position}</p>
                              <p className="text-[12px] text-muted-foreground line-clamp-2">{r.snippet}</p>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">{REPORT_REASON_LABEL[r.reason] ?? r.reason}</td>
                            <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">{r.note || "—"}</td>
                            <td className="px-3 py-2 text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[12px] gap-1"
                                disabled={resolve.isPending}
                                onClick={() => resolve.mutate(r.id)}
                              >
                                <Check className="h-3 w-3" /> Resolve
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Recently attempted papers */}
              <div>
                <p className="text-[13px] font-medium mb-2">Recently attempted papers</p>
                <div className="border border-border rounded-md overflow-hidden">
                  {data.recent_papers.length === 0 ? (
                    <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">No attempts yet.</p>
                  ) : (
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-b border-border bg-muted">
                          <th className="text-left font-medium text-muted-foreground px-3 py-2">Course</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2">Sitting</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2">Attempts</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2">Avg. score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recent_papers.map((p) => (
                          <tr key={p.paper_id} className="border-b border-border last:border-0 hover:bg-muted transition-colors">
                            <td className="px-3 py-2 font-medium">{p.course}</td>
                            <td className="px-3 py-2">
                              <span className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-foreground">
                                {examTypeLabel(p.exam_type)} · {p.term} {p.year}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground tabular-nums">{p.attempts}</td>
                            <td className="px-3 py-2 tabular-nums">{fmtPct(p.avg_pct)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
