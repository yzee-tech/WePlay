// Explosion particles and missile smoke. Pooled and capped.
import * as THREE from 'three';

const MAX = 400;
const PALETTES = {
  missile: [0xfff2a8, 0xffb020, 0xef6a5b],
  plane: [0xfff2a8, 0xffb020, 0xef6a5b, 0x555555],
  bomb: [0xfff2a8, 0xffb020],
  ground: [0x8a6b43, 0x6b5233, 0xb59a6a],
  turretHit: [0xff3b30, 0xffb020, 0x888888],
};

export class Effects {
  constructor(scene) {
    this.scene = scene;
    const geo = new THREE.SphereGeometry(1, 6, 5);
    this.items = [];
    this.free = [];
    for (let i = 0; i < MAX; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      scene.add(mesh);
      this.free.push({ mesh, mat, life: 0, max: 1, vx: 0, vy: 0, size: 1, grow: 0, gravity: 0 });
    }
  }

  spawn(x, y, o) {
    const p = this.free.pop();
    if (!p) return;
    p.life = p.max = o.life;
    p.vx = o.vx; p.vy = o.vy;
    p.size = o.size; p.grow = o.grow || 0; p.gravity = o.gravity || 0;
    p.mat.color.setHex(o.color);
    p.mat.opacity = o.opacity ?? 1;
    p.baseOpacity = p.mat.opacity;
    p.mesh.position.set(x, y, 1);
    p.mesh.scale.setScalar(o.size);
    p.mesh.visible = true;
    this.items.push(p);
  }

  explode(x, y, kind = 'missile', size = 1) {
    const colors = PALETTES[kind] || PALETTES.missile;
    const n = Math.round(22 * size);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = (2 + Math.random() * 7) * size;
      this.spawn(x, y, {
        vx: Math.cos(a) * s, vy: Math.sin(a) * s + (kind === 'ground' ? 3 : 0),
        life: 0.5 + Math.random() * 0.6, size: (0.15 + Math.random() * 0.3) * size,
        color: colors[(Math.random() * colors.length) | 0], gravity: kind === 'ground' ? 9 : 2, grow: -0.1,
      });
    }
    // Bright flash
    this.spawn(x, y, { vx: 0, vy: 0, life: 0.18, size: 0.6 * size, grow: 14 * size, color: 0xffffff, opacity: 0.9 });
    if (kind === 'plane') {
      for (let i = 0; i < 6; i++) {
        this.spawn(x, y, { vx: (Math.random() - 0.5) * 3, vy: Math.random() * 2, life: 1.2, size: 0.5 * size, grow: 1.5, color: 0x333333, opacity: 0.5, gravity: -0.5 });
      }
    }
  }

  smoke(x, y) {
    this.spawn(x, y, { vx: (Math.random() - 0.5) * 0.6, vy: 0.3 + Math.random() * 0.4, life: 0.7, size: 0.16, grow: 0.9, color: 0xdddddd, opacity: 0.45 });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        this.items.splice(i, 1);
        this.free.push(p);
        continue;
      }
      p.vy -= p.gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.size = Math.max(0.02, p.size + p.grow * dt);
      p.mesh.scale.setScalar(p.size);
      p.mat.opacity = p.baseOpacity * (p.life / p.max);
    }
  }

  clear() {
    for (const p of this.items) { p.mesh.visible = false; this.free.push(p); }
    this.items.length = 0;
  }
}
