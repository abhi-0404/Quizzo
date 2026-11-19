import { describe, expect, it } from "vitest";
import { parseVideoLink } from "@/lib/video-link";

const ID = "dQw4w9WgXcQ";

describe("parseVideoLink", () => {
  it("accepts every common YouTube form and normalises it", () => {
    for (const s of [
      `https://www.youtube.com/watch?v=${ID}`,
      `https://youtube.com/watch?v=${ID}&t=42s&list=PL1`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://youtu.be/${ID}?si=abc`,
      `youtu.be/${ID}`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `https://www.youtube.com/live/${ID}`,
    ]) {
      const v = parseVideoLink(s);
      expect(v, s).not.toBeNull();
      expect(v!.canonical).toBe(`https://www.youtube.com/watch?v=${ID}`);
      expect(v!.embed).toBe(`https://www.youtube-nocookie.com/embed/${ID}?rel=0`);
      expect(v!.thumbnail).toContain(ID);
    }
  });

  it("accepts Google Drive file links", () => {
    const id = "1AbCdEfGhIjKlMnOpQrStUv";
    for (const s of [
      `https://drive.google.com/file/d/${id}/view?usp=sharing`,
      `https://drive.google.com/open?id=${id}`,
      `https://drive.google.com/uc?id=${id}&export=download`,
    ]) {
      const v = parseVideoLink(s);
      expect(v?.canonical, s).toBe(`https://drive.google.com/file/d/${id}/view`);
      expect(v?.embed).toBe(`https://drive.google.com/file/d/${id}/preview`);
    }
  });

  it("matches the database's canonical patterns", () => {
    const yt = /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/;
    const dr = /^https:\/\/drive\.google\.com\/file\/d\/[A-Za-z0-9_-]{10,100}\/view$/;
    expect(parseVideoLink(`https://youtu.be/${ID}`)!.canonical).toMatch(yt);
    expect(parseVideoLink("https://drive.google.com/open?id=1AbCdEfGhIjK")!.canonical).toMatch(dr);
  });

  it("rejects anything else", () => {
    for (const s of [
      "",
      "not a url",
      "https://vimeo.com/123456",
      "https://evil.com/watch?v=" + ID,
      "https://youtube.com.evil.com/watch?v=" + ID,
      "https://www.youtube.com/watch?v=short",
      "https://www.youtube.com/channel/UC123",
      "javascript:alert(1)",
      "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMn",
      "https://docs.google.com/document/d/1AbCdEfGhIjKlMn/edit",
    ]) {
      expect(parseVideoLink(s), s).toBeNull();
    }
  });
});
