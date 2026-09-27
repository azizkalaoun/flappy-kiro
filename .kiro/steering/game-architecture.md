---
inclusion: always
---

# Flappy Kiro — Game Architecture Standards

These standards codify the architecture the design already establishes. They are
binding for every Flappy Kiro implementation task. When code and these standards
disagree, fix the code. When the design doc and these standards disagree, the
design doc wins and this file should be updated to match.

## 1. Layering: pure domain, impure shell

The codebase is split into two layers with a one-way dependency rule.

- `src/domain/` — pure game logic. No I/O, no DOM, no timers, no randomness read
  from globals. Every function is a pure function of its arguments (plus an
  injected RNG). Domain modules never import from `src/shell/`.
- `src/shell/` — the browser boundary. Owns canvas, audio, input, storage, and
  the requestAnimationFrame loop. The shell may import from `src/domain/`; the
  reverse is forbidden.

Rationale: the pure layer is deterministic and property-testable in Node with no
DOM; the shell stays thin and is covered by example/integration tests.

Rule: if you are about to call `localStorage`, `document`, `Audio`, `Math.random`,
`performance.now`, or `requestAnimationFrame` inside `src/domain/`, stop — that
work belongs in the shell, and the value should be passed into the domain instead.

## 2. Modular systems

Each domain concern is its own module with a narrow, pure interface:

- `config.js` — the single tuning surface (see section 5).
- `physics.js` — `applyGravity`, `applyFlap`. Fixed integration order: update
  velocity by gravity, clamp downward velocity, then integrate position.
- `pipeSystem.js` — `scroll`, `cull`, `maybeSpawn`, `makePipePair`.
- `collision.js` — `hitsPipe`, `hitsGround`, `hitsCeiling` (AABB predicates).
- `scoring.js` — `detectPasses`, `clampScore`.
- `highScore.js` / `format.js` — parsing, max/persist decisions, display strings.
- `gameEngine.js` — the orchestrator that holds `GameState` and composes the
  systems above in `step`.

Standards for every module:
- Functions return new objects; never mutate arguments (arrays or records).
- No cross-module hidden coupling — systems communicate only through the
  `GameState` the engine passes in and the values it returns.
- No gameplay constant is hardcoded; all come from `config`.

## 3. Event handling

Input and side effects both flow through explicit, data-only channels — never
direct calls from domain to browser APIs.

- Input → intents. The `InputController` translates raw browser events
  (`keydown`/`keyup` spacebar, `mousedown`, `touchstart`) into a queue of plain
  intent values (`FlapIntent`, `RestartIntent`). The loop drains this queue once
  per tick and passes the intents into `engine.step`.
- Debounce at the source. A held spacebar produces exactly one flap per physical
  press: queue a flap on `keydown` only when the key was previously up.
- Domain → events. `engine.step` returns a list of plain event values
  (`FlapApplied`, `Scored`, `GameOver`). The shell maps events to effects
  (audio, storage). The domain never plays a sound or writes storage itself.
- Effects are idempotent per event. Game-over audio plays exactly once because it
  is driven by a single `GameOver` event per transition.

Rule: no `addEventListener` outside the shell, and no effect (sound, save, draw)
triggered anywhere except from a drained intent or a returned event.

## 4. State management

- Single source of truth. One `GameState` record holds all mutable world state
  (`phase`, `ghost`, `pipes`, `score`, `highScore`, `gameOverAt`, and the
  `saveFailed` / `spriteLoaded` flags). Rendering is a pure read of this state.
- State machine. `phase` is exactly one of `Ready`, `Playing`, `Game_Over`.
  All transitions and their side effects are decided inside `GameEngine.step`:
  - `Ready → Playing` on a flap intent (applies one upward impulse).
  - `Playing → Game_Over` on any collision (pipe, ground, or ceiling).
  - `Game_Over → Playing` on a restart intent that arrives at least
    `restartLockoutMs` after entering Game_Over; earlier restarts are ignored.
- Frozen phases. In `Ready` and `Game_Over`, stepping does not change the ghost
  or pipes (no gravity, no scroll). Verify with a property test, not by hand.
- Timekeeping lives in the shell. `dt` and `now` are computed by the loop and
  passed into `step`; the domain treats them as ordinary inputs. `dt` is clamped
  to a max so a stall or resumed tab cannot tunnel the ghost through a pipe.

## 5. Configuration and dependency injection

- All tunable numbers live in `src/domain/config.js` as `defaultConfig`. No other
  module hardcodes gameplay values.
- Config is injected. The engine, systems, and shell components receive the
  values they need as arguments — they do not import globals. This keeps the
  domain deterministic and lets property tests inject their own config.
- Config is read once at engine construction / bootstrap. Values used only at
  spawn or reset take effect on the next new game.
- Every config field documents its unit (`px`, `px/s`, `px/s^2`, `ms`,
  `multiplier`) and any valid range from the requirements.

## 6. Testing alignment

- Domain modules get property-based tests (fast-check via Vitest), one test per
  correctness Property in the design, minimum 100 iterations, tagged with
  `// Feature: flappy-kiro, Property {n}: {text}`.
- Shell modules get example/integration tests with mocked audio, storage, canvas,
  and jsdom where a DOM is required.
- Because the domain is pure, tests import it directly and run in Node.

## 7. Error handling and graceful degradation

Every external dependency has a defined fallback so the game never crashes:
- Sprite load failure → placeholder rectangle; scene keeps rendering.
- Audio failure/blocked → swallow the error; gameplay continues.
- High score unreadable/invalid → parse to 0.
- High score save failure → keep the in-session value, set `saveFailed`, continue.
- Canvas unsupported → show a message and do not start the loop.

All audio and storage calls are wrapped in the shell. The domain performs no I/O,
so it cannot throw on external failure.
