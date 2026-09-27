// InputController: the shell-side translation of raw browser input events into
// a queue of plain, data-only intent values that the game loop drains once per
// tick and passes into `engine.step`.
//
// This is a SHELL module (see .kiro/steering/game-architecture.md, section 3):
// it is the ONLY place that may call `addEventListener`. The domain never sees a
// DOM event — it only receives the drained intent strings. Input is debounced at
// the source so a held spacebar produces exactly one flap per physical press.
//
// Intent semantics (verified against src/domain/gameEngine.js):
//   - The engine acts on an INTENT_FLAP only in the Ready and Playing phases and
//     ignores INTENT_RESTART there (`_stepReady`, `_stepPlaying`).
//   - The engine acts on an INTENT_RESTART only in the Game_Over phase and
//     ignores INTENT_FLAP there (`_stepGameOver`).
// A single physical "primary action" (spacebar press, mouse click, or touch tap)
// means "flap" while Ready/Playing and "restart" while Game_Over (Req 3.1, 3.3,
// 3.4, 8.2, 9.4). Because the controller does not know the current phase — and
// because each phase acts on exactly one of the two intent kinds and ignores the
// other — the correct and simplest translation is to queue BOTH an INTENT_FLAP
// and an INTENT_RESTART for each primary-action press. This cannot double-fire:
// in Ready/Playing the Restart is ignored; in Game_Over the Flap is ignored.

import { INTENT_FLAP, INTENT_RESTART } from "../domain/gameEngine.js";

/** The keys treated as the spacebar primary-action trigger. */
const SPACE_KEYS = new Set([" ", "Spacebar", "Space"]);

/**
 * Is this keyboard event the spacebar? Accepts both the modern `key` value
 * (`" "`), the legacy `"Spacebar"`, and the physical `code` (`"Space"`).
 *
 * @param {KeyboardEvent} event
 * @returns {boolean}
 */
function isSpaceKey(event) {
  return SPACE_KEYS.has(event.key) || event.code === "Space";
}

/**
 * Translates raw browser input on a target element (the canvas) into a queue of
 * plain intent strings for the loop to drain.
 *
 * Usage:
 *   const input = new InputController(canvas);  // attaches listeners
 *   // ...each tick:
 *   engine.step({ dt, now, intents: input.drainIntents() });
 *   // on teardown:
 *   input.detach();
 */
export class InputController {
  /**
   * @param {EventTarget|null} [target]  the element to listen on (typically the
   *   canvas). If provided, listeners are attached immediately. Omit and call
   *   `attach(target)` later to defer wiring.
   */
  constructor(target = null) {
    /** @type {string[]} pending intents, oldest first, drained each tick. */
    this._queue = [];

    /**
     * Whether the spacebar is currently held down. Used to debounce a held key
     * at the source: a flap is queued on `keydown` only when the key was
     * previously up, so a held key produces exactly one flap per physical press
     * (Req 3.2, Property 4).
     * @type {boolean}
     */
    this._spaceDown = false;

    /** @type {EventTarget|null} the element listeners are bound to, if any. */
    this._target = null;

    // Bind handlers once so the same references can be removed in `detach`.
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onMouseDown = this._handlePointer.bind(this);
    this._onTouchStart = this._handlePointer.bind(this);

    if (target) {
      this.attach(target);
    }
  }

  /**
   * Attach input listeners to a target element. Attaching to a new target while
   * already attached first detaches from the old one, so listeners never leak.
   *
   * @param {EventTarget} target  the element to listen on (typically the canvas)
   */
  attach(target) {
    if (!target || typeof target.addEventListener !== "function") {
      return;
    }
    if (this._target) {
      this.detach();
    }
    this._target = target;
    // keydown/keyup are registered on the target; the bootstrap makes the canvas
    // focusable (tabindex) so it can receive key events.
    target.addEventListener("keydown", this._onKeyDown);
    target.addEventListener("keyup", this._onKeyUp);
    target.addEventListener("mousedown", this._onMouseDown);
    target.addEventListener("touchstart", this._onTouchStart);
  }

  /**
   * Remove all listeners from the current target and forget it. Safe to call
   * when nothing is attached. Also resets the held-key state so a later
   * re-attach starts from a clean slate.
   */
  detach() {
    const target = this._target;
    if (target && typeof target.removeEventListener === "function") {
      target.removeEventListener("keydown", this._onKeyDown);
      target.removeEventListener("keyup", this._onKeyUp);
      target.removeEventListener("mousedown", this._onMouseDown);
      target.removeEventListener("touchstart", this._onTouchStart);
    }
    this._target = null;
    this._spaceDown = false;
  }

  /**
   * Return the pending intents in FIFO order and clear the internal queue. The
   * loop calls this once per tick; between drains, intents accumulate.
   *
   * @returns {string[]} the drained intents (a fresh array; safe to mutate).
   */
  drainIntents() {
    const drained = this._queue;
    this._queue = [];
    return drained;
  }

  /**
   * Queue one primary-action press as BOTH a Flap and a Restart intent (see the
   * module header for why this is correct and cannot double-fire).
   */
  _queuePrimaryAction() {
    this._queue.push(INTENT_FLAP, INTENT_RESTART);
  }

  /**
   * keydown handler. Only the spacebar is a game input. A flap is queued only on
   * the up→down transition (when the key was previously up), so the OS key-repeat
   * from a held key produces no additional flaps (Req 3.2, Property 4).
   *
   * @param {KeyboardEvent} event
   */
  _handleKeyDown(event) {
    if (!isSpaceKey(event)) {
      return;
    }
    // Prevent the page from scrolling on spacebar.
    if (typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    if (!this._spaceDown) {
      this._spaceDown = true;
      this._queuePrimaryAction();
    }
  }

  /**
   * keyup handler. Clears the held-key latch so the next physical press is
   * treated as a fresh up→down transition.
   *
   * @param {KeyboardEvent} event
   */
  _handleKeyUp(event) {
    if (!isSpaceKey(event)) {
      return;
    }
    this._spaceDown = false;
  }

  /**
   * mousedown / touchstart handler. Each pointer press is a discrete primary
   * action (Req 3.3, 3.4). Touch events are prevented from also synthesizing a
   * mouse event (which would double-count the press).
   *
   * @param {MouseEvent|TouchEvent} event
   */
  _handlePointer(event) {
    if (event && event.type === "touchstart" && typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    this._queuePrimaryAction();
  }
}
