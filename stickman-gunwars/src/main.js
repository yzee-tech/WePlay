import { Game } from './game.js';
import { Renderer } from './render.js';
import { Controls } from './input.js';
import { AudioFx } from './audio.js';
import { CFG } from './config.js';

const $ = (id) => document.getElementById(id);
const els = { stage: $('stage'), joy: $('joy'), knob: $('knob'), jump: $('btn-jump'), fire: $('btn-fire') };

const game = new Game();
const view = new Renderer(els.stage);
const controls = new Controls(els);
const audio = new AudioFx();
let running = false, paused = false, last = 0, bannerTimer = 0;

const show = (id, on) => { $(id).hidden = !on; };
const bannerEl = $('banner');
function showBanner(text, ms = 1200) { bannerEl.textContent = text; bannerEl.classList.add('show'); clearTimeout(bannerTimer); bannerTimer = setTimeout(() => bannerEl.classList.remove('show'), ms); }

function startRound() {
  game.reset();
  show('screen-start', false); show('screen-over', false); show('screen-pause', false);
  show('hud', true); show('touch', true);
  paused = false; running = true;
  showBanner('Fight!');
}

function updateHud() {
  const [a, b] = game.fighters;
  $('hp0').style.width = `${a.health}%`; $('hp1').style.width = `${b.health}%`;
  $('hp0-text').textContent = a.health; $('hp1-text').textContent = b.health;
  $('timer').textContent = `0:${String(Math.ceil(game.timeLeft)).padStart(2, '0')}`;
}

function onOver(e) {
  const msg = e.winner === -1 ? 'Draw' : e.winner === 0 ? 'You win the round!' : 'You lost the round';
  const loserIsYou = e.winner === 1;
  const why = { fall: loserIsYou ? 'You fell off the edge.' : 'The dummy fell off the edge.', health: loserIsYou ? 'Your health ran out.' : 'The dummy ran out of health.', time: 'Time ran out.' }[e.reason];
  $('over-title').textContent = msg;
  $('over-why').textContent = why;
  setTimeout(() => { if (game.state === 'over') { show('screen-over', true); show('touch', false); } }, 900);
}

function frame(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0);
  last = t;
  if (running && !paused) {
    const p = game.fighters[0];
    const from = view.toClient(p.x, p.y - 36);
    game.setInput(0, controls.read(from));
    game.update(dt);
    for (const e of game.takeEvents()) {
      audio.play(e);
      if (e.type === 'hit') view.spawnHit(e.x, e.y);
      if (e.type === 'over') onOver(e);
    }
    updateHud();
  }
  view.draw(game, paused ? 0 : dt);
  requestAnimationFrame(frame);
}

$('btn-start').addEventListener('click', () => { audio.unlock(); startRound(); });
$('btn-restart').addEventListener('click', () => { audio.unlock(); startRound(); });
$('btn-pause').addEventListener('click', () => { paused = true; show('screen-pause', true); });
$('btn-resume').addEventListener('click', () => { paused = false; show('screen-pause', false); });
$('mute').addEventListener('click', () => {
  audio.unlock(); audio.setMuted(!audio.muted);
  $('mute').textContent = audio.muted ? 'Sound off' : 'Sound on';
  $('mute').setAttribute('aria-pressed', String(audio.muted));
});
$('mute').textContent = audio.muted ? 'Sound off' : 'Sound on';
addEventListener('resize', () => view.resize());
addEventListener('orientationchange', () => setTimeout(() => view.resize(), 200));
addEventListener('keydown', (e) => { if (running && (e.key === 'p' || e.key === 'Escape')) { paused = !paused; show('screen-pause', paused); } });
// Debug hook for tests and screenshots only: ?debug exposes the game object.
if (location.search.includes('debug')) window.__gunwars = { game, CFG };
requestAnimationFrame(frame);
