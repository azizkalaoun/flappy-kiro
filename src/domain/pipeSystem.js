// Pipe system: pure functions that scroll, cull, spawn, and generate pipe pairs.
//
// All functions here are pure with respect to their inputs and the injected RNG:
// they never mutate the arrays or pipe objects passed in, returning fresh values
// instead. Randomness (gap placement) flows through an injected `rng` (a
// `() => number` in [0, 1)) so the domain layer stays deterministic and testable.
//
// See the design's `pipeSystem` section and Data Models (PipePair).
//
// A PipePair is `{ x, width, gapY, gapHeight, scored }` where `x` is the left
// edge (moving right -> left), `gapY` is the top of the gap, and `scored`
// guards against double-counting during scoring.

/**
 * Default ghost height (px) used when `config.ghostHeight` is not supplied.
 * Matches the 32x32 ghost sprite frame documented in ghosty-sprites.md.
 */
const DEFAULT_GHOST_HEIGHT = 32;

/**
 * Read the ghost height (px) that gap geometry is derived from. Prefers an
 * explicit `config.ghostHeight`; falls back to the sprite frame size.
 *
 * @param {{ ghostHeight?: number }} config
 * @returns {number}
 */
function ghostHeightOf(config) {
  return typeof config.ghostHeight === "number" ? config.ghostHeight : DEFAULT_GHOST_HEIGHT;
}

/**
 * Scroll every pipe left by `scrollSpeed * dt` pixels (Req 4.1).
 *
 * Pure: returns a new array of new pipe objects; inputs are not mutated.
 * Frame-rate independence follows from advancing by elapsed time: scrolling by
 * sub-intervals summing to `dt` yields the same positions as one scroll of `dt`.
 *
 * @param {Array<{x:number,width:number,gapY:number,gapHeight:number,scored:boolean}>} pipes
 * @param {number} scrollSpeed px/s
 * @param {number} dt elapsed seconds
 * @returns {Array<{x:number,width:number,gapY:number,gapHeight:number,scored:boolean}>}
 */
export function scroll(pipes, scrollSpeed, dt) {
  const delta = scrollSpeed * dt;
  return pipes.map((pipe) => ({ ...pipe, x: pipe.x - delta }));
}

/**
 * Remove pipes whose right edge has crossed the left edge of the canvas by
 * 1 or more pixels (Req 4.2). The left edge of the canvas is x = 0, so a pipe's
 * right edge is `x + width`; it has crossed by >= 1px when `x + width <= -1`.
 *
 * Pure: returns a new filtered array; inputs are not mutated. `canvasWidth` is
 * accepted for interface symmetry with the design but the cull boundary is the
 * left edge (x = 0).
 *
 * @param {Array<{x:number,width:number,gapY:number,gapHeight:number,scored:boolean}>} pipes
 * @param {number} canvasWidth px (unused; left edge is the cull boundary)
 * @returns {Array<{x:number,width:number,gapY:number,gapHeight:number,scored:boolean}>}
 */
export function cull(pipes, canvasWidth) {
  // Keep pipes whose right edge has NOT crossed the left edge by >= 1px.
  return pipes.filter((pipe) => pipe.x + pipe.width > -1);
}

/**
 * Generate a single pipe pair at horizontal position `spawnX` with a randomized,
 * valid gap (Req 4.4, 4.5).
 *
 * - `gapHeight = uniform(gapHeightMin, gapHeightMax) * ghostHeight`
 *   (the config multipliers are 2.5..4 of ghost height).
 * - `gapY` (gap top) is uniformly chosen so the whole gap plus a >= `gapMargin`
 *   margin stays inside the Play_Area:
 *   `gapY ∈ [ceilingY + gapMargin, groundTop - gapMargin - gapHeight]`.
 *
 * Two RNG draws are consumed: one for the gap height, one for the gap top.
 *
 * @param {import('./config.js').GameConfig & { ghostHeight?: number }} config
 * @param {() => number} rng returns a float in [0, 1)
 * @param {number} spawnX left edge of the new pair
 * @returns {{x:number,width:number,gapY:number,gapHeight:number,scored:boolean}}
 */
export function makePipePair(config, rng, spawnX) {
  const ghostHeight = ghostHeightOf(config);

  const gapHeight = (config.gapHeightMin + rng() * (config.gapHeightMax - config.gapHeightMin)) * ghostHeight;

  const gapYMin = config.ceilingY + config.gapMargin;
  const gapYMax = config.groundTop - config.gapMargin - gapHeight;
  // Guard against a degenerate range (max < min): pin to the min so the gap top
  // never lands below its valid lower bound.
  const gapYRange = Math.max(0, gapYMax - gapYMin);
  const gapY = gapYMin + rng() * gapYRange;

  return {
    x: spawnX,
    width: config.pipeWidth,
    gapY,
    gapHeight,
    scored: false,
  };
}

/**
 * Add a new pipe pair entering from the right when horizontal spacing warrants
 * it (Req 4.3), keeping at least one pair present or approaching.
 *
 * Spacing is measured as the distance from the rightmost existing pipe's left
 * edge to the canvas right edge. A new pair is spawned (just off the right edge
 * at `x = canvasWidth`) when that distance has grown into the
 * `[pipeSpacingMin, pipeSpacingMax]` window. With no pipes present, one is
 * spawned immediately so play always has an approaching pair.
 *
 * Pure: returns a new array (a copy with the spawned pair appended, or the same
 * contents copied) without mutating inputs.
 *
 * @param {Array<{x:number,width:number,gapY:number,gapHeight:number,scored:boolean}>} pipes
 * @param {import('./config.js').GameConfig & { ghostHeight?: number }} config
 * @param {() => number} rng returns a float in [0, 1)
 * @param {number} canvasWidth px
 * @returns {Array<{x:number,width:number,gapY:number,gapHeight:number,scored:boolean}>}
 */
export function maybeSpawn(pipes, config, rng, canvasWidth) {
  if (pipes.length === 0) {
    // No pairs yet: spawn one at the right edge so a pair is always approaching.
    return [makePipePair(config, rng, canvasWidth)];
  }

  // Rightmost pipe is the one with the greatest left-edge x.
  const rightmostX = pipes.reduce((max, pipe) => (pipe.x > max ? pipe.x : max), -Infinity);
  const spacingToRightEdge = canvasWidth - rightmostX;

  if (spacingToRightEdge >= config.pipeSpacingMin && spacingToRightEdge <= config.pipeSpacingMax) {
    return [...pipes, makePipePair(config, rng, canvasWidth)];
  }

  return [...pipes];
}
