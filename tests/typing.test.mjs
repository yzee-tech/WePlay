// Run with: node --test tests/typing.test.mjs
// Alien Invasion rules, words, stats, lessons, input decoding and deploy wiring. No DOM, no canvas.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CFG } from '../alien-invasion/src/config.js';
import {
  Game, mulberry32, waveSize, waveInterval, waveSpeedMultiplier, isBossWave, shipMix, pickShipType,
} from '../alien-invasion/src/game.js';
import {
  WORDS, BOSS_SENTENCES, LESSONS, WordSource, wordsForKeys, drillWord,
} from '../alien-invasion/src/words.js';
import { Stats, Progress, computeWpm, computeAccuracy, assistFactor } from '../alien-invasion/src/stats.js';
import { diffText, InputDecoder } from '../alien-invasion/src/input.js';
import { labelFontPx } from '../alien-invasion/src/render.js';
import { THEME_KEYS, LANDSCAPE_KEYS } from '../shared/scenery.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// A game with a fixed word list and one ship placed by hand, so tests control exactly what is on screen.
function gameWith(ships, opts = {}) {
  const g = new Game({ rng: mulberry32(1), halfWidth: 12, ...opts });
  g.state = 'playing';
  g.wave = 1;
  g.queue = []; // nothing spawns on its own
  g.ships = ships.map((s, i) => ({
    id: i + 1, type: s.type || 'scout', word: s.word, typed: 0, x: s.x ?? 0, y: s.y ?? 10, half: s.half ?? 1, speed: CFG.ships[s.type || 'scout'].speed, alive: true,
  }));
  g.nextId = g.ships.length + 1;
  return g;
}
const typeAll = (g, str) => [...str].map((c) => g.type(c));

// ---------- words ----------
test('word list is plain lowercase, unique, and covers every ship tier', () => {
  assert.ok(WORDS.length >= 800, `only ${WORDS.length} words`);
  assert.equal(new Set(WORDS).size, WORDS.length, 'duplicate words');
  for (const w of WORDS) assert.match(w, /^[a-z]{3,10}$/, w);
  for (const t of ['scout', 'cruiser', 'mothership']) {
    const { minLen, maxLen } = CFG.ships[t];
    const n = WORDS.filter((w) => w.length >= minLen && w.length <= maxLen).length;
    assert.ok(n >= 100, `${t} tier has only ${n} words`);
  }
});

test('boss sentences fit a boss ship and are fully typeable', () => {
  assert.ok(BOSS_SENTENCES.length >= 30);
  assert.equal(new Set(BOSS_SENTENCES).size, BOSS_SENTENCES.length);
  for (const s of BOSS_SENTENCES) {
    assert.ok(s.length >= 12 && s.length <= 30, s);
    assert.match(s, /^[A-Z][A-Za-z ]*\.$/, s); // one capital, letters and spaces, full stop
    assert.ok(!s.includes('  ') && s === s.trim(), s);
  }
});

test('WordSource picks within the requested length range', () => {
  const src = new WordSource();
  const rng = mulberry32(5);
  for (let i = 0; i < 200; i++) {
    const w = src.pick(rng, 5, 7);
    assert.ok(w.length >= 5 && w.length <= 7, w);
  }
});

test('WordSource avoids immediate repeats', () => {
  const src = new WordSource();
  const rng = mulberry32(9);
  const last = [];
  for (let i = 0; i < 100; i++) {
    const w = src.pick(rng, 3, 4);
    assert.ok(!last.slice(-12).includes(w), `repeat ${w}`);
    last.push(w);
  }
});

test('lessons only use their own keys', () => {
  const rng = mulberry32(3);
  for (const lesson of LESSONS) {
    const src = new WordSource({ lesson });
    const allowed = new Set([...lesson.keys]);
    if (lesson.transform === 'capitals') continue; // checked below
    for (let i = 0; i < 120; i++) {
      const w = src.pick(rng, 3, 6);
      assert.ok(w.length >= 3, `${lesson.id}: ${w}`);
      for (const ch of w) assert.ok(allowed.has(ch), `${lesson.id}: "${w}" has "${ch}"`);
    }
  }
});

