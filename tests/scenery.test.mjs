// Run with: node --test tests/
// Scenery is presentation only: these tests pin the data contract that
// render.js consumes, and prove scenery selection can never touch gameplay RNG.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  THEMES, LANDSCAPES, THEME_KEYS, LANDSCAPE_KEYS, DEFAULT_ENV,
  pickEnvironment, environmentFromString, resolveEnvironment,
} from '../shared/scenery.js';
import { Game, mulberry32 } from '../air-defense/src/game.js';

const TONES = ['far', 'near', 'ground', 'groundTop', 'water', 'sand', 'snow', 'window', 'structure'];
const PRIMITIVE_KINDS = ['hill', 'peak', 'rect', 'band', 'boat', 'cactus'];

test('pickEnvironment is deterministic for a seeded rng', () => {
  const a = pickEnvironment(mulberry32(42));
  const b = pickEnvironment(mulberry32(42));
  assert.deepEqual(a, b);
  assert.ok(THEME_KEYS.includes(a.theme));
  assert.ok(LANDSCAPE_KEYS.includes(a.landscape));
});

test('pickEnvironment defaults to its own random source (no shared state)', () => {
  const env = pickEnvironment();
  assert.ok(THEME_KEYS.includes(env.theme));
  assert.ok(LANDSCAPE_KEYS.includes(env.landscape));
});

test('pickEnvironment maps rng outputs to theme and landscape buckets', () => {
  // First draw picks the theme (3 equal buckets), second the landscape (4).
  const fixed = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };
  assert.deepEqual(pickEnvironment(fixed(0, 0)), { theme: 'day', landscape: 'city' });
  assert.deepEqual(pickEnvironment(fixed(0.32, 0.24)), { theme: 'day', landscape: 'city' });
  assert.deepEqual(pickEnvironment(fixed(0.34, 0.26)), { theme: 'sunset', landscape: 'mountains' });
  assert.deepEqual(pickEnvironment(fixed(0.66, 0.49)), { theme: 'sunset', landscape: 'mountains' });
  assert.deepEqual(pickEnvironment(fixed(0.67, 0.51)), { theme: 'night', landscape: 'sea' });
  assert.deepEqual(pickEnvironment(fixed(0.999, 0.76)), { theme: 'night', landscape: 'desert' });
  // Every combo is produced by some bucket - reachability by construction.
  const seen = new Set();
  for (let t = 0; t < 3; t++) {
    for (let l = 0; l < 4; l++) {
      const e = pickEnvironment(fixed((t + 0.5) / 3, (l + 0.5) / 4));
      seen.add(`${e.theme}:${e.landscape}`);
    }
  }
  assert.equal(seen.size, THEME_KEYS.length * LANDSCAPE_KEYS.length);
});

test('interleaved scenery picks never perturb a live gameplay rng', () => {
  const g = new Game({ rng: mulberry32(7), halfWidth: 16 });
  const reference = mulberry32(7);
  for (let i = 0; i < 50; i++) {
    pickEnvironment(mulberry32(i)); // seeded scenery rng
    pickEnvironment(); // default Math.random scenery rng
    assert.equal(g.rng(), reference(), `gameplay draw ${i} must match the undisturbed sequence`);
  }
});

test('environmentFromString parses and validates "theme:landscape"', () => {
  assert.deepEqual(environmentFromString('night:city'), { theme: 'night', landscape: 'city' });
  assert.equal(environmentFromString('night'), null);
  assert.equal(environmentFromString('dusk:city'), null);
  assert.equal(environmentFromString('night:plains'), null);
  assert.equal(environmentFromString(''), null);
  assert.equal(environmentFromString(null), null);
});

test('every theme defines the full palette contract', () => {
  for (const key of THEME_KEYS) {
    const t = THEMES[key];
    assert.ok(t, `theme ${key} exists`);
    assert.ok(Array.isArray(t.sky) && t.sky.length === 3, `${key}.sky has 3 gradient stops`);
    for (const c of t.sky) assert.ok(Number.isInteger(c) && c >= 0 && c <= 0xffffff, `${key} sky stop is a hex color`);
    for (const tone of TONES) {
      assert.ok(Number.isInteger(t.tones[tone]), `${key}.tones.${tone} present`);
    }
    assert.ok(Number.isInteger(t.cloud.color) && t.cloud.opacity > 0 && t.cloud.opacity <= 1, `${key}.cloud valid`);
    assert.ok(Number.isInteger(t.ambient.color) && t.ambient.intensity > 0, `${key}.ambient valid`);
    assert.ok(Number.isInteger(t.sun.color) && t.sun.intensity > 0 && Array.isArray(t.sun.position), `${key}.sun valid`);
    if (t.stars) assert.ok(t.starCount > 0, `${key} star count when stars enabled`);
    if (t.disc) {
      assert.ok(Number.isInteger(t.disc.color) && t.disc.r > 0, `${key}.disc valid`);
    }
  }
});

test('night theme is dark blue, not near-black', () => {
  const bottom = THEMES.night.sky[2];
  const blue = bottom & 0xff;
  assert.ok(blue >= 0x60, `night horizon keeps a blue channel (got ${bottom.toString(16)})`);
});

test('every landscape has valid primitives within world bounds', () => {
  for (const key of [...LANDSCAPE_KEYS, DEFAULT_ENV.landscape]) {
    const prims = LANDSCAPES[key];
    assert.ok(Array.isArray(prims) && prims.length > 0, `landscape ${key} non-empty`);
    for (const p of prims) {
      assert.ok(PRIMITIVE_KINDS.includes(p.kind), `${key}: known kind ${p.kind}`);
      if (p.kind !== 'band') {
        assert.ok(typeof p.x === 'number' && Math.abs(p.x) <= 70, `${key}: x in bounds (${p.x})`);
      } else {
        assert.ok(typeof p.y === 'number' && typeof p.h === 'number' && p.h > 0, `${key}: band has y/h`);
      }
      assert.ok(typeof p.z === 'number' && p.z >= -12 && p.z <= -0.5, `${key}: z behind gameplay (${p.z})`);
      if (p.kind !== 'band' && p.kind !== 'boat' && p.kind !== 'cactus') {
        assert.ok(typeof p.w === 'number' && p.w > 0 && typeof p.h === 'number' && p.h > 0, `${key}: ${p.kind} has w/h`);
        assert.ok(p.h <= 14, `${key}: ${p.kind} within camera height`);
      }
      if (p.tone) assert.ok(TONES.includes(p.tone), `${key}: known tone ${p.tone}`);
    }
  }
});

test('all theme x landscape combinations resolve fully', () => {
  for (const theme of THEME_KEYS) {
    for (const landscape of [...LANDSCAPE_KEYS, DEFAULT_ENV.landscape]) {
      const r = resolveEnvironment({ theme, landscape });
      assert.ok(r, `${theme}:${landscape} resolves`);
      assert.equal(r.sky.length, 3);
      for (const tone of TONES) assert.ok(Number.isInteger(r.tones[tone]), `${theme}:${landscape} tone ${tone}`);
      assert.ok(r.primitives.length > 0, `${theme}:${landscape} has primitives`);
      assert.ok(Number.isInteger(r.groundTone) && Number.isInteger(r.groundTopTone), `${theme}:${landscape} ground colors`);
    }
  }
});

test('resolveEnvironment rejects unknown keys', () => {
  assert.equal(resolveEnvironment({ theme: 'dusk', landscape: 'city' }), null);
  assert.equal(resolveEnvironment({ theme: 'day', landscape: 'plains' }), null);
});
