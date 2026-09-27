// GameEngine: the pure orchestrator that holds the single GameState and advances
// it one step per tick by composing the domain systems (physics, pipeSystem,
// collision, scoring, highScore).
//
// This module is pure with respect to its inputs and the injected RNG. It never
// performs I/O: `dt` and `now` are computed by the shell's loop and passed in as
// ordinary inputs, and randomness (gap placement) flows through the injected
// `rng`. The engine decides all state-machine transitions inside `step` and
// returns a list of plain event values (`FlapApplied`, `Scored`, `GameOver`)
// that the shell maps to effects (audio, storage). See the design's GameEngine
// and State Machine sections and the game-architecture steering standards.

import { applyGravity, applyFlap } from "./physics.js";
import { scroll, cull, maybeSpawn } from "./pipeSystem.js";
import { hitsPipe, hitsGround, hitsCeiling } from "./collision.js";
import { detectPasses, clampScore } from "./scoring.js";
import { nextHighScore, shouldPersist } from "./highScore.js";
import { ghostBox } from "./config.js";

/** Game phases (see Data Models: GamePhase). */
export const PHASE_READY = "Ready";
export const PHASE_PLAYING = "Playing";
export const PHASE_GAME_OVER = "Game_Over";

/** Intent kinds drained from input and passed into `step`. */
export const INTENT_FLAP = "Flap";
export const INTENT_RESTART = "Restart";

/** Event kinds returned by `step` (plain values the shell maps to effects). */
export const EVENT_FLAP_APPLIED = "FlapApplied";
export const EVENT_SCORED = "Scored";
export const EVENT_GAME_OVER = "GameOver";

/**
 * Default ghost size (px) used when the config does not supply one. Matches the
 * 32x32 ghost sprite frame documented in ghosty-sprites.md and the fallback in
 * pipeSystem.
 */
const DEFAULT_GHOST_SIZE = 32;

/**
 * Read the ghost width (px) from config, falling back to the sprite frame size.
 * @param {{ ghostWidth?: number }} config
 * @returns {number}
 */
function ghostWidthOf(config) {
  return typeof config.ghostWidth === "number" ? config.ghostWidth : DEFAULT_GHOST_SIZE;
}

/**
 * Read the ghost height (px) from config, falling back to the sprite frame size.
 * @param {{ ghostHeight?: number }} config
 * @returns {number}
 */
function ghostHeightOf(config) {
  return typeof config.ghostHeight === "number" ? config.ghostHeight : DEFAULT_GHOST_SIZE;
}

/**
 * Build the canonical Ready-start ghost: horizontally and vertically centered
 * within the Play_Area with zero vertical velocity (Req 9.2). `x`/`y` are the
 * ghost's top-left corner, consistent with `ghostBox`.
 *
 * @param {import('./config.js').GameConfig} config
 * @returns {{ x: number, y: number, vy: number, width: number, height: number }}
 */
function makeStartGhost(config) {
  const width = ghostWidthOf(config);
  const height = ghostHeightOf(config);
  const playAreaCenterX = config.canvasWidth / 2;
  const playAreaCenterY = (config.ceilingY + config.groundTop) / 2;
  return {
    x: playAreaCenterX - width / 2,
    y: playAreaCenterY - height / 2,
    vy: 0,
    width,
    height,
  };
}

/**
 * The orchestrator. Holds one `GameState` and advances it one step per tick.
 *
 * The engine composes the pure domain systems and decides every phase
 * transition. It stays deterministic because `config`, the `rng`, and the
 * per-tick `dt`/`now` are all injected rather than read from globals.
 */
export class GameEngine {
  /**
   * @param {import('./config.js').GameConfig} config  the tuning surface (injected)
   * @param {() => number} rng  a float generator in [0, 1) for gap placement
   * @param {number} initialHighScore  the high score loaded at bootstrap
   */
  constructor(config, rng, initialHighScore = 0) {
    this.config = config;
    this.rng = typeof rng === "function" ? rng : Math.random;
    this.initialHighScore = initialHighScore;

    /** @type {import('./config.js').GameConfig extends never ? never : object} */
    this.state = this._initialState(initialHighScore);
  }

