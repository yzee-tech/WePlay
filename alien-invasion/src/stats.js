// Typing statistics and saved progress. No DOM; storage is injected so node tests can use a fake.
import { CFG } from './config.js';

/** WPM using the standard rule: 5 characters = 1 word, over the time spent actually typing. */
export function computeWpm(correctChars, activeSeconds) {
  if (activeSeconds < 2) return 0; // too little time to mean anything
  return Math.round((correctChars / 5) / (activeSeconds / 60));
}

/** Accuracy as a 0..1 fraction: correct keystrokes over all counted keystrokes. 1 when nothing typed yet. */
export function computeAccuracy(correct, errors) {
  const total = correct + errors;
  return total === 0 ? 1 : correct / total;
}

/**
 * Ships slow down a little when recent accuracy is low. Returns a factor from minFactor to 1.
 * Full speed at fullAt accuracy or better, easing to minFactor at floorAt or worse.
 */
export function assistFactor(recentAccuracy, a = CFG.assist) {
  if (recentAccuracy >= a.fullAt) return 1;
  if (recentAccuracy <= a.floorAt) return a.minFactor;
  const t = (recentAccuracy - a.floorAt) / (a.fullAt - a.floorAt);
  return a.minFactor + (1 - a.minFactor) * t;
}

export class Stats {
  constructor() { this.reset(); }

  reset() {
    this.correct = 0;
    this.errors = 0;
    this.activeSeconds = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.keyMisses = {}; // expected character -> times it was typed wrong
    this.keyHits = {};
    this.recent = []; // last N keystrokes, true = correct
  }

  /** Counts time only while ships are on screen (so waiting between waves does not lower WPM). */
  tick(dt, active) {
    if (active) this.activeSeconds += dt;
  }

  hit(expected) {
    this.correct++;
    this.combo++;
    if (this.combo > this.bestCombo) this.bestCombo = this.combo;
    this.keyHits[expected] = (this.keyHits[expected] || 0) + 1;
    this.pushRecent(true);
  }

  /** `expected` is the character that should have been typed, or null when no ship was locked. */
  miss(expected) {
    this.errors++;
    this.combo = 0;
    if (expected) this.keyMisses[expected] = (this.keyMisses[expected] || 0) + 1;
    this.pushRecent(false);
  }

  pushRecent(ok) {
    this.recent.push(ok);
    if (this.recent.length > CFG.assist.window) this.recent.shift();
  }

  get wpm() { return computeWpm(this.correct, this.activeSeconds); }
  get accuracy() { return computeAccuracy(this.correct, this.errors); }

  get recentAccuracy() {
    if (this.recent.length < 10) return 1; // not enough data to slow anyone down
    return this.recent.filter(Boolean).length / this.recent.length;
  }

  /** The characters missed most often, most missed first. */
  hardestKeys(n = 3) {
    return Object.entries(this.keyMisses)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, n)
      .map(([key, count]) => ({ key, count }));
  }
}

const STORE_KEY = 'alieninvasion.progress.v1';

/** Best scores, unlocked lessons and lifetime missed keys, saved per device. */
export class Progress {
  constructor(storage = null) {
    this.storage = storage;
    this.data = { bestScore: 0, bestWpm: 0, bestWave: 0, passedLessons: [], keyMisses: {} };
    this.load();
  }

  load() {
    try {
      const raw = this.storage && this.storage.getItem(STORE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d && typeof d === 'object') {
        this.data.bestScore = Number(d.bestScore) || 0;
        this.data.bestWpm = Number(d.bestWpm) || 0;
        this.data.bestWave = Number(d.bestWave) || 0;
        this.data.passedLessons = Array.isArray(d.passedLessons) ? d.passedLessons.filter((x) => typeof x === 'string') : [];
        this.data.keyMisses = d.keyMisses && typeof d.keyMisses === 'object' ? d.keyMisses : {};
      }
    } catch (e) { /* corrupt or unavailable storage: start fresh */ }
  }

  save() {
    try { if (this.storage) this.storage.setItem(STORE_KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
  }

  /** Lesson i is open when it is the first or the one before it has been passed. */
  isUnlocked(lessons, index) {
    return index === 0 || this.data.passedLessons.includes(lessons[index - 1].id);
  }

  /** Records a finished run. Returns what is new so the results screen can celebrate. */
  recordRun({ mode, score, wave, wpm, stats, lessonId = null, passed = false }) {
    const out = { newBestScore: false, newBestWpm: false, unlocked: null };
    if (mode === 'invasion') {
      if (score > this.data.bestScore) { this.data.bestScore = score; out.newBestScore = true; }
      if (wave > this.data.bestWave) this.data.bestWave = wave;
    }
    if (wpm > this.data.bestWpm) { this.data.bestWpm = wpm; out.newBestWpm = true; }
    if (stats) {
      for (const [k, n] of Object.entries(stats.keyMisses)) this.data.keyMisses[k] = (this.data.keyMisses[k] || 0) + n;
    }
    if (mode === 'training' && passed && lessonId && !this.data.passedLessons.includes(lessonId)) {
      this.data.passedLessons.push(lessonId);
      out.unlocked = lessonId;
    }
    this.save();
    return out;
  }
}
