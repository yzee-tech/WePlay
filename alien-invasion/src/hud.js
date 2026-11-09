// HTML overlay: shield bar, wave, score, banners and the menu, pause and results screens.
import { CFG } from './config.js';
import { LESSONS } from './words.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['screen-start', 'screen-pause', 'screen-over'];

export class Hud {
  constructor() {
    this.bannerTimer = null;
  }

  showScreen(id) {
    for (const s of SCREENS) $(s).hidden = s !== id;
  }

  hideScreens() {
    for (const s of SCREENS) $(s).hidden = true;
  }

  showHud(on) {
    $('hud').hidden = !on;
  }

  update(game) {
    const pct = Math.max(0, game.shield) / CFG.base.maxShield;
    $('shield-fill').style.width = `${pct * 100}%`;
    $('shield-fill').classList.toggle('low', pct < 0.3);
    $('wave').textContent = game.wave || 1;
    $('score').textContent = game.score;
    $('wpm').textContent = game.stats.wpm;
    $('acc').textContent = Math.round(game.stats.accuracy * 100);
    const m = game.multiplier;
    $('combo-box').hidden = m < 2;
    $('mult').textContent = m;
  }

  banner(text, ms = 1800) {
    const b = $('banner');
    b.textContent = text;
    b.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => b.classList.remove('show'), ms);
  }

  setBestLine(progress) {
    const d = progress.data;
    $('best-line').textContent = d.bestScore || d.bestWpm ? `Best score ${d.bestScore} - best speed ${d.bestWpm} WPM` : '';
  }

  /** Training menu: one button per lesson, locked until the one before is passed. */
  renderLessons(progress, onPick) {
    const box = $('lesson-list');
    box.textContent = '';
    LESSONS.forEach((lesson, i) => {
      const open = progress.isUnlocked(LESSONS, i);
      const done = progress.data.passedLessons.includes(lesson.id);
      const b = document.createElement('button');
      b.type = 'button';
      b.disabled = !open;
      const name = document.createElement('span');
      name.textContent = `${i + 1}. ${lesson.name}`;
      const blurb = document.createElement('span');
      blurb.className = done ? 'blurb done' : 'blurb';
      blurb.textContent = done ? 'Passed' : open ? lesson.blurb : 'Locked';
      b.append(name, blurb);
      b.addEventListener('click', () => onPick(i));
      box.appendChild(b);
    });
  }

  showMenu(which) {
    $('menu-main').hidden = which !== 'main';
    $('menu-training').hidden = which !== 'training';
  }

  /** Results screen for a finished run. `info` is game.result() plus what the progress record says is new. */
  showResults(info, extra) {
    const { mode } = info;
    let title, sub = '';
    if (mode === 'invasion') {
      title = 'Base destroyed';
      sub = extra.newBestScore ? 'New best score!' : '';
    } else if (info.passed) {
      title = 'Lesson passed!';
      sub = extra.nextLesson ? `Next up: ${extra.nextLesson.name}` : 'You have cleared every lesson.';
    } else if (info.survived) {
      title = 'Lesson complete';
      sub = `Aim for ${Math.round(CFG.training.passAccuracy * 100)}% accuracy to unlock the next lesson.`;
    } else {
      title = 'Base destroyed';
      sub = 'Slow down a little and aim for accuracy first.';
    }
    $('over-title').textContent = title;
    $('over-sub').textContent = sub;
    const rows = [
      ['Score', info.score],
      ['Wave', info.wave],
      ['Speed', `${info.wpm} WPM`],
      ['Accuracy', `${Math.round(info.accuracy * 100)}%`],
      ['Best combo', info.bestCombo],
    ];
    const box = $('over-stats');
    box.textContent = '';
    for (const [k, v] of rows) {
      const a = document.createElement('span'); a.textContent = k;
      const b = document.createElement('b'); b.textContent = v;
      box.append(a, b);
    }
    $('over-keys').textContent = info.hardest.length
      ? `Hardest keys: ${info.hardest.map((h) => (h.key === ' ' ? 'space' : h.key)).join(', ')}`
      : 'No missed keys. Nice typing!';
    $('btn-next').hidden = !(info.passed && extra.nextLesson);
    this.showScreen('screen-over');
  }
}
