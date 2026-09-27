// Pure scoring functions.
//
// These functions never mutate their inputs. Scoring detects when the ghost has
// passed the trailing edge of a Pipe_Pair and awards exactly one point per pair,
// guarding against double-counting via each pair's `scored` flag (see Data
// Models: PipePair.scored). All gameplay numbers come from config elsewhere;
// this module holds no tunable constants.
//
// Ghost shape (see Data Models in design.md):
//   { x, y, vy, width, height }
// PipePair shape:
//   { x, width, gapY, gapHeight, scored, collided? }
//
// The trailing edge of a pipe is its right edge, `x + width`. A pair is counted
// when the ghost's horizontal position `ghost.x` has passed that trailing edge.

const SCORE_MIN = 0;
const SCORE_MAX = 999999;

/**
 * Detect newly passed Pipe_Pairs and mark them scored.
 *
 * A pair is counted (score +1) when the ghost's `x` has passed the pair's
 * trailing edge (`pipe.x + pipe.width`) and the pair has not already been
 * scored (Req 5.2) and was not collided with before its trailing edge was
 * passed (Req 5.4). Newly counted pairs are returned with `scored: true` so a
 * subsequent call over the same, unmoved state yields a zero delta (idempotent,
 * Property 10).
 *
 * Pure: returns a new pipes array with new pair objects; inputs are unchanged.
 *
 * @param {{ x: number }} ghost              the ghost (only `x` is read)
 * @param {Array<{ x: number, width: number, scored: boolean, collided?: boolean }>} pipes
 * @returns {{ pipes: Array<object>, scoreDelta: number }}
 */
export function detectPasses(ghost, pipes) {
  let scoreDelta = 0;
  const nextPipes = pipes.map((pipe) => {
    const trailingEdge = pipe.x + pipe.width;
    const passed = ghost.x > trailingEdge;
    // Skip pairs already scored or collided with (Req 5.2, 5.4).
    if (passed && !pipe.scored && !pipe.collided) {
      scoreDelta += 1;
      return { ...pipe, scored: true };
    }
    return pipe;
  });
  return { pipes: nextPipes, scoreDelta };
}

/**
 * Clamp a score to an integer within [0, 999999] inclusive (Req 5.5).
 *
 * Non-finite inputs (NaN, ±Infinity) collapse to the nearest valid bound:
 * NaN -> 0, +Infinity -> 999999, -Infinity -> 0. Fractional values are
 * truncated toward zero before clamping.
 *
 * @param {number} score
 * @returns {number} integer in [0, 999999]
 */
export function clampScore(score) {
  if (Number.isNaN(score)) {
    return SCORE_MIN;
  }
  const truncated = Math.trunc(score);
  if (truncated < SCORE_MIN) {
    return SCORE_MIN;
  }
  if (truncated > SCORE_MAX) {
    return SCORE_MAX;
  }
  return truncated;
}