test('lesson ladder starts with the home row and ends with capitals and numbers', () => {
  assert.equal(LESSONS[0].id, 'home');
  assert.equal(LESSONS[0].keys, 'asdfghjkl');
  assert.deepEqual(LESSONS.slice(-2).map((l) => l.id), ['capitals', 'numbers']);
  assert.equal(new Set(LESSONS.map((l) => l.id)).size, LESSONS.length);
});

test('scarce lessons fall back to drills, never an empty word', () => {
  const rng = mulberry32(11);
  const bottom = new WordSource({ lesson: LESSONS.find((l) => l.id === 'bottom') });
  assert.equal(wordsForKeys('zxcvbnm').length, 0);
  for (let i = 0; i < 50; i++) assert.match(bottom.pick(rng, 3, 8), /^[zxcvbnm]{3,8}$/);
  for (let i = 0; i < 200; i++) assert.doesNotMatch(drillWord(rng, 'asd', 8), /(.)\1\1/);
});

test('capitals lesson adds a capital first letter and sometimes punctuation', () => {
  const src = new WordSource({ lesson: LESSONS.find((l) => l.id === 'capitals') });
  const rng = mulberry32(21);
  let punct = 0;
  for (let i = 0; i < 200; i++) {
    const w = src.pick(rng, 3, 7);
    assert.match(w, /^[A-Z][a-z]+[,.]?$/, w);
    if (/[,.]$/.test(w)) punct++;
  }
  assert.ok(punct > 40 && punct < 160);
});

test('numbers lesson makes digit strings of the requested length', () => {
  const src = new WordSource({ lesson: LESSONS.find((l) => l.id === 'numbers') });
  const rng = mulberry32(2);
  for (let i = 0; i < 50; i++) assert.match(src.pick(rng, 3, 4), /^[0-9]{3,4}$/);
});

// ---------- stats ----------
test('WPM uses 5 characters per word over active time', () => {
  assert.equal(computeWpm(250, 60), 50);
  assert.equal(computeWpm(100, 30), 40);
  assert.equal(computeWpm(10, 1), 0); // too little time to mean anything
});

test('accuracy is correct over all keystrokes, 100% before any', () => {
  assert.equal(computeAccuracy(0, 0), 1);
  assert.equal(computeAccuracy(9, 1), 0.9);
  assert.equal(computeAccuracy(0, 4), 0);
});

test('Stats counts hits, misses, combos, hard keys and ignores idle time', () => {
  const s = new Stats();
  for (let i = 0; i < 5; i++) s.hit('a');
  s.miss('q'); s.miss('q'); s.miss('z'); s.miss(null);
  assert.equal(s.correct, 5);
  assert.equal(s.errors, 4);
  assert.equal(s.bestCombo, 5);
  assert.equal(s.combo, 0);
  assert.deepEqual(s.hardestKeys(2), [{ key: 'q', count: 2 }, { key: 'z', count: 1 }]);
  s.tick(10, true); s.tick(50, false);
  assert.equal(s.activeSeconds, 10);
  s.reset();
  assert.equal(s.correct, 0);
});

test('assist slows ships only when recent accuracy is low, never below the floor', () => {
  assert.equal(assistFactor(1), 1);
  assert.equal(assistFactor(CFG.assist.fullAt), 1);
  assert.equal(assistFactor(CFG.assist.floorAt), CFG.assist.minFactor);
  assert.equal(assistFactor(0.1), CFG.assist.minFactor);
  const mid = assistFactor((CFG.assist.fullAt + CFG.assist.floorAt) / 2);
  assert.ok(mid > CFG.assist.minFactor && mid < 1);
  const s = new Stats();
  for (let i = 0; i < 9; i++) s.miss('x');
  assert.equal(s.recentAccuracy, 1, 'too little data to slow anyone down');
  for (let i = 0; i < 31; i++) s.miss('x');
  assert.equal(s.recentAccuracy, 0);
});

