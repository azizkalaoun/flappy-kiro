# Requirements Document

## Introduction

Flappy Kiro is a retro, browser-based endless-scroller game in the style of Flappy Bird. The player guides a ghost character vertically through an endless series of gaps between green pipes that scroll from right to left. Gravity continuously pulls the ghost downward; player input (click, tap, or spacebar) makes the ghost flap upward. The player earns one point for each pipe gap successfully passed. The game ends when the ghost collides with a pipe, the ground, or the ceiling. A high score is persisted across browser sessions. The game runs entirely in the browser using HTML5 Canvas and JavaScript, and reuses existing assets (ghost sprite, flap sound, game-over sound).

## Glossary

- **Game**: The complete Flappy Kiro browser application, including rendering, input handling, physics, scoring, and audio.
- **Ghost**: The player-controlled white character sprite (assets/ghosty.png) whose vertical position the player controls.
- **Pipe_Pair**: A vertically aligned obstacle consisting of one pipe extending down from the top of the play area and one pipe extending up from the bottom, separated by a passable Gap.
- **Gap**: The vertical opening between the top and bottom pipe of a Pipe_Pair through which the Ghost can pass without colliding.
- **Play_Area**: The rectangular region of the canvas where gameplay occurs, bounded by the ceiling (top edge) and the ground (top of the ground strip).
- **Ground**: The dark floor strip rendered at the bottom of the canvas; its top edge is a lower collision boundary.
- **Ceiling**: The top edge of the Play_Area; an upper collision boundary.
- **Flap**: An upward vertical impulse applied to the Ghost in response to player input.
- **Gravity**: The constant downward acceleration continuously applied to the Ghost during active play.
- **Score**: The count of Pipe_Pairs whose Gap the Ghost has fully passed during the current game session.
- **High_Score**: The highest Score achieved across sessions, persisted in browser local storage.
- **Game_State**: The current mode of the Game, one of: Ready, Playing, Game_Over.
- **Local_Storage**: The browser localStorage mechanism used to persist the High_Score.

## Requirements

### Requirement 1: Render the game scene

**User Story:** As a player, I want to see a retro game scene with the ghost, pipes, and background, so that I can visually understand the game world.

#### Acceptance Criteria

1. WHEN the Game is loaded, THE Game SHALL render a light blue sky background filling the entire Play_Area.
2. WHEN the Game is loaded, THE Game SHALL render at least one decorative white rounded cloud shape positioned within the sky background area above the Ground.
3. WHEN the Game is loaded, THE Game SHALL render a dark Ground strip spanning the full width of the canvas along its bottom edge.
4. WHEN the Game is loaded, THE Game SHALL render the Ghost using the assets/ghosty.png sprite within the Play_Area.
5. IF the assets/ghosty.png sprite fails to load, THEN THE Game SHALL render the Ghost as a solid-color placeholder shape at the Ghost position and continue rendering the scene.
6. THE Game SHALL render each Pipe_Pair as one green pipe extending downward from the Ceiling and one green pipe extending upward from the Ground, vertically separated by a Gap of fixed height.
7. WHILE the Game_State is Playing, THE Game SHALL render the current Score and High_Score at the bottom center of the canvas in the exact format "Score: {score} | High: {high}", where {score} is the current Score value and {high} is the High_Score value.

### Requirement 2: Apply gravity to the ghost

**User Story:** As a player, I want the ghost to constantly fall, so that the game presents a continuous challenge.

#### Acceptance Criteria

1. WHILE the Game_State is Playing, THE Game SHALL add a single constant, deterministic downward Gravity acceleration value to the Ghost vertical velocity on every frame update.
2. WHILE the Game_State is Playing, THE Game SHALL, on each frame update, first update the Ghost vertical velocity by the Gravity acceleration and then update the Ghost vertical position by the resulting vertical velocity.
3. WHEN the Game_State transitions to Playing at the start of a new session, THE Game SHALL set the Ghost vertical velocity to zero.
4. WHILE the Game_State is Playing, IF the Ghost downward vertical velocity would exceed a defined maximum fall velocity, THEN THE Game SHALL limit the Ghost vertical velocity to that maximum fall velocity.

### Requirement 3: Flap on player input

**User Story:** As a player, I want the ghost to flap upward when I press a key, click, or tap, so that I can control its height.

