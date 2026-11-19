import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ExternalLink, FileText, Image as ImageIcon, Loader2, Users, X, PlaySquare } from "lucide-react";
import { VideoFacade } from "@/components/VideoFacade";
import { AppLayout } from "@/components/AppLayout";
import { AdminError, AdminLoading } from "@/components/AdminState";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  decideReview, decideSolution, formatBytes, formatKey, formatWhen, isImageMime, keyOptions,
  loadReviewInbox, mimeLabel, solutionTarget, solutionUrl,
  type FlagRow, type SolutionRow,
} from "@/lib/contributor-admin";

const QUERY_KEY = ["admin-review-inbox"];

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

const KIND_LABEL: Record<string, string> = {
  single: "Single correct",
  multi: "Multi correct",
  numerical: "Numerical",
  comprehension: "Comprehension",
};

const who = (name: string, email: string | null) => (name ? (email ? `${name} · ${email}` : name) : email ?? "Unknown");

export default function ReviewInbox() {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: QUERY_KEY, queryFn: loadReviewInbox });
  const refresh = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const review = useMutation({
    mutationFn: ({ id, accept, updatedAt }: { id: string; accept: boolean; updatedAt: string }) =>
      decideReview(id, accept, updatedAt),
    onSuccess: (_r, { accept }) => {
      toast.success(accept ? "Key corrected. Future attempts use the new answer." : "Flag rejected. The key is unchanged.");
      void refresh();
    },
    onError: (e) => {
      toast.error(errorText(e));
      void refresh();
    },
  });

  const solution = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => decideSolution(id, approve),
    onSuccess: (_r, { approve }) => {
      toast.success(approve ? "Solution approved. Students can now see it in practice mode." : "Solution rejected");
      void refresh();
    },
    onError: (e) => {
      toast.error(errorText(e));
      void refresh();
    },
  });

  const [preview, setPreview] = useState<{ row: SolutionRow; url: string } | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const openPreview = async (row: SolutionRow) => {
    setPreviewingId(row.id);
    try {
      setPreview({ row, url: row.kind === "video" ? row.video_url ?? "" : await solutionUrl(row.storage_path!) });
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setPreviewingId(null);
    }
  };

  const flags = data?.flags ?? [];
  const solutions = data?.solutions ?? [];
  const waiting = flags.length + solutions.length;

  return (
    <AppLayout>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-4 md:px-6 h-11 border-b border-border shrink-0">
          <h1 className="text-[13px] font-medium">Review Inbox</h1>
          <Button asChild size="sm" variant="outline" className="h-7 text-[12px] gap-1.5">
            <Link to="/admin/contributors">
              <Users className="h-3.5 w-3.5" /> Contributors
            </Link>
          </Button>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading && <AdminLoading />}
          {error && <AdminError message={errorText(error)} onRetry={() => void refetch()} />}

          {data && (
            <div className="p-4 md:p-6 max-w-[1100px] space-y-4">
              <p className="text-[12px] text-muted-foreground">
                {data.confirmed_correct.toLocaleString("en-IN")} answer keys confirmed correct by contributors ·{" "}
                {data.accepted_flags.toLocaleString("en-IN")} corrections applied
              </p>

              <Tabs defaultValue="flags">
                <TabsList className="h-9">
                  <TabsTrigger value="flags" className="text-[12px] gap-1.5">
                    Answer flags <span className="tabular-nums text-muted-foreground">{flags.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="solutions" className="text-[12px] gap-1.5">
                    Solutions <span className="tabular-nums text-muted-foreground">{solutions.length}</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="flags" className="mt-4 space-y-3">
                  {flags.length === 0 ? (
                    <Empty text={waiting === 0 ? "Nothing waiting for review." : "No answer flags waiting for review."} />
                  ) : (
                    flags.map((f) => (
                      <FlagCard
                        key={f.review_id}
                        f={f}
                        busy={review.isPending && review.variables?.id === f.review_id}
                        onDecide={(accept) => review.mutate({ id: f.review_id, accept, updatedAt: f.updated_at })}
                      />
                    ))
                  )}
                </TabsContent>

                <TabsContent value="solutions" className="mt-4">
                  {solutions.length === 0 ? (
                    <Empty text={waiting === 0 ? "Nothing waiting for review." : "No solutions waiting for review."} />
                  ) : (
                    <div className="border border-border rounded-md overflow-hidden bg-card">
                      {solutions.map((s) => (
                        <SolutionItem
                          key={s.id}
                          s={s}
                          busy={solution.isPending && solution.variables?.id === s.id}
                          previewing={previewingId === s.id}
                          onPreview={() => void openPreview(s)}
                          onDecide={(approve) => solution.mutate({ id: s.id, approve })}
                        />
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!preview} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-[14px] truncate">{preview?.row.file_name}</DialogTitle>
            <DialogDescription className="text-[12px]">
              {preview
                ? `${preview.row.course} · ${solutionTarget(preview.row.position)} · ${preview.row.kind === "video" ? "Video link" : formatBytes(preview.row.size_bytes ?? 0)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {preview && preview.row.kind === "video" ? (
            <VideoFacade url={preview.url} title={preview.row.file_name} />
          ) : preview && isImageMime(preview.row.mime ?? "") ? (
            <img
              src={preview.url}
              alt={preview.row.file_name}
              className="mx-auto max-h-[70vh] w-auto max-w-full rounded border border-border bg-background object-contain"
            />
          ) : preview ? (
            <div className="rounded-md border border-border bg-muted p-6 text-center">
              <FileText className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-[13px]">PDFs open in their own tab.</p>
              <Button asChild size="sm" className="mt-3 h-8 text-[12px] gap-1.5">
                <a href={preview.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> Open PDF
                </a>
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-border rounded-md px-4 py-12 text-center text-[13px] text-muted-foreground">
      {text}
    </div>
  );
}

function KeyBox({
  label, value, options, tone,
}: {
  label: string;
  value: string;
  options: { letter: string; text: string }[];
  tone: "current" | "suggested";
}) {
  return (
    <div className={`rounded-md border p-3 ${tone === "suggested" ? "border-primary bg-muted" : "border-border"}`}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-medium leading-none">{value}</p>
      {options.some((o) => o.text) && (
        <ul className="mt-2 space-y-0.5">
          {options.map((o) => (
            <li key={o.letter} className="text-[12px] text-muted-foreground line-clamp-2">
              <span className="font-medium text-foreground">{o.letter}</span>
              {o.text ? ` · ${o.text}` : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FlagCard({ f, busy, onDecide }: { f: FlagRow; busy: boolean; onDecide: (accept: boolean) => void }) {
  const isNumerical = f.kind === "numerical";
  const current = formatKey(f.kind, f.current_correct, f.current_numerical);
  const suggested = formatKey(f.kind, f.suggested_correct, f.suggested_numerical);

  return (
    <div className="border border-border rounded-md bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-[13px] font-medium truncate">
            {f.course} · Q{f.position}
          </p>
          <span className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px]">
            {KIND_LABEL[f.kind] ?? f.kind}
          </span>
        </div>
        <span className="text-[11px] text-muted-foreground">{formatWhen(f.created_at)}</span>
      </div>

      <div className="p-4 space-y-3">
        {f.snippet && <p className="text-[13px] line-clamp-3">{f.snippet}</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <KeyBox label="Current key" value={current} options={isNumerical ? [] : keyOptions(f.options, f.current_correct)} tone="current" />
          <KeyBox label="Suggested key" value={suggested} options={isNumerical ? [] : keyOptions(f.options, f.suggested_correct)} tone="suggested" />
        </div>

        {f.note && (
          <div className="rounded-md bg-muted px-3 py-2">
            <p className="text-[11px] text-muted-foreground mb-0.5">Reviewer's note</p>
            <p className="text-[13px] whitespace-pre-line">{f.note}</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-border">
        <p className="text-[12px] text-muted-foreground truncate min-w-0">
          Flagged by {who(f.reviewer_name, f.reviewer_email)}
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" className="h-8 text-[12px] gap-1" disabled={busy} onClick={() => onDecide(false)}>
            <X className="h-3.5 w-3.5" /> Reject
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" className="h-8 text-[12px] gap-1" disabled={busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Accept
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Change the answer key for Q{f.position}?</AlertDialogTitle>
                <AlertDialogDescription>
                  The key changes from <strong>{current}</strong> to <strong>{suggested}</strong> for every student from now
                  on. Attempts already submitted are <strong>not</strong> re-graded: they keep the score they were given.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => onDecide(true)}>Change the key</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

function SolutionItem({
  s, busy, previewing, onPreview, onDecide,
}: {
  s: SolutionRow;
  busy: boolean;
  previewing: boolean;
  onPreview: () => void;
  onDecide: (approve: boolean) => void;
}) {
  const isVideo = s.kind === "video";
  const Icon = isVideo ? PlaySquare : isImageMime(s.mime ?? "") ? ImageIcon : FileText;
  return (
    <div className="flex flex-col gap-3 px-4 py-3 border-b border-border last:border-0 md:flex-row md:items-center md:justify-between">
      <div className="flex items-start gap-3 min-w-0">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-[13px] font-medium truncate">{s.file_name}</p>
          <p className="text-[12px] text-muted-foreground">
            {s.course} · {solutionTarget(s.position)} · {isVideo ? "Video link" : `${mimeLabel(s.mime ?? "")} · ${formatBytes(s.size_bytes ?? 0)}`}
          </p>
          {s.note && <p className="mt-1 text-[12px] whitespace-pre-line">{s.note}</p>}
          <p className="mt-1 text-[11px] text-muted-foreground">
            {who(s.author_name, s.author_email)} · {formatWhen(s.created_at)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="outline" size="sm" className="h-8 text-[12px]" disabled={previewing} onClick={onPreview}>
          {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Preview"}
        </Button>
        <Button variant="outline" size="sm" className="h-8 text-[12px] gap-1" disabled={busy} onClick={() => onDecide(false)}>
          <X className="h-3.5 w-3.5" /> Reject
        </Button>
        <Button size="sm" className="h-8 text-[12px] gap-1" disabled={busy} onClick={() => onDecide(true)}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
        </Button>
      </div>
    </div>
  );
}
