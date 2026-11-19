import { beforeEach, describe, expect, it } from "vitest";
import {
  afterMark, afterSave, afterVisit, answeredTotal, counts, findNext, hasAnswer,
  initialStatuses, pressNumericKey, toggleMark,
} from "@/lib/exam-session";
import { clearSession, isResumable, loadNotes, loadSession, notedQuestions, notesToText, saveNotes, saveSession, type SavedSession } from "@/lib/exam-persist";

describe("answer detection", () => {
  it("treats empty values as unanswered", () => {
    expect(hasAnswer(null)).toBe(false);
    expect(hasAnswer(undefined)).toBe(false);
    expect(hasAnswer([])).toBe(false);
    expect(hasAnswer("  ")).toBe(false);
    expect(hasAnswer(0)).toBe(true);
    expect(hasAnswer([2])).toBe(true);
    expect(hasAnswer("3.5")).toBe(true);
  });
});

describe("status transitions", () => {
  it("save reflects whether there is an answer", () => {
    expect(afterSave(1)).toBe("answered");
    expect(afterSave(null)).toBe("notAnswered");
  });

  it("marking an answered question keeps it visibly answered", () => {
    expect(afterMark(1)).toBe("answeredMarked");
    expect(afterMark("")).toBe("marked");
  });

  it("toggling twice returns to the plain state", () => {
    const once = toggleMark("answered", 2);
    expect(once).toBe("answeredMarked");
    expect(toggleMark(once, 2)).toBe("answered");
    expect(toggleMark(toggleMark("notAnswered", null), null)).toBe("notAnswered");
  });

  it("a first visit only changes not-visited", () => {
    expect(afterVisit("notVisited")).toBe("notAnswered");
    expect(afterVisit("marked")).toBe("marked");
  });

  it("starts with question 1 open", () => {
    expect(initialStatuses(3)).toEqual(["notAnswered", "notVisited", "notVisited"]);
    expect(initialStatuses(0)).toEqual([]);
  });

  it("counts every state", () => {
    const c = counts(["answered", "answeredMarked", "marked", "notVisited", "notAnswered", "answered"]);
    expect(c).toEqual({ notVisited: 1, notAnswered: 1, answered: 2, marked: 1, answeredMarked: 1 });
    expect(answeredTotal(c)).toBe(3);
  });

  it("finds the next match, wrapping around", () => {
    const s = initialStatuses(5);
    s[1] = "marked";
    s[4] = "answeredMarked";
    const marked = (x: string) => x === "marked" || x === "answeredMarked";
    expect(findNext(s, 1, marked)).toBe(4);
    expect(findNext(s, 4, marked)).toBe(1);
    expect(findNext(initialStatuses(2), 0, marked)).toBe(-1);
  });
});

describe("numeric keypad", () => {
  it("allows one decimal point and a leading minus", () => {
    let v = "";
    for (const k of ["1", ".", "5", "."]) v = pressNumericKey(v, k);
    expect(v).toBe("1.5");
    expect(pressNumericKey(v, "-")).toBe("-1.5");
    expect(pressNumericKey("-1.5", "-")).toBe("1.5");
    expect(pressNumericKey(v, "back")).toBe("1.");
    expect(pressNumericKey(v, "clear")).toBe("");
    expect(pressNumericKey(v, "x")).toBe("1.5");
    expect(pressNumericKey("123456789012", "3")).toBe("123456789012");
  });
});

describe("session persistence", () => {
  const base: SavedSession = {
    v: 1, startedAt: 1_000, answers: { 0: 1 }, statuses: ["answered", "notVisited"],
    questionMs: { 0: 4000 }, current: 1,
  };
  beforeEach(() => localStorage.clear());

  it("round-trips and clears", () => {
    saveSession("p", "exam", base);
    expect(loadSession("p", "exam", 2)).toEqual(base);
    clearSession("p", "exam");
    expect(loadSession("p", "exam", 2)).toBeNull();
  });

  it("rejects a session that does not fit the paper", () => {
    saveSession("p", "exam", base);
    expect(loadSession("p", "exam", 3)).toBeNull();
    localStorage.setItem("quizzo_session:p:exam", JSON.stringify({ ...base, statuses: ["weird", "answered"] }));
    expect(loadSession("p", "exam", 2)).toBeNull();
    localStorage.setItem("quizzo_session:p:exam", "{not json");
    expect(loadSession("p", "exam", 2)).toBeNull();
  });

  it("only resumes a timed exam whose clock has time left", () => {
    expect(isResumable(base, false, 60, 1_000 + 59_000)).toBe(true);
    expect(isResumable(base, false, 60, 1_000 + 61_000)).toBe(false);
    expect(isResumable(base, true, 60, 9e12)).toBe(true);
  });
});

describe("per-question notes", () => {
  beforeEach(() => localStorage.clear());

  it("stores notes per question and a general note", () => {
    saveNotes("p", { general: "g", byQuestion: { 2: "use the chain rule", 5: "  " } });
    const n = loadNotes("p");
    expect(n.general).toBe("g");
    expect(n.byQuestion).toEqual({ 2: "use the chain rule" });
    expect([...notedQuestions(n)]).toEqual([2]);
  });

  it("reads an older single text note as the general note", () => {
    localStorage.setItem("quizzo_notes:p", "old scratch");
    expect(loadNotes("p")).toEqual({ general: "old scratch", byQuestion: {} });
  });

  it("removes the entry when everything is empty", () => {
    saveNotes("p", { general: "", byQuestion: { 1: "" } });
    expect(localStorage.getItem("quizzo_notes:p")).toBeNull();
  });

  it("exports readable text", () => {
    expect(notesToText({ general: "g", byQuestion: { 3: "b", 0: "a" } }, "Paper")).toBe(["Paper", "", "General", "g", "", "Question 1", "a", "", "Question 4", "b"].join(String.fromCharCode(10)));
  });
});
