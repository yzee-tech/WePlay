// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, mulberry32, platformsReachable } from '../stickman-gunwars/src/game.js';
import { CFG } from '../stickman-gunwars/src/config.js';

const newGame = () => new Game({ rng: mulberry32(1) });
const step = (g, seconds) => { for (let t = 0; t < seconds - 1e-9; t += 1 / 60) g.update(1 / 60); };
const idle = { move: 0, jump: false, fire: false, aim: null };
// Put a fighter at a spot with nothing under it so tests control the setup.
const place = (f, x, y) => { f.x = x; f.y = y; f.vx = 0; f.vy = 0; f.onGround = false; };

test('both fighters start alive on platforms, round in progress', () => {
  const g = newGame();
  step(g, 0.5);
  assert.equal(g.state, 'playing');
  for (const f of g.fighters) {
    assert.equal(f.alive, true);
    assert.equal(f.onGround, true);
    assert.equal(f.health, CFG.fighter.maxHealth);
  }
  assert.ok(g.fighters[0].x < g.fighters[1].x);
});

test('gravity pulls a fighter down onto a platform and stops there', () => {
  const g = newGame();
  const p = CFG.platforms[0];
  const f = g.fighters[0];
  place(f, p.x, p.y - 100);
  step(g, 1);
  assert.equal(f.onGround, true);
  assert.ok(Math.abs(f.y - p.y) < 0.5);
});

test('moving left and right changes x and facing', () => {
  const g = newGame();
  const f = g.fighters[0];
  const x0 = f.x;
  g.setInput(0, { ...idle, move: 1 });
  step(g, 0.3);
  assert.ok(f.x > x0 + 50);
  assert.equal(f.facing, 1);
  g.setInput(0, { ...idle, move: -1 });
  step(g, 0.6);
  assert.equal(f.facing, -1);
});

test('jump only works from the ground and rises', () => {
  const g = newGame();
  const f = g.fighters[0];
  step(g, 0.3);
  const y0 = f.y;
  g.setInput(0, { ...idle, jump: true });
  step(g, 0.2);
  assert.ok(f.y < y0 - 40, 'rose');
  assert.equal(f.onGround, false);
  // jumping again in the air does nothing extra
  const vy = f.vy;
  g.setInput(0, { ...idle, jump: true });
  g.update(1 / 60);
  assert.ok(f.vy >= vy, 'no double jump');
});

test('platforms are one-way: you can jump up through them and land on top', () => {
  const g = newGame();
  const f = g.fighters[0];
  const p = CFG.platforms.find((q) => q.y === 670); // row B
  place(f, p.x, p.y + 80); // just under it
  f.vy = -CFG.fighter.jumpSpeed;
  step(g, 0.25);
  assert.ok(f.y < p.y + 80, 'passed upward, not blocked');
  step(g, 1.5);
  assert.equal(f.onGround, true);
});

test('firing creates a bullet along the aim angle and respects the cooldown', () => {
  const g = newGame();
  step(g, 0.3);
  g.setInput(0, { ...idle, fire: true, aim: 0 });
  g.update(1 / 60);
  assert.equal(g.bullets.length, 1);
  assert.ok(g.bullets[0].vx > 0 && Math.abs(g.bullets[0].vy) < 1e-6);
  g.update(1 / 60);
  assert.equal(g.bullets.length, 1, 'cooldown blocks a second shot');
  step(g, CFG.fighter.fireCooldown + 0.05);
  assert.ok(g.bullets.length >= 2);
});

test('aim straight up sends the bullet up and faces the aim side', () => {
  const g = newGame();
  step(g, 0.3);
  g.setInput(0, { ...idle, fire: true, aim: -Math.PI / 2 + 0.01 });
  g.update(1 / 60);
  assert.ok(g.bullets[0].vy < -CFG.bullet.speed * 0.9);
});

test('a bullet hits the other fighter: damage, bullet removed', () => {
  const g = newGame();
  const [a, b] = g.fighters;
  const p = CFG.platforms[0];
  place(a, p.x, p.y); place(b, p.x + 90, p.y);
  step(g, 0.2);
  g.setInput(0, { ...idle, fire: true, aim: 0 });
  step(g, 0.5);
  assert.ok(b.health < CFG.fighter.maxHealth);
  assert.equal(a.health, CFG.fighter.maxHealth);
});

test('your own bullet never hurts you', () => {
  const g = newGame();
  const a = g.fighters[0];
  step(g, 0.3);
  g.setInput(0, { ...idle, fire: true, aim: Math.PI }); // fire left, away from the opponent
  step(g, 1);
  assert.equal(a.health, CFG.fighter.maxHealth);
});

test('bullets expire after their lifetime', () => {
  const g = newGame();
  step(g, 0.3);
  g.setInput(0, { ...idle, fire: true, aim: -Math.PI / 2 });
  g.update(1 / 60);
  g.setInput(0, idle);
  step(g, CFG.bullet.life + 0.2);
  assert.equal(g.bullets.length, 0);
});

