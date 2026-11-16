// Pure game rules for Stickman Battle: Gunwars. No DOM, no canvas: node tests run this directly.
import { CFG } from './config.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** True when every platform can be reached from the start platform by jumps (layout sanity check). */
export function platformsReachable(platforms, startIndex, reach = CFG.reach) {
  const seen = new Set([startIndex]);
  const queue = [startIndex];
  while (queue.length) {
    const a = platforms[queue.pop()];
    platforms.forEach((b, j) => {
      if (seen.has(j)) return;
      const gap = Math.max(0, Math.abs(a.x - b.x) - (a.w + b.w) / 2);
      const rise = a.y - b.y; // positive = b is higher
      if (gap <= reach.gap && rise <= reach.rise && -rise <= reach.drop) { seen.add(j); queue.push(j); }
    });
  }
  return seen.size === platforms.length;
}

const NO_INPUT = { move: 0, jump: false, fire: false, aim: null };

export class Game {
  constructor({ rng = Math.random, layout = null } = {}) {
    this.rng = rng;
    this.layout = layout; // { platforms, spawns: [platformIndex, platformIndex] }; null = classic fixed layout
    this.inputs = [{ ...NO_INPUT }, { ...NO_INPUT }];
    this.events = [];
    this.reset();
  }

  reset(layout) {
    if (layout) this.layout = layout;
    const platforms = this.layout ? this.layout.platforms : CFG.platforms;
    const spawnIdx = this.layout ? this.layout.spawns : CFG.spawns.map((s) => s.platform);
    this.platforms = platforms;
    const F = CFG.fighter;
    this.fighters = spawnIdx.map((pi, i) => {
      const p = platforms[pi];
      return {
        id: i, x: p.x, y: p.y - 1, vx: 0, vy: 0, onGround: false, facing: i === 0 ? 1 : -1,
        aim: i === 0 ? 0 : Math.PI, health: F.maxHealth, alive: true, fireCd: 0, hurt: 0, anim: 0,
        coyote: 0, jumpBuf: 0, prevJump: false,
      };
    });
    this.bullets = [];
    this.time = 0;
    this.timeLeft = CFG.roundSeconds;
    this.state = 'playing'; // 'playing' | 'over'
    this.winner = null; // 0, 1, or -1 for a draw
    this.reason = null; // 'fall' | 'health' | 'time'
    this.inputs = [{ ...NO_INPUT }, { ...NO_INPUT }];
    this.events.length = 0;
    this.nextBulletId = 1;
  }

  /** input = { move: -1..1, jump: bool, fire: bool, aim: radians|null } */
  setInput(id, input) { this.inputs[id] = { ...NO_INPUT, ...input }; }

  takeEvents() { const e = this.events; this.events = []; return e; }

  update(dt) {
    if (this.state !== 'playing') return;
    this.time += dt;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    for (const f of this.fighters) this.updateFighter(f, this.inputs[f.id], dt);
    this.updateBullets(dt);
    this.checkRoundEnd();
  }

