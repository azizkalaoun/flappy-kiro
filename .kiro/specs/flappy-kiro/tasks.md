# Implementation Plan: Flappy Kiro

## Overview

This plan builds Flappy Kiro incrementally, domain-first. We stand up the project and test tooling, then implement the pure domain layer (config/data models, physics, pipe system, collision, scoring, and the GameEngine state machine) with one property-based test per correctness property. Next we build the impure shell layer (AssetLoader, HighScoreStore, AudioManager, Renderer, InputController, GameLoop, bootstrap) with example/integration tests. Finally we wire everything into an `index.html` entry point so the game runs end to end in the browser.

The implementation language is vanilla JavaScript (ES modules), as chosen in the design. Property tests use Vitest + fast-check, run a minimum of 100 iterations, and are tagged `// Feature: flappy-kiro, Property {number}: {property_text}`.

## Tasks

- [x] 1. Set up project structure and test tooling
  - Create `package.json` with ES module type (`"type": "module"`) and scripts for `test` (Vitest single run) and `test:watch`
  - Add dev dependencies: `vitest` and `fast-check`; create a minimal `vitest.config.js`
  - Create the source directory layout: `src/domain/`, `src/shell/`, and a `test/` (or co-located `*.test.js`) convention
  - Add a `src/domain/config.js` module exporting a `defaultConfig` GameConfig and a `ghostBox(ghost)` helper producing `{ left, right, top, bottom }`
  - _Requirements: 10.1, 10.2_
  - _Design: Technology Choices, Data Models (GameConfig, ghostBox)_

- [x] 2. Implement the physics module
  - [x] 2.1 Implement gravity, flap, and clamping in `src/domain/physics.js`
    - `applyGravity(ghost, gravity, maxFall, dt)`: update velocity by `gravity*dt`, clamp downward velocity to `maxFall`, then update position by the resulting velocity (fixed order)
    - `applyFlap(ghost, flapVelocity)`: set `vy = -flapVelocity`
    - Return new ghost objects (pure, no mutation)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1_
    - _Design: physics_

  - [ ]* 2.2 Write property test for gravity integration order and effect
    - **Property 1: Gravity integration order and effect** — one Playing step first updates velocity by `gravity*dt` (then clamp), then updates position with the post-gravity velocity, so `y' = y + clamp(vy + gravity*dt) * dt`
    - **Validates: Requirements 2.1, 2.2**
    - Tag: `// Feature: flappy-kiro, Property 1: Gravity integration order and effect`; min 100 iterations

  - [ ]* 2.3 Write property test for maximum fall velocity
    - **Property 2: Maximum fall velocity is never exceeded** — over any sequence of gravity steps with arbitrary `dt`, downward velocity never exceeds `maxFallVelocity`
    - **Validates: Requirements 2.4**
    - Tag: `// Feature: flappy-kiro, Property 2: Maximum fall velocity is never exceeded`; min 100 iterations

  - [ ]* 2.4 Write property test for flap impulse
    - **Property 3: Flap applies a fixed upward impulse regardless of source** — applying a flap sets `vy = -flapVelocity` identically for spacebar, click, and tap sources
    - **Validates: Requirements 3.1, 3.3, 3.4**
    - Tag: `// Feature: flappy-kiro, Property 3: Flap applies a fixed upward impulse regardless of source`; min 100 iterations

