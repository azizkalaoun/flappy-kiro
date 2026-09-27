// Pure formatting helpers for on-screen text.
//
// These functions contain no I/O and no state: they map values to the exact
// display strings the Renderer draws. Keeping the formatting here (rather than
// in the canvas draw calls) makes the string contract testable in isolation.

/**
 * Build the score/high-score display string shown at the bottom center of the
 * canvas while Playing (Req 1.7, Property 21).
 *
 * The result is exactly `"Score: {score} | High: {high}"`, where the values are
 * interpolated verbatim via their default string coercion.
 *
 * @param {number} score  the current score
 * @param {number} high   the current high score
 * @returns {string} `"Score: {score} | High: {high}"`
 */
export function formatScore(score, high) {
  return `Score: ${score} | High: ${high}`;
}
