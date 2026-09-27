// AudioManager — shell-side sound effects.
//
// This is a SHELL module (see .kiro/steering/game-architecture.md §1, §3, §7).
// The pure domain never plays sound; instead `engine.step` returns plain event
// values (FlapApplied, GameOver) and the shell maps those events to audio calls
// here. All audio I/O is wrapped so a rejected `play()` promise, a missing asset
// (null element), or any other failure is swallowed and gameplay continues.

/**
 * Wraps the two game sound effects (flap and game-over) loaded by the
 * AssetLoader. Each play method restarts the clip from the beginning and can
 * never throw or reject, so callers may fire-and-forget from event handling.
 */
export class AudioManager {
  /**
   * @param {object} sounds
   * @param {(HTMLAudioElement|null)} [sounds.flapSound]      loaded jump.wav element, or null if load failed
   * @param {(HTMLAudioElement|null)} [sounds.gameOverSound]  loaded game_over.wav element, or null if load failed
   */
  constructor({ flapSound = null, gameOverSound = null } = {}) {
    this._flapSound = flapSound;
    this._gameOverSound = gameOverSound;
  }

  /**
   * Play the flap sound from its start (Req 3.5). Driven by a FlapApplied event.
   *
   * A missing asset, a synchronous throw, or a rejected `play()` promise is
   * swallowed so the flap impulse is applied regardless (Req 3.6).
   */
  playFlap() {
    this._playFromStart(this._flapSound);
  }

  /**
   * Play the game-over sound from its start (Req 3.5, 6.5). Driven by a single
   * GameOver event per transition, so it plays exactly once with no internal
   * dedup needed.
   *
   * A missing asset, a synchronous throw, or a rejected `play()` promise is
   * swallowed so the state still transitions to Game_Over (Req 6.6).
   */
  playGameOver() {
    this._playFromStart(this._gameOverSound);
  }

  /**
   * Restart the given clip from the beginning and play it, swallowing every
   * failure mode so gameplay is never interrupted (Req 3.6, 6.6).
   *
   * @param {(HTMLAudioElement|null|undefined)} sound
   */
  _playFromStart(sound) {
    if (!sound) {
      return;
    }
    try {
      // Restart from the beginning so rapid repeats always re-trigger (Req 3.5).
      sound.currentTime = 0;
      const result = sound.play();
      // `play()` returns a promise in modern browsers; a blocked or failed play
      // rejects it. Swallow so the rejection never surfaces as an unhandled
      // rejection and never interrupts gameplay.
      if (result && typeof result.then === "function") {
        result.then(undefined, () => {});
      }
    } catch {
      // Synchronous failures (e.g. setting currentTime on a broken element)
      // are swallowed too.
    }
  }
}