  /**
   * Build a fresh Ready state (Req 9.1, 9.2). Ghost centered, velocity zero, no
   * pipes, score zero, and the provided high score.
   *
   * @param {number} highScore
   * @returns {object} a fresh GameState
   */
  _initialState(highScore) {
    return {
      phase: PHASE_READY,
      ghost: makeStartGhost(this.config),
      pipes: [],
      score: 0,
      highScore,
      gameOverAt: null,
      saveFailed: false,
      spriteLoaded: true,
    };
  }

  /**
   * Reset the engine to a fresh Ready state (Req 9.1). The high score carried
   * forward is the larger of the current high score and the initial one, so a
   * reset never discards a score already achieved this session.
   */
  reset() {
    const carriedHigh = Math.max(this.state.highScore, this.initialHighScore);
    this.state = this._initialState(carriedHigh);
  }

  /**
   * Advance the game one step.
   *
   * @param {{ dt: number, intents?: Array<string|{type:string}>, now: number }} input
   *   `dt` is clamped elapsed seconds, `intents` is the drained intent queue,
   *   and `now` is a monotonic ms timestamp used for the restart lockout.
   * @returns {{ events: Array<object> }} plain event values for the shell.
   */
  step(input) {
    const dt = input && typeof input.dt === "number" ? input.dt : 0;
    const now = input && typeof input.now === "number" ? input.now : 0;
    const intents = normalizeIntents(input && input.intents);

    switch (this.state.phase) {
      case PHASE_READY:
        return this._stepReady(intents);
      case PHASE_PLAYING:
        return this._stepPlaying(dt, intents, now);
      case PHASE_GAME_OVER:
        return this._stepGameOver(intents, now);
      default:
        return { events: [] };
    }
  }

  /**
   * Ready: no gravity, no scroll (Req 9.3). A Flap intent transitions to Playing
   * and applies one upward impulse (Req 9.4).
   *
   * @param {string[]} intents
   * @returns {{ events: Array<object> }}
   */
  _stepReady(intents) {
    if (intents.includes(INTENT_FLAP)) {
      const ghost = applyFlap(this.state.ghost, this.config.flapVelocity);
      this.state = {
        ...this.state,
        phase: PHASE_PLAYING,
        ghost,
      };
      return { events: [{ type: EVENT_FLAP_APPLIED }] };
    }
    // Frozen: no state change.
    return { events: [] };
  }

