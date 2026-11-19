import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Image as ImageIcon, Link2, Loader2, PlaySquare, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "./StatusBadge";
import { VideoFacade } from "@/components/VideoFacade";
import { cn } from "@/lib/utils";
import { parseVideoLink } from "@/lib/video-link";
import {
  SOLUTION_ACCEPT,
  addVideoSolution,
  contributorKeys,
  deleteMySolution,
  formatBytes,
  isImageMime,
  solutionUrl,
  uploadSolution,
  validateSolutionFile,
  type MySolution,
} from "@/lib/contributor";

/** One uploaded file: status, a way to open it, and delete while it is pending. */
function SolutionRow({ solution, onDelete, deleting }: { solution: MySolution; onDelete: () => void; deleting: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const isVideo = solution.kind === "video";
  const image = !isVideo && isImageMime(solution.mime);

  // The bucket is private, so a link is minted on demand and only when asked for.
  const { data: url, isFetching, isError, refetch } = useQuery({
    queryKey: ["solution-url", solution.storage_path],
    queryFn: () => solutionUrl(solution.storage_path!),
    enabled: open && !isVideo && !!solution.storage_path,
    staleTime: 50 * 60 * 1000,
  });

  const Icon = isVideo ? PlaySquare : image ? ImageIcon : FileText;

  return (
    <li className="rounded-md border border-border bg-card p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13px]" title={solution.file_name}>
          {solution.file_name}
        </span>
        <span className="text-[11px] text-muted-foreground tabular-nums">{isVideo ? "Video link" : formatBytes(solution.size_bytes ?? 0)}</span>
        <StatusBadge status={solution.status} />
        <Button type="button" variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Hide" : "View"}
        </Button>
        {solution.status === "pending" &&
          (confirming ? (
            <>
              <Button type="button" variant="destructive" size="sm" className="h-7 text-[12px]" disabled={deleting} onClick={onDelete}>
                {deleting ? "Deleting…" : "Confirm delete"}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-[12px]" onClick={() => setConfirming(false)}>
                Keep
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => setConfirming(true)}
              aria-label={`Delete ${solution.file_name}`}
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          ))}
      </div>

      {solution.note && <p className="mt-1.5 text-[12px] text-muted-foreground">{solution.note}</p>}

      {open && isVideo && solution.video_url && (
        <VideoFacade url={solution.video_url} title={solution.file_name} className="mt-2 max-w-xl" />
      )}

      {open && !isVideo && (
        <div className="mt-2">
          {isFetching && (
            <p className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Getting the file…
            </p>
          )}
          {isError && (
            <p className="text-[12px] text-destructive">
              Could not open the file.{" "}
              <button type="button" className="underline underline-offset-2" onClick={() => void refetch()}>
                Try again
              </button>
            </p>
          )}
          {url && image && (
            <img src={url} alt={`Solution: ${solution.file_name}`} className="max-h-[420px] max-w-full rounded-md border border-border bg-background object-contain" />
          )}
          {url && !image && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-[13px] underline underline-offset-2">
              Open the PDF in a new tab
            </a>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * Upload and manage solutions for one question, or (questionId = null) for the
 * whole paper. Files go to the private `solutions` bucket and wait for an admin.
 */
export function SolutionUploader({
  paperId,
  questionId,
  solutions,
  label,
}: {
  paperId: string;
  questionId: string | null;
  solutions: MySolution[];
  label: string;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [mode, setMode] = useState<"file" | "video">("file");
  const [link, setLink] = useState("");
  const [title, setTitle] = useState("");
  const parsedLink = link.trim() ? parseVideoLink(link) : null;
  const linkError = link.trim() && !parsedLink ? "Paste a YouTube or Google Drive video link." : null;
  const fieldId = `solution-${questionId ?? "paper"}`;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: contributorKeys.solutions(paperId) });
    void queryClient.invalidateQueries({ queryKey: contributorKeys.mySolutions });
    void queryClient.invalidateQueries({ queryKey: contributorKeys.papers });
    void queryClient.invalidateQueries({ queryKey: contributorKeys.stats });
  };

  const upload = useMutation({
    mutationFn: () => uploadSolution({ paperId, questionId, file: file as File, note }),
    onSuccess: () => {
      toast.success("Uploaded. An admin will review it.");
      setFile(null);
      setNote("");
      if (inputRef.current) inputRef.current.value = "";
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Upload failed"),
  });

  const addLink = useMutation({
    mutationFn: () => addVideoSolution({ paperId, questionId, link, title, note }),
    onSuccess: () => {
      toast.success("Video added. An admin will review it.");
      setLink("");
      setTitle("");
      setNote("");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add the video"),
  });

  const remove = useMutation({
    mutationFn: (row: MySolution) => deleteMySolution(row),
    onSuccess: () => {
      toast.success("Solution deleted");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete"),
  });

  const onPick = (f: File | null) => {
    setFile(f);
    setFileError(f ? validateSolutionFile(f) : null);
  };

  return (
    <section aria-label={label} className="rounded-md border border-border bg-card">
      <div className="border-b border-border px-3 py-2">
        <h3 className="text-[13px] font-medium">{label}</h3>
        <p className="text-[12px] text-muted-foreground">
          A PDF or image (up to 10 MB), or a YouTube / Google Drive video link. An admin approves it before students can see it.
        </p>
      </div>

      <div className="space-y-3 p-3">
        {solutions.length > 0 ? (
          <ul className="space-y-2">
            {solutions.map((s) => (
              <SolutionRow key={s.id} solution={s} deleting={remove.isPending && remove.variables?.id === s.id} onDelete={() => remove.mutate(s)} />
            ))}
          </ul>
        ) : (
          <p className="text-[12px] text-muted-foreground">You have not uploaded anything here yet.</p>
        )}

        <div role="tablist" aria-label="Solution type" className="inline-flex rounded-md border border-border bg-muted p-0.5">
          {([
            ["file", "File", Upload],
            ["video", "Video link", Link2],
          ] as const).map(([k, l, I]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={mode === k}
              onClick={() => setMode(k)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-[12px] font-medium transition-colors",
                mode === k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <I className="h-3.5 w-3.5" /> {l}
            </button>
          ))}
        </div>

        {mode === "video" && (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!parsedLink) return;
              addLink.mutate();
            }}
          >
            <label htmlFor={`${fieldId}-link`} className="sr-only">Video link</label>
            <Input
              id={`${fieldId}-link`}
              value={link}
              onChange={(e) => setLink(e.target.value)}
              inputMode="url"
              placeholder="https://youtu.be/…  or  https://drive.google.com/file/d/…"
              className="h-8 text-[13px]"
            />
            {linkError && <p role="alert" className="text-[12px] text-destructive">{linkError}</p>}
            {parsedLink && (
              <p className="text-[12px] text-muted-foreground">
                {parsedLink.provider === "youtube" ? "YouTube" : "Google Drive"} video detected. Make sure it is unlisted or shared with "anyone with the link".
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={`${fieldId}-title`} className="sr-only">Title</label>
              <Input
                id={`${fieldId}-title`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                placeholder="Title, e.g. Q7 worked solution"
                className="h-8 flex-1 min-w-[180px] text-[13px]"
              />
              <Input
                aria-label="Note for the admin (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder="Note (optional)"
                className="h-8 flex-1 min-w-[160px] text-[13px]"
              />
              <Button type="submit" size="sm" className="h-8 gap-1.5 text-[12px]" disabled={!parsedLink || addLink.isPending}>
                {addLink.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                {addLink.isPending ? "Adding…" : "Add video"}
              </Button>
            </div>
          </form>
        )}

        {mode === "file" && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!file || fileError) return;
            upload.mutate();
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={fieldId} className="sr-only">
              Choose a solution file
            </label>
            <input
              id={fieldId}
              ref={inputRef}
              type="file"
              accept={SOLUTION_ACCEPT}
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              className="block max-w-full text-[12px] text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-foreground hover:file:bg-muted"
            />
          </div>
          {fileError && (
            <p role="alert" className="text-[12px] text-destructive">
              {fileError}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor={`${fieldId}-note`} className="sr-only">
              Note about this solution (optional)
            </label>
            <Input
              id={`${fieldId}-note`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="Note for the admin (optional)"
              className="h-8 flex-1 min-w-[200px] text-[13px]"
            />
            <Button type="submit" size="sm" className="h-8 gap-1.5 text-[12px]" disabled={!file || !!fileError || upload.isPending}>
              {upload.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              {upload.isPending ? "Uploading…" : "Upload"}
            </Button>
          </div>
        </form>
        )}
      </div>
    </section>
  );
}