test('Progress saves best scores, lesson unlocks and lifetime key misses; survives bad storage', () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  const p = new Progress(storage);
  assert.equal(p.isUnlocked(LESSONS, 0), true);
  assert.equal(p.isUnlocked(LESSONS, 1), false);
  const stats = new Stats(); stats.miss('q'); stats.miss('q');
  let out = p.recordRun({ mode: 'invasion', score: 500, wave: 3, wpm: 30, stats });
  assert.equal(out.newBestScore, true);
  out = p.recordRun({ mode: 'invasion', score: 100, wave: 1, wpm: 20, stats });
  assert.equal(out.newBestScore, false);
  out = p.recordRun({ mode: 'training', score: 0, wave: 3, wpm: 25, stats: null, lessonId: 'home', passed: true });
  assert.equal(out.unlocked, 'home');
  assert.equal(p.isUnlocked(LESSONS, 1), true);
  out = p.recordRun({ mode: 'training', score: 0, wave: 3, wpm: 25, stats: null, lessonId: 'home', passed: true });
  assert.equal(out.unlocked, null, 'already passed');
  // A failed training run unlocks nothing.
  p.recordRun({ mode: 'training', score: 0, wave: 3, wpm: 25, stats: null, lessonId: 'top', passed: false });
  assert.equal(p.isUnlocked(LESSONS, 2), false);
  // Reload from the saved text.
  const p2 = new Progress(storage);
  assert.equal(p2.data.bestScore, 500);
  assert.equal(p2.data.keyMisses.q, 4);
  assert.deepEqual(p2.data.passedLessons, ['home']);
  // Corrupt and missing storage fall back to defaults.
  assert.equal(new Progress({ getItem: () => '{not json', setItem() {} }).data.bestScore, 0);
  assert.equal(new Progress({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } }).data.bestScore, 0);
  assert.equal(new Progress(null).recordRun({ mode: 'invasion', score: 5, wave: 1, wpm: 1, stats: null }).newBestScore, true);
});

// ---------- difficulty curves ----------
test('waves get bigger, faster and denser, and stay within their caps', () => {
  for (let n = 1; n < 40; n++) {
    assert.ok(waveSize(n + 1) >= waveSize(n));
    assert.ok(waveInterval(n + 1) <= waveInterval(n));
    assert.ok(waveSpeedMultiplier(n + 1) >= waveSpeedMultiplier(n));
  }
  assert.equal(waveSize(99), CFG.waves.sizeMax);
  assert.equal(waveInterval(99), CFG.waves.intervalMin);
  assert.equal(waveSpeedMultiplier(99), CFG.waves.speedMax);
  assert.ok(waveSpeedMultiplier(1, 'training') < waveSpeedMultiplier(1), 'training is gentler');
});

test('bigger ships arrive later and the mix always sums to 1', () => {
  assert.deepEqual(shipMix(1), { scout: 1, cruiser: 0, mothership: 0 });
  assert.equal(shipMix(2).mothership, 0);
  assert.ok(shipMix(2).cruiser > 0);
  assert.ok(shipMix(4).mothership > 0);
  for (let n = 1; n <= 30; n++) {
    const m = shipMix(n);
    assert.ok(Math.abs(m.scout + m.cruiser + m.mothership - 1) < 1e-9);
    assert.ok(m.scout >= 0);
  }
  assert.equal(shipMix(10, 'training').mothership, 0, 'no motherships in training');
  const rng = mulberry32(8);
  const seen = new Set();
  for (let i = 0; i < 300; i++) seen.add(pickShipType(8, rng));
  assert.deepEqual([...seen].sort(), ['cruiser', 'mothership', 'scout']);
});

test('boss waves are every fifth wave in Invasion only', () => {
  assert.equal(isBossWave(5), true);
  assert.equal(isBossWave(10), true);
  assert.equal(isBossWave(4), false);
  assert.equal(isBossWave(5, 'training'), false);
});

