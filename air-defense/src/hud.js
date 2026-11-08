// HTML overlay: health bar, wave, score, mute button, banners and screens.
const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      healthFill: $('health-fill'), healthText: $('health-text'),
      wave: $('wave'), score: $('score'), high: $('high'),
      banner: $('banner'), mute: $('mute'),
      start: $('screen-start'), pause: $('screen-pause'), over: $('screen-over'),
      finalScore: $('final-score'), finalHigh: $('final-high'), finalWave: $('final-wave'),
      hud: $('hud'),
    };
    this.bannerTimer = null;
  }

  update(game, high) {
    const pct = Math.max(0, game.health) / 100;
    this.el.healthFill.style.width = `${pct * 100}%`;
    this.el.healthFill.classList.toggle('low', pct < 0.3);
    this.el.healthText.textContent = `${Math.ceil(Math.max(0, game.health))}`;
    this.el.wave.textContent = game.wave || 1;
    this.el.score.textContent = game.score;
    this.el.high.textContent = high;
  }

  banner(text) {
    const b = this.el.banner;
    b.textContent = text;
    b.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.remove('show'), 1800);
  }

  setMuted(m) {
    this.el.mute.textContent = m ? 'Sound off' : 'Sound on';
    this.el.mute.setAttribute('aria-pressed', String(m));
  }

  show(screen) {
    this.el.start.hidden = screen !== 'start';
    this.el.pause.hidden = screen !== 'pause';
    this.el.over.hidden = screen !== 'over';
    this.el.hud.hidden = screen === 'start';
  }

  gameOver(score, high, wave, isNew) {
    this.el.finalScore.textContent = score;
    this.el.finalHigh.textContent = isNew ? `${high} (new best!)` : high;
    this.el.finalWave.textContent = wave;
  }
}
