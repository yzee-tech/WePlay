// Run with: node --test tests/
// PR 9 jump forgiveness: coyote time (jump still works just after leaving an edge)
// and jump buffering (a press just before landing still jumps), plus per-round layouts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, mulberry32 } from '../stickman-gunwars/src/game.js';
import { CFG } from '../stickman-gunwars/src/config.js';

const step = (g, seconds) => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) g.update(1 / 60); };
const idle = { move: 0, jump: false, fire: false, aim: null };

// Two ledges with open air below fighter 0, plus a low catch platform for the buffer test.
const layout = {
  platforms: [
    { x: 400, y: 500, w: 200 },
    { x: 1100, y: 500, w: 200 },
    { x: 430, y: 850, w: 300 },
  ],
  spawns: [0, 1],
};
const newGame = () => new Game({ rng: mulberry32(1), layout });

test('fighters spawn on the layout passed to the game', () => {
  const g = newGame();
  step(g, 0.3);
  assert.ok(Math.abs(g.fighters[0].x - 400) < 1 && Math.abs(g.fighters[0].y - 500) < 1);
  assert.ok(Math.abs(g.fighters[1].x - 1100) < 1 && Math.abs(g.fighters[1].y - 500) < 1);
});

test('a game without a layout uses the classic fixed platforms', () => {
  const g = new Game({ rng: mulberry32(1) });
  step(g, 0.3);
  const spawnA = CFG.platforms[CFG.spawns[0].platform];
  assert.ok(Math.abs(g.fighters[0].x - spawnA.x) < 1);
});

test('a normal jump still works standing on a platform', () => {
  const g = newGame();
  step(g, 0.3);
  g.setInput(0, { ...idle, jump: true });
  g.update(1 / 60);
  assert.ok(g.fighters[0].vy < 0, 'jump should launch upward');
});

test('coyote time: a jump just after running off an edge still works', () => {
  const g = newGame();
  const f = g.fighters[0];
  step(g, 0.3); // settle
  g.setInput(0, { ...idle, move: 1 });
  let airborneFor = null;
  for (let t = 0; t < 1.5; t += 1 / 60) {
    g.update(1 / 60);
    if (!f.onGround) { airborneFor = 0; break; }
  }
  assert.notEqual(airborneFor, null, 'fighter should run off the edge');
  g.setInput(0, idle);
  step(g, 0.05); // 50ms past the edge, inside the grace window
  g.setInput(0, { ...idle, jump: true });
  g.update(1 / 60);
  assert.ok(f.vy < 0, 'jump within the grace window should fire');
});

test('no coyote jump long after the edge', () => {
  const g = newGame();
  const f = g.fighters[0];
  step(g, 0.3);
  g.setInput(0, { ...idle, move: 1 });
  for (let t = 0; t < 1.5; t += 1 / 60) { g.update(1 / 60); if (!f.onGround) break; }
  g.setInput(0, idle);
  step(g, 0.25); // well past the grace window
  const vyBefore = f.vy;
  g.setInput(0, { ...idle, jump: true });
  g.update(1 / 60);
  assert.ok(f.vy > 0 && f.vy >= vyBefore, 'a late press must not jump in mid-air');
});

test('jump buffer: a press just before landing jumps on touchdown', () => {
  const g = newGame();
  const f = g.fighters[0];
  step(g, 0.3);
  // Drop the fighter above the low catch platform, falling fast.
  f.x = 430; f.y = 700; f.vx = 0; f.vy = 400; f.onGround = false;
  // Press and release jump mid-fall, a moment before touchdown (inside the buffer).
  let pressed = false;
  let jumped = false;
  for (let t = 0; t < 1; t += 1 / 60) {
    if (!pressed && f.y > 780) { g.setInput(0, { ...idle, jump: true }); pressed = true; }
    else if (pressed) g.setInput(0, idle);
    g.update(1 / 60);
    if (f.vy < 0) { jumped = true; break; }
  }
  assert.ok(pressed, 'the mid-air press happened');
  assert.ok(jumped, 'the buffered press should jump right after landing');
});
