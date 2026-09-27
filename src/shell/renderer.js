// Renderer: the shell component that draws the current GameState onto a Canvas
// 2D context.
//
// Per the game-architecture steering standards, rendering is the SHELL side of
// the boundary but it is still a *pure read* of GameState: `draw(state)` issues
// canvas draw calls and never mutates `state` (or the config or sprite). All the
// numbers it needs (canvas size, play-area bounds, pipe width) come from the
// injected `config`; the sprite and 2D context are injected too, so the Renderer
// reads no globals. See the design's Renderer section and Requirement 1.

import { formatScore } from "../domain/format.js";
import { PHASE_READY, PHASE_PLAYING, PHASE_GAME_OVER } from "../domain/gameEngine.js";

// --- Palette (retro Flappy-style scene) --------------------------------------
const SKY_COLOR = "#4ec0ca"; // light blue sky (Req 1.1)
const CLOUD_COLOR = "#ffffff"; // white clouds (Req 1.2)
const GROUND_COLOR = "#3a2c1a"; // dark ground strip (Req 1.3)
const GROUND_EDGE_COLOR = "#d4b06a"; // lighter lip along the top of the ground
const PIPE_COLOR = "#4caf50"; // green pipes (Req 1.6)
const PIPE_EDGE_COLOR = "#2e7d32"; // darker green outline for the pipes
const GHOST_PLACEHOLDER_COLOR = "#f5f5f5"; // solid placeholder when sprite fails (Req 1.5)
const TEXT_COLOR = "#ffffff";
const TEXT_SHADOW_COLOR = "rgba(0, 0, 0, 0.45)";
const SAVE_FAILED_COLOR = "#ffd54f";

/**
 * Draws the game scene from a read-only GameState.
 *
 * The Renderer holds only injected dependencies. It does not own any mutable
 * game state: every draw is derived from the `state` argument passed to `draw`.
 */
export class Renderer {
  /**
   * @param {CanvasRenderingContext2D} ctx  the canvas 2D context to draw into
   * @param {import('../domain/config.js').GameConfig} config  the tuning surface (injected)
   * @param {HTMLImageElement | null} sprite  the loaded ghost sprite, or null if
   *   it failed to load / has not loaded. When null (or when the state reports
   *   the sprite failed) the ghost is drawn as a solid-color placeholder (Req 1.5).
   */
  constructor(ctx, config, sprite) {
    this.ctx = ctx;
    this.config = config;
    this.sprite = sprite ?? null;
  }

  /**
   * Render one frame from `state`. Pure read: `state` is never mutated.
   *
   * Draw order (back to front): sky, clouds, pipes, ground, ghost, then the HUD
   * text overlay for the current phase.
   *
   * @param {{
   *   phase: string,
   *   ghost: { x: number, y: number, width: number, height: number },
   *   pipes: Array<{ x: number, width: number, gapY: number, gapHeight: number }>,
   *   score: number,
   *   highScore: number,
   *   saveFailed?: boolean,
   *   spriteLoaded?: boolean,
   * }} state
   */
  draw(state) {
    const { ctx, config } = this;

    // Reset any transient text alignment so state does not leak between frames.
    ctx.save();

    this._drawSky();
    this._drawClouds();
    this._drawPipes(state.pipes);
    this._drawGround();
    this._drawGhost(state.ghost, state.spriteLoaded);
    this._drawHud(state);

    ctx.restore();
  }

  /**
   * Fill the entire Play_Area with the light-blue sky (Req 1.1). The sky covers
   * the whole canvas; the ground strip is painted over its lower portion next.
   */
  _drawSky() {
    const { ctx, config } = this;
    ctx.fillStyle = SKY_COLOR;
    ctx.fillRect(0, 0, config.canvasWidth, config.canvasHeight);
  }

  /**
   * Draw at least one decorative white rounded cloud within the sky, above the
   * ground (Req 1.2). Clouds are static scenery derived only from config, so
   * they render identically every frame without touching state.
   */
  _drawClouds() {
    const { ctx, config } = this;
    ctx.save();
    ctx.fillStyle = CLOUD_COLOR;

    // A cloud is a cluster of overlapping circles ("rounded" puffs). Positions
    // are fractions of the canvas so a cloud always sits above the ground.
    const clouds = [
      { cx: config.canvasWidth * 0.22, cy: config.groundTop * 0.22, r: 22 },
      { cx: config.canvasWidth * 0.7, cy: config.groundTop * 0.35, r: 26 },
    ];

    for (const cloud of clouds) {
      this._drawCloudPuff(cloud.cx, cloud.cy, cloud.r);
    }

    ctx.restore();
  }