// ---------- game: typing and targeting ----------
test('first letter locks the lowest matching ship, then the word is finished', () => {
  const g = gameWith([{ word: 'cat', y: 12, x: -4 }, { word: 'cow', y: 6, x: 4 }]);
  assert.equal(g.type('c'), 'hit');
  assert.equal(g.target.word, 'cow', 'the lower ship is picked');
  assert.equal(g.type('o'), 'hit');
  assert.equal(g.type('w'), 'destroy');
  assert.equal(g.target, null);
  assert.deepEqual(g.ships.map((s) => s.word), ['cat']);
  assert.ok(g.score > 0);
});

test('a locked target ignores other ships until it is finished', () => {
  const g = gameWith([{ word: 'dog', y: 10 }, { word: 'fox', y: 5, x: 5 }]);
  g.type('d');
  assert.equal(g.target.word, 'dog');
  assert.equal(g.type('f'), 'miss', 'f belongs to another ship, not the locked one');
  assert.equal(g.target.word, 'dog');
});

test('a wrong key is an error and a combo break but never costs shield', () => {
  const g = gameWith([{ word: 'sun' }]);
  typeAll(g, 'su');
  assert.equal(g.stats.combo, 2);
  assert.equal(g.type('x'), 'miss');
  assert.equal(g.stats.combo, 0);
  assert.equal(g.stats.errors, 1);
  assert.equal(g.shield, CFG.base.maxShield);
  assert.equal(g.target.typed, 2, 'progress stays');
  assert.deepEqual(g.stats.hardestKeys(1), [{ key: 'n', count: 1 }]);
});

test('typing with no matching ship is an error with no expected key', () => {
  const g = gameWith([{ word: 'sun' }]);
  assert.equal(g.type('z'), 'miss');
  assert.equal(g.target, null);
  assert.equal(g.stats.errors, 1);
  assert.deepEqual(g.stats.hardestKeys(5), []);
});

test('matching is case sensitive and spaces count', () => {
  const g = gameWith([{ type: 'boss', word: 'Go on.', half: 5 }]);
  assert.equal(g.type('g'), 'miss', 'lowercase g does not match capital G');
  assert.equal(g.type('G'), 'hit');
  assert.equal(g.type('o'), 'hit');
  assert.equal(g.type('x'), 'miss');
  assert.equal(g.type(' '), 'hit');
  typeAll(g, 'on');
  assert.equal(g.type('.'), 'destroy');
});

test('backspace steps back one correct character and releases the lock at zero', () => {
  const g = gameWith([{ word: 'bird' }]);
  typeAll(g, 'bi');
  g.backspace();
  assert.equal(g.target.typed, 1);
  g.backspace();
  assert.equal(g.target, null);
  assert.equal(g.stats.errors, 0, 'backspace is not an error');
  g.backspace(); // nothing locked: harmless
  assert.equal(g.type('b'), 'hit');
});

test('single-character and non-string input is ignored', () => {
  const g = gameWith([{ word: 'bird' }]);
  assert.equal(g.type('bi'), 'ignored');
  assert.equal(g.type(''), 'ignored');
  assert.equal(g.type(undefined), 'ignored');
  assert.equal(g.stats.correct + g.stats.errors, 0);
});

test('score grows with word length, ship tier and combo multiplier', () => {
  const a = gameWith([{ word: 'cat' }]);
  typeAll(a, 'cat');
  assert.equal(a.score, 3 * CFG.ships.scout.scorePerChar);
  const b = gameWith([{ type: 'mothership', word: 'umbrellas', half: 3 }]);
  typeAll(b, 'umbrellas');
  assert.equal(b.score, 9 * CFG.ships.mothership.scorePerChar);
  const c = gameWith([{ word: 'cat' }]);
  c.stats.combo = CFG.combo.step * 2; // two multiplier steps already earned
  assert.equal(c.multiplier, 3);
  typeAll(c, 'cat');
  assert.equal(c.score, 3 * CFG.ships.scout.scorePerChar * 3, 'multiplier is read when the ship dies (combo 23 -> x3)');
  const d = gameWith([{ word: 'cat' }]);
  d.stats.combo = 999;
  assert.equal(d.multiplier, CFG.combo.maxMultiplier);
});

