// HighScoreStore — the browser-storage boundary for the persisted high score.
//
// This is a SHELL module (see .kiro/steering/game-architecture.md section 1):
// it owns the impure Local_Storage I/O and wraps every call in try/catch so a
// browser that blocks storage (private mode) or is out of quota can never crash
// the game. All parsing/validation is delegated to the pure domain function
// `parseHighScore`, keeping the "what does this raw value mean" decision
// deterministic and property-testable.

import { parseHighScore } from "../domain/highScore.js";

/** Stable Local_Storage key for the persisted high score. */
export const HIGH_SCORE_KEY = "flappy-kiro.highScore";

/**
 * Create a HighScoreStore bound to a storage backend.
 *
 * The storage object is injected (defaulting to `globalThis.localStorage`) so
 * tests can supply a fake Map-like/throwing implementation and so the module
 * degrades gracefully when no storage exists at all.
 *
 * @param {Storage} [storage=globalThis.localStorage] a Web Storage-like object
 *   exposing `getItem(key)` and `setItem(key, value)`.
 * @returns {{ load: () => number, save: (score: number) => boolean }}
 */
export function createHighScoreStore(storage = globalThis.localStorage) {
  /**
   * Read and validate the persisted high score (Req 7.1–7.3).
   *
   * Any failure — storage missing, `getItem` throwing, or a missing/invalid
   * stored value — resolves to 0 via the domain parser, never throwing.
   *
   * @returns {number} an integer high score in [0, 999999999]
   */
  function load() {
    let raw = null;
    try {
      raw = storage ? storage.getItem(HIGH_SCORE_KEY) : null;
    } catch {
      // Storage unreadable (e.g. access denied). Treat as no stored value.
      raw = null;
    }
    // Empty/missing storage and every invalid value collapse to 0 here.
    return parseHighScore(raw);
  }

  /**
   * Persist the high score to Local_Storage (Req 7.4).
   *
   * Wrapped in try/catch so exceptions (private mode, quota exceeded, missing
   * storage) never crash the game (Req 7.6). Returns whether the write
   * succeeded so the Renderer can surface a `saveFailed` indication to the
   * player when it did not.
   *
   * @param {number} score the high score value to persist
   * @returns {boolean} true if the write succeeded, false if it failed
   */
  function save(score) {
    try {
      if (!storage) {
        return false;
      }
      storage.setItem(HIGH_SCORE_KEY, String(score));
      return true;
    } catch {
      // Private mode, quota exceeded, or storage unavailable. Keep the
      // in-session value and report failure to the caller.
      return false;
    }
  }

  return { load, save };
}
