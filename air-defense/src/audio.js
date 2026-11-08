// Sound effects synthesised with the Web Audio API. No audio files.
export class AudioFx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.last = {};
    this.activeExplosions = 0;
    this.alarmTimer = null;
    try { this.muted = localStorage.getItem('airdefense.muted') === '1'; } catch (e) { /* ignore */ }
  }

  /** Must be called from a user gesture (click on START). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('airdefense.muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  ok(name, gap) {
    if (!this.ctx || this.muted) return false;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] || -1) < gap) return false;
    this.last[name] = now;
    return true;
  }

  noiseBurst(dur, f0, f1, type, vol) {
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const filt = c.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  tone(type, f0, f1, dur, vol, delay = 0) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  launch() {
    if (!this.ok('launch', 0.05)) return;
    this.noiseBurst(0.3, 600, 3000, 'bandpass', 0.5);
    this.tone('sawtooth', 220, 80, 0.15, 0.15);
  }

  explosion(big = false) {
    if (!this.ok('explosion', 0.04) || this.activeExplosions >= 6) return;
    this.activeExplosions++;
    setTimeout(() => { this.activeExplosions--; }, 400);
    this.noiseBurst(big ? 0.9 : 0.6, 1800, 120, 'lowpass', big ? 0.9 : 0.6);
    this.tone('sine', 120, 35, 0.5, big ? 0.6 : 0.4);
  }

  bombHit() {
    if (!this.ok('bombHit', 0.1)) return;
    this.tone('sine', 90, 30, 0.4, 0.8);
    this.noiseBurst(0.35, 900, 90, 'lowpass', 0.7);
  }

  gameOver() {
    if (!this.ctx || this.muted) return;
    [0, 1, 2, 3].forEach((i) => this.tone('sawtooth', 330 - i * 50, 180 - i * 30, 0.4, 0.25, i * 0.25));
  }

  alarm(on) {
    if (on && !this.alarmTimer) {
      const beep = () => { if (this.ctx && !this.muted) this.tone('square', 880, 880, 0.12, 0.12); };
      beep();
      this.alarmTimer = setInterval(beep, 700);
    } else if (!on && this.alarmTimer) {
      clearInterval(this.alarmTimer);
      this.alarmTimer = null;
    }
  }
}
