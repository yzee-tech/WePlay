// Alien Invasion rules. No DOM, no canvas: everything here runs in plain Node for tests.
// Time is advanced only by update(dt). Randomness comes only from the injected rng.
// The renderer and sound read game.ships and the events from drainEvents().
import { CFG } from './config.js';
import { WordSource } from './words.js';
import { Stats, assistFactor } from './stats.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = CFG.waves;

export function waveSize(n, mode = 'invasion') {
  if (mode === 'training') return CFG.training.sizeBase + CFG.training.sizePerWave * (n - 1);
  return Math.min(W.sizeMax, W.sizeBase + W.sizePerWave * (n - 1));
}

/** Seconds between spawns in wave n. */
export function waveInterval(n, mode = 'invasion') {
  if (mode === 'training') return Math.max(W.intervalMin, CFG.training.intervalStart - CFG.training.intervalPerWave * (n - 1));
  return Math.max(W.intervalMin, W.intervalStart - W.intervalPerWave * (n - 1));
}

/** Multiplier on every ship's speed in wave n. */
export function waveSpeedMultiplier(n, mode = 'invasion') {
  const m = Math.min(W.speedMax, 1 + W.speedPerWave * (n - 1));
  return mode === 'training' ? m * CFG.training.speedMult : m;
}

export function isBossWave(n, mode = 'invasion') {
  return mode === 'invasion' && n % W.bossEvery === 0;
}

/** Chance of each ship type in wave n (they sum to 1). Bigger ships arrive later. */
export function shipMix(n, mode = 'invasion') {
  const cruiser = n >= W.cruiserFromWave ? Math.min(0.5, 0.25 + 0.04 * (n - W.cruiserFromWave)) : 0;
  const mothership = mode === 'invasion' && n >= W.mothershipFromWave ? Math.min(0.35, 0.06 * (n - W.mothershipFromWave + 1)) : 0;
  return { scout: 1 - cruiser - mothership, cruiser, mothership };
}

export function pickShipType(n, rng, mode = 'invasion') {
  const mix = shipMix(n, mode);
  const r = rng();
  if (r < mix.mothership) return 'mothership';
  if (r < mix.mothership + mix.cruiser) return 'cruiser';
  return 'scout';
}

export class Game {
  constructor({ rng = Math.random, mode = 'invasion', lesson = null, halfWidth = 10, charWidth = CFG.defaultCharWidth, words = null } = {}) {
    this.rng = rng;
    this.mode = mode;
    this.lesson = lesson;
    this.words = words || new WordSource({ lesson: mode === 'training' ? lesson : null });
    this.halfWidth = halfWidth;
    this.charWidth = charWidth;
    this.stats = new Stats();
    this.ships = [];
    this.target = null;
    this.shield = CFG.base.maxShield;
    this.score = 0;
    this.wave = 0;
    this.state = 'ready'; // ready | playing | intermission | over | won
    this.events = [];
    this.nextId = 1;
    this.queue = [];
    this.spawnTimer = 0;
    this.intermission = 0;
    this.leaks = 0;
    this.time = 0;
  }

  /** The renderer reports the visible half-width and the width of one character, in world units. */
  setMetrics({ halfWidth, charWidth }) {
    if (halfWidth > 0) this.halfWidth = halfWidth;
    if (charWidth > 0) this.charWidth = charWidth;
    // After a resize (rotation, keyboard opening) pull ships back inside the new width.
    for (const s of this.ships) {
      const lim = Math.max(0, this.halfWidth - s.half - 0.3);
      s.x = Math.max(-lim, Math.min(lim, s.x));
    }
  }

  start() {
    this.startWave(1);
  }

  get multiplier() {
    return 1 + Math.min(CFG.combo.maxMultiplier - 1, Math.floor(this.stats.combo / CFG.combo.step));
  }

  get speedFactor() {
    return waveSpeedMultiplier(this.wave, this.mode) * assistFactor(this.stats.recentAccuracy);
  }

