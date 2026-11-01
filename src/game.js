// Pure game rules. No Three.js and no DOM here, so this file can be tested in plain Node.
import { CFG } from './config.js';

export function clampAngle(a) {
  return Math.min(CFG.turret.maxAngle, Math.max(CFG.turret.minAngle, a));
}

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

/** Distance from point (cx, cy) to the segment (ax, ay)-(bx, by); also returns the closest point. */
export function segmentPointDistance(ax, ay, bx, by, cx, cy) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((cx - ax) * dx + (cy - ay) * dy) / len2));
  const px = ax + t * dx, py = ay + t * dy;
  return { dist: Math.hypot(cx - px, cy - py), x: px, y: py };
}

export function waveSize(n) {
  return CFG.waves.baseCount + CFG.waves.countPerWave * n;
}
export function waveInterval(n) {
  return Math.max(CFG.waves.minInterval, CFG.waves.baseInterval - CFG.waves.intervalDrop * n);
}
export function waveSpeedMultiplier(n) {
  return 1 + CFG.waves.speedPerWave * (n - 1);
}
export function bomberChance(n) {
  return Math.min(CFG.waves.maxBomberChance, CFG.waves.bomberChancePerWave * (n - 1));
}

export class Game {
  constructor({ rng = Math.random, halfWidth = 16 } = {}) {
    this.rng = rng;
    this.halfWidth = halfWidth;
    this.reset();
  }

  reset() {
    this.state = 'playing'; // 'playing' | 'gameover'
    this.health = CFG.turret.maxHealth;
    this.score = 0;
    this.wave = 0;
    this.waveActive = false;
    this.waveTimer = CFG.waves.firstDelay;
    this.spawnTimer = 0;
    this.queue = [];
    this.planes = [];
    this.bombs = [];
    this.missiles = [];
    this.events = [];
    this.cooldown = 0;
    this.aimAngle = Math.PI / 2;
    this.nextId = 1;
    this.lowHealthSent = false;
  }

  setHalfWidth(w) {
    this.halfWidth = w;
  }

  barrelTip() {
    const t = CFG.turret;
    return {
      x: t.x + Math.cos(this.aimAngle) * t.barrelLength,
      y: t.pivotY + Math.sin(this.aimAngle) * t.barrelLength,
    };
  }

  aim(x, y) {
    const dx = x - CFG.turret.x, dy = y - CFG.turret.pivotY;
    // Below the horizon the barrel stays on the side of the cursor (lowest allowed angle on that side).
    if (dy < 0) this.aimAngle = dx >= 0 ? CFG.turret.minAngle : CFG.turret.maxAngle;
    else this.aimAngle = clampAngle(Math.atan2(dy, dx));
  }