#### Acceptance Criteria

1. WHILE the Game_State is Playing, WHEN the player presses the spacebar, THE Game SHALL set the Ghost vertical velocity to a fixed upward value that produces immediate upward motion.
2. WHILE the Game_State is Playing, WHILE the spacebar is held down, THE Game SHALL apply no more than one Flap per discrete key press.
3. WHILE the Game_State is Playing, WHEN the player clicks the mouse within the canvas, THE Game SHALL set the Ghost vertical velocity to the same fixed upward value used for the spacebar.
4. WHILE the Game_State is Playing, WHEN the player performs a touch tap on the canvas, THE Game SHALL set the Ghost vertical velocity to the same fixed upward value used for the spacebar.
5. WHEN a Flap impulse is applied to the Ghost, THE Game SHALL play the assets/jump.wav sound effect from its start.
6. IF the assets/jump.wav sound effect fails to play or is blocked by the browser when a Flap impulse is applied, THEN THE Game SHALL continue applying the Flap impulse without interrupting gameplay.

### Requirement 4: Scroll pipes endlessly

**User Story:** As a player, I want pipes to continuously scroll toward me, so that the game is an endless scroller.

#### Acceptance Criteria

1. WHILE the Game_State is Playing, THE Game SHALL move each Pipe_Pair horizontally from right to left at a constant scroll speed between 100 and 300 pixels per second, independent of frame rate.
2. WHILE the Game_State is Playing, WHEN the rightmost edge of a Pipe_Pair has crossed the left edge of the canvas by 1 or more pixels, THE Game SHALL remove that Pipe_Pair from the scene.
3. WHILE the Game_State is Playing, THE Game SHALL generate new Pipe_Pairs entering from the right edge with a horizontal spacing between 200 and 400 pixels such that at least one Pipe_Pair is always present or approaching within the Play_Area.
4. WHEN a Pipe_Pair is generated, THE Game SHALL set the vertical position of its Gap to a uniformly randomized value that keeps the entire Gap, including a margin of at least 20 pixels, within the Play_Area boundaries.
5. WHEN a Pipe_Pair is generated, THE Game SHALL set the Gap height to between 2.5 and 4 times the Ghost height so the Ghost can pass through without collision.

### Requirement 5: Score when passing a pipe gap

**User Story:** As a player, I want my score to increase when I pass through a pipe gap, so that I can measure my progress.

#### Acceptance Criteria

1. WHILE the Game_State is Playing, WHEN the Ghost passes the trailing edge of a Pipe_Pair without having collided with that Pipe_Pair, THE Game SHALL increase the Score by exactly 1 within 100 milliseconds of the pass event.
2. WHILE the Game_State is Playing, WHEN a Pipe_Pair has already been counted toward the Score, THE Game SHALL NOT further increase the Score for that same Pipe_Pair.
3. WHEN the Game_State transitions to Playing at the start of a new session, THE Game SHALL set the Score to the integer value 0.
4. WHILE the Game_State is Playing, IF the Ghost collides with a Pipe_Pair before passing its trailing edge, THEN THE Game SHALL NOT increase the Score for that Pipe_Pair.
5. THE Game SHALL constrain the Score to an integer between 0 and 999,999 inclusive.

### Requirement 6: Detect collisions and end the game

**User Story:** As a player, I want the game to end when the ghost hits a pipe, the ground, or the ceiling, so that there is a fail condition.

#### Acceptance Criteria

1. WHILE the Game_State is Playing, IF the Ghost bounding box overlaps the bounding box of any pipe within a Pipe_Pair by 1 or more pixels, THEN THE Game SHALL transition the Game_State to Game_Over.
2. WHILE the Game_State is Playing, IF the bottom edge of the Ghost bounding box is at or below the top edge of the Ground, THEN THE Game SHALL transition the Game_State to Game_Over.
3. WHILE the Game_State is Playing, IF the top edge of the Ghost bounding box is at or above the Ceiling, THEN THE Game SHALL transition the Game_State to Game_Over.
4. WHILE the Game_State is Playing, THE Game SHALL evaluate the collision conditions in criteria 1 through 3 once per rendered animation frame.
5. WHEN the Game_State transitions to Game_Over, THE Game SHALL play the assets/game_over.wav sound effect exactly once.
6. IF the assets/game_over.wav sound effect fails to play when the Game_State transitions to Game_Over, THEN THE Game SHALL continue the transition to Game_Over without interrupting gameplay termination.
7. WHEN the Game_State transitions to Game_Over, THE Game SHALL stop applying Gravity to the Ghost.
8. WHEN the Game_State transitions to Game_Over, THE Game SHALL stop scrolling all Pipe_Pairs.

