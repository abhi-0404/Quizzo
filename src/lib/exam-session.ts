/**
 * Question-status rules for the exam and practice screens, kept pure so they
 * can be tested. Scoring never reads these: the database grades `answers`.
 *
 * The five states mirror the NTA / TCS iON palette students sit in the real exam.
 */

export type QStatus = "notVisited" | "notAnswered" | "answered" | "marked" | "answeredMarked";

export type Answer = number | number[] | string | null | undefined;

export function hasAnswer(a: Answer): boolean {
  if (a == null) return false;
  if (Array.isArray(a)) return a.length > 0;
  if (typeof a === "string") return a.trim().length > 0;
  return true;
}

/** Status after "Save & Next" (or after leaving a question). */
export const afterSave = (a: Answer): QStatus => (hasAnswer(a) ? "answered" : "notAnswered");

/** Status after marking for review. An answered question stays visibly answered. */
export const afterMark = (a: Answer): QStatus => (hasAnswer(a) ? "answeredMarked" : "marked");

export const isMarked = (s: QStatus) => s === "marked" || s === "answeredMarked";

/** The flag toggle: marked states go back to their plain state, others become marked. */
export function toggleMark(current: QStatus, a: Answer): QStatus {
  return isMarked(current) ? afterSave(a) : afterMark(a);
}

/** First visit turns "not visited" into "not answered"; anything else is kept. */
export const afterVisit = (s: QStatus): QStatus => (s === "notVisited" ? "notAnswered" : s);

/** Fresh statuses for a paper of `total` questions, with question 1 on screen. */
export function initialStatuses(total: number): QStatus[] {
  const arr = Array<QStatus>(total).fill("notVisited");
  if (total > 0) arr[0] = "notAnswered";
  return arr;
}

export type StatusCounts = Record<QStatus, number>;

export function counts(statuses: QStatus[]): StatusCounts {
  const c: StatusCounts = { notVisited: 0, notAnswered: 0, answered: 0, marked: 0, answeredMarked: 0 };
  for (const s of statuses) c[s] += 1;
  return c;
}

/** Questions that carry an answer, whatever their mark state. */
export const answeredTotal = (c: StatusCounts) => c.answered + c.answeredMarked;

/** Index of the first question matching `pred`, searching from `from` and wrapping around. */
export function findNext(statuses: QStatus[], from: number, pred: (s: QStatus) => boolean): number {
  const n = statuses.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (pred(statuses[i])) return i;
  }
  return -1;
}

/** Numeric keypad input: digits, one decimal point, one leading minus, max 12 characters. */
export function pressNumericKey(current: string, key: string): string {
  if (key === "back") return current.slice(0, -1);
  if (key === "clear") return "";
  if (key === "-") return current.startsWith("-") ? current.slice(1) : current.length < 12 ? `-${current}` : current;
  if (key === "." && current.includes(".")) return current;
  if (!/^[0-9.]$/.test(key)) return current;
  if (current.length >= 12) return current;
  return current + key;
}
