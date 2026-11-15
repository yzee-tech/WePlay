// Small pure helpers for the HUD and pause rules (kept apart from the DOM so tests can run them).

// Whole seconds, rounded up: 60 -> "1:00", 59.2 -> "1:00", 58.9 -> "0:59", 0 -> "0:00".
export function formatTime(secondsLeft) {
  const s = Math.max(0, Math.ceil(secondsLeft));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Can the player pause right now? Not before the first round, not once the round is over.
export function canPause({ running, state, paused }) {
  return running && state === 'playing' && !paused;
}

// P / Esc: toggles pause during a round, does nothing once the round is over.
export function nextPausedOnKey({ running, state, paused }) {
  if (!running || state !== 'playing') return paused;
  return !paused;
}

// Tab hidden or phone turned to portrait: pause (never resume by itself).
export function shouldAutoPause({ running, state, paused, hidden, portrait }) {
  return running && state === 'playing' && !paused && (hidden || portrait);
}