test('destroy emits an event and removes the ship', () => {
  const g = gameWith([{ word: 'ox ', y: 9, x: 2 }]);
  g.drainEvents();
  typeAll(g, 'ox ');
  const ev = g.drainEvents();
  assert.ok(ev.some((e) => e.type === 'destroy' && e.x === 2));
  assert.equal(g.ships.length, 0);
  assert.deepEqual(g.drainEvents(), [], 'drain empties the queue');
});

// ---------- game: waves, damage, end states ----------
test('ships fall, and one reaching the base costs shield by tier and breaks the combo', () => {
  const g = gameWith([{ type: 'cruiser', word: 'planet', y: CFG.hitY + 0.2 }]);
  g.stats.combo = 7;
  g.update(1);
  assert.equal(g.shield, CFG.base.maxShield - CFG.ships.cruiser.damage);
  assert.equal(g.stats.combo, 0);
  assert.equal(g.ships.length, 0);
  assert.ok(g.drainEvents().some((e) => e.type === 'leak'));
});

test('a leaking ship that was locked releases the target', () => {
  const g = gameWith([{ word: 'sun', y: CFG.hitY + 0.1 }]);
  g.type('s');
  g.update(1);
  assert.equal(g.target, null);
});

test('shield reaching zero ends the game and further input is ignored', () => {
  const g = gameWith([{ type: 'boss', word: 'The end.', y: CFG.hitY + 0.1, half: 5 }]);
  g.shield = 30;
  g.update(1);
  assert.equal(g.state, 'over');
  assert.equal(g.shield, 0);
  assert.equal(g.type('T'), 'ignored');
  const frozen = g.time;
  g.update(1);
  assert.equal(g.time, frozen);
  assert.equal(g.result().survived, false);
});

test('ships speed scales with wave and the accuracy assist', () => {
  const g = gameWith([{ word: 'sun', y: 10 }]);
  g.update(1);
  const base = 10 - g.ships[0].y;
  assert.ok(Math.abs(base - CFG.ships.scout.speed) < 1e-9);
  const h = gameWith([{ word: 'sun', y: 10 }]);
  for (let i = 0; i < 40; i++) h.stats.miss('x');
  h.update(1);
  assert.ok(Math.abs(10 - h.ships[0].y - CFG.ships.scout.speed * CFG.assist.minFactor) < 1e-9);
});

test('a wave spawns its whole queue, waits for it to be cleared, then runs an intermission', () => {
  const g = new Game({ rng: mulberry32(4), halfWidth: 14 });
  g.start();
  assert.equal(g.wave, 1);
  assert.equal(g.queue.length, waveSize(1));
  let spawned = 0;
  for (let i = 0; i < 4000 && g.queue.length; i++) {
    g.update(0.05);
    spawned += g.drainEvents().filter((e) => e.type === 'spawn').length;
    // Destroy anything that appears so no ship leaks while we watch spawning.
    for (const s of [...g.ships]) typeAll(g, s.word);
  }
  assert.equal(g.queue.length, 0);
  assert.equal(g.state, 'playing');
  g.update(0.05);
  g.drainEvents();
  assert.equal(g.leaks, 0);
  assert.ok(g.score >= CFG.waves.cleanWaveBonus);
  assert.equal(g.state, 'intermission');
  for (let i = 0; i < 100; i++) g.update(0.05);
  assert.equal(g.wave, 2);
  assert.equal(g.state, 'playing');
});

test('a clean wave earns a bonus and a wave with a leak does not', () => {
  const clean = gameWith([]);
  clean.update(0.1);
  assert.equal(clean.score, CFG.waves.cleanWaveBonus);
  const leaky = gameWith([]);
  leaky.leaks = 1;
  leaky.update(0.1);
  assert.equal(leaky.score, 0);
});

