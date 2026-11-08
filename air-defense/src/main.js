import { Renderer } from './render.js';
import { Effects } from './effects.js';
import { AudioFx } from './audio.js';
import { Hud } from './hud.js';
import { Game } from './game.js';
import { pickEnvironment, environmentFromString } from './scenery.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.1;

function fatal(msg) {
  const f = document.getElementById('fatal');
  f.textContent = msg;
  f.hidden = false;
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) { return false; }
}

if (!webglAvailable()) {
  fatal('This game needs WebGL, which your browser or device has disabled or does not support.');
} else {
  start();
}

function start() {
  const view = new Renderer(document.getElementById('stage'));
  const fx = new Effects(view.scene);

  // Scenery: one random environment per game. The start screen shows the
  // first game's environment (no re-roll when Start is clicked); Play Again
  // picks a fresh one. '?env=night:city' pins one environment for the whole
  // session (verification/debugging only). pickEnvironment draws from
  // Math.random, never from the gameplay rng.
  const pinnedEnv = environmentFromString(new URLSearchParams(window.location.search).get('env'));
  let gamesPlayed = 0;
  view.setEnvironment(pinnedEnv || pickEnvironment());
  const audio = new AudioFx();
  const hud = new Hud();
  const game = new Game({ halfWidth: view.halfWidth });

  let high = 0;
  try { high = +localStorage.getItem('airdefense.highscore') || 0; } catch (e) { /* ignore */ }

  let mode = 'start'; // 'start' | 'playing' | 'paused' | 'over'
  let mouse = { x: 0, y: 10 };
  let lastTime = performance.now();
  let acc = 0;
  let clock = 0;
  let tick = 0;

  hud.setMuted(audio.muted);
  hud.show('start');
  hud.update(game, high);
  game.setHalfWidth(view.halfWidth);
  window.addEventListener('resize', () => game.setHalfWidth(view.halfWidth));

  function begin() {
    audio.unlock();
    if (gamesPlayed > 0) view.setEnvironment(pinnedEnv || pickEnvironment()); // Play Again re-rolls
    gamesPlayed++;
    game.reset();
    fx.clear();
    audio.alarm(false);
    mode = 'playing';
    hud.show(null);
    hud.banner('Defend the turret');
  }

  function pause() {
    if (mode !== 'playing') return;
    mode = 'paused';
    audio.alarm(false);
    hud.show('pause');
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = 'playing';
    lastTime = performance.now();
    hud.show(null);
  }

  document.getElementById('btn-start').addEventListener('click', begin);
  document.getElementById('btn-resume').addEventListener('click', resume);
  document.getElementById('btn-restart').addEventListener('click', begin);
  document.getElementById('mute').addEventListener('click', () => {
    audio.unlock();
    audio.setMuted(!audio.muted);
    hud.setMuted(audio.muted);
  });

  view.canvas.addEventListener('pointermove', (e) => { mouse = view.toWorld(e.clientX, e.clientY); });
  view.canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || mode !== 'playing') return;
    mouse = view.toWorld(e.clientX, e.clientY);
    game.fire(mouse.x, mouse.y);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (mode === 'playing') pause(); else if (mode === 'paused') resume();
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  function handleEvents() {
    for (const e of game.drainEvents()) {
      switch (e.type) {
        case 'fire': audio.launch(); break;
        case 'explosion':
          fx.explode(e.x, e.y, e.kind, e.size);
          audio.explosion(e.kind === 'plane' && e.size > 1.3);
          if (e.kind === 'plane') view.addShake(0.25);
          if (e.kind === 'turretHit') { view.addShake(0.8); audio.bombHit(); view.flashDamage(); }
          break;
        case 'waveStart': hud.banner(`Wave ${e.wave}`); break;
        case 'lowHealth': audio.alarm(true); hud.banner('Turret critical!'); break;
        case 'gameOver': {
          audio.alarm(false);
          audio.gameOver();
          const isNew = e.score > high;
          if (isNew) {
            high = e.score;
            try { localStorage.setItem('airdefense.highscore', String(high)); } catch (err) { /* ignore */ }
          }
          hud.gameOver(e.score, high, e.wave, isNew);
          mode = 'over';
          setTimeout(() => { if (mode === 'over') hud.show('over'); }, 900);
          break;
        }
        default: break;
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(MAX_FRAME, (now - lastTime) / 1000);
    lastTime = now;
    clock += dt;

    if (mode === 'playing' || mode === 'over') {
      acc += dt;
      while (acc >= STEP) {
        if (mode === 'playing') game.aim(mouse.x, mouse.y);
        game.update(STEP);
        acc -= STEP;
        tick++;
        if (tick % 2 === 0) for (const m of game.missiles) fx.smoke(m.x - m.dx * 0.5, m.y - m.dy * 0.5);
        handleEvents();
      }
      hud.update(game, high);
    }
    fx.update(mode === 'paused' ? 0 : dt);
    view.sync(game, clock);
    view.render(mode === 'paused' ? 0 : dt);
  }
  requestAnimationFrame(frame);

  // Test hook for automated checks.
  window.__airdefense = {
    game,
    get mode() { return mode; },
    get environment() { return view.env ? { theme: view.env.theme, landscape: view.env.landscape } : null; },
  };
}