  /** Fire towards (tx, ty). Returns true if a missile was launched. */
  fire(tx, ty) {
    if (this.state !== 'playing' || this.cooldown > 0) return false;
    this.aim(tx, ty);
    const tip = this.barrelTip();
    const dx = Math.cos(this.aimAngle), dy = Math.sin(this.aimAngle);
    const targetDist = Math.max(2, Math.hypot(tx - tip.x, ty - tip.y));
    this.missiles.push({
      id: this.nextId++, x: tip.x, y: tip.y, dx, dy,
      vx: dx * CFG.missile.speed, vy: dy * CFG.missile.speed,
      targetDist, travelled: 0, life: 0,
    });
    this.cooldown = CFG.turret.cooldown;
    this.events.push({ type: 'fire', x: tip.x, y: tip.y });
    return true;
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  update(dt) {
    if (this.state !== 'playing') return;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.updateWaves(dt);
    this.updatePlanes(dt);
    this.updateBombs(dt);
    this.updateMissiles(dt);
    this.checkHealth();
  }

  // ---- waves ----
  updateWaves(dt) {
    const W = CFG.waves;
    if (!this.waveActive) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) this.startWave();
      return;
    }
    if (this.queue.length) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnPlane(this.queue.shift());
        this.spawnTimer = waveInterval(this.wave);
      }
    } else if (this.planes.length === 0) {
      // Wave ends when every plane has been spawned and none are left on screen.
      this.waveActive = false;
      this.waveTimer = W.betweenDelay;
      this.events.push({ type: 'waveClear', wave: this.wave });
    }
  }

  startWave() {
    this.wave++;
    this.waveActive = true;
    const n = waveSize(this.wave), chance = bomberChance(this.wave);
    this.queue = [];
    for (let i = 0; i < n; i++) this.queue.push(this.rng() < chance ? 'bomber' : 'fighter');
    this.spawnTimer = 0.4;
    this.events.push({ type: 'waveStart', wave: this.wave });
  }

  spawnPlane(type) {
    const def = CFG.planes[type];
    const dir = this.rng() < 0.5 ? 1 : -1;
    const y = CFG.planeMinY + this.rng() * (CFG.planeMaxY - CFG.planeMinY);
    this.planes.push({
      id: this.nextId++, type, dir, y,
      x: -dir * (this.halfWidth + 3),
      vx: dir * def.speed * waveSpeedMultiplier(this.wave),
      hp: def.hp, radius: def.radius,
      bombsDropped: 0, bombCd: 0,
      aimError: (this.rng() - 0.5) * 2 * CFG.aimJitter,
    });
  }

  updatePlanes(dt) {
    for (const p of this.planes) {
      p.x += p.vx * dt;
      p.bombCd -= dt;
      const def = CFG.planes[p.type];
      if (p.bombsDropped < def.maxBombs && p.bombCd <= 0 && p.y > 0) {
        const fall = Math.sqrt((2 * p.y) / CFG.gravity);
        const landing = p.x + p.vx * fall + p.aimError;
        if (Math.abs(landing - CFG.turret.x) <= def.dropTolerance) {
          this.bombs.push({
            id: this.nextId++, x: p.x, y: p.y - 0.4, vx: p.vx, vy: 0,
            radius: def.bombRadius, damage: def.bombDamage,
          });
          p.bombsDropped++;
          p.bombCd = CFG.bombCooldown;
          this.events.push({ type: 'bombDrop', x: p.x, y: p.y });
        }
      }
    }
    // Despawn planes that have flown past the far edge.
    const limit = this.halfWidth + 3.5;
    this.planes = this.planes.filter((p) => p.dir * p.x <= limit);
  }

  updateBombs(dt) {
    const keep = [];
    for (const b of this.bombs) {
      b.vy -= CFG.gravity * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y > 0) { keep.push(b); continue; }
      const hit = Math.abs(b.x - CFG.turret.x) <= CFG.turret.hitRadius;
      this.events.push({ type: 'explosion', kind: hit ? 'turretHit' : 'ground', x: b.x, y: 0, size: b.damage > 10 ? 1.3 : 1 });
      if (hit) {
        this.health = Math.max(0, this.health - b.damage);
        this.events.push({ type: 'turretHit', damage: b.damage, health: this.health });
      }
    }
    this.bombs = keep;
  }

  updateMissiles(dt) {
    const keep = [];
    for (const m of this.missiles) {
      const step = CFG.missile.speed * dt;
      const ox = m.x, oy = m.y;
      m.x += m.dx * step;
      m.y += m.dy * step;
      m.travelled += step;
      m.life += dt;
      const contact = this.findContact(ox, oy, m.x, m.y);
      if (contact) { this.detonate(contact.x, contact.y); continue; }
      if (m.travelled >= m.targetDist) { this.detonate(m.x, m.y); continue; }
      if (m.life > CFG.missile.maxLife || Math.abs(m.x) > this.halfWidth + 6 || m.y > CFG.camTop + 6 || m.y < -3) continue;
      keep.push(m);
    }
    this.missiles = keep;
  }

  findContact(ax, ay, bx, by) {
    const pad = CFG.missile.hitPadding;
    let best = null;
    for (const p of this.planes) {
      const r = segmentPointDistance(ax, ay, bx, by, p.x, p.y);
      if (r.dist <= p.radius + pad && (!best || r.dist < best.dist)) best = r;
    }
    for (const b of this.bombs) {
      const r = segmentPointDistance(ax, ay, bx, by, b.x, b.y);
      if (r.dist <= b.radius + pad && (!best || r.dist < best.dist)) best = r;
    }
    return best;
  }

  /** Missile explosion: damages planes and destroys bombs in range; destroyed planes can chain (capped). */
  detonate(x, y) {
    this.events.push({ type: 'explosion', kind: 'missile', x, y, size: 1 });
    const stack = [{ x, y, r: CFG.missile.blastRadius }];
    let chains = 0;
    while (stack.length) {
      const blast = stack.pop();
      for (const p of this.planes) {
        if (p.hp <= 0) continue;
        if (Math.hypot(p.x - blast.x, p.y - blast.y) <= blast.r + p.radius) {
          p.hp--;
          if (p.hp <= 0) {
            this.score += CFG.planes[p.type].score;
            this.events.push({ type: 'explosion', kind: 'plane', x: p.x, y: p.y, size: p.type === 'bomber' ? 1.6 : 1.2 });
            this.events.push({ type: 'planeKilled', plane: p.type, x: p.x, y: p.y });
            if (chains < CFG.chain.maxPerDetonation) {
              chains++;
              stack.push({ x: p.x, y: p.y, r: CFG.chain.radius });
            }
          }
        }
      }
      this.planes = this.planes.filter((p) => p.hp > 0);
      const survivors = [];
      for (const b of this.bombs) {
        if (Math.hypot(b.x - blast.x, b.y - blast.y) <= blast.r + b.radius) {
          this.score += CFG.bombScore;
          this.events.push({ type: 'explosion', kind: 'bomb', x: b.x, y: b.y, size: 0.6 });
        } else survivors.push(b);
      }
      this.bombs = survivors;
    }
  }

  checkHealth() {
    const frac = this.health / CFG.turret.maxHealth;
    if (!this.lowHealthSent && this.health > 0 && frac < CFG.turret.lowHealthFraction) {
      this.lowHealthSent = true;
      this.events.push({ type: 'lowHealth' });
    }
    if (this.health <= 0) {
      this.state = 'gameover';
      this.events.push({ type: 'gameOver', score: this.score, wave: this.wave });
    }
  }
}
