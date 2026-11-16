// Random per-round arena layouts for Stickman Battle: Gunwars.
// Same platform size and row spacing as the classic fixed layout; only positions change.
// A roll is kept only when every platform is jumpable from both spawn platforms.
import { CFG } from './config.js';
import { platformsReachable } from './game.js';

export const LAYOUT_ROWS = [790, 670, 560, 450, 340, 230, 120];

/** Roll a layout: { platforms: [{x,y,w}...], spawns: [platformIndex, platformIndex] }. */
export function randomLayout(rng = Math.random) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const platforms = [{ x: 800, y: 790, w: 200 }]; // the bottom floor, as in the classic layout
    for (const y of LAYOUT_ROWS.slice(1, -1)) {
      const n = rng() < 0.45 ? 3 : 2; // 2-3 per row
      const xs = [];
      for (let k = 0; k < n; k++) {
        for (let t = 0; t < 25; t++) {
          const x = 110 + rng() * 1380; // anywhere across the arena
          if (xs.every((o) => Math.abs(o - x) >= 250)) { xs.push(x); break; }
        }
      }
      for (const x of xs) platforms.push({ x: Math.round(x), y, w: 200 });
    }
    platforms.push({ x: 800, y: 120, w: 200 }); // the top platform, as in the classic layout
    // Spawns: two platforms on the same middle row, at least 400px apart.
    const spawnRow = [560, 450, 340][Math.floor(rng() * 3)];
    const idx = platforms.map((p, i) => ({ p, i })).filter(({ p }) => p.y === spawnRow);
    if (idx.length < 2) continue;
    const a = idx[Math.floor(rng() * idx.length)];
    const rest = idx.filter((o) => Math.abs(o.p.x - a.p.x) >= 400);
    if (!rest.length) continue;
    const b = rest[Math.floor(rng() * rest.length)];
    if (platformsReachable(platforms, a.i) && platformsReachable(platforms, b.i)) {
      return { platforms, spawns: [a.i, b.i] };
    }
  }
  // Practically unreachable; keep the classic layout rather than fail a round.
  return { platforms: CFG.platforms, spawns: CFG.spawns.map((s) => s.platform) };
}
