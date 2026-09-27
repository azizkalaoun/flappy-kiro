// AssetLoader — shell module (impure; browser I/O lives here).
//
// Loads the game's image and audio assets and records per-asset success or
// failure so the Renderer can draw a placeholder sprite (Req 1.5) and the
// AudioManager can no-op when a sound is missing (Req 3.6, 6.6). Loading NEVER
// blocks or fails startup: a failed load resolves (it does not reject) with a
// flag indicating the failure, so bootstrap can carry on regardless (Req 10.4).
//
// Per the architecture standards, all browser I/O (`Image`, `Audio`, load
// events) is confined to the shell; the pure domain never touches these APIs.

/** Paths of the three assets the game ships with. */
export const ASSET_PATHS = {
  sprite: "assets/ghosty.png",
  flapSound: "assets/jump.wav",
  gameOverSound: "assets/game_over.wav",
};

/**
 * Load an image, resolving to the `Image` on success or `null` on failure.
 *
 * Wrapped so that nothing thrown while constructing or wiring up the element
 * can escape: any synchronous error resolves to a failed result rather than
 * rejecting the promise.
 *
 * @param {string} src  the image URL
 * @returns {Promise<{ image: HTMLImageElement | null, loaded: boolean }>}
 */
export function loadImage(src) {
  return new Promise((resolve) => {
    try {
      const image = new Image();
      // `onload`/`onerror` are one-shot: whichever fires first settles the
      // promise. We never reject — a broken asset must not crash startup.
      image.onload = () => resolve({ image, loaded: true });
      image.onerror = () => resolve({ image: null, loaded: false });
      image.src = src;
    } catch {
      resolve({ image: null, loaded: false });
    }
  });
}

/**
 * Load an audio clip, resolving to the `Audio` on success or `null` on failure.
 *
 * Uses the media element's `canplaythrough` event to signal readiness and its
 * `error` event to signal failure. Like `loadImage`, this never rejects and
 * swallows any synchronous construction error.
 *
 * @param {string} src  the audio URL
 * @returns {Promise<{ audio: HTMLAudioElement | null, loaded: boolean }>}
 */
export function loadAudio(src) {
  return new Promise((resolve) => {
    try {
      const audio = new Audio();
      let settled = false;
      const succeed = () => {
        if (settled) return;
        settled = true;
        resolve({ audio, loaded: true });
      };
      const fail = () => {
        if (settled) return;
        settled = true;
        resolve({ audio: null, loaded: false });
      };
      // `canplaythrough` means enough data is buffered to play start to finish.
      // Some browsers only fire it once preload kicks in, so we set preload
      // and also accept `loadeddata` as a readiness signal.
      audio.addEventListener("canplaythrough", succeed, { once: true });
      audio.addEventListener("loadeddata", succeed, { once: true });
      audio.addEventListener("error", fail, { once: true });
      audio.preload = "auto";
      audio.src = src;
      // Kick off buffering. `load()` is a no-op if unsupported.
      if (typeof audio.load === "function") {
        audio.load();
      }
    } catch {
      resolve({ audio: null, loaded: false });
    }
  });
}

/**
 * Load every game asset in parallel and report per-asset outcomes.
 *
 * The returned promise always resolves — never rejects — even if every asset
 * fails, so bootstrap can proceed and the game can degrade gracefully. The
 * shape exposes the loaded handles (or `null`) alongside boolean success flags
 * the Renderer and AudioManager consult before use.
 *
 * @param {{ sprite?: string, flapSound?: string, gameOverSound?: string }} [paths]
 *   optional override of asset paths (defaults to {@link ASSET_PATHS}); handy
 *   for tests.
 * @returns {Promise<{
 *   sprite: HTMLImageElement | null,
 *   spriteLoaded: boolean,
 *   flapSound: HTMLAudioElement | null,
 *   flapLoaded: boolean,
 *   gameOverSound: HTMLAudioElement | null,
 *   gameOverLoaded: boolean,
 * }>}
 */
export async function loadAssets(paths = ASSET_PATHS) {
  const spritePath = paths.sprite ?? ASSET_PATHS.sprite;
  const flapPath = paths.flapSound ?? ASSET_PATHS.flapSound;
  const gameOverPath = paths.gameOverSound ?? ASSET_PATHS.gameOverSound;

  // Load all three concurrently; each sub-load already resolves on failure, so
  // Promise.all here can never reject.
  const [spriteResult, flapResult, gameOverResult] = await Promise.all([
    loadImage(spritePath),
    loadAudio(flapPath),
    loadAudio(gameOverPath),
  ]);

  return {
    sprite: spriteResult.image,
    spriteLoaded: spriteResult.loaded,
    flapSound: flapResult.audio,
    flapLoaded: flapResult.loaded,
    gameOverSound: gameOverResult.audio,
    gameOverLoaded: gameOverResult.loaded,
  };
}
