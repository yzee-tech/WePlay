// All tunable numbers live here. World units: y = 0 is the ground surface, the base is at x = 0.
// The camera shows y from camBottom to camTop; the visible width depends on the screen shape.
export const CFG = {
  camBottom: -2,
  camTop: 16,

  base: { x: 0, maxShield: 100, muzzleY: 1.6 },

  // Ships. Words are picked by length range; speed is world units per second.
  // 'damage' is what a ship takes off the shield when it reaches the ground.
  ships: {
    scout: { minLen: 3, maxLen: 4, speed: 1.55, damage: 8, scorePerChar: 10, minHalf: 1.0 },
    cruiser: { minLen: 5, maxLen: 7, speed: 1.05, damage: 14, scorePerChar: 12, minHalf: 1.3 },
    mothership: { minLen: 8, maxLen: 10, speed: 0.72, damage: 22, scorePerChar: 15, minHalf: 1.8 },
    boss: { speed: 0.42, damage: 45, scorePerChar: 20, maxHalf: 7 },
  },
  spawnY: 16.8, // just above the top edge so ships glide in
  hitY: 2.0, // a ship reaching this height hits the base
  laneGap: 0.4, // minimum clear space between ships that spawn close together in time
  spawnRetryDelay: 0.25,

  // Typing metrics (world units per character) are set by the renderer for the current font.
  defaultCharWidth: 0.55,

  // Word labels under the ships: font size in px = clamp(scale * ratio, minPx, maxPx),
  // where scale is px per world unit for the current viewport. Kept large enough to read
  // on a phone while the longest word still fits a narrow portrait screen.
  labelFont: { minPx: 20, maxPx: 34, ratio: 0.75 },

  // Combo: every 10 clean characters in a row adds +1 to the score multiplier, up to maxMultiplier.
  combo: { step: 10, maxMultiplier: 5 },

  // Waves (n starts at 1).
  waves: {
    intermission: 2.6,
    bossEvery: 5,
    cleanWaveBonus: 100, // times wave number, when no ship got through
    sizeBase: 4, sizePerWave: 2, sizeMax: 28,
    intervalStart: 2.8, intervalPerWave: 0.16, intervalMin: 0.9,
    speedPerWave: 0.07, speedMax: 2.4,
    cruiserFromWave: 2, mothershipFromWave: 4,
  },

  // Training: a lesson run is a few short waves, and you unlock the next lesson with enough accuracy.
  training: { waves: 3, passAccuracy: 0.9, sizeBase: 5, sizePerWave: 2, intervalStart: 3.0, intervalPerWave: 0.2, speedMult: 0.8 },

  // Assist: when recent accuracy drops, ships slow down so learners are not crushed.
  assist: { window: 40, fullAt: 0.9, floorAt: 0.6, minFactor: 0.7 },

  // Presentation only.
  scenery: { clouds: { count: 8, minSpeed: 0.004, maxSpeed: 0.012, minY: 8, maxY: 14.5 } },
};
