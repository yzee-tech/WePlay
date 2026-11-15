// Sound effects synthesised with the Web Audio API. No audio files.
// unlock() must be called from a user gesture (the Start tap or click).
export class AudioFx {
  constructor() {
    this.ctx = null; this.master = null; this.noise = null; this.muted = false; this.last = {};
    try { this.muted = localStorage.getItem('gunwars.muted') === '1'; } catch (e) { /* ignore */ }
  }
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.4;
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
    try { localStorage.setItem('gunwars.muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
    if (this.master) this.master.gain.value = m ? 0 : 0.4;
  }
  ok(name, gap) {
    if (!this.ctx || this.muted) return false;
    const now = this.ctx.currentTime;
    if (now - (this.last[name] ?? -1) < gap) return false;
    this.last[name] = now;
    return true;
  }
  tone(type, f0, f1, dur, vol) {
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  burst(dur, vol, freq) {
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur + 0.02);
  }
  play(e) {
    if (e.type === 'shoot' && this.ok('shoot' + e.id, 0.05)) { this.burst(0.09, 0.5, 1800); this.tone('square', 520, 140, 0.08, 0.12); }
    else if (e.type === 'hit' && this.ok('hit', 0.04)) { this.tone('sawtooth', 220, 70, 0.12, 0.25); }
    else if (e.type === 'jump' && this.ok('jump' + e.id, 0.1)) { this.tone('sine', 260, 520, 0.12, 0.12); }
    else if (e.type === 'fall' && this.ok('fall', 0.3)) { this.tone('sine', 600, 80, 0.6, 0.25); }
    else if (e.type === 'over' && this.ok('over', 0.5)) {
      if (e.winner === 0) { this.tone('triangle', 440, 660, 0.25, 0.25); setTimeout(() => this.ctx && this.tone('triangle', 660, 880, 0.35, 0.25), 220); }
      else this.tone('triangle', 330, 120, 0.6, 0.25);
    }
  }
}
