// Sound effects synthesised with the Web Audio API. No audio files.
// unlock() must be called from a user gesture (the Start tap or click).
export class AudioFx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.muted = false;
    this.last = {};
    try { this.muted = localStorage.getItem('alieninvasion.muted') === '1'; } catch (e) { /* ignore */ }
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.45;
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
    try { localStorage.setItem('alieninvasion.muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
    if (this.master) this.master.gain.value = m ? 0 : 0.45;
  }

  // Rate limit per sound name, and stay silent until unlocked or when muted.
  ok(name, gap) {
    if (!this.ctx || this.muted) return false;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] ?? -1) < gap) return false;
    this.last[name] = now;
    return true;
  }

  tone(type, f0, f1, dur, vol) {
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noiseBurst(dur, f0, f1, vol) {
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(f0, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  key() { if (this.ok('key', 0.02)) this.tone('square', 880, 1100, 0.05, 0.05); }
  error() { if (this.ok('error', 0.08)) this.tone('sawtooth', 150, 90, 0.12, 0.09); }
  destroy(big) {
    if (!this.ok('destroy', 0.05)) return;
    this.tone('sawtooth', 600, 120, 0.25, 0.1);
    this.noiseBurst(big ? 0.6 : 0.35, 2400, 200, big ? 0.35 : 0.22);
  }
  leak() { if (this.ok('leak', 0.1)) { this.tone('square', 110, 40, 0.4, 0.16); this.noiseBurst(0.5, 900, 80, 0.4); } }
  wave() { if (this.ok('wave', 0.3)) { this.tone('triangle', 440, 660, 0.18, 0.12); setTimeout(() => this.ctx && !this.muted && this.tone('triangle', 660, 880, 0.25, 0.12), 150); } }
  over() { if (this.ok('over', 0.5)) { this.tone('sawtooth', 330, 55, 1.0, 0.16); this.noiseBurst(0.9, 1500, 60, 0.3); } }
  win() { if (this.ok('win', 0.5)) { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.ctx && !this.muted && this.tone('triangle', f, f, 0.22, 0.13), i * 120)); } }
}
