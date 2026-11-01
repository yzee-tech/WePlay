// All tunable numbers live here. World units: y = 0 is the ground surface, turret at x = 0.
export const CFG = {
  camBottom: -2,
  camTop: 16,

  turret: {
    x: 0,
    pivotY: 0.9,
    barrelLength: 1.9,
    hitRadius: 1.7,
    maxHealth: 100,
    cooldown: 0.35,
    minAngle: (5 * Math.PI) / 180,
    maxAngle: (175 * Math.PI) / 180,
    lowHealthFraction: 0.3,
  },

  missile: { speed: 30, blastRadius: 2.4, maxLife: 3, hitPadding: 0.25 },

  // Blast from a destroyed plane (chain reactions).
  chain: { radius: 1.6, maxPerDetonation: 5 },

  gravity: 12,
  bombCooldown: 0.8,
  bombScore: 25,

  planes: {
    fighter: { speed: 7, hp: 1, radius: 0.9, score: 100, maxBombs: 1, bombDamage: 10, bombRadius: 0.35, dropTolerance: 1.5 },
    bomber: { speed: 4.5, hp: 2, radius: 1.5, score: 250, maxBombs: 3, bombDamage: 15, bombRadius: 0.5, dropTolerance: 5 },
  },
  planeMinY: 7.5,
  planeMaxY: 14.5,
  aimJitter: 2, // random error (world units) in where a plane thinks the bomb will land

  waves: {
    firstDelay: 1.2,
    betweenDelay: 2.5,
    baseCount: 4,
    countPerWave: 2,
    baseInterval: 2.0,
    intervalDrop: 0.12,
    minInterval: 0.5,
    speedPerWave: 0.05,
    bomberChancePerWave: 0.1,
    maxBomberChance: 0.5,
  },
};
