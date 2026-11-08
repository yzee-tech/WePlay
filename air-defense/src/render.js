// Scene, orthographic side-on camera and meshes. Reads game state; contains no rules.
import * as THREE from 'three';
import { CFG } from './config.js';

const WORLD_H = CFG.camTop - CFG.camBottom;

function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#0b1a2e');
  grad.addColorStop(0.7, '#35648f');
  grad.addColorStop(1, '#9ec3dd');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Renderer {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;

    this.scene = new THREE.Scene();
    this.scene.background = skyTexture();
    this.camera = new THREE.OrthographicCamera(-16, 16, CFG.camTop, CFG.camBottom, 0.1, 100);
    this.camera.position.set(0, 0, 30);
    this.halfWidth = 16;
    this.shake = 0;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
    sun.position.set(-10, 20, 20);
    this.scene.add(sun);

    this.buildScenery();
    this.buildTurret();

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

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  buildScenery() {
    const mk = (color, z) => new THREE.MeshStandardMaterial({ color, roughness: 1 });
    // Far hills
    const hill = (x, w, h, color, z) => {
      const s = new THREE.Shape();
      s.moveTo(-w / 2, 0); s.quadraticCurveTo(0, h * 2, w / 2, 0); s.lineTo(-w / 2, 0);
      const m = new THREE.Mesh(new THREE.ShapeGeometry(s, 16), mk(color));
      m.position.set(x, 0, z);
      this.scene.add(m);
    };
    for (let i = -4; i <= 4; i++) hill(i * 14 + (i % 2) * 3, 22, 3.2 + ((i * 7) % 3), 0x1c3a52, -10);
    for (let i = -4; i <= 4; i++) hill(i * 11 - 4, 18, 1.8 + ((i * 5) % 2), 0x25503f, -6);
    // Ground
    const ground = new THREE.Mesh(new THREE.BoxGeometry(200, 2.2, 8), mk(0x2f5a38));
    ground.position.set(0, -1.1, -1);
    this.scene.add(ground);
    const topSoil = new THREE.Mesh(new THREE.BoxGeometry(200, 0.15, 8), mk(0x3f7a47));
    topSoil.position.set(0, 0.07, -1);
    this.scene.add(topSoil);
    // Clouds
    this.clouds = [];
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Mesh(
        new THREE.SphereGeometry(1, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 })
      );
      c.scale.set(2.5 + (i % 3), 0.7, 0.5);
      c.position.set(-30 + i * 11, 10 + (i * 37 % 5), -8);
      this.scene.add(c);
      this.clouds.push(c);
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
      c.position.x += 0.004;
      if (c.position.x > this.halfWidth + 20) c.position.x = -this.halfWidth - 20;
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
