// Bootstrap — the shell entry point that wires the whole game together.
//
// This is a SHELL module (see .kiro/steering/game-architecture.md §1, §5, §7):
// it owns the one-time startup wiring at the browser boundary. It detects canvas
// support, loads assets, reads the persisted high score, constructs the pure
// `GameEngine` plus the impure shell components (Renderer, AudioManager,
// InputController, GameLoop), and starts the loop. Nothing here is read by the
// domain; the domain only receives the injected config, rng, and per-tick
// dt/now via the engine.
//
// Graceful degradation is central (Req 10.4): if the canvas cannot give us a 2D
// context we show an "unsupported browser" message and never start the loop.
// Asset loading never blocks or throws (Req 1.5, 3.6, 6.6), and the high score
// read falls back to 0 on any failure (Req 7.x). All document/window access is
// guarded so this module can be imported in Node (the supported-path components
// touch browser-only APIs only when actually run in a browser).

import { loadAssets } from "./assetLoader.js";
import { createHighScoreStore } from "./highScoreStore.js";
import { AudioManager } from "./audioManager.js";
import { Renderer } from "./renderer.js";
import { InputController } from "./inputController.js";
import { GameLoop } from "./gameLoop.js";
import { GameEngine } from "../domain/gameEngine.js";
import { defaultConfig } from "../domain/config.js";

/**
 * Detect whether a canvas element can provide a usable 2D rendering context.
 *
 * Support requires both that `getContext` exists as a function and that
 * `getContext("2d")` returns a non-null context (Req 10.4). Wrapped in a
 * try/catch because a hostile or broken `getContext` could throw.
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {CanvasRenderingContext2D | null} the 2D context, or null if unsupported
 */
export function getCanvas2DContext(canvas) {
  if (!canvas || typeof canvas.getContext !== "function") {
    return null;
  }
  try {
    const ctx = canvas.getContext("2d");
    return ctx ?? null;
  } catch {
    return null;
  }
}

/**
 * Render the "unsupported browser" fallback for a canvas that cannot give us a
 * 2D context (Req 10.4). Best-effort: prefer an overlay message in the DOM, and
 * fall back to the canvas's own text content. Never throws, and never starts the
 * game loop.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {string} [message]
 */
export function showUnsupportedMessage(canvas, message = "Your browser does not support the canvas element required to play.") {
  // Prefer replacing the canvas's fallback content: browsers already show a
  // canvas element's child content when canvas is unsupported, so setting it is
  // the most robust surface. Guarded because `canvas` may be a bare stub.
  try {
    if (canvas && typeof canvas === "object") {
      // textContent is the standard fallback surface for <canvas>.
      if ("textContent" in canvas) {
        canvas.textContent = message;
      }
    }
  } catch {
    // Swallow: showing the message must never crash startup.
  }

  // Additionally surface the message next to the canvas when a DOM is present,
  // so users who see a blank canvas still get feedback. Guarded for Node.
  try {
    const doc = typeof document !== "undefined" ? document : null;
    if (doc && typeof doc.createElement === "function" && canvas && canvas.parentNode) {
      const banner = doc.createElement("div");
      banner.className = "unsupported-browser-message";
      banner.setAttribute("role", "alert");
      banner.textContent = message;
      canvas.parentNode.insertBefore(banner, canvas.nextSibling);
    }
  } catch {
    // Swallow: DOM insertion is a nicety, not a requirement.
  }
}

/**
 * Bootstrap and start the game on the given canvas.
 *
 * Startup sequence:
 *   1. Detect canvas 2D support. If unsupported, show a message and return
 *      `{ started: false }` WITHOUT constructing the loop (Req 10.4).
 *   2. Load assets — never blocks or throws (Req 1.5, 3.6, 6.6).
 *   3. Load the persisted high score — falls back to 0 on failure (Req 7.x).
 *   4. Construct the pure `GameEngine` (Ready phase, Req 9.1) with the config,
 *      an injected `rng` (defaults to `Math.random`), and the loaded high score.
 *      The sprite-load result is written to `engine.state.spriteLoaded` so the
 *      Renderer fallback (placeholder rectangle) works when the sprite failed
 *      to load (Req 1.5).
 *   5. Construct the shell components (Renderer, AudioManager, InputController,
 *      GameLoop) and start the loop.
 *
 * @param {HTMLCanvasElement} canvas  the game canvas
 * @param {object} [options]
 * @param {import('../domain/config.js').GameConfig} [options.config]  tuning surface (defaults to `defaultConfig`)
 * @param {() => number} [options.rng]  float generator in [0,1) for gap placement (defaults to `Math.random`)
 * @param {typeof loadAssets} [options.loadAssets]  injectable asset loader (for tests)
 * @param {ReturnType<typeof createHighScoreStore>} [options.highScoreStore]  injectable store (for tests)
 * @param {object} [options.loopDeps]  extra deps passed through to GameLoop (e.g. injected RAF/now for tests)
 * @returns {Promise<
 *   { started: false } |
 *   { started: true, engine: GameEngine, renderer: Renderer, audio: AudioManager,
 *     input: InputController, loop: GameLoop, highScoreStore: ReturnType<typeof createHighScoreStore>,
 *     assets: object, ctx: CanvasRenderingContext2D }
 * >}
 */
export async function bootstrap(canvas, options = {}) {
  const config = options.config ?? defaultConfig;
  const rng = typeof options.rng === "function" ? options.rng : Math.random;
  const loadAssetsFn = typeof options.loadAssets === "function" ? options.loadAssets : loadAssets;

  // 1) Canvas support gate (Req 10.4). Do NOT start the loop when unsupported.
  const ctx = getCanvas2DContext(canvas);
  if (!ctx) {
    showUnsupportedMessage(canvas);
    return { started: false };
  }

  // The canvas must be focusable to receive keydown/keyup events. The tabindex
  // attribute is normally set in the HTML shell (task 18); set it here too as a
  // belt-and-suspenders measure when a DOM element supports it.
  try {
    if (canvas && typeof canvas.setAttribute === "function" && typeof canvas.getAttribute === "function") {
      if (canvas.getAttribute("tabindex") == null) {
        canvas.setAttribute("tabindex", "0");
      }
    }
  } catch {
    // Non-DOM stubs won't have these; ignore.
  }

  // 2) Load assets. This never rejects, so a failed load degrades gracefully.
  const assets = await loadAssetsFn();

  // 3) Load the persisted high score (falls back to 0 on any failure).
  const highScoreStore = options.highScoreStore ?? createHighScoreStore();
  const initialHighScore = highScoreStore.load();

  // 4) Construct the pure engine in Ready (Req 9.1) and reflect the sprite-load
  //    outcome so the Renderer knows whether to draw the sprite or the
  //    placeholder rectangle (Req 1.5).
  const engine = new GameEngine(config, rng, initialHighScore);
  engine.state.spriteLoaded = assets.spriteLoaded === true;

  // 5) Construct the shell components and start the loop.
  const renderer = new Renderer(ctx, config, assets.sprite);
  const audio = new AudioManager({
    flapSound: assets.flapSound,
    gameOverSound: assets.gameOverSound,
  });
  const input = new InputController(canvas);
  const loop = new GameLoop({
    engine,
    renderer,
    input,
    audio,
    highScoreStore,
    config,
    ...(options.loopDeps ?? {}),
  });

  loop.start();

  return {
    started: true,
    engine,
    renderer,
    audio,
    input,
    loop,
    highScoreStore,
    assets,
    ctx,
  };
}

export default bootstrap;