- [x] 3. Implement the pipe system module
  - [x] 3.1 Implement scroll, cull, spawn, and pair generation in `src/domain/pipeSystem.js`
    - `scroll(pipes, scrollSpeed, dt)`: `x -= scrollSpeed*dt` for each pipe (pure)
    - `cull(pipes, canvasWidth)`: drop pipes whose right edge crossed the left edge by ≥ 1px
    - `makePipePair(config, rng, spawnX)`: `gapHeight = uniform(2.5,4)*ghostHeight`, `gapY ∈ [ceiling+20, groundTop-20-gapHeight]`, `scored: false`
    - `maybeSpawn(pipes, config, rng, canvasWidth)`: add a new pair when spacing to the right edge falls in the 200–400px window
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
    - _Design: pipeSystem, Data Models (PipePair)_

  - [ ]* 3.2 Write property test for frame-rate-independent scrolling
    - **Property 5: Pipes scroll frame-rate independently** — scrolling by sub-intervals in sequence equals scrolling once by the total elapsed time, moving left at `scrollSpeed`
    - **Validates: Requirements 4.1**
    - Tag: `// Feature: flappy-kiro, Property 5: Pipes scroll frame-rate independently`; min 100 iterations

  - [ ]* 3.3 Write property test for culling off-screen pipes
    - **Property 6: Off-screen pipes are culled** — after culling, exactly the pipes whose right edge has not crossed the left edge by ≥ 1px remain
    - **Validates: Requirements 4.2**
    - Tag: `// Feature: flappy-kiro, Property 6: Off-screen pipes are culled`; min 100 iterations

  - [ ]* 3.4 Write property test for spawn spacing and coverage
    - **Property 7: Spawn spacing stays within bounds and maintains coverage** — spacing between consecutive spawned pairs stays within `[200, 400]`px, keeping at least one pair present or approaching
    - **Validates: Requirements 4.3**
    - Tag: `// Feature: flappy-kiro, Property 7: Spawn spacing stays within bounds and maintains coverage`; min 100 iterations

  - [ ]* 3.5 Write property test for generated gap validity
    - **Property 8: Generated gaps are valid and passable** — gap height ∈ `[2.5*ghostHeight, 4*ghostHeight]` and the whole gap plus a ≥ 20px margin stays in the Play_Area (`gapY ≥ ceilingY+20`, `gapY+gapHeight ≤ groundTop-20`)
    - **Validates: Requirements 4.4, 4.5**
    - Tag: `// Feature: flappy-kiro, Property 8: Generated gaps are valid and passable`; min 100 iterations (seed the injected RNG)

- [x] 4. Implement the collision module
  - [x] 4.1 Implement AABB collision predicates in `src/domain/collision.js`
    - `hitsPipe(ghostBox, pipePair)`: overlap ≥ 1px with either the top or bottom pipe
    - `hitsGround(ghostBox, groundTop)`: `ghost.bottom >= groundTop`
    - `hitsCeiling(ghostBox, ceilingY)`: `ghost.top <= ceilingY`
    - _Requirements: 6.1, 6.2, 6.3_
    - _Design: collision_

  - [ ]* 4.2 Write property test for pipe collision correctness
    - **Property 12: Pipe collision matches AABB overlap** — the pipe-collision predicate reports a hit iff the ghost box overlaps either pipe's box by ≥ 1px
    - **Validates: Requirements 6.1**
    - Tag: `// Feature: flappy-kiro, Property 12: Pipe collision matches AABB overlap`; min 100 iterations

- [x] 5. Implement the scoring module
  - [x] 5.1 Implement pass detection and score clamping in `src/domain/scoring.js`
    - `detectPasses(ghost, pipes)`: mark a pipe `scored` when `ghost.x` passes its trailing edge, skip already-scored or collided pipes; return `{ pipes', scoreDelta }`
    - `clampScore(score)`: clamp to integer `[0, 999999]`
    - _Requirements: 5.1, 5.2, 5.4, 5.5_
    - _Design: scoring, Data Models (PipePair.scored)_

  - [ ]* 5.2 Write property test for scoring passed uncollided pipes once
    - **Property 9: Scoring counts each passed, uncollided pipe exactly once** — score increases by exactly 1 when the ghost passes the trailing edge of an uncollided pair, and does not increase for a pair collided with before its trailing edge is passed
    - **Validates: Requirements 5.1, 5.4**
    - Tag: `// Feature: flappy-kiro, Property 9: Scoring counts each passed, uncollided pipe exactly once`; min 100 iterations

  - [ ]* 5.3 Write property test for idempotent pass detection
    - **Property 10: Pass detection is idempotent** — applying pass detection again without movement yields a zero score delta
    - **Validates: Requirements 5.2**
    - Tag: `// Feature: flappy-kiro, Property 10: Pass detection is idempotent`; min 100 iterations

  - [ ]* 5.4 Write property test for score range and integrality
    - **Property 11: Score stays an integer within range** — over any sequence of scoring updates the score remains an integer within `[0, 999999]`
    - **Validates: Requirements 5.5**
    - Tag: `// Feature: flappy-kiro, Property 11: Score stays an integer within range`; min 100 iterations

