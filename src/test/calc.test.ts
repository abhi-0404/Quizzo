import { describe, expect, it } from "vitest";
import { CalcError, evaluate, formatResult } from "@/lib/calc";

const ev = (s: string, mode: "deg" | "rad" = "deg", ans?: number) => evaluate(s, { mode, ans });

describe("calculator", () => {
  it("follows precedence and associativity", () => {
    expect(ev("2+3*4")).toBe(14);
    expect(ev("(2+3)*4")).toBe(20);
    expect(ev("2^3^2")).toBe(512);
    expect(ev("-2^2")).toBe(-4);
    expect(ev("2^-1")).toBe(0.5);
    expect(ev("10-4-3")).toBe(3);
    expect(ev("7%3")).toBe(1);
    expect(ev("-7%3")).toBe(2);
  });

  it("handles implicit multiplication and constants", () => {
    expect(ev("2pi")).toBeCloseTo(2 * Math.PI);
    expect(ev("3(4)")).toBe(12);
    expect(ev("2sqrt(9)")).toBe(6);
    expect(ev("e")).toBeCloseTo(Math.E);
    expect(ev("ans*2", "deg", 21)).toBe(42);
  });

  it("uses the angle mode for trig", () => {
    expect(ev("sin(30)")).toBeCloseTo(0.5);
    expect(ev("sin(pi/6)", "rad")).toBeCloseTo(0.5);
    expect(ev("asin(1)")).toBeCloseTo(90);
  });

  it("supports logs, roots and factorial", () => {
    expect(ev("log(1000)")).toBeCloseTo(3);
    expect(ev("ln(e)")).toBeCloseTo(1);
    expect(ev("5!")).toBe(120);
    expect(ev("√16")).toBe(4);
    expect(ev("6 × 7 ÷ 2")).toBe(21);
  });

  it("rejects bad input instead of running it", () => {
    for (const bad of ["", "2+", "(2", "foo(2)", "alert(1)", "2 ; 3", "3.5!"]) {
      expect(() => ev(bad)).toThrow(CalcError);
    }
  });

  it("formats results without float noise", () => {
    expect(formatResult(ev("0.1+0.2"))).toBe("0.3");
    expect(formatResult(1 / 0)).toBe("∞");
    expect(formatResult(NaN)).toBe("Error");
    expect(formatResult(1e15)).toBe("1e+15");
  });
});
