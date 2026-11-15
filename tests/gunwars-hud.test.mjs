// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatTime, canPause, nextPausedOnKey, shouldAutoPause } from '../stickman-gunwars/src/hud.js';
import { Game } from '../stickman-gunwars/src/game.js';
import { CFG } from '../stickman-gunwars/src/config.js';
import { readFileSync } from 'node:fs';

test('timer reads 1:00 at the start, then 0:59 and down to 0:00', () => {
  assert.equal(formatTime(CFG.roundSeconds), '1:00');
  assert.equal(formatTime(59.5), '1:00');
  assert.equal(formatTime(59), '0:59');
  assert.equal(formatTime(58.01), '0:59');
  assert.equal(formatTime(9.2), '0:10');
  assert.equal(formatTime(0.1), '0:01');
  assert.equal(formatTime(0), '0:00');
  assert.equal(formatTime(-1), '0:00');
});

test('the first frame of a new round shows 1:00', () => {
  const g = new Game();
  assert.equal(formatTime(g.timeLeft), '1:00');
});

test('P / Esc toggle pause during a round', () => {
  assert.equal(nextPausedOnKey({ running: true, state: 'playing', paused: false }), true);
  assert.equal(nextPausedOnKey({ running: true, state: 'playing', paused: true }), false);
});

test('P / Esc do nothing once the round is over or before it starts', () => {
  assert.equal(nextPausedOnKey({ running: true, state: 'over', paused: false }), false);
  assert.equal(nextPausedOnKey({ running: false, state: 'playing', paused: false }), false);
  assert.equal(canPause({ running: true, state: 'over', paused: false }), false);
  assert.equal(canPause({ running: true, state: 'playing', paused: false }), true);
});

test('auto-pause: hidden tab or portrait pauses a live round only', () => {
  const live = { running: true, state: 'playing', paused: false };
  assert.equal(shouldAutoPause({ ...live, hidden: true, portrait: false }), true);
  assert.equal(shouldAutoPause({ ...live, hidden: false, portrait: true }), true);
  assert.equal(shouldAutoPause({ ...live, hidden: false, portrait: false }), false);
  assert.equal(shouldAutoPause({ ...live, state: 'over', hidden: true, portrait: false }), false);
  assert.equal(shouldAutoPause({ ...live, running: false, hidden: true, portrait: true }), false);
  assert.equal(shouldAutoPause({ ...live, paused: true, hidden: true, portrait: true }), false);
});

test('main.js wires the helpers: visibility, portrait query, and no raw 0:NN timer', () => {
  const src = readFileSync(new URL('../stickman-gunwars/src/main.js', import.meta.url), 'utf8');
  assert.match(src, /visibilitychange/);
  assert.match(src, /orientation: portrait/);
  assert.match(src, /formatTime\(game\.timeLeft\)/);
  assert.doesNotMatch(src, /`0:\$\{/);
});

test('static HTML timer placeholder also reads 1:00', () => {
  const html = readFileSync(new URL('../stickman-gunwars/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="timer">1:00</);
});