- [x] 6. Implement high-score parsing helper
  - [x] 6.1 Implement `parseHighScore(raw)` in `src/domain/highScore.js`
    - Total function: return an integer in `[0, 999999999]`; return 0 for missing, non-numeric, negative, or out-of-range values; never throw
    - Add a `nextHighScore(score, highScore)` returning `max(score, highScore)` and a `shouldPersist(score, highScore)` returning `score > highScore`
    - _Requirements: 7.3, 7.4, 7.5_
    - _Design: HighScoreStore, Property 15/16_

  - [ ]* 6.2 Write property test for total, range-bounded parsing
    - **Property 15: High score parsing is total and range-bounded** — parsing any stored value returns an integer in `[0, 999999999]` without throwing, returning 0 for anything not parseable in range
    - **Validates: Requirements 7.3**
    - Tag: `// Feature: flappy-kiro, Property 15: High score parsing is total and range-bounded`; min 100 iterations

  - [ ]* 6.3 Write property test for high-score max and persistence gating
    - **Property 16: High score becomes the maximum and persists only when beaten** — result equals `max(score, highScore)` and a persist is signaled iff `score > highScore`
    - **Validates: Requirements 7.4, 7.5**
    - Tag: `// Feature: flappy-kiro, Property 16: High score becomes the maximum and persists only when beaten`; min 100 iterations

- [x] 7. Implement score formatting helper
  - [x] 7.1 Implement `formatScore(score, high)` in `src/domain/format.js`
    - Return exactly `"Score: {score} | High: {high}"`
    - _Requirements: 1.7_
    - _Design: Renderer, Property 21_

  - [ ]* 7.2 Write property test for score/high-score formatting
    - **Property 21: Score/high-score formatting** — for any non-negative integers, the string equals exactly `"Score: {score} | High: {high}"`
    - **Validates: Requirements 1.7**
    - Tag: `// Feature: flappy-kiro, Property 21: Score/high-score formatting`; min 100 iterations

- [x] 8. Checkpoint - Ensure all domain-primitive tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement the GameEngine state machine
  - [x] 9.1 Implement `GameEngine` in `src/domain/gameEngine.js`
    - Hold a single `GameState` (`phase`, `ghost`, `pipes`, `score`, `highScore`, `gameOverAt`, `saveFailed`, `spriteLoaded`)
    - `constructor(config, rng, initialHighScore)` and `reset()` initialize a centered ghost with zero velocity in Ready
    - `step({ dt, intents, now })` returns `{ events }` (`FlapApplied | Scored | GameOver`):
      - Ready: hold ghost still (no gravity/scroll); a Flap intent → Playing + upward impulse
      - Playing: apply gravity/integrate (via physics), scroll/cull/spawn (via pipeSystem), detect passes/score (via scoring), evaluate collisions (via collision) and transition to Game_Over
      - Game_Over: freeze world; a Restart intent ≥ 500ms after entering Game_Over resets to a fresh Playing state; earlier inputs ignored
    - Compute high score on Game_Over via `nextHighScore`, emit a GameOver event carrying whether to persist
    - _Requirements: 2.3, 5.3, 6.1, 6.2, 6.3, 6.4, 6.7, 6.8, 8.2, 8.3, 9.1, 9.2, 9.3, 9.4_
    - _Design: GameEngine, State Machine_

  - [ ]* 9.2 Write property test for collision-to-GameOver transition
    - **Property 13: Any collision transitions to Game_Over** — a Playing state with a pipe/ground/ceiling collision transitions to Game_Over in one step
    - **Validates: Requirements 6.1, 6.2, 6.3**
    - Tag: `// Feature: flappy-kiro, Property 13: Any collision transitions to Game_Over`; min 100 iterations

  - [ ]* 9.3 Write property test for Game_Over freezing the world
    - **Property 14: Game_Over freezes the world** — in Game_Over, over any number of steps the ghost position/velocity and every pipe position stay unchanged
    - **Validates: Requirements 6.7, 6.8**
    - Tag: `// Feature: flappy-kiro, Property 14: Game_Over freezes the world`; min 100 iterations

  - [ ]* 9.4 Write property test for canonical restart
    - **Property 17: Restart produces a canonical fresh Playing state** — a restart ≥ 500ms after Game_Over resets ghost position/velocity, clears pipes, zeroes the score, and transitions to Playing
    - **Validates: Requirements 8.2**
    - Tag: `// Feature: flappy-kiro, Property 17: Restart produces a canonical fresh Playing state`; min 100 iterations

  - [ ]* 9.5 Write property test for restart lockout
    - **Property 18: Restart is locked out for 500 ms** — a restart input < 500ms after entering Game_Over is ignored and the state stays Game_Over
    - **Validates: Requirements 8.3**
    - Tag: `// Feature: flappy-kiro, Property 18: Restart is locked out for 500 ms`; min 100 iterations

  - [ ]* 9.6 Write property test for stable centered Ready state
    - **Property 19: Ready is a stable, centered state** — while Ready the ghost is centered with zero velocity, and any number of steps leave ghost and pipes unchanged
    - **Validates: Requirements 9.2, 9.3**
    - Tag: `// Feature: flappy-kiro, Property 19: Ready is a stable, centered state`; min 100 iterations

  - [ ]* 9.7 Write property test for flap-from-Ready start
    - **Property 20: Flap from Ready starts play with an upward impulse** — a flap in Ready transitions to Playing and sets `vy = -flapVelocity`
    - **Validates: Requirements 9.4**
    - Tag: `// Feature: flappy-kiro, Property 20: Flap from Ready starts play with an upward impulse`; min 100 iterations

