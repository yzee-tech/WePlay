// Plain 2D canvas renderer. Reads game state, never changes it.
// The whole 1600x900 arena is scaled to fit the screen (letterboxed), so every phone sees the same layout.
import { CFG } from './config.js';
import { THEMES, resolveEnvironment } from '../../shared/scenery.js';

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
    // Default look (what the start screen sits over) until the first round rolls a backdrop.
    this.env = resolveEnvironment({ theme: 'sunset', landscape: 'mountains' });
    this.theme = THEMES[this.env.theme];
    this.particles = [];
    this.scale = 1; this.ox = 0; this.oy = 0;
    this.resize();
  }

  /** Switch the backdrop ({ theme, landscape } keys, e.g. { theme: 'night', landscape: 'city' }) and repaint. */
  setEnvironment(envKeys) {
    const env = resolveEnvironment(envKeys);
    if (!env) return;
    this.env = env;
    this.theme = THEMES[env.theme];
    if (this.W) this.makeBackground(this.W, this.H);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth, H = window.innerHeight;
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = `${W}px`; this.canvas.style.height = `${H}px`;
    this.dpr = dpr;
    this.W = W; this.H = H;
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
    const env = this.env;
    const [top, mid, low] = env.sky;
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, hex(top)); g.addColorStop(0.55, hex(mid)); g.addColorStop(1, hex(low));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const rng = mulberry(7);
    // stars at night
    if (env.stars) {
      for (let i = 0; i < (env.starCount || 150); i++) {
        c.globalAlpha = 0.25 + rng() * 0.75;
        c.fillStyle = '#fff'; c.beginPath(); c.arc(rng() * W, rng() * H * 0.6, 0.4 + rng() * 1.3, 0, 7); c.fill();
      }
      c.globalAlpha = 1;
    }
    // sun or moon disc (positions live in shared/scenery.js world units: x -16..16, y 0..16 up)
    if (env.disc) {
      const d = env.disc;
      const sx = ((d.x + 16) / 32) * W, sy = H * (1 - d.y / 16), sr = (d.r / 16) * H;
      if (d.glow) {
        c.globalAlpha = d.glow.opacity; c.fillStyle = hex(d.glow.color);
        c.beginPath(); c.arc(sx, sy, (d.glow.r / 16) * H, 0, 7); c.fill(); c.globalAlpha = 1;
      }
      c.fillStyle = hex(d.color); c.beginPath(); c.arc(sx, sy, sr, 0, 7); c.fill();
      if (d.rays) {
        c.strokeStyle = hex(d.rays.color); c.lineWidth = Math.max(2, (d.rays.width / 16) * H); c.lineCap = 'round';
        const r0 = sr * 1.25, r1 = r0 + (d.rays.length / 16) * H;
        for (let i = 0; i < d.rays.count; i++) {
          const a = (i / d.rays.count) * Math.PI * 2;
          c.beginPath(); c.moveTo(sx + Math.cos(a) * r0, sy + Math.sin(a) * r0);
          c.lineTo(sx + Math.cos(a) * r1, sy + Math.sin(a) * r1); c.stroke();
        }
      }
    }
    this.landscape(c, W, H, rng);
    this.bg = bg;
    this.clouds = Array.from({ length: 4 }, (_, i) => ({ x: rng() * CFG.world.w, y: 70 + rng() * 140, s: 0.7 + rng() * 0.8, v: 6 + i * 2 }));
  }

  /** Draw the shared scenery primitives (also used by Air Defense in 3D) as 2D silhouettes.
   *  World coords: x -56..56 maps to 0..W; y 0 is the bottom of the screen. */
  landscape(c, W, H, rng) {
    const sx = W / 112, sy = H / 18;
    const X = (x) => (x + 56) * sx;
    const Y = (y) => H - y * sy;
    const tones = this.env.tones;
    for (const p of this.env.primitives) {
      const col = hex(tones[p.tone] ?? tones.far);
      if (p.kind === 'hill') {
        c.fillStyle = col; c.beginPath();
        c.moveTo(X(p.x - p.w / 2), H);
        c.quadraticCurveTo(X(p.x), Y(p.h * 2), X(p.x + p.w / 2), H);
        c.closePath(); c.fill();
      } else if (p.kind === 'peak') {
        c.fillStyle = col; c.beginPath();
        c.moveTo(X(p.x - p.w / 2), H); c.lineTo(X(p.x), Y(p.h)); c.lineTo(X(p.x + p.w / 2), H);
        c.closePath(); c.fill();
        if (p.snow) {
          const sw = p.w * 0.18;
          c.fillStyle = hex(tones.snow); c.beginPath();
          c.moveTo(X(p.x - sw), Y(p.h * 0.62)); c.lineTo(X(p.x), Y(p.h)); c.lineTo(X(p.x + sw), Y(p.h * 0.62));
          c.lineTo(X(p.x + sw * 0.5), Y(p.h * 0.7)); c.lineTo(X(p.x), Y(p.h * 0.62)); c.lineTo(X(p.x - sw * 0.5), Y(p.h * 0.7));
          c.closePath(); c.fill();
        }
      } else if (p.kind === 'rect') {
        const bw = p.w * sx, bh = p.h * sy;
        c.fillStyle = col; c.fillRect(X(p.x) - bw / 2, Y(p.h), bw, bh);
        if (p.windows && this.env.windowsLit) {
          c.fillStyle = hex(tones.window);
          for (let wy = Y(p.h) + 8; wy < H - 10; wy += 14)
            for (let wx = X(p.x) - bw / 2 + 5; wx < X(p.x) + bw / 2 - 7; wx += 12)
              if (rng() < 0.4) c.fillRect(wx, wy, 4, 6);
        }
      } else if (p.kind === 'band') {
        c.fillStyle = col; c.fillRect(0, Y(p.y + p.h), W, (p.y + p.h) * sy);
        if (p.shimmer) {
          c.fillStyle = 'rgba(255,255,255,0.25)';
          for (let i = 0; i < 22; i++) c.fillRect(rng() * W, Y(p.y + p.h) + 6 + rng() * ((p.y + p.h) * sy - 12), 14 + rng() * 26, 2);
        }
      } else if (p.kind === 'boat') {
        const bx = X(p.x), by = Y(p.y);
        c.fillStyle = col; c.beginPath();
        c.moveTo(bx - 10, by); c.lineTo(bx + 10, by); c.lineTo(bx + 6, by + 6); c.lineTo(bx - 6, by + 6); c.closePath(); c.fill();
        c.beginPath(); c.moveTo(bx, by - 18); c.lineTo(bx, by); c.lineTo(bx + 10, by); c.closePath(); c.fill();
      } else if (p.kind === 'cactus') {
        const bx = X(p.x), u = sy * (p.scale || 1); // one world unit in pixels, scaled
        c.fillStyle = col;
        c.fillRect(bx - 0.28 * u, H - 2.4 * u, 0.56 * u, 2.4 * u); // trunk
        c.fillRect(bx - 0.9 * u, H - 1.8 * u, 0.62 * u, 0.4 * u); c.fillRect(bx - 0.9 * u, H - 2.3 * u, 0.4 * u, 0.9 * u); // left arm
        c.fillRect(bx + 0.28 * u, H - 1.5 * u, 0.62 * u, 0.4 * u); c.fillRect(bx + 0.5 * u, H - 2.0 * u, 0.4 * u, 0.9 * u); // right arm
      }
    }
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
      c.fillStyle = hex(this.env.cloud.color);
      c.globalAlpha = this.env.cloud.opacity;
      const x = cl.x - 150;
      c.beginPath(); c.ellipse(x, cl.y, 70 * cl.s, 14 * cl.s, 0, 0, 7); c.ellipse(x - 12 * cl.s, cl.y - 12 * cl.s, 36 * cl.s, 14 * cl.s, 0, 0, 7); c.fill();
      c.globalAlpha = 1;
    }
    for (const p of game.platforms || CFG.platforms) this.platform(c, p);
    for (const f of game.fighters) if (f.alive || f.y < CFG.world.h + 40) this.stickman(c, f);
    this.bullets(c, game);
    this.parts(c, dt);
    c.restore();
  }

  platform(c, p) {
    const x = p.x - p.w / 2;
    c.fillStyle = '#2b2e22';
    c.beginPath(); c.moveTo(x, p.y + 8); c.lineTo(x + p.w, p.y + 8); c.lineTo(x + p.w * 0.8, p.y + 30); c.lineTo(x + p.w * 0.2, p.y + 30); c.closePath(); c.fill();
    c.fillStyle = hex(this.env.groundTopTone); c.fillRect(x, p.y, p.w, 9);
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
