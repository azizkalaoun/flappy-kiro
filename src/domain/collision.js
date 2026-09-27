// Pure axis-aligned bounding box (AABB) collision predicates.
//
// The domain layer never performs I/O; these predicates are pure functions of
// their arguments so they are deterministic and directly testable. See the
// design's `collision` component and Data Models sections.
//
// Boxes use the same `{ left, right, top, bottom }` shape produced by
// `ghostBox(ghost)` in config.js, where `+y` is downward. A PipePair carries
// `{ x, width, gapY, gapHeight }`: the top pipe occupies the column
// `x..x+width` from the ceiling down to `gapY`, and the bottom pipe occupies
// the same column from `gapY + gapHeight` down to the ground.

/**
 * Do two AABBs overlap by 1 or more pixels on both axes?
 *
 * "Overlap by >= 1px" means the intersection has positive extent of at least
 * one pixel on each axis. Boxes that merely touch edge-to-edge (zero-width
 * intersection) do NOT count as a hit.
 *
 * @param {{ left: number, right: number, top: number, bottom: number }} a
 * @param {{ left: number, right: number, top: number, bottom: number }} b
 * @returns {boolean}
 */
function overlapsBy1px(a, b) {
  const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return overlapX >= 1 && overlapY >= 1;
}

/**
 * Does the ghost box overlap either pipe of the pair by 1 or more pixels?
 *
 * The top pipe box spans the ceiling (top of the Play_Area) down to the top of
 * the gap; the bottom pipe box spans the bottom of the gap down to the ground.
 * Vertically the top pipe extends upward beyond the ceiling and the bottom pipe
 * extends downward beyond the ground, so the pipe boxes are modeled as
 * half-open on those outer edges (`-Infinity` / `+Infinity`); this keeps the
 * predicate a pure function of the pair without needing the ceiling/ground.
 *
 * (Req 6.1)
 *
 * @param {{ left: number, right: number, top: number, bottom: number }} ghostBox
 * @param {{ x: number, width: number, gapY: number, gapHeight: number }} pipePair
 * @returns {boolean}
 */
export function hitsPipe(ghostBox, pipePair) {
  const left = pipePair.x;
  const right = pipePair.x + pipePair.width;

  const topPipe = {
    left,
    right,
    top: -Infinity,
    bottom: pipePair.gapY,
  };
  const bottomPipe = {
    left,
    right,
    top: pipePair.gapY + pipePair.gapHeight,
    bottom: Infinity,
  };

  return overlapsBy1px(ghostBox, topPipe) || overlapsBy1px(ghostBox, bottomPipe);
}

/**
 * Is the ghost at or below the top of the ground? (Req 6.2)
 *
 * @param {{ left: number, right: number, top: number, bottom: number }} ghostBox
 * @param {number} groundTop
 * @returns {boolean}
 */
export function hitsGround(ghostBox, groundTop) {
  return ghostBox.bottom >= groundTop;
}

/**
 * Is the ghost at or above the ceiling? (Req 6.3)
 *
 * @param {{ left: number, right: number, top: number, bottom: number }} ghostBox
 * @param {number} ceilingY
 * @returns {boolean}
 */
export function hitsCeiling(ghostBox, ceilingY) {
  return ghostBox.top <= ceilingY;
}