test('wave 5 in Invasion ends with a boss that carries a sentence', () => {
  const g = new Game({ rng: mulberry32(6), halfWidth: 12 });
  g.startWave(5);
  assert.equal(g.queue.at(-1), 'boss');
  let boss = null;
  for (let i = 0; i < 6000 && !boss; i++) {
    g.update(0.05);
    boss = g.ships.find((s) => s.type === 'boss') || null;
    for (const s of [...g.ships]) if (s.type !== 'boss') typeAll(g, s.word);
  }
  assert.ok(boss, 'boss spawned');
  assert.ok(BOSS_SENTENCES.includes(boss.word));
  assert.ok(boss.half <= CFG.ships.boss.maxHalf);
  const results = typeAll(g, boss.word);
  assert.equal(results.at(-1), 'destroy');
  assert.ok(results.slice(0, -1).every((r) => r === 'hit'));
});

test('ships spawn inside the screen and never overlap while entering', () => {
  const rng = mulberry32(77);
  for (const halfWidth of [5, 8, 14, 22]) {
    const g = new Game({ rng, halfWidth, charWidth: 0.7 });
    g.startWave(7);
    for (let i = 0; i < 1500; i++) {
      g.update(0.05);
      for (const s of g.ships) {
        assert.ok(s.x - s.half >= -halfWidth - 0.001 || s.half * 2 > halfWidth * 2, `left edge ${s.word} @${halfWidth}`);
        assert.ok(s.x + s.half <= halfWidth + 0.001 || s.half * 2 > halfWidth * 2, `right edge ${s.word} @${halfWidth}`);
      }
      const fresh = g.ships.filter((s) => s.y > CFG.spawnY - 3);
      for (let a = 0; a < fresh.length; a++) {
        for (let b = a + 1; b < fresh.length; b++) {
          assert.ok(Math.abs(fresh[a].x - fresh[b].x) > fresh[a].half + fresh[b].half, 'overlap at spawn');
        }
      }
      for (const s of [...g.ships]) if (s.y < 9) typeAll(g, s.word);
      if (g.state === 'over') break;
    }
  }
});

test('screen resize pulls ships back inside the new width', () => {
  const g = gameWith([{ word: 'cat', x: 11, half: 1 }]);
  g.setMetrics({ halfWidth: 5, charWidth: 0.6 });
  assert.ok(g.ships[0].x + g.ships[0].half <= 5);
});

test('on-screen ships get distinct first letters when the word pool allows', () => {
  const g = new Game({ rng: mulberry32(13), halfWidth: 30 });
  g.startWave(3);
  for (let i = 0; i < 600; i++) {
    g.update(0.05);
    const firsts = g.ships.map((s) => s.word[0]);
    // Soft rule (six tries), so allow rare repeats but not a pattern.
    if (i === 599) assert.ok(new Set(firsts).size >= firsts.length - 1);
    for (const s of [...g.ships]) if (s.y < 11) typeAll(g, s.word);
    if (g.state === 'over') break;
  }
});

// ---------- training mode ----------
test('a training run is three waves with no bosses, then ends as won; passing needs 90% accuracy', () => {
  const lesson = LESSONS.find((l) => l.id === 'home-top');
  const g = new Game({ rng: mulberry32(31), mode: 'training', lesson, halfWidth: 14 });
  g.start();
  for (let i = 0; i < 20000 && g.state !== 'won' && g.state !== 'over'; i++) {
    g.update(0.05);
    for (const s of [...g.ships]) {
      assert.notEqual(s.type, 'boss');
      assert.notEqual(s.type, 'mothership');
      for (const ch of s.word) assert.ok(lesson.keys.includes(ch), `${s.word} leaves the lesson keys`);
      typeAll(g, s.word);
    }
  }
  assert.equal(g.state, 'won');
  assert.equal(g.wave, CFG.training.waves);
  const r = g.result();
  assert.equal(r.accuracy, 1);
  assert.equal(r.passed, true);
  assert.equal(r.lessonId, 'home-top');
});

