// Run with: node --test tests/
// Random per-round layouts for PR 9: every roll must be fully jumpable and fair to start on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomLayout, LAYOUT_ROWS } from '../stickman-gunwars/src/layout.js';
import { mulberry32, platformsReachable } from '../stickman-gunwars/src/game.js';

test('randomLayout is deterministic for a seeded rng', () => {
  const a = randomLayout(mulberry32(7));
  const b = randomLayout(mulberry32(7));
  assert.deepEqual(a, b);
});

test('two rolls differ', () => {
  const a = randomLayout(mulberry32(1));
  const b = randomLayout(mulberry32(2));
  assert.notDeepEqual(a.platforms, b.platforms);
});

test('every roll is reachable, fair and unchanged in size/spacing (200 seeds)', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const { platforms, spawns } = randomLayout(mulberry32(seed));
    assert.equal(spawns.length, 2, `seed ${seed}: two spawns`);
    const [sa, sb] = spawns.map((i) => platforms[i]);
    assert.ok(sa && sb, `seed ${seed}: spawn indices valid`);
    assert.equal(sa.y, sb.y, `seed ${seed}: both fighters start at the same height`);
    assert.ok(Math.abs(sa.x - sb.x) >= 400, `seed ${seed}: spawns never point-blank`);
    for (const p of platforms) {
      assert.equal(p.w, 200, `seed ${seed}: platform width unchanged`);
      assert.ok(LAYOUT_ROWS.includes(p.y), `seed ${seed}: platform on a standard row`);
      assert.ok(p.x - p.w / 2 >= 0 && p.x + p.w / 2 <= 1600, `seed ${seed}: inside the arena`);
    }
    assert.ok(platforms.length >= 12 && platforms.length <= 20, `seed ${seed}: sensible count (${platforms.length})`);
    assert.ok(platformsReachable(platforms, spawns[0]), `seed ${seed}: reachable from spawn 0`);
    assert.ok(platformsReachable(platforms, spawns[1]), `seed ${seed}: reachable from spawn 1`);
  }
});
