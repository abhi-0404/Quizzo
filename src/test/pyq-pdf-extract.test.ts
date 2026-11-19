import { describe, expect, it } from "vitest";
import { itemsToLines, scriptText } from "@/lib/pdf-extract";

/**
 * Line assembly in pdf-extract, fed the text items pdf.js reports for the real
 * "IIT M IMPROVEMENT AN EXAM QIV4 26 Oct 2025" paper. Item transforms are given
 * already in device space, so the viewport transform is the identity.
 */

interface Item {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/** A text item at `x` with its baseline at `base` (device space, y down). */
const item = (str: string, x: number, base: number, size: number, width: number): Item => ({
  str,
  transform: [size, 0, 0, size, x, base],
  width,
  height: str.trim() ? size : 0,
});

const lines = (items: Item[]) => itemsToLines(items, [1, 0, 0, 1, 0, 0], (_a, b) => b, 0);

describe("itemsToLines - superscripts and subscripts (QIV4 audit)", () => {
  it("keeps an exponent raised: option 'A² = 0.' (Maths2 Q35)", () => {
    // The 10pt "2" sits 3.96 units above the 12pt baseline. Joined flat it read
    // "A2 = 0.", a different statement, and it was one of the correct options.
    const [line] = lines([
      item("6406535124909.", 23.62, 689.4, 12, 92.29),
      item(" ", 115.91, 689.4, 12, 18.22),
      item("A", 134.13, 689.4, 12, 6.74),
      item("2", 140.87, 685.44, 10, 5.71),
      item(" ", 146.58, 685.44, 10, 3.1),
      item("= 0.", 149.69, 689.4, 12, 20.03),
    ]);
    expect(line.text).toBe("6406535124909. A² = 0.");
    // The option id is still the first piece, which the parser keys on.
    expect(line.pieces[0].text).toBe("6406535124909.");
    expect(line.pieces).toHaveLength(6);
  });

  it("keeps subscripts lowered: 'n₂ − n₁' (Maths2 Q40)", () => {
    const [line] = lines([
      item("A, respectively, then find the value of", 29.61, 776.96, 12, 199.7),
      item(" ", 229.33, 776.96, 12, 3.1),
      item("n", 232.44, 776.96, 12, 6.95),
      item("2", 239.38, 779.36, 10, 5.71),
      item(" ", 245.09, 779.36, 10, 3.1),
      item("−", 248.2, 776.96, 12, 6.85),
      item(" ", 255.05, 776.96, 12, 3.1),
      item("n", 258.16, 776.96, 12, 6.95),
      item("1", 265.11, 779.36, 10, 5.71),
      item(".", 270.82, 776.96, 12, 3.2),
    ]);
    expect(line.text).toBe("A, respectively, then find the value of n₂ − n₁.");
  });

  it("joins a multi-letter subscript run into one bracketed script", () => {
    // LLM: "d" with subscript "model" set as several small runs.
    const [line] = lines([
      item("keeping d", 100, 300, 12, 50),
      item("mod", 150, 302.4, 10, 15),
      item("el", 165, 302.4, 10, 8),
      item(" fixed", 173, 300, 12, 30),
    ]);
    expect(line.text).toBe("keeping d_(model) fixed");
  });

  it("leaves same-size text on a slightly different baseline alone", () => {
    const [line] = lines([
      item("Total", 20, 400, 12, 30),
      item(" 42", 50, 401.5, 12, 15),
    ]);
    expect(line.text).toBe("Total 42");
  });

  it("leaves smaller text on the same baseline alone", () => {
    const [line] = lines([
      item("Price", 20, 400, 12, 30),
      item(" (Rs)", 50, 400, 10, 20),
    ]);
    expect(line.text).toBe("Price (Rs)");
  });
});

describe("scriptText", () => {
  it("uses Unicode script forms for digits and signs", () => {
    expect(scriptText("2", "sup")).toBe("²");
    expect(scriptText("-1", "sup")).toBe("⁻¹");
    expect(scriptText("10", "sub")).toBe("₁₀");
  });

  it("falls back to ^ and _ for letters", () => {
    expect(scriptText("T", "sup")).toBe("^T");
    expect(scriptText("g", "sub")).toBe("_g");
    expect(scriptText("data", "sub")).toBe("_(data)");
  });

  it("leaves primes and stars as they are", () => {
    expect(scriptText("*", "sup")).toBe("*");
    expect(scriptText("′", "sup")).toBe("′");
  });
});
