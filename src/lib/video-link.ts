/**
 * Video solutions are links, never uploads. A link is accepted only if it is a
 * YouTube or Google Drive video, and is normalised to the canonical form the
 * database checks (see migration 20261113000000_solution_video_links.sql).
 */

export type VideoProvider = "youtube" | "drive";

export interface VideoLink {
  provider: VideoProvider;
  id: string;
  /** Canonical URL stored in `paper_solutions.video_url`. */
  canonical: string;
  /** URL for an <iframe>. YouTube uses the privacy-enhanced no-cookie host. */
  embed: string;
  /** Preview image shown before the player loads (YouTube only). */
  thumbnail: string | null;
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const DRIVE_ID = /^[A-Za-z0-9_-]{10,100}$/;

function fromYouTube(id: string): VideoLink {
  return {
    provider: "youtube",
    id,
    canonical: `https://www.youtube.com/watch?v=${id}`,
    embed: `https://www.youtube-nocookie.com/embed/${id}?rel=0`,
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

function fromDrive(id: string): VideoLink {
  return {
    provider: "drive",
    id,
    canonical: `https://drive.google.com/file/d/${id}/view`,
    embed: `https://drive.google.com/file/d/${id}/preview`,
    thumbnail: null,
  };
}

/** Parse anything a contributor is likely to paste. Returns null when it is not a supported video link. */
export function parseVideoLink(input: string): VideoLink | null {
  const raw = input.trim();
  if (!raw || raw.length > 500) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    const id = parts[0] ?? "";
    return YT_ID.test(id) ? fromYouTube(id) : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "music.youtube.com") {
    let id = "";
    if (parts[0] === "watch") id = url.searchParams.get("v") ?? "";
    else if (["shorts", "embed", "live", "v"].includes(parts[0] ?? "")) id = parts[1] ?? "";
    return YT_ID.test(id) ? fromYouTube(id) : null;
  }
  if (host === "drive.google.com") {
    let id = "";
    if (parts[0] === "file" && parts[1] === "d") id = parts[2] ?? "";
    else if (parts[0] === "open" || parts[0] === "uc") id = url.searchParams.get("id") ?? "";
    return DRIVE_ID.test(id) ? fromDrive(id) : null;
  }
  return null;
}
