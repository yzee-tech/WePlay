// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, mulberry32, clampAngle, segmentPointDistance, waveSize, bomberChance } from '../src/game.js';
import { CFG } from '../src/config.js';

const newGame = (seed = 1) => {
  const g = new Game({ rng: mulberry32(seed), halfWidth: 16 });
  g.waveTimer = 999; // no automatic waves unless a test starts one
  return g;
};
const step = (g, seconds) => { for (let t = 0; t < seconds; t += 1 / 60) g.update(1 / 60); };
const addPlane = (g, o = {}) => {
  const p = { id: g.nextId++, type: 'fighter', dir: 1, x: 0, y: 10, vx: 0, hp: 1, radius: 0.9, bombsDropped: 9, bombCd: 99, aimError: 0, ...o };
  g.planes.push(p);
  return p;
};

test('aim angle is clamped to the upper half', () => {
  const g = newGame();
  g.aim(10, -5);
  assert.ok(Math.abs(g.aimAngle - CFG.turret.minAngle) < 1e-9);
  g.aim(-10, -5);
  assert.ok(Math.abs(g.aimAngle - CFG.turret.maxAngle) < 1e-9);
  assert.equal(clampAngle(Math.PI / 2), Math.PI / 2);
});

test('firing respects the cooldown', () => {
  const g = newGame();
  assert.equal(g.fire(0, 10), true);
  assert.equal(g.fire(0, 10), false);
  step(g, CFG.turret.cooldown + 0.05);
  assert.equal(g.fire(0, 10), true);
});

test('a missile hitting a fighter destroys it and scores', () => {
  const g = newGame();
  addPlane(g, { x: 0, y: 10 });
  g.fire(0, 10);
  step(g, 1);
  assert.equal(g.planes.length, 0);
  assert.equal(g.score, CFG.planes.fighter.score);
});

test('a bomber needs two hits', () => {
  const g = newGame();
  addPlane(g, { type: 'bomber', hp: 2, radius: 1.5, x: 0, y: 10 });
  g.fire(0, 10);
  step(g, 1);
  assert.equal(g.planes.length, 1);
  assert.equal(g.planes[0].hp, 1);
  step(g, 0.4);
  g.fire(0, 10);
  step(g, 1);
  assert.equal(g.planes.length, 0);
  assert.equal(g.score, CFG.planes.bomber.score);
});

test('missile detonates at the target point when nothing is hit', () => {
  const g = newGame();
  g.fire(5, 8);
  step(g, 1);
  const ex = g.drainEvents().filter((e) => e.type === 'explosion' && e.kind === 'missile');
  assert.equal(ex.length, 1);
  assert.ok(Math.hypot(ex[0].x - 5, ex[0].y - 8) < 0.7);
});

test('bombs can be shot down and score', () => {
  const g = newGame();
  g.bombs.push({ id: 99, x: 0, y: 8, vx: 0, vy: 0, radius: 0.35, damage: 10 });
  g.fire(0, 8);
  step(g, 0.6);
  assert.equal(g.bombs.length, 0);
  assert.equal(g.score, CFG.bombScore);
  assert.equal(g.health, CFG.turret.maxHealth);
});

test('a bomb landing on the turret damages it; elsewhere it does not', () => {
  const g = newGame();
  g.bombs.push({ id: 1, x: 0.5, y: 0.1, vx: 0, vy: -5, radius: 0.35, damage: 10 });
  g.bombs.push({ id: 2, x: 8, y: 0.1, vx: 0, vy: -5, radius: 0.35, damage: 10 });
  step(g, 0.1);
  assert.equal(g.health, CFG.turret.maxHealth - 10);
  assert.equal(g.bombs.length, 0);
});

test('game over when health reaches zero, and reset restores state', () => {
  const g = newGame();
  g.health = 10;
  g.bombs.push({ id: 1, x: 0, y: 0.1, vx: 0, vy: -5, radius: 0.35, damage: 15 });
  step(g, 0.1);
  assert.equal(g.state, 'gameover');
  assert.ok(g.drainEvents().some((e) => e.type === 'gameOver'));
  g.reset();
  assert.equal(g.state, 'playing');
  assert.equal(g.health, CFG.turret.maxHealth);
  assert.equal(g.score, 0);
});

test('bomb cadence: never more than maxBombs per plane per pass, and spaced apart', () => {
  const g = newGame(7);
  const p = addPlane(g, { type: 'bomber', hp: 2, radius: 1.5, x: -20, y: 9, vx: 4.5, dir: 1, bombsDropped: 0, bombCd: 0, aimError: 0 });
  const times = [];
  for (let t = 0; t < 12; t += 1 / 60) {
    const before = p.bombsDropped;
    g.update(1 / 60);
    if (p.bombsDropped > before) times.push(t);
    g.health = CFG.turret.maxHealth;
  }
  assert.ok(p.bombsDropped >= 1 && p.bombsDropped <= CFG.planes.bomber.maxBombs);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= CFG.bombCooldown - 0.02);
});

test('bombs inherit the plane horizontal velocity', () => {
  const g = newGame();
  addPlane(g, { x: -9, y: 9, vx: 7, dir: 1, bombsDropped: 0, bombCd: 0, aimError: 0 });
  step(g, 3);
  const dropped = g.drainEvents().some((e) => e.type === 'bombDrop');
  assert.ok(dropped);
});

test('wave does not end while planes are queued or alive; ends when all gone', () => {
  const g = new Game({ rng: mulberry32(3), halfWidth: 16 });
  g.waveTimer = 0;
  step(g, 0.1);
  assert.equal(g.wave, 1);
  assert.equal(g.waveActive, true);
  assert.equal(g.queue.length + g.planes.length, waveSize(1));
  g.queue = [];
  g.planes = [];
  step(g, 0.1);
  assert.equal(g.waveActive, false);
  assert.ok(g.drainEvents().some((e) => e.type === 'waveClear'));
});

test('planes that fly off screen are removed and count as done', () => {
  const g = newGame();
  addPlane(g, { x: 18, y: 12, vx: 7, dir: 1 });
  step(g, 2);
  assert.equal(g.planes.length, 0);
});

test('chain reactions are capped', () => {
  const g = newGame();
  for (let i = 0; i < 12; i++) addPlane(g, { x: i * 0.2, y: 10 });
  g.detonate(0, 10);
  assert.ok(g.planes.length >= 12 - 1 - CFG.chain.maxPerDetonation * 12);
  const killed = 12 - g.planes.length;
  assert.ok(killed >= 1 && killed <= 12);
});

test('same seed gives the same game', () => {
  const run = (seed) => {
    const g = new Game({ rng: mulberry32(seed), halfWidth: 16 });
    g.waveTimer = 0;
    step(g, 5);
    return JSON.stringify(g.planes.map((p) => [p.type, p.y.toFixed(3)]));
  };
  assert.equal(run(5), run(5));
});

test('helpers', () => {
  assert.ok(segmentPointDistance(0, 0, 10, 0, 5, 3).dist === 3);
  assert.equal(bomberChance(1), 0);
  assert.ok(bomberChance(99) <= CFG.waves.maxBomberChance);
});
