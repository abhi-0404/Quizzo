import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { AdminError, AdminLoading } from "@/components/AdminState";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, FileUp, Flag, Library } from "lucide-react";
import { examTypeLabel } from "@/lib/pyq-read";
import {
  computeStats,
  contributorKeys,
  listMyReviews,
  listMySolutions,
  listReviewPapers,
  papersInProgress,
  progressPct,
} from "@/lib/contributor";

async function loadOverview() {
  const [papers, reviews, solutions] = await Promise.all([listReviewPapers(), listMyReviews(), listMySolutions()]);
  return {
    papers,
    stats: computeStats(
      papers,
      reviews.map((r) => ({ verdict: r.verdict as "correct" | "incorrect", status: r.status as "pending" | "accepted" | "rejected" })),
      solutions.map((s) => ({ status: s.status as "pending" | "approved" | "rejected" }))
    ),
  };
}

export default function ContributorOverview() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: contributorKeys.stats,
    queryFn: loadOverview,
  });

  const stats = data?.stats;
  const inProgress = data ? papersInProgress(data.papers) : [];

  const cards = stats
    ? [
        { label: "Papers to review", value: stats.papersAvailable, icon: Library, hint: "Published and open to you" },
        {
          label: "Questions reviewed",
          value: stats.questionsReviewed,
          icon: ClipboardCheck,
          hint: `${stats.confirmed} confirmed correct`,
        },
        {
          label: "Flags raised",
          value: stats.flagsRaised,
          icon: Flag,
          hint: `${stats.flagsAccepted} accepted · ${stats.flagsPending} pending · ${stats.flagsRejected} rejected`,
        },
        {
          label: "Solutions uploaded",
          value: stats.solutionsSubmitted,
          icon: FileUp,
          hint: `${stats.solutionsApproved} approved · ${stats.solutionsPending} pending · ${stats.solutionsRejected} rejected`,
        },
      ]
    : [];

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 md:px-6 h-11 border-b border-border shrink-0">
          <h1 className="text-[13px] font-medium">Overview</h1>
          <Button asChild size="sm" className="h-7 text-[12px] gap-1.5">
            <Link to="/contributor/papers">
              <ClipboardCheck className="h-3.5 w-3.5" /> Papers to review
            </Link>
          </Button>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading && <AdminLoading />}
          {error && <AdminError message={error instanceof Error ? error.message : "Unknown error"} onRetry={() => void refetch()} />}

          {data && stats && (
            <div className="p-4 md:p-6 space-y-6 max-w-[1400px]">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px border border-border bg-border rounded-md overflow-hidden">
                {cards.map((c) => (
                  <div key={c.label} className="bg-card p-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <c.icon className="h-3.5 w-3.5" />
                      <p className="text-[12px]">{c.label}</p>
                    </div>
                    <p className="text-2xl font-medium mt-1 tabular-nums">{c.value.toLocaleString("en-IN")}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{c.hint}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-[13px] font-medium mb-2">Continue where you left off</p>
                <div className="border border-border rounded-md overflow-hidden">
                  {inProgress.length === 0 ? (
                    <p className="px-3 py-6 text-center text-[12px] text-muted-foreground">
                      {data.papers.length === 0
                        ? "No papers are published yet. They will appear here once an admin publishes one."
                        : "Nothing in progress. Pick a paper to start checking its answers."}
                    </p>
                  ) : (
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-b border-border bg-muted">
                          <th className="text-left font-medium text-muted-foreground px-3 py-2">Paper</th>
                          <th className="text-left font-medium text-muted-foreground px-3 py-2 w-[220px]">Progress</th>
                          <th className="px-3 py-2 w-[90px]" />
                        </tr>
                      </thead>
                      <tbody>
                        {inProgress.map((p) => {
                          const pct = progressPct(p.my_reviews, p.question_count);
                          return (
                            <tr key={p.paper_id} className="border-b border-border last:border-0 hover:bg-muted transition-colors">
                              <td className="px-3 py-2">
                                <p className="font-medium">{p.course}</p>
                                <p className="text-[12px] text-muted-foreground">
                                  {examTypeLabel(p.exam_type)} · {p.term} {p.year}
                                </p>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 flex-1 rounded-full bg-border" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Reviewed">
                                    <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
                                    {p.my_reviews}/{p.question_count}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <Button asChild size="sm" variant="outline" className="h-7 text-[12px]">
                                  <Link to={`/contributor/papers/${p.paper_id}`}>Continue</Link>
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
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