test('falling off the bottom loses the round for the faller', () => {
  const g = newGame();
  const f = g.fighters[0];
  place(f, 800, 600); // between platform columns, free fall
  f.x = 5; f.y = 880; // left of everything
  step(g, 2);
  assert.equal(g.state, 'over');
  assert.equal(g.winner, 1);
  assert.equal(g.reason, 'fall');
});

test('health reaching zero loses the round', () => {
  const g = newGame();
  const [a, b] = g.fighters;
  const p = CFG.platforms[0];
  place(a, p.x, p.y); place(b, p.x + 90, p.y);
  b.health = CFG.bullet.damage;
  step(g, 0.2);
  g.setInput(0, { ...idle, fire: true, aim: 0 });
  step(g, 0.5);
  assert.equal(g.state, 'over');
  assert.equal(g.winner, 0);
  assert.equal(g.reason, 'health');
});

test('timer runs out: more health wins, equal health is a draw', () => {
  let g = newGame();
  g.fighters[1].health = 50;
  step(g, CFG.roundSeconds + 0.5);
  assert.equal(g.state, 'over');
  assert.equal(g.winner, 0);
  assert.equal(g.reason, 'time');
  g = newGame();
  step(g, CFG.roundSeconds + 0.5);
  assert.equal(g.winner, -1);
});

test('input is ignored after the round is over', () => {
  const g = newGame();
  g.fighters[0].health = 0;
  step(g, 0.1);
  assert.equal(g.state, 'over');
  const x = g.fighters[1].x;
  g.setInput(1, { ...idle, move: 1, fire: true, aim: 0 });
  step(g, 0.5);
  assert.equal(g.bullets.length, 0);
  assert.ok(Math.abs(g.fighters[1].x - x) < 1);
});

test('reset starts a fresh round', () => {
  const g = newGame();
  g.fighters[0].health = 0;
  step(g, 0.1);
  g.reset();
  assert.equal(g.state, 'playing');
  assert.equal(g.fighters[0].health, CFG.fighter.maxHealth);
  assert.equal(g.bullets.length, 0);
});

test('game events are reported for sound and effects, then cleared', () => {
  const g = newGame();
  step(g, 0.3);
  g.setInput(0, { ...idle, fire: true, aim: 0 });
  g.update(1 / 60);
  assert.ok(g.takeEvents().some((e) => e.type === 'shoot'));
  assert.equal(g.takeEvents().length, 0);
});

test('arena layout: many small platforms, inside the world, all reachable by jumping', () => {
  assert.ok(CFG.platforms.length >= 14);
  for (const p of CFG.platforms) {
    assert.ok(p.x - p.w / 2 >= 0 && p.x + p.w / 2 <= CFG.world.w, 'inside width');
    assert.ok(p.y > 0 && p.y < CFG.world.h);
    assert.ok(p.w <= 240, 'small');
  }
  assert.ok(platformsReachable(CFG.platforms, CFG.spawns[0].platform));
  assert.equal(platformsReachable([{ x: 100, y: 800, w: 200 }, { x: 1400, y: 300, w: 200 }], 0), false);
});

test('both spawn platforms exist and are apart', () => {
  const [s0, s1] = CFG.spawns;
  assert.ok(CFG.platforms[s0.platform] && CFG.platforms[s1.platform]);
  assert.ok(Math.abs(CFG.platforms[s0.platform].x - CFG.platforms[s1.platform].x) > 800);
});

test('real physics: every upward step the layout relies on can be jumped', () => {
  const P = CFG.platforms, R = CFG.reach;
  let checked = 0;
  for (const a of P) for (const b of P) {
    if (a === b) continue;
    const gap = Math.max(0, Math.abs(a.x - b.x) - (a.w + b.w) / 2);
    const rise = a.y - b.y;
    if (rise <= 0 || rise > R.rise || gap > R.gap) continue;
    checked++;
    const dir = b.x > a.x ? 1 : -1;
    let landed = false;
    // try jumping after running 0..N frames from the platform's far edge toward b
    for (let run = 0; run < 90 && !landed; run++) {
      const g = newGame();
      const f = g.fighters[0];
      place(f, a.x - dir * (a.w / 2 - 10), a.y);
      g.setInput(0, { ...idle, move: dir });
      for (let i = 0; i < run; i++) g.update(1 / 60);
      if (!f.onGround) continue;
      g.setInput(0, { ...idle, move: dir, jump: true });
      for (let i = 0; i < 120 && !landed; i++) {
        g.update(1 / 60);
        g.setInput(0, { ...idle, move: dir });
        if (f.onGround && Math.abs(f.y - b.y) < 0.5 && Math.abs(f.x - b.x) <= b.w / 2) landed = true;
      }
    }
    assert.ok(landed, `cannot jump from (${a.x},${a.y}) to (${b.x},${b.y})`);
  }
  assert.ok(checked > 10);
});
