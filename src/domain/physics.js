// Pure physics functions over the ghost.
//
// These functions never mutate their inputs: each returns a new ghost object.
// All tunable numbers (gravity, maxFall, flapVelocity) are injected by the
// caller from the GameConfig single source of truth (see config.js), so this
// module hardcodes no gameplay values and stays deterministic and testable.
//
// Ghost shape (see Data Models in design.md):
//   { x, y, vy, width, height }  where vy is vertical velocity in px/s, + down.

/**
 * Advance the ghost by one gravity step (Playing phase).
 *
 * Ordering is fixed (Req 2.2): velocity is updated by gravity first, then the
 * resulting velocity is clamped to the maximum fall velocity (Req 2.4), and
 * only then is the position integrated using that post-gravity velocity. This
 * yields exactly `y' = y + clamp(vy + gravity*dt) * dt` (Property 1).
 *
 * The clamp bounds only the downward (positive) velocity to `maxFall`; upward
 * (negative) velocity from a flap is left untouched.
 *
 * @param {{ x: number, y: number, vy: number, width: number, height: number }} ghost
 * @param {number} gravity  downward acceleration, px/s^2 (Req 2.1)
 * @param {number} maxFall  maximum downward velocity, px/s (Req 2.4)
 * @param {number} dt       elapsed time in seconds, >= 0
 * @returns {{ x: number, y: number, vy: number, width: number, height: number }} new ghost
 */
export function applyGravity(ghost, gravity, maxFall, dt) {
  // 1) Update velocity by gravity.
  let vy = ghost.vy + gravity * dt;
  // 2) Clamp downward velocity to the maximum fall velocity.
  if (vy > maxFall) {
    vy = maxFall;
  }
  // 3) Integrate position with the post-gravity (clamped) velocity.
  const y = ghost.y + vy * dt;
  return { ...ghost, vy, y };
}

/**
 * Apply a flap impulse, setting the ghost's vertical velocity to a fixed
 * upward value (Req 3.1). The impulse is identical regardless of the input
 * source (spacebar, click, tap) since sources all call this with the same
 * `flapVelocity` (Property 3).
 *
 * @param {{ x: number, y: number, vy: number, width: number, height: number }} ghost
 * @param {number} flapVelocity  upward impulse magnitude, px/s (Req 3.1)
 * @returns {{ x: number, y: number, vy: number, width: number, height: number }} new ghost
 */
export function applyFlap(ghost, flapVelocity) {
  return { ...ghost, vy: -flapVelocity };
}
