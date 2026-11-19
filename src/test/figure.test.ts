import { describe, expect, it } from "vitest";
import { classifyFigure } from "@/components/UniversalRenderer";

describe("classifyFigure", () => {
  it("treats a short, wide strip as a line of text", () => {
    expect(classifyFigure(900, 120)).toBe("inline");
    expect(classifyFigure(640, 200)).toBe("inline");
  });
  it("treats graphs, tables and diagrams as real figures", () => {
    expect(classifyFigure(800, 600)).toBe("block");
    expect(classifyFigure(1700, 840)).toBe("block");
    expect(classifyFigure(300, 300)).toBe("block");
    expect(classifyFigure(2000, 400)).toBe("block");
  });
  it("is safe before the image has a size", () => {
    expect(classifyFigure(0, 0)).toBe("inline");
  });
});

import { paperAlpha, PAPER_LUM } from "@/lib/pdf-extract";

describe("paperAlpha", () => {
  it("drops white paper and light-grey box fills", () => {
    expect(paperAlpha(255)).toBe(0);
    expect(paperAlpha(240)).toBe(0); // a typical code-box fill
    expect(paperAlpha(PAPER_LUM)).toBe(0);
  });
  it("keeps ink fully and greys partly", () => {
    expect(paperAlpha(0)).toBe(1);
    expect(paperAlpha(20)).toBe(1);
    const mid = paperAlpha(128);
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
  });
});