test('training with too many mistakes is complete but not passed', () => {
  const lesson = LESSONS[0];
  const g = new Game({ rng: mulberry32(32), mode: 'training', lesson, halfWidth: 14 });
  g.start();
  for (let i = 0; i < 20000 && g.state !== 'won' && g.state !== 'over'; i++) {
    g.update(0.05);
    for (const s of [...g.ships]) { g.type('1'); g.type('1'); typeAll(g, s.word); }
  }
  assert.equal(g.state, 'won');
  assert.ok(g.result().accuracy < CFG.training.passAccuracy);
  assert.equal(g.result().passed, false);
});

test('result summarises a run for the results screen', () => {
  const g = gameWith([{ word: 'cat' }]);
  typeAll(g, 'cat');
  g.type('q');
  const r = g.result();
  assert.equal(r.mode, 'invasion');
  assert.equal(r.score, 3 * CFG.ships.scout.scorePerChar);
  assert.equal(r.bestCombo, 3);
  assert.equal(r.passed, false);
  assert.equal(r.survived, true);
});

// ---------- determinism ----------
test('the same seed gives the same game', () => {
  const run = (seed) => {
    const g = new Game({ rng: mulberry32(seed), halfWidth: 12 });
    g.start();
    const words = [];
    for (let i = 0; i < 800; i++) {
      g.update(0.05);
      for (const s of [...g.ships]) { words.push(s.word); typeAll(g, s.word); }
    }
    return [words.join(','), g.score];
  };
  assert.deepEqual(run(2), run(2));
  assert.notDeepEqual(run(2), run(3));
});

// ---------- input decoding ----------
test('diffText finds appended characters and deletions', () => {
  assert.deepEqual(diffText('', 'a'), { backspaces: 0, added: 'a' });
  assert.deepEqual(diffText('ab', 'abc'), { backspaces: 0, added: 'c' });
  assert.deepEqual(diffText('abc', 'ab'), { backspaces: 1, added: '' });
  assert.deepEqual(diffText('abc', 'abx'), { backspaces: 1, added: 'x' });
  assert.deepEqual(diffText('teh', 'the'), { backspaces: 2, added: 'he' }); // an autocorrect
  assert.deepEqual(diffText('abc', 'abc'), { backspaces: 0, added: '' });
});

test('InputDecoder turns keydown and field changes into characters and backspaces', () => {
  const log = [];
  const d = new InputDecoder((c) => log.push(c), () => log.push('<'));
  assert.equal(d.keydown({ key: 'a' }), true);
  assert.equal(d.keydown({ key: 'Backspace' }), true);
  assert.equal(d.keydown({ key: 'Enter' }), false);
  assert.equal(d.keydown({ key: 'Shift' }), false);
  assert.equal(d.keydown({ key: 'Unidentified' }), false, 'soft keyboards are read from the field instead');
  assert.equal(d.keydown({ key: 'c', ctrlKey: true }), false, 'shortcuts are left alone');
  assert.deepEqual(log, ['a', '<']);
  log.length = 0;
  d.input('h'); d.input('hi'); d.input('h'); d.input('ho');
  assert.deepEqual(log, ['h', 'i', '<', 'o']);
  d.reset();
  log.length = 0;
  d.input('x');
  assert.deepEqual(log, ['x']);
  log.length = 0;
  d.input('ab cd'); // a pasted or multi-character burst arrives one character at a time
  assert.deepEqual(log, ['<', 'a', 'b', ' ', 'c', 'd']);
});

// ---------- scenery shared with Air Defense ----------
test('shared scenery still offers every theme and landscape Alien Invasion draws', () => {
  assert.deepEqual(THEME_KEYS, ['day', 'sunset', 'night']);
  assert.ok(LANDSCAPE_KEYS.length >= 4);
});

