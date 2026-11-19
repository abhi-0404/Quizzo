/**
 * Exam clock arithmetic, kept pure so it can be tested.
 *
 * Everything is derived from wall-clock timestamps rather than by counting
 * interval ticks. Browsers throttle timers in background tabs and laptops
 * sleep; a tick counter drifts in both cases, a timestamp does not.
 */

/** Whole seconds since `startedAtMs`, never negative. */
export function elapsedSeconds(startedAtMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
}

/** Whole seconds left of a `totalSeconds` allowance, clamped to 0..total. */
export function remainingSeconds(startedAtMs: number, totalSeconds: number, nowMs: number): number {
  return Math.min(totalSeconds, Math.max(0, totalSeconds - elapsedSeconds(startedAtMs, nowMs)));
}

/** Milliseconds spent per question index. */
export type QuestionTimes = Record<number, number>;

/** Returns a new tally with `ms` added to question `index`. Non-positive time is ignored. */
export function addQuestionTime(times: QuestionTimes, index: number, ms: number): QuestionTimes {
  if (!(ms > 0)) return times;
  return { ...times, [index]: (times[index] ?? 0) + ms };
}

/** Milliseconds to whole seconds, as stored on an attempt answer. */
export function toSeconds(ms: number): number {
  return Math.max(0, Math.round(ms / 1000));
}
