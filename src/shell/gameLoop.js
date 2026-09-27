// GameLoop — the shell component that owns the animation loop and timekeeping.
//
// This is a SHELL module (see .kiro/steering/game-architecture.md §1, §3, §4):
// it owns `requestAnimationFrame`, computes and clamps `dt`, drains the queued
// intents from the InputController, calls `engine.step`, then hands the resulting
// read-only state to `renderer.draw`. It maps the plain event values the engine
// returns (FlapApplied, GameOver, Scored) to audio/storage effects, and pauses
// stepping when the tab is hidden or blurred, resuming on focus/visible.
//
// Timekeeping lives here, not in the domain: `dt` (seconds) and `now` (ms) are
// computed by the loop and passed into `engine.step` as ordinary inputs. `dt` is
// clamped to a maximum so a long stall or a resumed hidden tab cannot teleport
// the ghost through a pipe (Req 10.3, and the design's Game Loop and Timing).

import {
  EVENT_FLAP_APPLIED,
  EVENT_SCORED,
  EVENT_GAME_OVER,
} from "../domain/gameEngine.js";

/**
 * Default maximum `dt` per tick, in seconds. Clamping to ~0.05s enforces a
 * ~20 fps physics floor: a stall or a resumed hidden tab advances the world by
 * at most one 0.05s step, so the ghost can never tunnel through a pipe (design:
 * Game Loop and Timing; Req 10.3).
 */
export const DEFAULT_MAX_DT = 0.05;

/**
 * Clamp `value` into the inclusive range `[min, max]`.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

/**
 * Drives the game one frame at a time via `requestAnimationFrame`, wiring the
 * pure engine to the impure shell (input, renderer, audio, storage).
 *
 * Usage:
 *   const loop = new GameLoop({ engine, renderer, input, audio, highScoreStore });
 *   loop.start();   // begin the RAF loop and attach pause/resume listeners
 *   // ...later:
 *   loop.stop();    // end the loop and detach listeners
 */
export class GameLoop {
  /**
   * @param {object} deps
   * @param {import('../domain/gameEngine.js').GameEngine} deps.engine  the pure orchestrator
   * @param {{ draw: (state: object) => void }} deps.renderer  draws a read-only GameState
   * @param {{ drainIntents: () => Array<string|{type:string}> }} deps.input  the InputController
   * @param {{ playFlap: () => void, playGameOver: () => void }} deps.audio  the AudioManager
   * @param {{ save: (score: number) => boolean }} deps.highScoreStore  from createHighScoreStore
   * @param {object} [deps.config]  optional config; only `config.maxDt` is read for the dt clamp
   * @param {number} [deps.maxDt]  optional dt clamp override (seconds); wins over `config.maxDt`
   * @param {(cb: (timestamp: number) => void) => number} [deps.requestAnimationFrame]
   *   RAF implementation (defaults to `globalThis.requestAnimationFrame`); injectable for tests
   * @param {(handle: number) => void} [deps.cancelAnimationFrame]
   *   cancel implementation (defaults to `globalThis.cancelAnimationFrame`); injectable for tests
   * @param {() => number} [deps.now]  monotonic clock in ms (defaults to `performance.now`); injectable for tests
   */
  constructor({
    engine,
    renderer,
    input,
    audio,
    highScoreStore,
    config = undefined,
    maxDt = undefined,
    requestAnimationFrame = undefined,
    cancelAnimationFrame = undefined,
    now = undefined,
  } = {}) {
    this.engine = engine;
    this.renderer = renderer;
    this.input = input;
    this.audio = audio;
    this.highScoreStore = highScoreStore;

    // dt clamp: explicit `maxDt` wins, then `config.maxDt`, then the default.
    const configMaxDt = config && typeof config.maxDt === "number" ? config.maxDt : undefined;
    this.maxDt =
      typeof maxDt === "number" ? maxDt : typeof configMaxDt === "number" ? configMaxDt : DEFAULT_MAX_DT;

    // Injectable timekeeping so the loop is testable in Node without a browser.
    // Bind the browser defaults to their host object so `this` is correct.
    const raf = requestAnimationFrame ?? bindGlobal("requestAnimationFrame");
    const caf = cancelAnimationFrame ?? bindGlobal("cancelAnimationFrame");
    this._raf = typeof raf === "function" ? raf : null;
    this._caf = typeof caf === "function" ? caf : null;
    this._now = typeof now === "function" ? now : defaultNow;

    /** @type {boolean} whether the loop is scheduling frames. */
    this._running = false;
    /** @type {boolean} whether stepping is paused (tab hidden/blurred). */
    this._paused = false;
    /** @type {number|null} RAF handle for the pending frame, if any. */
    this._frameHandle = null;
    /** @type {number|null} timestamp (ms) of the previous stepped frame. */
    this._lastTime = null;

    // Bound handlers so the same references can be removed on stop().
    this._onFrame = this._tick.bind(this);
    this._onHide = this._pause.bind(this);
    this._onShow = this._resume.bind(this);
    this._onVisibilityChange = this._handleVisibilityChange.bind(this);
  }

