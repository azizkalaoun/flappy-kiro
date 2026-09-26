# Ghosty Character Sprite Specifications

Character sprite specifications for the ghost character in Flappy Kiro.

## Sprite Dimensions

- **Frame size:** 32 x 32 pixels
- **Format:** PNG with transparency (alpha channel)
- **Source asset:** `assets/ghosty.png`
- **Alignment:** Character centered within the 32 x 32 frame, with a 2px transparent margin on all sides to prevent edge clipping during rotation/scaling

## Hitbox

- **Shape:** Circle
- **Radius:** 12 pixels
- **Center:** Center of the 32 x 32 frame (16, 16)
- **Rationale:** A 12px radius (24px diameter) sits inside the 32px frame, leaving a forgiving ~4px margin from the sprite edge so collisions feel fair rather than punishing on the transparent corners.

## Animation States

All animations share the 32 x 32 frame size and are laid out horizontally in a sprite sheet, left to right.

### Idle

The resting/hover state shown while the game is in the Ready state and between flaps.

- **Frames:** 2
- **Frame order:** 0, 1
- **Frame duration:** 250 ms per frame (4 fps)
- **Loop:** Yes (ping-pong: 0 → 1 → 0 …)
- **Description:** Subtle vertical bob and a slow blink to give the ghost life while stationary.

### Flap

Triggered on each upward flap impulse (spacebar / click / tap).

- **Frames:** 3
- **Frame order:** 2, 3, 4
- **Frame duration:** 60 ms per frame (~16 fps)
- **Loop:** No (plays once per flap, then returns to Idle)
- **Description:** Ghost squashes slightly, then stretches upward as it gains vertical velocity, tail trailing behind.

### Death

Triggered when the game transitions to Game Over (collision with pipe, ground, or ceiling).

- **Frames:** 4
- **Frame order:** 5, 6, 7, 8
- **Frame duration:** 100 ms per frame (10 fps)
- **Loop:** No (plays once, holds on the final frame)
- **Description:** Ghost recoils, eyes turn to X's, fades toward semi-transparent, and spins slightly as it drops.

## Sprite Sheet Layout

| Frame Index | State | Notes                    |
|-------------|-------|--------------------------|
| 0           | Idle  | Neutral hover            |
| 1           | Idle  | Bob / blink              |
| 2           | Flap  | Squash (wind-up)         |
| 3           | Flap  | Stretch (rising)         |
| 4           | Flap  | Recover                  |
| 5           | Death | Recoil                   |
| 6           | Death | X eyes                   |
| 7           | Death | Fade + spin              |
| 8           | Death | Final rest frame         |

- **Sheet dimensions:** 288 x 32 px (9 frames x 32px wide)
- **Frame extraction:** `sourceX = frameIndex * 32`, `sourceY = 0`, width/height = 32

## Summary

| Property        | Value            |
|-----------------|------------------|
| Sprite size     | 32 x 32 px       |
| Hitbox radius   | 12 px            |
| Idle frames     | 2                |
| Flap frames     | 3                |
| Death frames    | 4                |
| Total frames    | 9                |