// ---------- deploy wiring (a missing entry 404s or skips tests in production) ----------
test('pages workflow tests this file and publishes the game folder and shared/', () => {
  const yml = readFileSync(resolve(root, '.github/workflows/pages.yml'), 'utf8');
  assert.match(yml, /node --test[^\n]*tests\/typing\.test\.mjs/);
  const cp = yml.match(/cp -r ([^\n]*) _site\//);
  assert.ok(cp, 'cp line present');
  const dirs = cp[1].split(/\s+/);
  for (const d of ['assets', 'air-defense', 'alien-invasion', 'shared', 'vendor']) assert.ok(dirs.includes(d), `workflow does not copy ${d}`);
});

test('portal links to Alien Invasion with art that exists, using relative paths', () => {
  const js = readFileSync(resolve(root, 'portal.js'), 'utf8');
  assert.match(js, /id: 'alien-invasion'[^\n]*path: '\.\/alien-invasion\/'[^\n]*status: 'play'/);
  const art = js.match(/id: 'alien-invasion'[^\n]*art: '([^']+)'/)[1];
  assert.ok(!art.startsWith('/'));
  assert.ok(existsSync(resolve(root, art)), art);
});

test('Alien Invasion pages use only relative URLs and every import resolves to a real file', () => {
  const html = readFileSync(resolve(root, 'alien-invasion/index.html'), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) assert.ok(!m[1].startsWith('/') && !/^https?:/.test(m[1]), `root-absolute or external URL: ${m[1]}`);
  for (const file of ['main', 'game', 'render', 'hud', 'audio', 'input', 'stats', 'words', 'wordlist', 'config']) {
    const path = resolve(root, `alien-invasion/src/${file}.js`);
    const src = readFileSync(path, 'utf8');
    assert.ok(!/from\s+['"]three['"]/.test(src), `${file}.js must not import three`);
    for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
      assert.ok(m[1].startsWith('.'), `${file}.js: non-relative import ${m[1]}`);
      assert.ok(existsSync(resolve(dirname(path), m[1])), `${file}.js imports missing ${m[1]}`);
    }
  }
  const css = readFileSync(resolve(root, 'alien-invasion/style.css'), 'utf8');
  assert.ok(!/url\(\s*['"]?\//.test(css));
});

// ---------- word label font ----------
test('word label font is clearly readable on phone and desktop viewports', () => {
  // scale is px per world unit: ~20 on a phone with the keyboard open,
  // ~42 on a full-height portrait phone, 40-60 on a desktop.
  assert.ok(labelFontPx(20) >= 20, `keyboard-open phone: ${labelFontPx(20)}px`);
  assert.ok(labelFontPx(42) >= 28, `portrait phone: ${labelFontPx(42)}px`);
  assert.ok(labelFontPx(60) >= 30, `desktop: ${labelFontPx(60)}px`);
  assert.ok(labelFontPx(400) <= 40, `giant screen must be capped: ${labelFontPx(400)}px`);
});

test('the longest word still fits across a narrow phone screen', () => {
  // A bold monospace advance is about 0.6em; 0.65 leaves margin for fallback fonts.
  // A 360px-wide phone (halfWidth = 180 / scale) is the tightest screen we support.
  for (const scale of [20, 42]) {
    const halfWidth = 180 / scale;
    const charWorld = (0.65 * labelFontPx(scale)) / scale;
    const half = (CFG.ships.mothership.maxLen * charWorld) / 2 + 0.45;
    assert.ok(half <= halfWidth - 0.3, `scale ${scale}: word half ${half.toFixed(2)} vs limit ${(halfWidth - 0.3).toFixed(2)}`);
  }
});

test('the hidden typing field is set up for soft keyboards', () => {
  const html = readFileSync(resolve(root, 'alien-invasion/index.html'), 'utf8');
  const input = html.match(/<input id="typer"[^>]*>/)[0];
  for (const attr of ['autocomplete="off"', 'autocorrect="off"', 'autocapitalize="off"', 'spellcheck="false"']) assert.ok(input.includes(attr), attr);
});
