// Tunable numbers for Stickman Battle: Gunwars. World units are pixels of a 1600x900 arena.
// y grows downward. A platform's y is the walking surface (its top edge).
export const CFG = {
  world: { w: 1600, h: 900, killY: 960 },
  roundSeconds: 60,
  gravity: 2200,
  fighter: {
    w: 22, h: 54, // small stickmen
    runSpeed: 300, airControl: 0.85, accel: 2600,
    jumpSpeed: 780,
    maxHealth: 100,
    fireCooldown: 0.3,
    knock: 90, // small push when hit
  },
  bullet: { speed: 1100, damage: 10, life: 1.2, muzzleX: 18, muzzleY: 36 },
  // 14 small one-way platforms in staggered rows. Every step is a jump the fighters can make.
  // The bottom corners are left empty on purpose: the phone's thumb controls sit there, and the fighters start above them.
  platforms: [
    { x: 800, y: 790, w: 200 },
    { x: 480, y: 670, w: 200 }, { x: 1120, y: 670, w: 200 },
    { x: 150, y: 560, w: 200 }, { x: 800, y: 560, w: 200 }, { x: 1450, y: 560, w: 200 },
    { x: 480, y: 450, w: 200 }, { x: 1120, y: 450, w: 200 },
    { x: 150, y: 340, w: 200 }, { x: 800, y: 340, w: 200 }, { x: 1450, y: 340, w: 200 },
    { x: 470, y: 230, w: 200 }, { x: 1130, y: 230, w: 200 },
    { x: 800, y: 120, w: 200 },
  ],
  spawns: [{ platform: 3 }, { platform: 5 }],
  // Conservative jump reach used only by the layout check: highest rise and widest gap.
  reach: { rise: 125, gap: 130, drop: 400 },
};