### Requirement 7: Persist the high score

**User Story:** As a player, I want my best score to be remembered between sessions, so that I can try to beat it over time.

#### Acceptance Criteria

1. WHEN the Game starts and a High_Score value exists in Local_Storage, THE Game SHALL load the High_Score from Local_Storage within 500 milliseconds of initialization and display it to the player.
2. IF no High_Score exists in Local_Storage when the Game starts, THEN THE Game SHALL set the High_Score to 0 and display it to the player.
3. IF the High_Score value in Local_Storage is missing, non-numeric, negative, or otherwise cannot be parsed as an integer between 0 and 999,999,999 inclusive when the Game starts, THEN THE Game SHALL set the High_Score to 0 without terminating and display it to the player.
4. WHEN the Game_State transitions to Game_Over and the Score is greater than the High_Score, THE Game SHALL set the High_Score to the Score and save the High_Score to Local_Storage.
5. WHEN the Game_State transitions to Game_Over and the Score is less than or equal to the High_Score, THE Game SHALL retain the existing High_Score without writing to Local_Storage.
6. IF saving the High_Score to Local_Storage fails when the Game_State transitions to Game_Over, THEN THE Game SHALL retain the current in-session High_Score value, continue running without terminating, and provide an indication to the player that the score could not be saved.

### Requirement 8: Restart after game over

**User Story:** As a player, I want to restart after losing, so that I can play again without reloading the page.

#### Acceptance Criteria

1. WHILE the Game_State is Game_Over, THE Game SHALL display a restart prompt indicating that a Flap input (spacebar, mouse click, or touch tap) restarts the Game, together with the final Score and the High_Score.
2. WHILE the Game_State is Game_Over, WHEN the player provides a restart input (spacebar press, mouse click within the canvas, or touch tap on the canvas), THE Game SHALL reset the Ghost to the same start position and vertical velocity used when the Game_State is Ready, clear all Pipe_Pairs from the scene, set the Score to 0, and transition the Game_State to Playing.
3. WHILE the Game_State is Game_Over, IF a restart input occurs within 500 milliseconds of the transition into Game_Over, THEN THE Game SHALL ignore that input and remain in the Game_Over state.

### Requirement 9: Start the game

**User Story:** As a player, I want a clear starting state, so that I can begin playing when ready.

#### Acceptance Criteria

1. WHEN the Game finishes loading in the browser, THE Game SHALL set the Game_State to Ready.
2. WHILE the Game_State is Ready, THE Game SHALL display the Ghost horizontally and vertically centered within the Play_Area with zero vertical velocity.
3. WHILE the Game_State is Ready, THE Game SHALL keep the Ghost stationary by not applying Gravity and not scrolling Pipe_Pairs.
4. WHILE the Game_State is Ready, WHEN the player presses the spacebar, clicks the mouse within the canvas, or performs a touch tap on the canvas, THE Game SHALL transition the Game_State to Playing and apply an upward Flap impulse to the Ghost.

### Requirement 10: Run in the browser

**User Story:** As a player, I want to play in my web browser, so that no installation is required.

#### Acceptance Criteria

1. THE Game SHALL render all gameplay visuals on a single HTML5 Canvas element.
2. THE Game SHALL execute all game logic in JavaScript running entirely within the browser with no dependency on server-side execution during gameplay.
3. WHILE the Game_State is Playing, THE Game SHALL run a continuous animation loop that updates and renders the scene at a minimum of 30 frames per second.
4. WHEN the Game is loaded in a browser that does not support the HTML5 Canvas element, THE Game SHALL display a message indicating that the browser is unsupported and SHALL not attempt to start gameplay.
5. WHILE the Game_State is Playing, IF the browser tab loses focus or becomes hidden, THEN THE Game SHALL pause the animation loop and retain the current game state until focus is restored.
