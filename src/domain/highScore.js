// Pure high-score domain functions.
//
// These functions contain no I/O: the HighScoreStore shell is responsible for
// reading/writing Local_Storage and wrapping those calls in try/catch. This
// module only decides what a raw stored value means and how the high score
// evolves at a Game_Over transition, so it stays deterministic and testable.

/** Largest high score we are willing to accept or persist (Req 7.3). */
export const MAX_HIGH_SCORE = 999999999;

/**
 * Parse a raw value read from Local_Storage into a valid high score.
 *
 * Total function (never throws): for any input — missing (null/undefined),
 * non-numeric, negative, fractional, or out of range — it returns an integer
 * in `[0, MAX_HIGH_SCORE]`, falling back to 0 for anything that cannot be
 * parsed as an integer in that range (Req 7.3, Property 15).
 *
 * @param {*} raw  the value read from Local_Storage (typically a string or null)
 * @returns {number} an integer in [0, 999999999]
 */
export function parseHighScore(raw) {
  // Reject anything that is not a finite number after coercion. Numbers and
  // numeric strings coerce; null, undefined, objects, booleans, empty/blank or
  // non-numeric strings become NaN and fall through to 0.
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    return 0;
  }
  // Must be a whole number (no fractional high scores).
  if (!Number.isInteger(n)) {
    return 0;
  }
  // Must be within the inclusive valid range.
  if (n < 0 || n > MAX_HIGH_SCORE) {
    return 0;
  }
  return n;
}

/**
 * The high score after a Game_Over transition: the larger of the final score
 * and the existing high score (Req 7.4, 7.5; Property 16).
 *
 * @param {number} score      the final score for this run
 * @param {number} highScore  the existing high score
 * @returns {number} max(score, highScore)
 */
export function nextHighScore(score, highScore) {
  return Math.max(score, highScore);
}

/**
 * Whether the new score beats the existing high score and therefore must be
 * written to Local_Storage. A write occurs if and only if `score > highScore`
 * (Req 7.4, 7.5; Property 16).
 *
 * @param {number} score      the final score for this run
 * @param {number} highScore  the existing high score
 * @returns {boolean} true when the score should be persisted
 */
export function shouldPersist(score, highScore) {
  return score > highScore;
}
