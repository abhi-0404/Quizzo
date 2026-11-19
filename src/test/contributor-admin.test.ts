import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatKey,
  initialsOf,
  isImageMime,
  isValidEmail,
  keyIndexes,
  keyOptions,
  mimeLabel,
  normalizeEmail,
  solutionTarget,
} from "@/lib/contributor-admin";

describe("email validation (mirrors admin_add_contributor)", () => {
  it("normalises like the database does: trim and lowercase", () => {
    expect(normalizeEmail("  Priya.Nair@Gmail.COM ")).toBe("priya.nair@gmail.com");
  });

  it("accepts ordinary addresses, including surrounding whitespace and capitals", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("  Someone@Example.COM  ")).toBe(true);
    expect(isValidEmail("first.last+tag@sub.domain.in")).toBe(true);
  });

  it("rejects the shapes the SQL rejects", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("   ")).toBe(false);
    expect(isValidEmail("no-at-sign.com")).toBe(false);
    expect(isValidEmail("two@@signs.com")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a b@c.com")).toBe(false);
    expect(isValidEmail("a@b .com")).toBe(false);
    expect(isValidEmail("@b.com")).toBe(false);
  });

  it("enforces the 254 character limit after trimming", () => {
    const ok = `${"a".repeat(64)}@${"b".repeat(180)}.com`; // 64 + 1 + 180 + 4 = 249
    const tooLong = `${"a".repeat(64)}@${"b".repeat(190)}.com`; // 259
    expect(isValidEmail(ok)).toBe(true);
    expect(isValidEmail(tooLong)).toBe(false);
  });
});

describe("answer key formatting", () => {
  it("turns option indexes into sorted letters", () => {
    expect(formatKey("single", [1], null)).toBe("B");
    expect(formatKey("multi", [2, 0], null)).toBe("A, C");
  });

  it("shows the numeric answer for numerical questions and a dash when absent", () => {
    expect(formatKey("numerical", [], " 80 to 81 ")).toBe("80 to 81");
    expect(formatKey("numerical", [], "")).toBe("—");
    expect(formatKey("numerical", [], null)).toBe("—");
  });

  it("shows a dash for an empty or malformed key rather than throwing", () => {
    expect(formatKey("single", [], null)).toBe("—");
    expect(formatKey("single", null, null)).toBe("—");
    expect(formatKey("single", "B", null)).toBe("—");
    expect(formatKey("multi", { a: 1 }, null)).toBe("—");
  });

  it("drops anything in the key that is not a non-negative whole number", () => {
    expect(keyIndexes([3, "x", -1, 1.5, null, 0])).toEqual([0, 3]);
  });

  it("pairs each chosen letter with its option text, tolerating bad option data", () => {
    expect(keyOptions(["Variance", "Median", "Range"], [1])).toEqual([{ letter: "B", text: "Median" }]);
    expect(keyOptions(["x"], [0, 5])).toEqual([
      { letter: "A", text: "x" },
      { letter: "F", text: "" },
    ]);
    expect(keyOptions(null, [0])).toEqual([{ letter: "A", text: "" }]);
  });
});

describe("file helpers", () => {
  it("formats sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2_621_440)).toBe("2.5 MB");
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(NaN)).toBe("—");
  });

  it("classifies the four allowed types", () => {
    expect(isImageMime("image/png")).toBe(true);
    expect(isImageMime("image/webp")).toBe(true);
    expect(isImageMime("application/pdf")).toBe(false);
    expect(mimeLabel("application/pdf")).toBe("PDF");
    expect(mimeLabel("image/jpeg")).toBe("Image");
  });

  it("describes what a solution is attached to", () => {
    expect(solutionTarget(null)).toBe("Whole paper");
    expect(solutionTarget(undefined)).toBe("Whole paper");
    expect(solutionTarget(7)).toBe("Question 7");
  });
});

describe("initials", () => {
  it("uses first and last name", () => {
    expect(initialsOf("Priya Nair")).toBe("PN");
    expect(initialsOf("Asha Devi Rao")).toBe("AR");
    expect(initialsOf("Single")).toBe("S");
  });

  it("falls back to the email, then a question mark", () => {
    expect(initialsOf("", "ravi.kumar@gmail.com")).toBe("RK");
    expect(initialsOf(null, null)).toBe("?");
    expect(initialsOf("   ", "")).toBe("?");
  });
});