- [x] 10. Checkpoint - Ensure all domain (engine + property) tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Implement the AssetLoader shell module
  - [x] 11.1 Implement `src/shell/assetLoader.js`
    - Load `assets/ghosty.png`, `assets/jump.wav`, `assets/game_over.wav`; record per-asset success/failure (`img.onerror` → `spriteLoaded = false`)
    - Never block startup on failure; expose loaded handles and flags to Renderer/AudioManager
    - _Requirements: 1.5, 3.6, 6.6_
    - _Design: AssetLoader_

  - [ ]* 11.2 Write unit tests for AssetLoader fallback flags
    - Simulate load success and `onerror` failure; assert flags reflect per-asset status and startup is not blocked
    - _Requirements: 1.5, 3.6, 6.6_

- [x] 12. Implement the HighScoreStore shell module
  - [x] 12.1 Implement `src/shell/highScoreStore.js`
    - `load()` reads `localStorage` and validates via `parseHighScore` (defaulting to 0 within the load window)
    - `save(score)` writes to `localStorage` inside try/catch; on failure return a signal that sets `saveFailed`
    - _Requirements: 7.1, 7.2, 7.3, 7.6_
    - _Design: HighScoreStore_

  - [ ]* 12.2 Write unit tests for HighScoreStore load/save
    - Mock `localStorage`; cover existing value, empty default, invalid value → 0, and a throwing `setItem` producing the save-failed signal
    - _Requirements: 7.1, 7.2, 7.3, 7.6_

- [x] 13. Implement the AudioManager shell module
  - [x] 13.1 Implement `src/shell/audioManager.js`
    - `playFlap()` and `playGameOver()` restart the clip from the start
    - Wrap each `play()` so a rejected promise or missing asset is swallowed; game-over plays once per GameOver event
    - _Requirements: 3.5, 3.6, 6.5, 6.6_
    - _Design: AudioManager_

  - [ ]* 13.2 Write unit tests for AudioManager
    - Mock `HTMLAudioElement`; assert clip restart, error tolerance on rejected `play()`, and single game-over playback per event
    - _Requirements: 3.5, 3.6, 6.5, 6.6_

- [x] 14. Implement the Renderer shell module
  - [x] 14.1 Implement `src/shell/renderer.js`
    - Pure read of `GameState` → Canvas 2D draws: sky fill, ≥1 cloud, ground strip, pipes, ghost sprite (or placeholder rect when `spriteLoaded` is false)
    - Draw the `formatScore` text bottom-center while Playing; draw Ready prompt and Game_Over restart prompt with final score + high score; surface `saveFailed` indication
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 7.6, 8.1_
    - _Design: Renderer_

  - [ ]* 14.2 Write unit tests for Renderer draw calls
    - Use a mocked canvas 2D context; assert sky/cloud/ground/pipe draws, sprite vs placeholder branch, score text, and Game_Over prompt with final score
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 8.1_