  startWave(n) {
    this.wave = n;
    this.state = 'playing';
    this.leaks = 0;
    const boss = isBossWave(n, this.mode);
    const count = boss ? Math.max(2, Math.floor(waveSize(n, this.mode) / 2)) : waveSize(n, this.mode);
    this.queue = [];
    for (let i = 0; i < count; i++) this.queue.push(pickShipType(n, this.rng, this.mode));
    if (boss) this.queue.push('boss');
    this.spawnTimer = 0.8;
    this.events.push({ type: 'wave', wave: n, boss });
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  shipHalfWidth(type, len) {
    const c = CFG.ships[type];
    if (type === 'boss') return Math.min(c.maxHalf, this.halfWidth * 0.85);
    return Math.max(c.minHalf, (len * this.charWidth) / 2 + 0.45);
  }

  chooseWord(type) {
    const c = CFG.ships[type];
    if (type === 'boss') return this.words.sentence(this.rng);
    // Prefer a first letter no other ship on screen uses, so one keystroke picks one target.
    let word = '';
    for (let tries = 0; tries < 6; tries++) {
      word = this.words.pick(this.rng, c.minLen, c.maxLen);
      if (!this.ships.some((s) => s.word[0] === word[0])) break;
    }
    return word;
  }

  /** Tries to put the next queued ship on screen. Returns false if there is no clear lane right now. */
  trySpawn() {
    const type = this.queue[0];
    const word = this.chooseWord(type);
    const half = this.shipHalfWidth(type, word.length);
    const lo = -this.halfWidth + half + 0.3;
    const hi = this.halfWidth - half - 0.3;
    for (let attempt = 0; attempt < 8; attempt++) {
      const x = hi > lo ? lo + this.rng() * (hi - lo) : 0;
      const clear = this.ships.every((s) => s.y < CFG.spawnY - 4 || Math.abs(s.x - x) > s.half + half + CFG.laneGap);
      if (!clear) continue;
      this.queue.shift();
      const c = CFG.ships[type];
      const ship = { id: this.nextId++, type, word, typed: 0, x, y: CFG.spawnY, half, speed: c.speed, alive: true };
      this.ships.push(ship);
      this.events.push({ type: 'spawn', id: ship.id, shipType: type });
      return true;
    }
    return false;
  }

  /** One typed character (already a single printable character). Returns 'hit', 'destroy', 'miss' or 'ignored'. */
  type(ch) {
    if (this.state !== 'playing' || typeof ch !== 'string' || ch.length !== 1) return 'ignored';
    let ship = this.target;
    if (!ship) {
      const cands = this.ships.filter((s) => s.alive && s.word[0] === ch);
      if (!cands.length) {
        this.stats.miss(null);
        this.events.push({ type: 'error', expected: null });
        return 'miss';
      }
      ship = cands.reduce((low, s) => (s.y < low.y ? s : low));
      this.target = ship;
    }
    const expected = ship.word[ship.typed];
    if (ch !== expected) {
      this.stats.miss(expected);
      this.events.push({ type: 'error', expected });
      return 'miss';
    }
    ship.typed++;
    this.stats.hit(expected);
    if (ship.typed >= ship.word.length) {
      this.destroy(ship);
      return 'destroy';
    }
    this.events.push({ type: 'key', id: ship.id });
    return 'hit';
  }

  /** Steps back one correct character; stepping back to zero releases the lock. Not counted as an error. */
  backspace() {
    const ship = this.target;
    if (!ship || this.state !== 'playing') return;
    if (ship.typed > 0) ship.typed--;
    if (ship.typed === 0) this.target = null;
  }

  destroy(ship) {
    const c = CFG.ships[ship.type];
    const gain = ship.word.length * c.scorePerChar * this.multiplier;
    this.score += gain;
    ship.alive = false;
    this.ships = this.ships.filter((s) => s !== ship);
    if (this.target === ship) this.target = null;
    this.events.push({ type: 'destroy', id: ship.id, shipType: ship.type, x: ship.x, y: ship.y, half: ship.half, gain });
  }

  update(dt) {
    if (this.state === 'over' || this.state === 'won' || this.state === 'ready') return;
    this.time += dt;
    if (this.state === 'intermission') {
      this.intermission -= dt;
      if (this.intermission <= 0) this.startWave(this.wave + 1);
      return;
    }
    this.stats.tick(dt, this.ships.length > 0);

    // Spawn from the wave queue.
    this.spawnTimer -= dt;
    while (this.queue.length && this.spawnTimer <= 0) {
      if (this.trySpawn()) {
        const jitter = 0.8 + this.rng() * 0.4;
        this.spawnTimer += waveInterval(this.wave, this.mode) * jitter;
      } else {
        this.spawnTimer = CFG.spawnRetryDelay;
        break;
      }
    }

    // Move ships; any that reach the ground hit the base.
    const factor = this.speedFactor;
    for (const s of [...this.ships]) {
      s.y -= s.speed * factor * dt;
      if (s.y <= CFG.hitY) this.leak(s);
    }
    if (this.state === 'over') return;

    if (!this.queue.length && !this.ships.length) this.finishWave();
  }

  leak(ship) {
    const dmg = CFG.ships[ship.type].damage;
    this.shield = Math.max(0, this.shield - dmg);
    this.leaks++;
    this.stats.combo = 0;
    this.ships = this.ships.filter((s) => s !== ship);
    if (this.target === ship) this.target = null;
    this.events.push({ type: 'leak', id: ship.id, shipType: ship.type, x: ship.x, damage: dmg });
    if (this.shield <= 0) {
      this.state = 'over';
      this.target = null;
      this.events.push({ type: 'over' });
    }
  }

  finishWave() {
    let bonus = 0;
    if (this.leaks === 0) {
      bonus = W.cleanWaveBonus * this.wave;
      this.score += bonus;
    }
    this.events.push({ type: 'waveClear', wave: this.wave, bonus });
    if (this.mode === 'training' && this.wave >= CFG.training.waves) {
      this.state = 'won';
      this.events.push({ type: 'won' });
    } else {
      this.state = 'intermission';
      this.intermission = W.intermission;
    }
  }

  /** Summary for the results screen once the run has ended. */
  result() {
    const acc = this.stats.accuracy;
    return {
      mode: this.mode,
      lessonId: this.lesson ? this.lesson.id : null,
      score: this.score,
      wave: this.wave,
      wpm: this.stats.wpm,
      accuracy: acc,
      bestCombo: this.stats.bestCombo,
      hardest: this.stats.hardestKeys(3),
      survived: this.state !== 'over',
      passed: this.mode === 'training' && this.state === 'won' && acc >= CFG.training.passAccuracy,
    };
  }
}
