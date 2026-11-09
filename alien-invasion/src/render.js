// Plain 2D canvas renderer. Reads game state, never changes it.
// World units: x = 0 is the middle, y = 0 is the ground, the camera shows y from camBottom to camTop.
// The scenery data (sky, landscapes) comes from shared/scenery.js, the same data Air Defense uses.
import { CFG } from './config.js';
import { resolveEnvironment, DEFAULT_ENV } from '../../shared/scenery.js';

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const SHIP_COLORS = {
  scout: { hull: '#7bd44a', trim: '#3f8f2a', light: '#e9ff9a', alien: '#4fae33' },
  cruiser: { hull: '#a674e8', trim: '#6a3fb0', light: '#f2d9ff', alien: '#8a55d0' },
  mothership: { hull: '#f39a45', trim: '#b4601c', light: '#fff0b0', alien: '#d9792a' },
  boss: { hull: '#e84c6e', trim: '#912b45', light: '#ffd2dc', alien: '#c2304f' },
};

/** Word label font size in px for a render scale (px per world unit). Exported so tests can check it. */
export function labelFontPx(scale) {
  const f = CFG.labelFont;
  return Math.max(f.minPx, Math.min(f.maxPx, scale * f.ratio));
}

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
    this.bg = document.createElement('canvas');
    this.env = resolveEnvironment(DEFAULT_ENV);
    this.particles = [];
    this.rings = [];
    this.flash = 0; // red flash after a hit
    this.shake = 0;
    this.errorFlash = 0;
    this.laser = 0; // seconds of laser glow left
    this.clouds = [];
    this.time = 0;
    this.W = 1; this.H = 1; this.dpr = 1; this.scale = 1;
    this.resize();
  }

  /** Visible size: use the visual viewport so the play area sits above an open soft keyboard. */
  viewSize() {
    const vv = window.visualViewport;
    return { w: Math.max(1, Math.round(vv ? vv.width : window.innerWidth)), h: Math.max(1, Math.round(vv ? vv.height : window.innerHeight)) };
  }

  resize() {
    const { w, h } = this.viewSize();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = w; this.H = h;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.scale = h / (CFG.camTop - CFG.camBottom);
    this.fontPx = labelFontPx(this.scale);
    this.font = `700 ${this.fontPx}px ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`;
    const m = this.ctx;
    m.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    m.font = this.font;
    this.charPx = m.measureText('M').width;
    this.buildBackground();
    return this.metrics();
  }

  metrics() {
    return { halfWidth: this.W / 2 / this.scale, charWidth: this.charPx / this.scale };
  }

  toX(x) { return this.W / 2 + x * this.scale; }
  toY(y) { return this.H - (y - CFG.camBottom) * this.scale; }

  setEnvironment(key) {
    this.env = resolveEnvironment(key) || resolveEnvironment(DEFAULT_ENV);
    this.buildBackground();
    this.buildClouds();
  }

  // ---- static background (sky, stars, sun or moon, landscape, ground), cached ----
  buildBackground() {
    const { W, H } = this;
    this.bg.width = Math.round(W * this.dpr);
    this.bg.height = Math.round(H * this.dpr);
    const c = this.bg.getContext('2d');
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const env = this.env;
    const groundY = this.toY(0);

    const g = c.createLinearGradient(0, 0, 0, groundY);
    g.addColorStop(0, hex(env.sky[0]));
    g.addColorStop(0.5, hex(env.sky[1]));
    g.addColorStop(1, hex(env.sky[2]));
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    if (env.stars) {
      const rnd = mulberry(1234);
      c.fillStyle = '#f4f6ff';
      for (let i = 0; i < env.starCount; i++) {
        const x = rnd() * W, y = rnd() * groundY * 0.85, r = 0.5 + rnd() * 1.3;
        c.globalAlpha = 0.5 + rnd() * 0.5;
        c.fillRect(x, y, r, r);
      }
      c.globalAlpha = 1;
    }

    if (env.disc) this.drawDisc(c, env.disc);

    // Landscape, far to near.
    const prims = [...env.primitives].sort((a, b) => a.z - b.z);
    for (const p of prims) if (p.kind !== 'boat') this.drawPrimitive(c, p, env);

    // Ground strip.
    c.fillStyle = hex(env.groundTone);
    c.fillRect(0, groundY, W, H - groundY);
    c.fillStyle = hex(env.groundTopTone);
    c.fillRect(0, groundY, W, Math.max(3, this.scale * 0.25));
  }

  drawDisc(c, disc) {
    // Keep the disc on screen on narrow phones.
    const half = this.W / 2 / this.scale;
    const x = Math.max(-half + disc.r * 1.8, Math.min(half - disc.r * 1.8, disc.x));
    const px = this.toX(x), py = this.toY(disc.y), r = disc.r * this.scale;
    if (disc.glow) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      for (const [rad, a] of [[disc.r * 1.6, disc.glow.opacity], [disc.glow.r, disc.glow.opacity * 0.4]]) {
        const rg = c.createRadialGradient(px, py, 0, px, py, rad * this.scale);
        rg.addColorStop(0, hex(disc.glow.color));
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        c.globalAlpha = a * 1.6;
        c.fillStyle = rg;
        c.beginPath(); c.arc(px, py, rad * this.scale, 0, Math.PI * 2); c.fill();
      }
      c.restore();
    }
    if (disc.rays) {
      const { count, length, width, color } = disc.rays;
      c.fillStyle = hex(color);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const r0 = r * 1.25, r1 = r * 1.25 + length * this.scale;
        const w = (width * this.scale) / 2;
        c.save();
        c.translate(px, py); c.rotate(a);
        c.beginPath(); c.moveTo(r0, -w); c.lineTo(r1, 0); c.lineTo(r0, w); c.closePath(); c.fill();
        c.restore();
      }
    }
    c.fillStyle = hex(disc.color);
    c.beginPath(); c.arc(px, py, r, 0, Math.PI * 2); c.fill();
  }

  drawPrimitive(c, p, env) {
    const tone = hex(env.tones[p.tone] ?? env.tones.far);
    const S = this.scale;
    c.fillStyle = tone;
    if (p.kind === 'hill') {
      c.beginPath();
      c.moveTo(this.toX(p.x - p.w / 2), this.toY(0));
      c.quadraticCurveTo(this.toX(p.x), this.toY(p.h * 2), this.toX(p.x + p.w / 2), this.toY(0));
      c.closePath(); c.fill();
    } else if (p.kind === 'peak') {
      c.beginPath();
      c.moveTo(this.toX(p.x - p.w / 2), this.toY(0));
      c.lineTo(this.toX(p.x), this.toY(p.h));
      c.lineTo(this.toX(p.x + p.w / 2), this.toY(0));
      c.closePath(); c.fill();
      if (p.snow) {
        const f = 0.72;
        c.fillStyle = hex(env.tones.snow);
        c.beginPath();
        c.moveTo(this.toX(p.x - (p.w / 2) * (1 - f)), this.toY(p.h * f));
        c.lineTo(this.toX(p.x), this.toY(p.h));
        c.lineTo(this.toX(p.x + (p.w / 2) * (1 - f)), this.toY(p.h * f));
        c.closePath(); c.fill();
      }
    } else if (p.kind === 'rect') {
      c.fillRect(this.toX(p.x - p.w / 2), this.toY(p.h), p.w * S, p.h * S);
      if (p.windows && env.windowsLit) {
        c.fillStyle = hex(env.tones.window);
        const cols = Math.max(2, Math.floor(p.w / 1.1));
        const rows = Math.max(2, Math.floor(p.h / 1.1));
        for (let r = 0; r < rows; r++) {
          for (let k = 0; k < cols; k++) {
            if ((r * 7 + k * 3 + Math.round(p.x)) % 3 === 0) continue;
            const wx = p.x - p.w / 2 + ((k + 0.5) * p.w) / cols;
            const wy = ((r + 0.5) * p.h) / rows;
            c.fillRect(this.toX(wx) - 0.11 * S, this.toY(wy) - 0.15 * S, 0.22 * S, 0.3 * S);
          }
        }
      }
    } else if (p.kind === 'band') {
      c.globalAlpha = 0.9;
      c.fillRect(0, this.toY(p.y + p.h), this.W, p.h * S);
      c.globalAlpha = 1;
    } else if (p.kind === 'cactus') {
      const s = (p.scale || 1) * S;
      const x = this.toX(p.x), y = this.toY(0);
      const rr = (cx, cy, w, h) => { c.beginPath(); c.roundRect(cx - w / 2, cy - h, w, h, w / 2); c.fill(); };
      rr(x, y, 0.3 * s, 1.5 * s);
      rr(x - 0.34 * s, y - 0.5 * s, 0.2 * s, 0.7 * s);
      rr(x + 0.34 * s, y - 0.35 * s, 0.2 * s, 0.6 * s);
    }
  }

  buildClouds() {
    const C = CFG.scenery.clouds;
    const rnd = mulberry(99);
    const half = Math.max(this.W / 2 / this.scale, 12);
    this.clouds = [];
    for (let i = 0; i < C.count; i++) {
      const puffs = [];
      const n = 3 + Math.floor(rnd() * 2);
      for (let k = 0; k < n; k++) puffs.push({ dx: (k - (n - 1) / 2) * 0.9 + (rnd() - 0.5) * 0.3, dy: (rnd() - 0.3) * 0.4, r: 0.55 + rnd() * 0.45 });
      this.clouds.push({
        x: (rnd() * 2 - 1) * (half + 4), y: C.minY + rnd() * (C.maxY - C.minY),
        speed: (C.minSpeed + rnd() * (C.maxSpeed - C.minSpeed)) * 60 * (i % 3 === 0 ? 1.6 : 1),
        scale: 0.8 + rnd() * 0.8, puffs, phase: rnd() * 6,
      });
    }
  }

  // ---- events from the game: particles and sound cues ----
  handleEvents(events, game) {
    for (const e of events) {
      if (e.type === 'destroy') {
        const color = SHIP_COLORS[e.shipType];
        const n = e.shipType === 'boss' ? 60 : e.shipType === 'mothership' ? 36 : 22;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 6;
          this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.5, max: 1, color: Math.random() < 0.5 ? color.hull : '#ffd86b', size: 2 + Math.random() * 4 });
        }
        this.rings.push({ x: e.x, y: e.y, r: 0.2, max: e.half * 1.4 + 1, life: 0.45, maxLife: 0.45 });
        this.laser = 0.12;
      } else if (e.type === 'leak') {
        this.flash = 0.6; this.shake = 0.5;
        for (let i = 0; i < 26; i++) {
          const a = Math.PI * Math.random(), sp = 2 + Math.random() * 6;
          this.particles.push({ x: e.x, y: CFG.hitY - 1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.6, max: 1, color: Math.random() < 0.5 ? '#ff7a4a' : '#ffd86b', size: 3 + Math.random() * 4 });
        }
      } else if (e.type === 'error') {
        this.errorFlash = 0.25;
      } else if (e.type === 'key') {
        this.laser = 0.1;
      }
    }
  }

  update(dt) {
    this.time += dt;
    const half = Math.max(this.W / 2 / this.scale, 12) + 4;
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x > half) c.x = -half;
    }
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 9 * dt; p.life -= dt; }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
    this.flash = Math.max(0, this.flash - dt * 1.4);
    this.shake = Math.max(0, this.shake - dt * 1.8);
    this.errorFlash = Math.max(0, this.errorFlash - dt * 1.5);
    this.laser = Math.max(0, this.laser - dt);
  }

  // ---- drawing ----
  draw(game) {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.W, this.H);
    if (this.shake > 0) c.translate((Math.random() - 0.5) * 10 * this.shake, (Math.random() - 0.5) * 10 * this.shake);
    c.drawImage(this.bg, 0, 0, this.W, this.H);
    this.drawClouds(c);
    this.drawBoats(c);
    this.drawBase(c, game);
    if (game) {
      for (const s of game.ships) this.drawShip(c, s, game.target === s);
      if (game.target) this.drawLaser(c, game.target);
    }
    this.drawEffects(c);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.flash > 0) { c.fillStyle = `rgba(255,70,40,${this.flash * 0.35})`; c.fillRect(0, 0, this.W, this.H); }
    if (this.errorFlash > 0) { c.fillStyle = `rgba(255,60,60,${this.errorFlash * 0.18})`; c.fillRect(0, 0, this.W, this.H); }
  }

  drawClouds(c) {
    const env = this.env;
    c.fillStyle = hex(env.cloud.color);
    c.globalAlpha = env.cloud.opacity;
    for (const k of this.clouds) {
      const bob = Math.sin(this.time * 0.4 + k.phase) * 0.2;
      c.beginPath();
      for (const p of k.puffs) {
        const x = this.toX(k.x + p.dx * k.scale), y = this.toY(k.y + bob + p.dy * k.scale), r = p.r * k.scale * this.scale;
        c.moveTo(x + r, y);
        c.arc(x, y, r, 0, Math.PI * 2);
      }
      c.fill();
    }
    c.globalAlpha = 1;
  }

  drawBoats(c) {
    for (const p of this.env.primitives) {
      if (p.kind !== 'boat') continue;
      const S = this.scale;
      const bob = Math.sin(this.time * 0.9 + p.x * 0.7) * 0.06;
      const x = this.toX(p.x), y = this.toY(p.y + bob);
      c.fillStyle = hex(this.env.tones.far);
      c.fillRect(x - 0.6 * S, y - 0.25 * S, 1.2 * S, 0.25 * S);
      c.beginPath(); c.moveTo(x - 0.1 * S, y - 0.25 * S); c.lineTo(x - 0.08 * S, y - 1.1 * S); c.lineTo(x + 0.45 * S, y - 0.25 * S); c.closePath(); c.fill();
    }
  }

  drawBase(c, game) {
    const S = this.scale;
    const x = this.toX(0), y = this.toY(0);
    const shieldPct = game ? game.shield / CFG.base.maxShield : 1;
    // Shield bubble.
    c.save();
    c.strokeStyle = `rgba(120,230,255,${0.2 + 0.5 * shieldPct})`;
    c.fillStyle = `rgba(120,230,255,${0.05 + 0.1 * shieldPct})`;
    c.lineWidth = 2;
    c.beginPath(); c.arc(x, y, 2.6 * S, Math.PI, 0); c.closePath(); c.fill(); c.stroke();
    c.restore();
    // Barrel aims at the target.
    let ang = -Math.PI / 2;
    if (game && game.target) ang = Math.atan2(this.toY(game.target.y) - this.toY(CFG.base.muzzleY), this.toX(game.target.x) - x);
    c.save();
    c.translate(x, y - 1.0 * S);
    c.rotate(ang);
    c.fillStyle = '#4a5663';
    c.fillRect(0, -0.15 * S, 1.3 * S, 0.3 * S);
    c.fillStyle = '#7fe3ff';
    c.fillRect(1.2 * S, -0.18 * S, 0.2 * S, 0.36 * S);
    c.restore();
    // Dome and plinth.
    c.fillStyle = '#d7dee6';
    c.beginPath(); c.arc(x, y - 0.4 * S, 1.0 * S, Math.PI, 0); c.closePath(); c.fill();
    c.fillStyle = '#4fd0f0';
    c.beginPath(); c.arc(x, y - 0.75 * S, 0.3 * S, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#333c47';
    c.fillRect(x - 1.5 * S, y - 0.42 * S, 3.0 * S, 0.5 * S);
    c.fillStyle = '#7fe3ff';
    c.fillRect(x - 1.1 * S, y - 0.25 * S, 0.5 * S, 0.1 * S);
    c.fillRect(x + 0.6 * S, y - 0.25 * S, 0.5 * S, 0.1 * S);
  }

  drawLaser(c, ship) {
    const x0 = this.toX(0), y0 = this.toY(CFG.base.muzzleY);
    const x1 = this.toX(ship.x), y1 = this.toY(ship.y);
    // A thin targeting line always; a bright beam flashes on each correct key.
    c.save();
    c.strokeStyle = 'rgba(255,230,120,0.45)';
    c.lineWidth = 1.5;
    c.setLineDash([6, 8]);
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    c.setLineDash([]);
    if (this.laser > 0) {
      c.strokeStyle = `rgba(110,240,255,${Math.min(1, this.laser * 9)})`;
      c.shadowColor = '#6ef0ff'; c.shadowBlur = 12;
      c.lineWidth = 4;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
    c.restore();
  }

  drawShip(c, s, targeted) {
    const S = this.scale;
    const col = SHIP_COLORS[s.type];
    const sway = Math.sin(this.time * 1.3 + s.id * 1.7) * 0.08;
    const cx = this.toX(s.x + sway), cy = this.toY(s.y);
    const rx = s.half * S;
    const hullRx = Math.min(rx, { scout: 1.9, cruiser: 2.6, mothership: 3.4, boss: 4.4 }[s.type] * S);
    const hullH = hullRx * 0.3;

    // Engine glow.
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.beginPath(); c.moveTo(cx - hullRx * 0.5, cy + hullH * 0.6); c.lineTo(cx + hullRx * 0.5, cy + hullH * 0.6); c.lineTo(cx + hullRx * 0.8, cy + hullH * 2.4); c.lineTo(cx - hullRx * 0.8, cy + hullH * 2.4); c.closePath(); c.fill();
    // Dome with a small alien inside.
    const domeR = hullRx * 0.42;
    c.fillStyle = col.alien;
    c.beginPath(); c.arc(cx, cy - hullH * 0.2, domeR * 0.55, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(cx - domeR * 0.2, cy - hullH * 0.3, domeR * 0.13, 0, Math.PI * 2); c.arc(cx + domeR * 0.2, cy - hullH * 0.3, domeR * 0.13, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#18202a';
    c.beginPath(); c.arc(cx - domeR * 0.2, cy - hullH * 0.3, domeR * 0.06, 0, Math.PI * 2); c.arc(cx + domeR * 0.2, cy - hullH * 0.3, domeR * 0.06, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(190,235,255,0.55)';
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = 1.5;
    c.beginPath(); c.arc(cx, cy - hullH * 0.1, domeR, Math.PI, 0); c.closePath(); c.fill(); c.stroke();
    // Hull.
    c.fillStyle = col.hull;
    c.beginPath(); c.ellipse(cx, cy, hullRx, hullH, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = col.trim;
    c.beginPath(); c.ellipse(cx, cy + hullH * 0.35, hullRx * 0.9, hullH * 0.6, 0, 0, Math.PI); c.fill();
    // Lights.
    const lights = s.type === 'scout' ? 3 : s.type === 'cruiser' ? 5 : 7;
    for (let i = 0; i < lights; i++) {
      const t = (i + 0.5) / lights;
      const on = Math.sin(this.time * 4 + i + s.id) > -0.3;
      c.fillStyle = on ? col.light : col.trim;
      c.beginPath(); c.arc(cx + (t - 0.5) * hullRx * 1.7, cy + hullH * 0.1, Math.max(2, hullH * 0.2), 0, Math.PI * 2); c.fill();
    }
    if (targeted) {
      c.strokeStyle = '#ffe36b'; c.lineWidth = 2.5;
      c.beginPath(); c.ellipse(cx, cy, hullRx + 4, hullH + 4, 0, 0, Math.PI * 2); c.stroke();
    }

    // Word label under the ship.
    this.drawLabel(c, s, cx, cy + hullH + 6, rx, targeted);
  }

  /** Word plate with typed letters highlighted. Long sentences (bosses) wrap onto lines. */
  drawLabel(c, s, cx, top, maxHalf, targeted) {
    const cw = this.charPx, lh = this.fontPx * 1.25;
    const maxChars = Math.max(6, Math.floor((maxHalf * 2 - 16) / cw));
    const lines = [];
    if (s.word.length <= maxChars) lines.push({ start: 0, text: s.word });
    else {
      let start = 0;
      while (start < s.word.length) {
        let end = Math.min(s.word.length, start + maxChars);
        if (end < s.word.length) {
          const sp = s.word.lastIndexOf(' ', end);
          if (sp > start) end = sp + 1;
        }
        lines.push({ start, text: s.word.slice(start, end) });
        start = end;
      }
    }
    const widest = Math.max(...lines.map((l) => l.text.length)) * cw;
    const pw = widest + 16, ph = lines.length * lh + 8;
    c.fillStyle = 'rgba(8,16,28,0.84)';
    c.beginPath(); c.roundRect(cx - pw / 2, top, pw, ph, 8); c.fill();
    c.strokeStyle = targeted ? '#ffe36b' : 'rgba(255,255,255,0.22)';
    c.lineWidth = targeted ? 2.5 : 1;
    c.stroke();
    c.font = this.font;
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    lines.forEach((l, li) => {
      const y = top + 4 + lh * (li + 0.5);
      const x0 = cx - (l.text.length * cw) / 2;
      for (let i = 0; i < l.text.length; i++) {
        const idx = l.start + i;
        const ch = l.text[i];
        const x = x0 + i * cw;
        if (idx < s.typed) { c.fillStyle = '#5eead4'; }
        else if (idx === s.typed && targeted) {
          c.fillStyle = 'rgba(255,227,107,0.28)'; c.fillRect(x, y - lh * 0.45, cw, lh * 0.9);
          c.fillStyle = '#ffe36b';
        } else c.fillStyle = '#ffffff';
        if (ch === ' ') {
          if (idx >= s.typed) { c.fillStyle = idx === s.typed && targeted ? '#ffe36b' : 'rgba(255,255,255,0.5)'; c.fillRect(x + cw * 0.2, y + lh * 0.3, cw * 0.6, 2); }
          continue;
        }
        c.fillText(ch, x, y);
      }
    });
  }

  drawEffects(c) {
    for (const r of this.rings) {
      const t = 1 - r.life / r.maxLife;
      c.strokeStyle = `rgba(255,230,140,${1 - t})`;
      c.lineWidth = 3;
      c.beginPath(); c.arc(this.toX(r.x), this.toY(r.y), (r.r + (r.max - r.r) * t) * this.scale, 0, Math.PI * 2); c.stroke();
    }
    for (const p of this.particles) {
      c.globalAlpha = Math.max(0, Math.min(1, p.life * 1.6));
      c.fillStyle = p.color;
      c.fillRect(this.toX(p.x) - p.size / 2, this.toY(p.y) - p.size / 2, p.size, p.size);
    }
    c.globalAlpha = 1;
  }
}