  updateFighter(f, inp, dt) {
    const F = CFG.fighter;
    f.fireCd = Math.max(0, f.fireCd - dt);
    f.hurt = Math.max(0, f.hurt - dt);
    const move = Math.max(-1, Math.min(1, inp.move || 0));
    const target = move * F.runSpeed;
    const rate = (f.onGround ? F.accel : F.accel * F.airControl) * dt;
    f.vx += Math.max(-rate, Math.min(rate, target - f.vx));
    if (move !== 0) f.facing = move > 0 ? 1 : -1;
    if (inp.aim !== null && inp.aim !== undefined) {
      f.aim = inp.aim;
      f.facing = Math.cos(inp.aim) >= 0 ? 1 : -1; // gun side wins over run direction
    } else {
      f.aim = f.facing > 0 ? 0 : Math.PI;
    }
    // Jump, with a grace window after leaving an edge (coyote time) and a
    // short buffer for presses made just before landing: falling is a misplay, not bad luck.
    if (inp.jump && !f.prevJump) f.jumpBuf = F.jumpBuffer;
    f.prevJump = !!inp.jump;
    if ((inp.jump || f.jumpBuf > 0) && (f.onGround || f.coyote > 0)) {
      f.vy = -F.jumpSpeed;
      f.onGround = false;
      f.coyote = 0;
      f.jumpBuf = 0;
      this.events.push({ type: 'jump', id: f.id });
    } else {
      f.jumpBuf = Math.max(0, f.jumpBuf - dt);
    }
    const prevY = f.y;
    f.vy += CFG.gravity * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.x = Math.max(F.w / 2, Math.min(CFG.world.w - F.w / 2, f.x));
    f.onGround = false;
    if (f.vy >= 0) {
      for (const p of this.platforms) {
        if (Math.abs(f.x - p.x) <= p.w / 2 + F.w / 4 && prevY <= p.y + 0.01 && f.y >= p.y) {
          f.y = p.y; f.vy = 0; f.onGround = true;
          break;
        }
      }
    }
    f.coyote = f.onGround ? F.coyoteTime : Math.max(0, f.coyote - dt);
    if (f.onGround) f.anim += Math.abs(f.vx) * dt * 0.05; else f.anim += dt * 4;
    if (inp.fire && f.fireCd <= 0) this.shoot(f);
    if (f.y > CFG.world.killY && f.alive) {
      f.alive = false;
      this.events.push({ type: 'fall', id: f.id });
    }
  }

  shoot(f) {
    const B = CFG.bullet;
    f.fireCd = CFG.fighter.fireCooldown;
    const c = Math.cos(f.aim), s = Math.sin(f.aim);
    this.bullets.push({
      id: this.nextBulletId++, owner: f.id,
      x: f.x + c * B.muzzleX, y: f.y - B.muzzleY + s * B.muzzleX,
      vx: c * B.speed, vy: s * B.speed, life: B.life,
    });
    this.events.push({ type: 'shoot', id: f.id });
  }

  updateBullets(dt) {
    const F = CFG.fighter;
    const keep = [];
    for (const b of this.bullets) {
      b.life -= dt;
      let hit = null;
      // Sweep in a few small steps so fast bullets cannot skip over a thin stickman.
      const steps = 3;
      for (let i = 0; i < steps && !hit; i++) {
        b.x += (b.vx * dt) / steps;
        b.y += (b.vy * dt) / steps;
        for (const f of this.fighters) {
          if (f.id === b.owner || !f.alive) continue;
          if (Math.abs(b.x - f.x) <= F.w / 2 + 2 && b.y >= f.y - F.h - 2 && b.y <= f.y + 2) { hit = f; break; }
        }
      }
      if (hit) {
        hit.health = Math.max(0, hit.health - CFG.bullet.damage);
        hit.hurt = 0.15;
        hit.vx += Math.sign(b.vx || 1) * F.knock;
        this.events.push({ type: 'hit', id: hit.id, x: b.x, y: b.y });
        continue;
      }
      const w = CFG.world;
      if (b.life > 0 && b.x > -50 && b.x < w.w + 50 && b.y > -300 && b.y < w.h + 100) keep.push(b);
    }
    this.bullets = keep;
  }

  checkRoundEnd() {
    const [a, b] = this.fighters;
    const lost = (f) => !f.alive || f.health <= 0;
    let winner = null, reason = null;
    if (lost(a) || lost(b)) {
      if (lost(a) && lost(b)) { winner = -1; }
      else winner = lost(a) ? 1 : 0;
      const loser = this.fighters[winner === 0 ? 1 : winner === 1 ? 0 : 0];
      reason = winner === -1 ? 'health' : (!loser.alive ? 'fall' : 'health');
    } else if (this.timeLeft <= 0) {
      reason = 'time';
      winner = a.health === b.health ? -1 : a.health > b.health ? 0 : 1;
    }
    if (winner !== null) {
      this.state = 'over';
      this.winner = winner;
      this.reason = reason;
      this.events.push({ type: 'over', winner, reason });
    }
  }
}
