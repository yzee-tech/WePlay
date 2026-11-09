// Word material and lessons for Alien Invasion. Our own list (wordlist.js), nothing copied from
// another typing program. Pure data and pure functions (no DOM), so node tests can check it.
import { RAW } from './wordlist.js';

const seen = new Set();
const byLen = {};
for (const [len, text] of Object.entries(RAW)) {
  const n = Number(len);
  byLen[n] = [];
  for (const w of text.split(/\s+/)) {
    // Drop blanks, duplicates and any entry filed under the wrong length.
    if (!w || seen.has(w) || w.length !== n || !/^[a-z]+$/.test(w)) continue;
    seen.add(w);
    byLen[n].push(w);
  }
}

/** Every word, shortest first. */
export const WORDS = Object.keys(byLen).map(Number).sort((a, b) => a - b).flatMap((n) => byLen[n]);

/** Boss sentences: up to 30 characters, typed in full including the capital letter and full stop. */
export const BOSS_SENTENCES = [
  'The aliens are coming.',
  'Defend the base today.',
  'Type fast and stay calm.',
  'Fire the lasers now.',
  'Earth needs a hero.',
  'Stars shine in the night.',
  'Keep your eyes on the sky.',
  'Practice makes perfect.',
  'A small step is progress.',
  'Quick hands win the day.',
  'The moon is very bright.',
  'We can save the planet.',
  'Slow and steady wins.',
  'Never give up the fight.',
  'The ship is going down.',
  'Rockets fly past the sun.',
  'Look up at the big sky.',
  'Brave pilots never quit.',
  'Hold the line together.',
  'Strike before they land.',
  'Clouds drift over the hills.',
  'Wave after wave they come.',
  'The base will not fall.',
  'Good typists stay relaxed.',
  'Aim true and type true.',
  'Each word is a laser shot.',
  'Fast fingers save the day.',
  'Planets spin around a star.',
  'Silver ships fill the sky.',
  'Think first and then type.',
  'The night is full of stars.',
  'Show them what you can do.',
  'Hit every key with care.',
  'Little by little we win.',
  'The final wave is here.',
  'Courage beats the invaders.',
  'Keep calm and keep typing.',
  'Zap the mothership now.',
  'Home is worth defending.',
  'Victory belongs to us.',
];

const ROW_HOME = 'asdfghjkl';
const ROW_TOP = 'qwertyuiop';
const ROW_BOTTOM = 'zxcvbnm';

/** Lessons for Training mode. `keys` is the set of characters words may contain. */
export const LESSONS = [
  { id: 'home', name: 'Home row', keys: ROW_HOME, blurb: 'a s d f g h j k l' },
  { id: 'top', name: 'Top row', keys: ROW_TOP, blurb: 'q w e r t y u i o p' },
  { id: 'bottom', name: 'Bottom row', keys: ROW_BOTTOM, blurb: 'z x c v b n m' },
  { id: 'home-top', name: 'Home + top rows', keys: ROW_HOME + ROW_TOP, blurb: 'two rows together' },
  { id: 'letters', name: 'All letters', keys: ROW_HOME + ROW_TOP + ROW_BOTTOM, blurb: 'the whole alphabet' },
  { id: 'capitals', name: 'Capitals and punctuation', keys: ROW_HOME + ROW_TOP + ROW_BOTTOM, blurb: 'Capital letters, commas and full stops', transform: 'capitals' },
  { id: 'numbers', name: 'Numbers', keys: '0123456789', blurb: 'digits 0 to 9', transform: 'numbers' },
];

/** Words (a-z) that use only the given letters. */
export function wordsForKeys(keys, list = WORDS) {
  const allowed = new Set(keys);
  return list.filter((w) => [...w].every((c) => allowed.has(c)));
}

function between(rng, lo, hi) {
  return lo + Math.min(hi - lo, Math.floor(rng() * (hi - lo + 1)));
}

/**
 * A short run of letters from the allowed keys, for lessons where real words are scarce
 * (the home row has few real words). Never three of the same character in a row.
 */
export function drillWord(rng, keys, len) {
  const chars = [...new Set(keys)];
  let out = '';
  while (out.length < len) {
    const c = chars[Math.min(chars.length - 1, Math.floor(rng() * chars.length))];
    if (out.length >= 2 && out[out.length - 1] === c && out[out.length - 2] === c) continue;
    out += c;
  }
  return out;
}

/**
 * Picks words for a game. Invasion uses the whole list; Training restricts to a lesson.
 * pick(rng, minLen, maxLen) returns a word as close to that length range as the pool allows.
 */
export class WordSource {
  constructor({ lesson = null, list = WORDS } = {}) {
    this.lesson = lesson;
    this.transform = lesson && lesson.transform ? lesson.transform : null;
    this.drills = false;
    if (!lesson || this.transform === 'capitals') this.pool = list;
    else if (this.transform === 'numbers') this.pool = [];
    else {
      this.pool = wordsForKeys(lesson.keys, list);
      this.drills = this.pool.length < 60;
    }
    this.recent = [];
  }

  pick(rng, minLen, maxLen) {
    if (this.transform === 'numbers') return drillWord(rng, this.lesson.keys, between(rng, minLen, maxLen));
    // When real words are scarce, half the picks are letter drills.
    if (this.drills && rng() < 0.5) return drillWord(rng, this.lesson.keys, between(rng, minLen, maxLen));
    let cands = this.pool.filter((w) => w.length >= minLen && w.length <= maxLen && !this.recent.includes(w));
    if (!cands.length) cands = this.pool.filter((w) => w.length >= minLen && w.length <= maxLen);
    if (!cands.length && this.lesson) return drillWord(rng, this.lesson.keys, between(rng, minLen, maxLen));
    if (!cands.length) {
      const lens = this.pool.map((w) => w.length);
      const target = Math.max(minLen, Math.min(maxLen, lens[0]));
      const nearest = lens.reduce((best, l) => (Math.abs(l - target) < Math.abs(best - target) ? l : best), lens[0]);
      cands = this.pool.filter((w) => w.length === nearest);
    }
    let w = cands[Math.min(cands.length - 1, Math.floor(rng() * cands.length))];
    if (this.transform === 'capitals') {
      // Capital first letter, and a comma or full stop on half of the words.
      w = w[0].toUpperCase() + w.slice(1);
      const p = rng();
      if (p < 0.25) w += ',';
      else if (p < 0.5) w += '.';
    }
    this.recent.push(w);
    if (this.recent.length > 12) this.recent.shift();
    return w;
  }

  sentence(rng) {
    return BOSS_SENTENCES[Math.min(BOSS_SENTENCES.length - 1, Math.floor(rng() * BOSS_SENTENCES.length))];
  }
}
