// Scene, orthographic side-on camera and meshes. Reads game state; contains no rules.
// Scenery (sky, landscape, clouds, lights) comes from scenery.js data via setEnvironment.
import * as THREE from 'three';
import { CFG } from './config.js';
import { resolveEnvironment, DEFAULT_ENV } from './scenery.js';

const WORLD_H = CFG.camTop - CFG.camBottom;

const cssHex = (n) => '#' + n.toString(16).padStart(6, '0');

function skyTexture(stops) {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, cssHex(stops[0]));
  grad.addColorStop(0.7, cssHex(stops[1]));
  grad.addColorStop(1, cssHex(stops[2]));
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}

export class Renderer {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-16, 16, CFG.camTop, CFG.camBottom, 0.1, 100);
    this.camera.position.set(0, 0, 30);
    this.halfWidth = 16;
    this.shake = 0;

    this.ambient = new THREE.AmbientLight(0xffffff, 0.9);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
    this.sun.position.set(-10, 20, 20);
    this.scene.add(this.sun);

    this.pools = { plane: new Map(), bomber: new Map(), bomb: new Map(), missile: new Map() };
    this.free = { fighter: [], bomber: [], bomb: [], missile: [] };

    this.geo = {
      bomb: new THREE.SphereGeometry(1, 10, 8),
      missile: new THREE.CylinderGeometry(0.12, 0.12, 0.9, 8),
      nose: new THREE.ConeGeometry(0.12, 0.3, 8),
      fuselage: new THREE.CapsuleGeometry(0.28, 1.5, 4, 8),
      wing: new THREE.BoxGeometry(0.9, 0.08, 2.4),
      tail: new THREE.BoxGeometry(0.5, 0.7, 0.08),
      cockpit: new THREE.SphereGeometry(0.22, 8, 6),
    };
    this.mat = {
      fighter: new THREE.MeshStandardMaterial({ color: 0xc9d4df, roughness: 0.5, metalness: 0.2 }),
      bomber: new THREE.MeshStandardMaterial({ color: 0x6f7f57, roughness: 0.6, metalness: 0.1 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x2b3642 }),
      bomb: new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.4 }),
      missile: new THREE.MeshStandardMaterial({ color: 0xe9e9e9, roughness: 0.3 }),
      nose: new THREE.MeshStandardMaterial({ color: 0xef6a5b }),
    };

    this.sceneryGroup = null;
    this.clouds = [];
    this.boats = [];
    this.water = null;
    this.env = null;
    this.setEnvironment(DEFAULT_ENV);

    this.buildTurret();

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  // Swap the whole backdrop (theme + landscape). Visual only: never touches
  // game state. Safe to call between games; rebuilds the scenery group and
  // re-tints lights, sky and the bomb material (night lifts near-black bombs).
  setEnvironment(env) {
    const resolved = resolveEnvironment(env);
    if (!resolved) return;
    this.env = resolved;

    if (this.scene.background && this.scene.background.dispose) this.scene.background.dispose();
    this.scene.background = skyTexture(resolved.sky);

    this.ambient.color.setHex(resolved.ambient.color);
    this.ambient.intensity = resolved.ambient.intensity;
    this.sun.color.setHex(resolved.sun.color);
    this.sun.intensity = resolved.sun.intensity;
    this.sun.position.set(...resolved.sun.position);

    this.mat.bomb.color.setHex(resolved.bombColor ?? 0x1b1b1b);

    if (this.sceneryGroup) {
      this.scene.remove(this.sceneryGroup);
      disposeGroup(this.sceneryGroup);
    }
    this.sceneryGroup = new THREE.Group();
    this.clouds = [];
    this.boats = [];
    this.water = null;

    // Ground (colors resolve per landscape through the theme's tones).
    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(200, 2.2, 8),
      new THREE.MeshStandardMaterial({ color: resolved.groundTone, roughness: 1 })
    );
    ground.position.set(0, -1.1, -1);
    this.sceneryGroup.add(ground);
    const topSoil = new THREE.Mesh(
      new THREE.BoxGeometry(200, 0.15, 8),
      new THREE.MeshStandardMaterial({ color: resolved.groundTopTone, roughness: 1 })
    );
    topSoil.position.set(0, 0.07, -1);
    this.sceneryGroup.add(topSoil);

    for (const p of resolved.primitives) this.buildPrimitive(p, resolved);
    if (resolved.disc) this.buildDisc(resolved.disc);
    if (resolved.stars) this.buildStars(resolved.starCount);
    this.buildClouds(resolved);

    this.scene.add(this.sceneryGroup);
  }

  buildPrimitive(p, resolved) {
    const tone = resolved.tones[p.tone] ?? resolved.tones.far;
    const mat = new THREE.MeshStandardMaterial({ color: tone, roughness: 1 });
    if (p.kind === 'hill') {
      const s = new THREE.Shape();
      s.moveTo(-p.w / 2, 0); s.quadraticCurveTo(0, p.h * 2, p.w / 2, 0); s.lineTo(-p.w / 2, 0);
      const m = new THREE.Mesh(new THREE.ShapeGeometry(s, 16), mat);
      m.position.set(p.x, 0, p.z);
      this.sceneryGroup.add(m);
    } else if (p.kind === 'peak') {
      const s = new THREE.Shape();
      s.moveTo(-p.w / 2, 0); s.lineTo(0, p.h); s.lineTo(p.w / 2, 0); s.lineTo(-p.w / 2, 0);
      const m = new THREE.Mesh(new THREE.ShapeGeometry(s), mat);
      m.position.set(p.x, 0, p.z);
      this.sceneryGroup.add(m);
      if (p.snow) {
        const f = 0.72; // snow covers the top fraction of the peak
        const cap = new THREE.Shape();
        cap.moveTo(-p.w / 2 * (1 - f), p.h * f); cap.lineTo(0, p.h); cap.lineTo(p.w / 2 * (1 - f), p.h * f);
        cap.lineTo(-p.w / 2 * (1 - f), p.h * f);
        const sm = new THREE.Mesh(
          new THREE.ShapeGeometry(cap),
          new THREE.MeshStandardMaterial({ color: resolved.tones.snow, roughness: 0.9 })
        );
        sm.position.set(p.x, 0, p.z + 0.05);
        this.sceneryGroup.add(sm);
      }
    } else if (p.kind === 'rect') {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(p.w, p.h), mat);
      m.position.set(p.x, p.h / 2, p.z);
      this.sceneryGroup.add(m);
      if (p.windows && resolved.windowsLit) {
        const winMat = new THREE.MeshBasicMaterial({ color: resolved.tones.window });
        const cols = Math.max(2, Math.floor(p.w / 1.1));
        const rows = Math.max(2, Math.floor(p.h / 1.1));
        const winGeo = new THREE.PlaneGeometry(0.22, 0.3);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if ((r * 7 + c * 3 + Math.round(p.x)) % 3 === 0) continue; // some windows stay dark
            const w = new THREE.Mesh(winGeo, winMat);
            w.position.set(
              p.x - p.w / 2 + ((c + 0.5) * p.w) / cols,
              ((r + 0.5) * p.h) / rows,
              p.z + 0.06
            );
            this.sceneryGroup.add(w);
          }
        }
      }
    } else if (p.kind === 'band') {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(200, p.h, 4),
        new THREE.MeshStandardMaterial({ color: tone, roughness: 0.6, transparent: true, opacity: 0.9 })
      );
      m.position.set(0, p.y + p.h / 2, p.z);
      this.sceneryGroup.add(m);
      if (p.shimmer) this.water = m;
    } else if (p.kind === 'boat') {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.3), mat);
      const sailShape = new THREE.Shape();
      sailShape.moveTo(0, 0); sailShape.lineTo(0.02, 0.9); sailShape.lineTo(0.55, 0.12); sailShape.lineTo(0, 0);
      const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), mat);
      sail.position.set(-0.1, 0.12, 0);
      g.add(hull, sail);
      g.position.set(p.x, p.y, p.z);
      g.userData = { baseY: p.y, phase: p.x * 0.7 };
      this.sceneryGroup.add(g);
      this.boats.push(g);
    } else if (p.kind === 'cactus') {
      const s = p.scale || 1;
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CapsuleGeometry(0.14 * s, 1.2 * s, 4, 8), mat);
      trunk.position.y = 0.7 * s;
      const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.09 * s, 0.4 * s, 4, 8), mat);
      armL.position.set(-0.3 * s, 0.85 * s, 0);
      const armR = new THREE.Mesh(new THREE.CapsuleGeometry(0.09 * s, 0.35 * s, 4, 8), mat);
      armR.position.set(0.3 * s, 0.65 * s, 0);
      g.add(trunk, armL, armR);
      g.position.set(p.x, 0, p.z);
      this.sceneryGroup.add(g);
    }
  }

  buildDisc(disc) {
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(disc.r, 32),
      new THREE.MeshBasicMaterial({ color: disc.color })
    );
    m.position.set(disc.x, disc.y, disc.z);
    this.sceneryGroup.add(m);
  }

  buildStars(count) {
    // Deterministic scatter (fixed-seed LCG) so tests and reloads agree.
    let seed = 1234567;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = -45 + rand() * 90;
      pos[i * 3 + 1] = 4.5 + rand() * 11;
      pos[i * 3 + 2] = -9.5;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.14, transparent: true, opacity: 0.85 })
    );
    this.sceneryGroup.add(stars);
  }

  buildClouds(resolved) {
    const C = CFG.scenery.clouds;
    const puffGeo = new THREE.SphereGeometry(1, 12, 8);
    for (let i = 0; i < C.count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: resolved.cloud.color,
        transparent: true,
        opacity: resolved.cloud.opacity,
      });
      const g = new THREE.Group();
      const puffs = 3 + (i % 2);
      for (let j = 0; j < puffs; j++) {
        const puff = new THREE.Mesh(puffGeo, mat);
        const off = (j - (puffs - 1) / 2) * 1.1;
        const sc = 1 - Math.abs(off) * 0.18;
        puff.position.set(off, (j % 2) * 0.3 - 0.05, 0);
        puff.scale.set(1.6 * sc, 0.8 * sc, 0.5);
        g.add(puff);
      }
      const near = i % 3 === 0; // nearer clouds drift faster (parallax)
      const speed = (C.minSpeed + (C.maxSpeed - C.minSpeed) * ((i * 0.37) % 1)) * (near ? 1.7 : 1);
      const scale = near ? 1.25 : 0.95;
      g.scale.setScalar(scale);
      g.position.set(-40 + ((i * 97) % 80), C.minY + (((i * 53) % 100) / 100) * (C.maxY - C.minY), near ? -5 : -8.5);
      g.userData = { speed, baseY: g.position.y, phase: i * 1.7 };
      this.sceneryGroup.add(g);
      this.clouds.push(g);
    }
  }

  buildTurret() {
    const T = CFG.turret;
    const metal = new THREE.MeshStandardMaterial({ color: 0x5b6b7a, roughness: 0.5, metalness: 0.4 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3b4753, roughness: 0.6, metalness: 0.3 });
    this.turret = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 0.7, 16), metal);
    base.position.set(T.x, 0.35, 0);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), dark);
    dome.position.set(T.x, 0.7, 0);
    this.barrel = new THREE.Group();
    this.barrel.position.set(T.x, T.pivotY, 0);
    const tube = new THREE.Mesh(new THREE.BoxGeometry(T.barrelLength, 0.42, 0.42), metal);
    tube.position.x = T.barrelLength / 2;
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.55, 0.55), dark);
    muzzle.position.x = T.barrelLength;
    this.barrel.add(tube, muzzle);
    this.turret.add(base, dome, this.barrel);
    this.scene.add(this.turret);
    this.damageLight = new THREE.PointLight(0xff3b30, 0, 8);
    this.damageLight.position.set(T.x, 2, 3);
    this.scene.add(this.damageLight);
  }

  resize() {
    const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
    this.renderer.setSize(w, h);
    const aspect = w / h;
    this.halfWidth = (WORLD_H * aspect) / 2;
    this.camera.left = -this.halfWidth;
    this.camera.right = this.halfWidth;
    this.camera.top = CFG.camTop;
    this.camera.bottom = CFG.camBottom;
    this.camera.updateProjectionMatrix();
  }

  /** Convert a pointer event to world coordinates. */
  toWorld(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const nx = (clientX - r.left) / Math.max(1, r.width);
    const ny = (clientY - r.top) / Math.max(1, r.height);
    return { x: (nx * 2 - 1) * this.halfWidth, y: CFG.camTop - ny * WORLD_H };
  }

  makePlane(type) {
    const g = new THREE.Group();
    const body = type === 'bomber' ? this.mat.bomber : this.mat.fighter;
    const fus = new THREE.Mesh(this.geo.fuselage, body);
    fus.rotation.z = Math.PI / 2;
    const wing = new THREE.Mesh(this.geo.wing, body);
    wing.position.set(-0.1, 0, 0);
    wing.rotation.x = 0.9; // tilted so the wings read from the side-on camera
    const tail = new THREE.Mesh(this.geo.tail, body);
    tail.position.set(-1.0, 0.35, 0);
    const cock = new THREE.Mesh(this.geo.cockpit, this.mat.dark);
    cock.position.set(0.5, 0.2, 0);
    cock.scale.set(1.4, 0.8, 0.8);
    g.add(fus, wing, tail, cock);
    if (type === 'bomber') {
      g.scale.setScalar(1.5);
      const w2 = new THREE.Mesh(this.geo.wing, body);
      w2.scale.set(0.6, 1, 1.4);
      w2.position.set(-0.9, 0, 0);
      w2.rotation.x = 0.9;
      g.add(w2);
    }
    return g;
  }

  makeMissile() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.geo.missile, this.mat.missile);
    body.rotation.z = Math.PI / 2;
    const nose = new THREE.Mesh(this.geo.nose, this.mat.nose);
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = 0.6;
    g.add(body, nose);
    return g;
  }

  makeBomb() {
    const m = new THREE.Mesh(this.geo.bomb, this.mat.bomb);
    return m;
  }

  /** Match meshes to game entities (create, update, release to a free list). */
  sync(game, time) {
    this.barrel.rotation.z = game.aimAngle;

    this.syncSet(game.planes, 'plane', (p) => p.type, (p) => this.makePlane(p.type), (mesh, p) => {
      mesh.position.set(p.x, p.y + Math.sin(time * 4 + p.id) * 0.08, 0);
      mesh.scale.x = Math.abs(mesh.scale.x) * p.dir;
      mesh.rotation.z = Math.sin(time * 2 + p.id) * 0.05;
    });
    this.syncSet(game.bombs, 'bomb', () => 'bomb', () => this.makeBomb(), (mesh, b) => {
      mesh.position.set(b.x, b.y, 0);
      mesh.scale.set(b.radius, b.radius * 1.4, b.radius);
      mesh.rotation.z = Math.atan2(b.vy, b.vx) + Math.PI / 2;
    });
    this.syncSet(game.missiles, 'missile', () => 'missile', () => this.makeMissile(), (mesh, m) => {
      mesh.position.set(m.x, m.y, 0);
      mesh.rotation.z = Math.atan2(m.dy, m.dx);
    });

    for (const c of this.clouds) {
      c.position.x += c.userData.speed;
      c.position.y = c.userData.baseY + Math.sin(time * 0.4 + c.userData.phase) * CFG.scenery.clouds.bob;
      if (c.position.x > this.halfWidth + 24) c.position.x = -this.halfWidth - 24;
    }
    if (this.water) this.water.material.opacity = 0.84 + Math.sin(time * 0.9) * 0.08;
    for (const b of this.boats) {
      b.position.y = b.userData.baseY + Math.sin(time * 0.7 + b.userData.phase) * 0.12;
      b.rotation.z = Math.sin(time * 0.5 + b.userData.phase) * 0.05;
    }
  }

  syncSet(entities, kind, keyOf, make, update) {
    const active = this.pools[kind === 'plane' ? 'plane' : kind];
    const seen = new Set();
    for (const e of entities) {
      seen.add(e.id);
      let mesh = active.get(e.id);
      if (!mesh) {
        const key = kind === 'plane' ? keyOf(e) : kind;
        const list = this.free[key] || (this.free[key] = []);
        mesh = list.pop() || make(e);
        mesh.userData.key = key;
        if (kind === 'plane') mesh.scale.x = Math.abs(mesh.scale.x);
        this.scene.add(mesh);
        active.set(e.id, mesh);
      }
      update(mesh, e);
    }
    for (const [id, mesh] of active) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        active.delete(id);
        (this.free[mesh.userData.key] || (this.free[mesh.userData.key] = [])).push(mesh);
      }
    }
  }

  addShake(a) {
    this.shake = Math.min(1.2, this.shake + a);
  }

  flashDamage() {
    this.damageLight.intensity = 60;
  }

  render(dt) {
    this.shake = Math.max(0, this.shake - dt * 3);
    const s = this.shake * 0.35;
    this.camera.position.x = (Math.random() - 0.5) * s;
    this.camera.position.y = (Math.random() - 0.5) * s;
    this.damageLight.intensity = Math.max(0, this.damageLight.intensity - dt * 200);
    this.renderer.render(this.scene, this.camera);
  }
}
