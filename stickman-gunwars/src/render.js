// Plain 2D canvas renderer. Reads game state, never changes it.
// The whole 1600x900 arena is scaled to fit the screen (letterboxed), so every phone sees the same layout.
import { CFG } from './config.js';
import { THEMES } from '../../shared/scenery.js';

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const COLORS = [{ body: '#14121c', tag: '#6ee7b7' }, { body: '#2a1218', tag: '#f58a7b' }];

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Renderer {
  constructor(container) {
    this.canvas = document.createElement('canvas');
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.theme = THEMES.sunset;
    this.particles = [];
    this.scale = 1; this.ox = 0; this.oy = 0;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth, H = window.innerHeight;
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = `${W}px`; this.canvas.style.height = `${H}px`;
    this.dpr = dpr;
    this.scale = Math.min(W / CFG.world.w, H / CFG.world.h);
    this.ox = (W - CFG.world.w * this.scale) / 2;
    this.oy = (H - CFG.world.h * this.scale) / 2;
    this.makeBackground(W, H);
  }

  /** World point -> client (screen) pixel. Used by input to aim from the player's position. */
  toClient(x, y) { return { x: this.ox + x * this.scale, y: this.oy + y * this.scale }; }

  makeBackground(W, H) {
    const bg = document.createElement('canvas');
    bg.width = Math.round(W * this.dpr); bg.height = Math.round(H * this.dpr);
    const c = bg.getContext('2d');
    c.scale(this.dpr, this.dpr);
    const [top, mid, low] = this.theme.sky;
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, hex(top)); g.addColorStop(0.55, hex(mid)); g.addColorStop(1, hex(low));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // sun
    const sx = W * 0.72, sy = H * 0.5, sr = H * 0.13;
    c.fillStyle = 'rgba(255,190,100,0.3)'; c.beginPath(); c.arc(sx, sy, sr * 1.7, 0, 7); c.fill();
    c.fillStyle = hex(this.theme.disc.color); c.beginPath(); c.arc(sx, sy, sr, 0, 7); c.fill();
    // mountains: two silhouette layers
    const rng = mulberry(7);
    for (const [tone, base, amp] of [[this.theme.tones.far, 0.62, 0.22], [this.theme.tones.near, 0.78, 0.16]]) {
      c.fillStyle = hex(tone); c.beginPath(); c.moveTo(0, H);
      for (let x = 0; x <= W + 80; x += 80) c.lineTo(x, H * base - rng() * H * amp);
      c.lineTo(W, H); c.closePath(); c.fill();
    }
    this.bg = bg;
    this.clouds = Array.from({ length: 4 }, (_, i) => ({ x: rng() * CFG.world.w, y: 70 + rng() * 140, s: 0.7 + rng() * 0.8, v: 6 + i * 2 }));
  }

  spawnHit(x, y) {
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * 7, s = 80 + Math.random() * 200;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0.4 });
    }
  }

  draw(game, dt) {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.drawImage(this.bg, 0, 0, this.canvas.width / this.dpr, this.canvas.height / this.dpr);
    c.save();
    c.translate(this.ox, this.oy); c.scale(this.scale, this.scale);
    c.beginPath(); c.rect(0, 0, CFG.world.w, CFG.world.h); c.clip();
    for (const cl of this.clouds) {
      cl.x = (cl.x + cl.v * dt) % (CFG.world.w + 300);
      c.fillStyle = 'rgba(255,217,192,0.5)';
      const x = cl.x - 150;
      c.beginPath(); c.ellipse(x, cl.y, 70 * cl.s, 14 * cl.s, 0, 0, 7); c.ellipse(x - 12 * cl.s, cl.y - 12 * cl.s, 36 * cl.s, 14 * cl.s, 0, 0, 7); c.fill();
    }
    for (const p of CFG.platforms) this.platform(c, p);
    for (const f of game.fighters) if (f.alive || f.y < CFG.world.h + 40) this.stickman(c, f);
    this.bullets(c, game);
    this.parts(c, dt);
    c.restore();
  }

  platform(c, p) {
    const x = p.x - p.w / 2;
    c.fillStyle = '#2b2e22';
    c.beginPath(); c.moveTo(x, p.y + 8); c.lineTo(x + p.w, p.y + 8); c.lineTo(x + p.w * 0.8, p.y + 30); c.lineTo(x + p.w * 0.2, p.y + 30); c.closePath(); c.fill();
    c.fillStyle = hex(this.theme.tones.groundTop); c.fillRect(x, p.y, p.w, 9);
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x, p.y, p.w, 2);
  }

  stickman(c, f) {
    const col = COLORS[f.id], H = CFG.fighter.h;
    c.save();
    c.translate(f.x, f.y);
    c.strokeStyle = f.hurt > 0 ? '#ffffff' : col.body; c.fillStyle = c.strokeStyle;
    c.lineWidth = 4; c.lineCap = 'round'; c.lineJoin = 'round';
    const hipY = -24, shoulderY = -42;
    const swing = f.onGround ? Math.sin(f.anim * 4) * Math.min(1, Math.abs(f.vx) / 150) : 0.5;
    c.beginPath();
    c.moveTo(0, shoulderY); c.lineTo(0, hipY);                    // torso
    c.moveTo(0, hipY); c.lineTo(-9 * swing - 3, 0);               // legs
    c.moveTo(0, hipY); c.lineTo(9 * swing + 3, 0);
    c.stroke();
    c.beginPath(); c.arc(0, -H + 6, 7, 0, 7); c.fill();           // head
    // arm + pistol along the aim angle
    const ax = Math.cos(f.aim), ay = Math.sin(f.aim);
    c.beginPath(); c.moveTo(0, shoulderY + 2); c.lineTo(ax * 16, shoulderY + 2 + ay * 16); c.stroke();
    c.lineWidth = 6; c.beginPath();
    c.moveTo(ax * 14, shoulderY + 2 + ay * 14); c.lineTo(ax * 26, shoulderY + 2 + ay * 26); c.stroke();
    c.restore();
    if (f.alive) {
      c.fillStyle = col.tag; c.font = '700 15px system-ui, sans-serif'; c.textAlign = 'center';
      c.fillText(f.id === 0 ? 'YOU' : 'DUMMY', f.x, f.y - H - 10);
    }
  }

  bullets(c, game) {
    c.fillStyle = '#ffe28a'; c.strokeStyle = '#ffe28a'; c.lineWidth = 3; c.lineCap = 'round';
    for (const b of game.bullets) {
      const n = Math.hypot(b.vx, b.vy) || 1;
      c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x - (b.vx / n) * 14, b.y - (b.vy / n) * 14); c.stroke();
    }
  }

  parts(c, dt) {
    this.particles = this.particles.filter((p) => (p.life -= dt) > 0);
    c.fillStyle = '#ff9a6a';
    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 600 * dt;
      c.globalAlpha = Math.max(0, p.life / 0.4); c.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    c.globalAlpha = 1;
  }
}
