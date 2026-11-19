import { describe, expect, it } from "vitest";
import { orderSolutions } from "@/lib/solutions";

const item = (id: string, scope: "question" | "paper") => ({ id, scope });

describe("orderSolutions", () => {
  it("puts question-specific solutions before whole-paper ones", () => {
    const out = orderSolutions([item("p1", "paper"), item("q1", "question"), item("p2", "paper"), item("q2", "question")]);
    expect(out.map((s) => s.id)).toEqual(["q1", "q2", "p1", "p2"]);
  });

  it("keeps the original order inside each group", () => {
    const out = orderSolutions([item("q2", "question"), item("q1", "question")]);
    expect(out.map((s) => s.id)).toEqual(["q2", "q1"]);
  });

  it("does not mutate its input and handles an empty list", () => {
    const input = [item("p", "paper"), item("q", "question")];
    const copy = [...input];
    orderSolutions(input);
    expect(input).toEqual(copy);
    expect(orderSolutions([])).toEqual([]);
  });
});
