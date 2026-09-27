// Single source of truth for every gameplay tuning number.
//
// Per the design's Configuration and Tuning section, no other module hardcodes
// gameplay values: every domain function and shell component receives the values
// it needs from this config via dependency injection. Retuning the game means
// editing this file only. Each field documents its unit and, where the
// requirements define one, its valid range.

/**
 * @typedef {Object} GameConfig
 * @property {number} canvasWidth        px
 * @property {number} canvasHeight       px
 * @property {number} ceilingY           px, top of Play_Area
 * @property {number} groundTop          px, top of ground strip = bottom of Play_Area
 * @property {number} gravity            px/s^2 (Req 2.1)
 * @property {number} maxFallVelocity    px/s (Req 2.4)
 * @property {number} flapVelocity       px/s upward magnitude (Req 3.1)
 * @property {number} scrollSpeed        px/s, valid 100..300 (Req 4.1)
 * @property {number} pipeSpacingMin     px (Req 4.3)
 * @property {number} pipeSpacingMax     px (Req 4.3)
 * @property {number} gapMargin          px, valid >= 20 (Req 4.4)
 * @property {number} gapHeightMin       multiplier of ghostHeight (Req 4.5)
 * @property {number} gapHeightMax       multiplier of ghostHeight (Req 4.5)
 * @property {number} pipeWidth          px
 * @property {number} restartLockoutMs   ms, fixed at 500 (Req 8.3)
 */

/** @type {GameConfig} */
export const defaultConfig = {
  canvasWidth: 480, // px
  canvasHeight: 640, // px
  ceilingY: 0, // px, top of Play_Area
  groundTop: 560, // px, top of ground strip = bottom of Play_Area
  gravity: 1600, // px/s^2 (Req 2.1)
  maxFallVelocity: 700, // px/s (Req 2.4)
  flapVelocity: 480, // px/s upward magnitude (Req 3.1)
  scrollSpeed: 160, // px/s, valid 100..300 (Req 4.1)
  pipeSpacingMin: 200, // px (Req 4.3)
  pipeSpacingMax: 400, // px (Req 4.3)
  gapMargin: 20, // px, valid >= 20 (Req 4.4)
  gapHeightMin: 2.5, // multiplier of ghostHeight (Req 4.5)
  gapHeightMax: 4, // multiplier of ghostHeight (Req 4.5)
  pipeWidth: 60, // px
  restartLockoutMs: 500, // ms, fixed at 500 (Req 8.3)
};

/**
 * Derived helper producing the ghost's axis-aligned bounding box (AABB).
 *
 * The ghost's `x`/`y` are treated as its top-left corner and `width`/`height`
 * as its extent, so the box is used consistently throughout collision and
 * scoring. See Data Models in the design.
 *
 * @param {{ x: number, y: number, width: number, height: number }} ghost
 * @returns {{ left: number, right: number, top: number, bottom: number }}
 */
export function ghostBox(ghost) {
  return {
    left: ghost.x,
    right: ghost.x + ghost.width,
    top: ghost.y,
    bottom: ghost.y + ghost.height,
  };
}
