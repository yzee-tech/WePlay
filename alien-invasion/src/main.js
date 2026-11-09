// Boot, input, game loop and screens for Alien Invasion.
import { Renderer } from './render.js';
import { AudioFx } from './audio.js';
import { Hud } from './hud.js';
import { Game } from './game.js';
import { InputDecoder } from './input.js';
import { Progress } from './stats.js';
import { LESSONS } from './words.js';
import { pickEnvironment, environmentFromString } from '../../shared/scenery.js';

const $ = (id) => document.getElementById(id);

function fatal(msg) {
  const f = $('fatal');
  f.textContent = msg;
  f.hidden = false;
}

try {
  if (!document.createElement('canvas').getContext('2d')) throw new Error('no canvas');
} catch (e) {
  fatal('Your browser cannot run this game. Please try a current Chrome, Firefox, Edge or Safari.');
  throw e;
}

let storage = null;
try { storage = window.localStorage; } catch (e) { /* private mode: progress just will not be saved */ }

const view = new Renderer($('stage'));
const audio = new AudioFx();
const hud = new Hud();
const progress = new Progress(storage);
const typer = $('typer');
const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
const envOverride = environmentFromString(new URLSearchParams(location.search).get('env'));

let game = null;
let state = 'menu'; // menu | playing | paused | over
let current = { mode: 'invasion', lessonIndex: 0 };

view.setEnvironment(envOverride || pickEnvironment());
hud.setBestLine(progress);
hud.showScreen('screen-start');
hud.showMenu('main');

// ---- typing input ----
const decoder = new InputDecoder(
  (ch) => {
    if (state !== 'playing') return;
    game.type(ch);
  },
  () => { if (state === 'playing') game.backspace(); },
);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state === 'playing') pause();
    else if (state === 'paused') resume();
    return;
  }
  if (state === 'playing' && decoder.keydown(e)) e.preventDefault();
});

typer.addEventListener('input', (e) => {
  if (state !== 'playing') return;
  decoder.input(typer.value);
  // Keep the field short, but never clear it in the middle of a keyboard composition.
  if (typer.value.length > 24 && !e.isComposing) { typer.value = ''; decoder.reset(); }
});

function focusTyper() {
  try { typer.focus({ preventScroll: true }); } catch (e) { typer.focus(); }
}
view.canvas.addEventListener('pointerdown', () => { if (state === 'playing') focusTyper(); });
typer.addEventListener('blur', () => {
  // On phones the keyboard can be dismissed (back button). Offer a way to bring it back.
  if (coarse && state === 'playing') $('btn-keyboard').hidden = false;
});
typer.addEventListener('focus', () => { $('btn-keyboard').hidden = true; });
$('btn-keyboard').addEventListener('click', focusTyper);

// ---- screens and game flow ----
function startGame(mode, lessonIndex = 0) {
  current = { mode, lessonIndex };
  audio.unlock();
  const lesson = mode === 'training' ? LESSONS[lessonIndex] : null;
  view.setEnvironment(envOverride || pickEnvironment());
  game = new Game({ mode, lesson, ...view.metrics() });
  game.start();
  state = 'playing';
  hud.hideScreens();
  hud.showHud(true);
  typer.value = '';
  decoder.reset();
  focusTyper();
  hud.update(game);
}

function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  typer.blur();
  $('btn-keyboard').hidden = true;
  hud.showScreen('screen-pause');
}

function resume() {
  if (state !== 'paused') return;
  state = 'playing';
  hud.hideScreens();
  focusTyper();
}

function toMenu() {
  state = 'menu';
  game = null;
  typer.blur();
  $('btn-keyboard').hidden = true;
  hud.showHud(false);
  hud.setBestLine(progress);
  hud.showMenu('main');
  hud.showScreen('screen-start');
}

function finish() {
  state = 'over';
  typer.blur();
  $('btn-keyboard').hidden = true;
  const info = game.result();
  const extra = progress.recordRun({ ...info, stats: game.stats });
  if (info.passed) {
    const i = LESSONS.findIndex((l) => l.id === info.lessonId);
    extra.nextLesson = LESSONS[i + 1] || null;
  }
  hud.update(game);
  hud.showResults(info, extra);
}

$('btn-invasion').addEventListener('click', () => startGame('invasion'));
$('btn-training').addEventListener('click', () => {
  hud.renderLessons(progress, (i) => startGame('training', i));
  hud.showMenu('training');
});
$('btn-lessons-back').addEventListener('click', () => hud.showMenu('main'));
$('btn-pause').addEventListener('click', pause);
$('btn-resume').addEventListener('click', resume);
$('btn-quit').addEventListener('click', toMenu);
$('btn-again').addEventListener('click', () => startGame(current.mode, current.lessonIndex));
$('btn-next').addEventListener('click', () => startGame('training', current.lessonIndex + 1));
$('btn-menu').addEventListener('click', toMenu);

const muteBtn = $('mute');
function syncMute() {
  muteBtn.textContent = audio.muted ? 'Sound off' : 'Sound on';
  muteBtn.setAttribute('aria-pressed', String(audio.muted));
}
muteBtn.addEventListener('click', () => { audio.setMuted(!audio.muted); syncMute(); if (state === 'playing') focusTyper(); });
syncMute();

document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

function onResize() {
  const m = view.resize();
  if (game) game.setMetrics(m);
}
window.addEventListener('resize', onResize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

// ---- loop ----
function playEvents(events) {
  for (const e of events) {
    if (e.type === 'key') audio.key();
    else if (e.type === 'error') audio.error();
    else if (e.type === 'destroy') audio.destroy(e.shipType === 'mothership' || e.shipType === 'boss');
    else if (e.type === 'leak') audio.leak();
    else if (e.type === 'wave') { hud.banner(e.boss ? `Wave ${e.wave} - Boss!` : `Wave ${e.wave}`); audio.wave(); }
    else if (e.type === 'waveClear' && e.bonus) hud.banner(`Wave clear! +${e.bonus}`, 1400);
    else if (e.type === 'over') audio.over();
    else if (e.type === 'won') audio.win();
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game && state === 'playing') {
    game.update(dt);
    const events = game.drainEvents();
    view.handleEvents(events, game);
    playEvents(events);
    hud.update(game);
    if (game.state === 'over' || game.state === 'won') finish();
  }
  view.update(state === 'paused' ? 0 : dt);
  view.draw(game);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Test hook for headless checks only: add ?debug=1 to the address.
if (new URLSearchParams(location.search).get('debug') === '1') {
  window.__alien = { get game() { return game; }, get state() { return state; }, view };
}