  /**
   * Playing: apply gravity/integrate, then at most one flap per Flap intent;
   * scroll/cull/maybeSpawn pipes; detect passes and clamp score; evaluate
   * collisions and transition to Game_Over on any hit.
   *
   * Event order: a FlapApplied (if flapped) precedes any Scored events, which
   * precede a GameOver (if the step ends the game).
   *
   * @param {number} dt
   * @param {string[]} intents
   * @param {number} now  monotonic ms timestamp (recorded as gameOverAt on a hit)
   * @returns {{ events: Array<object> }}
   */
  _stepPlaying(dt, intents, now) {
    const events = [];
    const { config } = this;

    // 1) Physics: gravity then integrate (fixed order inside applyGravity).
    let ghost = applyGravity(this.state.ghost, config.gravity, config.maxFallVelocity, dt);

    // 2) Flap: apply at most one flap per Flap intent this tick (Req 3.1-3.4).
    //    A single physical press yields a single Flap intent; the loop debounces
    //    a held key at the source, so applying one impulse per intent is correct.
    let flapped = false;
    for (const intent of intents) {
      if (intent === INTENT_FLAP) {
        ghost = applyFlap(ghost, config.flapVelocity);
        flapped = true;
      }
    }
    if (flapped) {
      events.push({ type: EVENT_FLAP_APPLIED });
    }

    // 3) Pipes: scroll, cull off-screen, then maybe spawn a new approaching pair.
    let pipes = scroll(this.state.pipes, config.scrollSpeed, dt);
    pipes = cull(pipes, config.canvasWidth);
    pipes = maybeSpawn(pipes, config, this.rng, config.canvasWidth);

    // 4) Collision: evaluate once this step (Req 6.4). A pipe hit must not award
    //    a score for that same pair (Req 5.4), so mark hit pairs as collided
    //    before scoring runs.
    const box = ghostBox(ghost);
    const groundHit = hitsGround(box, config.groundTop);
    const ceilingHit = hitsCeiling(box, config.ceilingY);

    let pipeHit = false;
    pipes = pipes.map((pipe) => {
      if (hitsPipe(box, pipe)) {
        pipeHit = true;
        return { ...pipe, collided: true };
      }
      return pipe;
    });

    // 5) Scoring: count newly passed, uncollided pairs (Req 5.1, 5.2, 5.4).
    const { pipes: scoredPipes, scoreDelta } = detectPasses(ghost, pipes);
    pipes = scoredPipes;
    let score = this.state.score;
    if (scoreDelta > 0) {
      score = clampScore(score + scoreDelta);
      for (let i = 0; i < scoreDelta; i += 1) {
        events.push({ type: EVENT_SCORED });
      }
    }

    const collided = pipeHit || groundHit || ceilingHit;

    if (collided) {
      // 6) Transition to Game_Over (Req 6.1-6.3, 6.7, 6.8). Freeze happens by
      //    committing this final ghost/pipes and stepping no further while in
      //    Game_Over. High score becomes max(score, high) (Req 7.4/7.5).
      const high = nextHighScore(score, this.state.highScore);
      const persist = shouldPersist(score, this.state.highScore);
      this.state = {
        ...this.state,
        phase: PHASE_GAME_OVER,
        ghost,
        pipes,
        score,
        highScore: high,
        gameOverAt: now,
      };
      events.push({ type: EVENT_GAME_OVER, score, highScore: high, persist });
      return { events };
    }

    this.state = {
      ...this.state,
      ghost,
      pipes,
      score,
    };
    return { events };
  }

  /**
   * Game_Over: no gravity, no scroll (Req 6.7, 6.8). A Restart intent arriving
   * at least `restartLockoutMs` after `gameOverAt` resets the world to a fresh
   * Playing state (Req 8.2); earlier restarts are ignored (Req 8.3).
   *
   * @param {string[]} intents
   * @param {number} now  monotonic ms timestamp
   * @returns {{ events: Array<object> }}
   */
  _stepGameOver(intents, now) {
    if (intents.includes(INTENT_RESTART)) {
      const since = now - (this.state.gameOverAt ?? now);
      if (since >= this.config.restartLockoutMs) {
        // Canonical fresh Playing state: ghost reset to the Ready start (Req
        // 8.2), pipes cleared, score zeroed. The high score is retained.
        this.state = {
          ...this.state,
          phase: PHASE_PLAYING,
          ghost: makeStartGhost(this.config),
          pipes: [],
          score: 0,
          gameOverAt: null,
        };
        return { events: [] };
      }
      // Within the lockout window: ignore the input, remain Game_Over.
    }
    // Frozen: no state change.
    return { events: [] };
  }
}

/**
 * Normalize an intent queue to an array of intent-kind strings. Accepts either
 * plain strings (`"Flap"`) or tagged objects (`{ type: "Flap" }`), so the shell
 * can queue whichever shape is convenient.
 *
 * @param {Array<string|{type:string}>|undefined|null} intents
 * @returns {string[]}
 */
function normalizeIntents(intents) {
  if (!Array.isArray(intents)) {
    return [];
  }
  return intents
    .map((intent) => (typeof intent === "string" ? intent : intent && intent.type))
    .filter((kind) => typeof kind === "string");
}