  /**
   * Begin the RAF loop and attach pause/resume listeners. Idempotent: calling
   * `start` while already running does nothing.
   */
  start() {
    if (this._running) {
      return;
    }
    this._running = true;
    this._paused = false;
    // Reset timing so the first tick produces a small dt rather than a jump.
    this._lastTime = null;
    this._attachLifecycleListeners();
    this._scheduleNextFrame();
  }

  /**
   * End the RAF loop and detach pause/resume listeners. Idempotent: safe to call
   * when not running.
   */
  stop() {
    if (!this._running) {
      return;
    }
    this._running = false;
    this._paused = false;
    if (this._frameHandle !== null && this._caf) {
      this._caf(this._frameHandle);
    }
    this._frameHandle = null;
    this._lastTime = null;
    this._detachLifecycleListeners();
  }

  /**
   * Schedule the next animation frame if the loop is running and a RAF
   * implementation is available.
   */
  _scheduleNextFrame() {
    if (!this._running || !this._raf) {
      this._frameHandle = null;
      return;
    }
    this._frameHandle = this._raf(this._onFrame);
  }

  /**
   * One animation-frame tick. Computes and clamps `dt`, drains intents, steps
   * the engine, maps returned events to effects, and draws the new state.
   *
   * When paused (tab hidden/blurred) the tick keeps scheduling frames but does
   * not step or draw, and it forgets the last timestamp so the first frame after
   * resume produces a small dt rather than a jump.
   *
   * @param {number} [timestamp]  the RAF timestamp (ms); falls back to `now()`.
   */
  _tick(timestamp) {
    if (!this._running) {
      return;
    }

    if (this._paused) {
      // While paused, do not advance the world; drop the timestamp baseline so
      // no giant dt accumulates across the pause.
      this._lastTime = null;
      this._scheduleNextFrame();
      return;
    }

    const nowMs = typeof timestamp === "number" ? timestamp : this._now();

    // First stepped frame after start/resume: establish the baseline with a
    // zero dt so nothing teleports.
    if (this._lastTime === null) {
      this._lastTime = nowMs;
    }
    const dt = clamp((nowMs - this._lastTime) / 1000, 0, this.maxDt);
    this._lastTime = nowMs;

    const intents = this.input && typeof this.input.drainIntents === "function"
      ? this.input.drainIntents()
      : [];

    const result = this.engine.step({ dt, now: nowMs, intents });
    this._applyEvents(result && result.events);

    if (this.renderer && typeof this.renderer.draw === "function") {
      this.renderer.draw(this.engine.state);
    }

    this._scheduleNextFrame();
  }