- [x] 15. Implement the InputController shell module
  - [x] 15.1 Implement `src/shell/inputController.js`
    - Register `keydown`/`keyup` (spacebar), `mousedown`, and `touchstart` on the canvas; queue `FlapIntent`/`RestartIntent` for the next tick
    - Track spacebar state so a held key yields exactly one flap per physical press (queue on `keydown` only when previously up)
    - Expose `drainIntents()` for the loop
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 8.2, 9.4_
    - _Design: InputController_

  - [ ]* 15.2 Write property test for one flap per key press
    - **Property 4: One flap per discrete key press** — flaps produced equal the number of up-to-down transitions in a keydown/keyup sequence
    - **Validates: Requirements 3.2**
    - Tag: `// Feature: flappy-kiro, Property 4: One flap per discrete key press`; min 100 iterations

- [x] 16. Implement the GameLoop shell module
  - [x] 16.1 Implement `src/shell/gameLoop.js`
    - Drive `requestAnimationFrame`; compute `dt` (seconds) and clamp to a max (≈ 0.05s) to prevent tunneling
    - Each tick: drain intents, call `engine.step`, map emitted events to AudioManager/HighScoreStore effects, then `renderer.draw(engine.state)`
    - Pause on `visibilitychange`/`blur`, resume on `focus`/`visible`, resetting the timestamp so no large `dt` accumulates
    - _Requirements: 3.5, 6.5, 7.4, 10.3, 10.5_
    - _Design: GameLoop, Game Loop and Timing_

  - [ ]* 16.2 Write integration tests for loop timing and pause/resume
    - Assert `dt` clamping, event→effect mapping (flap/game-over audio, high-score save), and that stepping stops on simulated `visibilitychange` while state is retained
    - _Requirements: 7.4, 10.5_

- [x] 17. Implement bootstrap and canvas support detection
  - [x] 17.1 Implement `src/shell/bootstrap.js`
    - Detect canvas support (`getContext("2d")` present and non-null); if unsupported, render an "unsupported browser" message and do not start the loop
    - Otherwise: load high score via HighScoreStore, kick off AssetLoader, build the engine in Ready, wire InputController + Renderer + AudioManager, and start the GameLoop
    - _Requirements: 7.1, 9.1, 10.4_
    - _Design: Bootstrap / Canvas support_

  - [ ]* 17.2 Write unit tests for bootstrap wiring and unsupported-canvas path
    - Assert the unsupported-canvas message with no loop start, and that the supported path initializes the engine in Ready and starts the loop
    - _Requirements: 9.1, 10.4_

- [x] 18. Create the HTML entry point and wire the app
  - Create `index.html` with a single `<canvas>` element and a module `<script>` importing/starting `src/shell/bootstrap.js`
  - Reference existing assets at `assets/ghosty.png`, `assets/jump.wav`, `assets/game_over.wav`
  - Ensure all game logic runs client-side with no server dependency
  - _Requirements: 10.1, 10.2_
  - _Design: Architecture, Bootstrap / Canvas support_

- [x] 19. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; core implementation sub-tasks are never marked optional.
- Each task references specific requirements and the design sections/components it implements for traceability.
- Each correctness Property is implemented by a single fast-check property test running a minimum of 100 iterations and tagged `// Feature: flappy-kiro, Property {number}: {property_text}`.
- Checkpoints ensure incremental validation as the domain and shell layers come together.
- Domain modules are tested in Node without a DOM; shell modules use mocked audio/storage/canvas and jsdom where a DOM is required.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "5.1", "6.1", "7.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.2", "3.3", "3.4", "3.5", "4.2", "5.2", "5.3", "5.4", "6.2", "6.3", "7.2"] },
    { "id": 3, "tasks": ["9.1"] },
    { "id": 4, "tasks": ["9.2", "9.3", "9.4", "9.5", "9.6", "9.7"] },
    { "id": 5, "tasks": ["11.1", "12.1", "13.1", "14.1", "15.1", "16.1"] },
    { "id": 6, "tasks": ["11.2", "12.2", "13.2", "14.2", "15.2", "16.2", "17.1"] },
    { "id": 7, "tasks": ["17.2", "18"] }
  ]
}
```