  /**
   * Draw a single rounded cloud as three overlapping circles.
   * @param {number} cx  center x of the middle puff
   * @param {number} cy  center y of the middle puff
   * @param {number} r   base radius
   */
  _drawCloudPuff(cx, cy, r) {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(cx - r, cy, r * 0.7, 0, Math.PI * 2);
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.arc(cx + r, cy, r * 0.7, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Draw the dark ground strip spanning the full canvas width along the bottom
   * edge (Req 1.3). Its top edge is at `config.groundTop`.
   */
  _drawGround() {
    const { ctx, config } = this;
    const groundHeight = config.canvasHeight - config.groundTop;
    // A thin lighter lip makes the ground read as a surface, then the dark body.
    ctx.fillStyle = GROUND_EDGE_COLOR;
    ctx.fillRect(0, config.groundTop, config.canvasWidth, 6);
    ctx.fillStyle = GROUND_COLOR;
    ctx.fillRect(0, config.groundTop + 6, config.canvasWidth, groundHeight - 6);
  }

  /**
   * Draw every pipe pair as a green pipe extending down from the ceiling and a
   * green pipe extending up from the ground, separated by the gap (Req 1.6).
   *
   * @param {Array<{ x: number, width: number, gapY: number, gapHeight: number }>} pipes
   */
  _drawPipes(pipes) {
    const { ctx, config } = this;
    if (!Array.isArray(pipes)) {
      return;
    }

    for (const pipe of pipes) {
      const top = config.ceilingY;
      const topPipeHeight = pipe.gapY - config.ceilingY;
      const gapBottom = pipe.gapY + pipe.gapHeight;
      const bottomPipeHeight = config.groundTop - gapBottom;

      // Top pipe: from the ceiling down to the top of the gap.
      if (topPipeHeight > 0) {
        this._drawPipeBody(pipe.x, top, pipe.width, topPipeHeight);
      }
      // Bottom pipe: from the bottom of the gap down to the ground.
      if (bottomPipeHeight > 0) {
        this._drawPipeBody(pipe.x, gapBottom, pipe.width, bottomPipeHeight);
      }
    }
  }

  /**
   * Fill one pipe rectangle with a body and a darker outline.
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   */
  _drawPipeBody(x, y, width, height) {
    const { ctx } = this;
    ctx.fillStyle = PIPE_COLOR;
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = PIPE_EDGE_COLOR;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);
  }

  /**
   * Draw the ghost. When the sprite is available and the state reports it loaded,
   * draw the sprite; otherwise draw a solid-color placeholder rectangle at the
   * ghost position and keep rendering (Req 1.4, 1.5).
   *
   * @param {{ x: number, y: number, width: number, height: number }} ghost
   * @param {boolean | undefined} spriteLoaded
   */
  _drawGhost(ghost, spriteLoaded) {
    const { ctx } = this;
    if (!ghost) {
      return;
    }

    const useSprite = this.sprite != null && spriteLoaded !== false;
    if (useSprite) {
      ctx.drawImage(this.sprite, ghost.x, ghost.y, ghost.width, ghost.height);
      return;
    }

    // Fallback placeholder: a solid-color rectangle at the ghost position.
    ctx.fillStyle = GHOST_PLACEHOLDER_COLOR;
    ctx.fillRect(ghost.x, ghost.y, ghost.width, ghost.height);
  }

  /**
   * Draw the phase-dependent HUD overlay:
   * - Playing: score/high-score text bottom-center (Req 1.7).
   * - Ready: a "press to start" prompt.
   * - Game_Over: a restart prompt plus the final score and high score (Req 8.1).
   * In every phase, a save-failure indication is surfaced when `saveFailed` is
   * set (Req 7.6).
   *
   * @param {{ phase: string, score: number, highScore: number, saveFailed?: boolean }} state
   */
  _drawHud(state) {
    const { config } = this;
    const centerX = config.canvasWidth / 2;
    const bottomY = config.groundTop + (config.canvasHeight - config.groundTop) / 2;

    if (state.phase === PHASE_PLAYING) {
      this._drawCenteredText(formatScore(state.score, state.highScore), centerX, bottomY, 20);
    } else if (state.phase === PHASE_READY) {
      this._drawCenteredText("Press Space / Click / Tap to start", centerX, config.canvasHeight * 0.4, 20);
    } else if (state.phase === PHASE_GAME_OVER) {
      this._drawCenteredText("Game Over", centerX, config.canvasHeight * 0.32, 32);
      this._drawCenteredText(formatScore(state.score, state.highScore), centerX, config.canvasHeight * 0.42, 20);
      this._drawCenteredText("Press Space / Click / Tap to restart", centerX, config.canvasHeight * 0.5, 18);
    }

    if (state.saveFailed) {
      this._drawCenteredText("(high score could not be saved)", centerX, config.canvasHeight * 0.58, 14, SAVE_FAILED_COLOR);
    }
  }

  /**
   * Draw centered text with a subtle shadow for legibility over the scene.
   * @param {string} text
   * @param {number} x  center x
   * @param {number} y  baseline y
   * @param {number} sizePx  font size in px
   * @param {string} [color]  fill color (defaults to white)
   */
  _drawCenteredText(text, x, y, sizePx, color = TEXT_COLOR) {
    const { ctx } = this;
    ctx.save();
    ctx.font = `${sizePx}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = TEXT_SHADOW_COLOR;
    ctx.fillText(text, x + 1, y + 1);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }
}
