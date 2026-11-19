import { useState } from "react";
import { ExternalLink, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseVideoLink } from "@/lib/video-link";

/**
 * A video solution that costs nothing until it is wanted: a thumbnail and a
 * play button first, the YouTube / Drive player only after a click. Keeps the
 * practice screen fast on phones and avoids loading third-party players for
 * students who never press play.
 */
export function VideoFacade({ url, title, className }: { url: string; title: string; className?: string }) {
  const [playing, setPlaying] = useState(false);
  const video = parseVideoLink(url);
  if (!video) return null;

  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-black", className)}>
      <div className="relative aspect-video w-full">
        {playing ? (
          <iframe
            src={`${video.embed}${video.provider === "youtube" ? "&autoplay=1" : ""}`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play video: ${title}`}
            className="group absolute inset-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {video.thumbnail ? (
              <img src={video.thumbnail} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100" />
            ) : (
              <span className="absolute inset-0 bg-gradient-to-br from-neutral-800 to-neutral-950" />
            )}
            <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-black shadow-lg transition-transform group-hover:scale-105">
              <Play className="ml-0.5 h-6 w-6 fill-current" />
            </span>
            <span className="absolute bottom-2 left-2 right-2 truncate text-left text-[12px] font-medium text-white drop-shadow">{title}</span>
          </button>
        )}
      </div>
      <a
        href={video.canonical}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-end gap-1 bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
      >
        Open on {video.provider === "youtube" ? "YouTube" : "Google Drive"} <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
