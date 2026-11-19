import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { AdminError, AdminLoading } from "@/components/AdminState";
import { StatusBadge } from "@/components/contributor/StatusBadge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { examTypeLabel } from "@/lib/pyq-read";
import {
  contributorKeys,
  formatBytes,
  formatKey,
  formatWhen,
  listSubmittedReviews,
  listSubmittedSolutions,
  solutionUrl,
} from "@/lib/contributor";

const th = "text-left font-medium text-muted-foreground px-3 py-2";

/** A private file is opened through a short-lived link, minted when asked for. */
function OpenFile({ path, name }: { path: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (url) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-[12px] underline underline-offset-2" aria-label={`Open ${name}`}>
        Open file
      </a>
    );
  }
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 gap-1 text-[12px]"
      disabled={busy}
      aria-label={`Get a link to ${name}`}
      onClick={async () => {
        setBusy(true);
        setFailed(false);
        try {
          setUrl(await solutionUrl(path));
        } catch {
          setFailed(true);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy && <Loader2 className="h-3 w-3 animate-spin" />}
      {failed ? "Retry" : "View"}
    </Button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-10 text-center text-[13px] text-muted-foreground">{children}</p>;
}

export default function ContributorSubmissions() {
  const reviewsQ = useQuery({ queryKey: contributorKeys.myReviews, queryFn: listSubmittedReviews });
  const solutionsQ = useQuery({ queryKey: contributorKeys.mySolutions, queryFn: listSubmittedSolutions });

  const reviews = reviewsQ.data ?? [];
  const solutions = solutionsQ.data ?? [];

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 md:px-6 h-11 border-b border-border shrink-0">
          <h1 className="text-[13px] font-medium">My submissions</h1>
        </div>

        <div className="flex-1 overflow-auto">
          <Tabs defaultValue="reviews" className="p-4 md:p-6 max-w-[1400px]">
            <TabsList className="h-8">
              <TabsTrigger value="reviews" className="text-[12px]">
                Answer reviews <span className="ml-1.5 text-muted-foreground tabular-nums">{reviews.length}</span>
              </TabsTrigger>
              <TabsTrigger value="solutions" className="text-[12px]">
                Solutions <span className="ml-1.5 text-muted-foreground tabular-nums">{solutions.length}</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="reviews" className="mt-4">
              {reviewsQ.error ? (
                <AdminError message={reviewsQ.error instanceof Error ? reviewsQ.error.message : "Unknown error"} onRetry={() => void reviewsQ.refetch()} />
              ) : reviewsQ.isLoading ? (
                <AdminLoading />
              ) : (
                <div className="border border-border rounded-md overflow-x-auto">
                  {reviews.length === 0 ? (
                    <Empty>
                      You have not reviewed any answers yet.{" "}
                      <Link to="/contributor/papers" className="underline underline-offset-2">
                        Pick a paper
                      </Link>
                      .
                    </Empty>
                  ) : (
                    <table className="w-full text-[13px] min-w-[640px]">
                      <thead>
                        <tr className="border-b border-border bg-muted">
                          <th className={th}>Paper</th>
                          <th className={`${th} w-[70px]`}>Q</th>
                          <th className={th}>Your verdict</th>
                          <th className={`${th} w-[110px]`}>Status</th>
                          <th className={`${th} w-[110px]`}>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reviews.map((r) => (
                          <tr key={r.id} className="border-b border-border last:border-0 align-top hover:bg-muted transition-colors">
                            <td className="px-3 py-2">
                              <Link to={`/contributor/papers/${r.paperId}`} className="font-medium hover:underline underline-offset-2">
                                {r.course}
                              </Link>
                              <p className="text-[12px] text-muted-foreground">
                                {examTypeLabel(r.examType)} · {r.term} {r.year}
                              </p>
                            </td>
                            <td className="px-3 py-2 tabular-nums">{r.position}</td>
                            <td className="px-3 py-2">
                              {r.verdict === "correct" ? (
                                <span>Key is correct</span>
                              ) : (
                                <span>
                                  Key is wrong. Should be{" "}
                                  <span className="font-medium">
                                    {formatKey(r.suggestedCorrect, r.suggestedNumerical, r.suggestedNumerical ? "numerical" : "multi")}
                                  </span>
                                </span>
                              )}
                              {r.note && <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-2">{r.note}</p>}
                            </td>
                            <td className="px-3 py-2">
                              {r.verdict === "correct" ? (
                                <span className="text-[11px] text-muted-foreground">Confirmed</span>
                              ) : (
                                <StatusBadge status={r.status} />
                              )}
                            </td>
                            <td className="px-3 py-2 text-[12px] text-muted-foreground whitespace-nowrap">{formatWhen(r.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="solutions" className="mt-4">
              {solutionsQ.error ? (
                <AdminError message={solutionsQ.error instanceof Error ? solutionsQ.error.message : "Unknown error"} onRetry={() => void solutionsQ.refetch()} />
              ) : solutionsQ.isLoading ? (
                <AdminLoading />
              ) : (
                <div className="border border-border rounded-md overflow-x-auto">
                  {solutions.length === 0 ? (
                    <Empty>
                      You have not uploaded any solutions yet.{" "}
                      <Link to="/contributor/papers" className="underline underline-offset-2">
                        Pick a paper
                      </Link>
                      .
                    </Empty>
                  ) : (
                    <table className="w-full text-[13px] min-w-[720px]">
                      <thead>
                        <tr className="border-b border-border bg-muted">
                          <th className={th}>File</th>
                          <th className={th}>Paper</th>
                          <th className={`${th} w-[120px]`}>For</th>
                          <th className={`${th} w-[110px]`}>Status</th>
                          <th className={`${th} w-[110px]`}>Date</th>
                          <th className="px-3 py-2 w-[90px]" />
                        </tr>
                      </thead>
                      <tbody>
                        {solutions.map((s) => (
                          <tr key={s.id} className="border-b border-border last:border-0 align-top hover:bg-muted transition-colors">
                            <td className="px-3 py-2">
                              <p className="max-w-[260px] truncate font-medium" title={s.fileName}>{s.fileName}</p>
                              <p className="text-[12px] text-muted-foreground">{s.kind === "video" ? "Video link" : formatBytes(s.sizeBytes)}</p>
                              {s.note && <p className="mt-0.5 text-[12px] text-muted-foreground line-clamp-2">{s.note}</p>}
                            </td>
                            <td className="px-3 py-2">
                              <Link to={`/contributor/papers/${s.paperId}`} className="hover:underline underline-offset-2">
                                {s.course}
                              </Link>
                              <p className="text-[12px] text-muted-foreground">
                                {examTypeLabel(s.examType)} · {s.term} {s.year}
                              </p>
                            </td>
                            <td className="px-3 py-2 text-[12px]">{s.position == null ? "Whole paper" : `Question ${s.position}`}</td>
                            <td className="px-3 py-2"><StatusBadge status={s.status} /></td>
                            <td className="px-3 py-2 text-[12px] text-muted-foreground whitespace-nowrap">{formatWhen(s.createdAt)}</td>
                            <td className="px-3 py-2 text-right">
                              {s.kind === "video" && s.videoUrl ? (
                                <a href={s.videoUrl} target="_blank" rel="noopener noreferrer" className="text-[12px] underline underline-offset-2">Open video</a>
                              ) : s.storagePath ? (
                                <OpenFile path={s.storagePath} name={s.fileName} />
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}