  /**
   * Map the plain event values returned by `engine.step` to shell effects:
   *   - FlapApplied → play the flap sound (Req 3.5).
   *   - GameOver    → play the game-over sound once (Req 6.5) and persist the
   *                   high score when the event says to (Req 7.4); a failed save
   *                   sets `state.saveFailed` so the Renderer surfaces it (Req 7.6).
   *   - Scored      → no effect required.
   *
   * @param {Array<{type: string, persist?: boolean, highScore?: number}>|undefined|null} events
   */
  _applyEvents(events) {
    if (!Array.isArray(events)) {
      return;
    }
    for (const event of events) {
      if (!event || typeof event.type !== "string") {
        continue;
      }
      switch (event.type) {
        case EVENT_FLAP_APPLIED:
          if (this.audio && typeof this.audio.playFlap === "function") {
            this.audio.playFlap();
          }
          break;
        case EVENT_GAME_OVER:
          if (this.audio && typeof this.audio.playGameOver === "function") {
            this.audio.playGameOver();
          }
          if (event.persist === true && this.highScoreStore && typeof this.highScoreStore.save === "function") {
            const saved = this.highScoreStore.save(event.highScore);
            if (saved === false && this.engine && this.engine.state) {
              // Surface the failure to the player via the Renderer (Req 7.6).
              this.engine.state.saveFailed = true;
            }
          }
          break;
        case EVENT_SCORED:
          // No effect required.
          break;
        default:
          break;
      }
    }
  }

  /**
   * Pause stepping (Req 10.5). The RAF loop keeps running but ticks become
   * no-ops until resumed, and the timestamp baseline is dropped so no large dt
   * accumulates across the pause.
   */
  _pause() {
    this._paused = true;
    this._lastTime = null;
  }

  /**
   * Resume stepping after a pause (Req 10.5). Resets the timestamp baseline so
   * the first frame after resume produces a small dt rather than a jump.
   */
  _resume() {
    this._paused = false;
    this._lastTime = null;
  }

  /**
   * `visibilitychange` handler: pause when the document is hidden, resume when
   * it becomes visible.
   */
  _handleVisibilityChange() {
    const doc = getDocument();
    if (!doc) {
      return;
    }
    if (doc.visibilityState === "hidden" || doc.hidden === true) {
      this._pause();
    } else {
      this._resume();
    }
  }

  /**
   * Attach visibility/focus listeners so the loop pauses when the tab is hidden
   * or the window loses focus, and resumes on visible/focus (Req 10.5). Guarded
   * so the module can be imported and constructed in Node (no document/window).
   */
  _attachLifecycleListeners() {
    const doc = getDocument();
    if (doc && typeof doc.addEventListener === "function") {
      doc.addEventListener("visibilitychange", this._onVisibilityChange);
    }
    const win = getWindow();
    if (win && typeof win.addEventListener === "function") {
      win.addEventListener("blur", this._onHide);
      win.addEventListener("focus", this._onShow);
    }
  }

  /**
   * Remove the visibility/focus listeners added by `_attachLifecycleListeners`.
   */
  _detachLifecycleListeners() {
    const doc = getDocument();
    if (doc && typeof doc.removeEventListener === "function") {
      doc.removeEventListener("visibilitychange", this._onVisibilityChange);
    }
    const win = getWindow();
    if (win && typeof win.removeEventListener === "function") {
      win.removeEventListener("blur", this._onHide);
      win.removeEventListener("focus", this._onShow);
    }
  }
}

/**
 * Resolve a global function by name and bind it to `globalThis` so that host
 * functions like `requestAnimationFrame` keep their correct `this`. Returns
 * `null` when the global is absent (e.g. in Node).
 *
 * @param {string} name
 * @returns {Function|null}
 */
function bindGlobal(name) {
  const fn = typeof globalThis !== "undefined" ? globalThis[name] : undefined;
  return typeof fn === "function" ? fn.bind(globalThis) : null;
}

/**
 * Default monotonic clock: `performance.now()` when available, otherwise
 * `Date.now()`. Guarded so the module works in any environment.
 *
 * @returns {number} milliseconds
 */
function defaultNow() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

/**
 * The global `document`, or null when it is undefined (e.g. in Node). Guarded so
 * the module can be imported outside a browser.
 *
 * @returns {Document|null}
 */
function getDocument() {
  return typeof document !== "undefined" ? document : null;
}

/**
 * The global `window`, or null when it is undefined (e.g. in Node). Guarded so
 * the module can be imported outside a browser.
 *
 * @returns {Window|null}
 */
function getWindow() {
  return typeof window !== "undefined" ? window : null;
}
