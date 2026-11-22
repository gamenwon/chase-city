// V2.1 destructible low-rise buildings (game/buildings.js), drawn as
// their wall cells: one InstancedMesh for every cell in the city (walls
// with a band of windows, tinted per building), darker as a cell is
// damaged; a broken cell leaves a rubble heap on the ground, and chunks
// of wall fly out along the blow and stay where they land.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createBuildingCells } from "../game/buildings.js";

const WALL_COLORS = [0xf34b32, 0xffbf22, 0x087cba, 0x13a783, 0xf38617, 0x2364ce, 0xe8dcc4, 0xb4553f];
function colored(g, hex) {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  g.deleteAttribute("uv");
  return g.toNonIndexed();
}
// A unit cell (1 x 1 x 1, standing on y = 0): white wall (tinted by the
// instance colour), dark windows on all four sides, a pale roof rim.
function cellGeometry() {
  const parts = [];
  const add = (w, h, d, x, y, z, hex) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    parts.push(colored(g, hex));
  };
  add(1, 1, 1, 0, 0.5, 0, 0xffffff);
  for (const [x, z, w, d] of [[0, 0.505, 0.62, 0.02], [0, -0.505, 0.62, 0.02], [0.505, 0, 0.02, 0.62], [-0.505, 0, 0.02, 0.62]]) {
    add(w, 0.22, d, x, 0.32, z, 0x23303c);
    add(w, 0.22, d, x, 0.7, z, 0x23303c);
  }
  add(1.02, 0.04, 1.02, 0, 1.0, 0, 0xdedad2);
  return mergeGeometries(parts);
}

export class BuildingCellsRenderer {
  constructor(scene) {
    this.scene = scene;
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
    this.geometry = cellGeometry();
    this.rubbleGeo = new THREE.DodecahedronGeometry(0.5, 0);
    this.chunkGeo = new THREE.BoxGeometry(0.5, 0.35, 0.4);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.e = new THREE.Euler();
    this.c = new THREE.Color();
    this.mesh = null;
  }
  setLayout(layout) {
    for (const m of [this.mesh, this.rubble, this.chunks]) if (m) { this.scene.remove(m); m.dispose?.(); }
    this.mesh = this.rubble = this.chunks = null;
    const { cells } = createBuildingCells(layout);
    this.count = cells.length;
    this.version = -1;
    if (!cells.length) return;
    const inst = (geo, mat, n) => {
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
      m.castShadow = m.receiveShadow = true;
      m.frustumCulled = false;
      this.scene.add(m);
      return m;
    };
    this.mesh = inst(this.geometry, this.material, cells.length);
    this.base = cells.map((c) => WALL_COLORS[(layout.buildings[c.building].color * 3 + c.building) % WALL_COLORS.length]);
    cells.forEach((c, i) => {
      this.m.compose(this.v.set(c.x, 0.38, c.z), this.q.identity(), this.s.set(c.w + 0.01, c.h, c.d + 0.01));
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.c.setHex(this.base[i]));
    });
    this.rubble = inst(this.rubbleGeo, new THREE.MeshStandardMaterial({ color: 0x9c968d, roughness: 1, flatShading: true }), cells.length * 3);
    this.rubble.count = 0;
    this.chunks = inst(this.chunkGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), 260);
    this.chunks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(260 * 3), 3);
    this.chunks.count = 0;
    this.flying = [];
    this.landed = 0;
    this.shown = new Set();
  }
  update(sim, dt) {
    const bc = sim.buildingCells;
    if (!this.mesh || !bc) return;
    if (bc.version !== this.version) {
      this.version = bc.version;
      let r = 0;
      bc.cells.forEach((c, i) => {
        if (c.alive) {
          const k = Math.max(0, c.hp) / 70;
          this.mesh.setColorAt(i, this.c.setHex(this.base[i]).multiplyScalar(0.55 + 0.45 * k));
          // A cracked wall leans a little.
          this.e.set(k < 1 ? (1 - k) * 0.04 : 0, 0, k < 1 ? (1 - k) * 0.03 : 0);
          this.m.compose(this.v.set(c.x, 0.38, c.z), this.q.setFromEuler(this.e), this.s.set(c.w + 0.01, c.h, c.d + 0.01));
        } else {
          this.m.compose(this.v.set(c.x, -50, c.z), this.q.identity(), this.s.set(0.001, 0.001, 0.001));
          // Rubble heap where it stood (drivable).
          for (let k = 0; k < 3; k++) {
            this.e.set(k, c.id + k, k * 0.7);
            this.rubble.setMatrixAt(r++, this.m.compose(this.v.set(c.x + (k - 1) * c.w * 0.25, 0.42, c.z + ((k * 7) % 3 - 1) * c.d * 0.2), this.q.setFromEuler(this.e), this.s.set(c.w * 0.45, 0.6, c.d * 0.45)));
          }
          this.m.compose(this.v.set(c.x, -50, c.z), this.q.identity(), this.s.set(0.001, 0.001, 0.001));
          // Chunks fly out along the blow (once per cell).
          if (!this.shown.has(c.id)) {
            this.shown.add(c.id);
            const b = c.blow || { x: 0, z: 1, speed: 12 };
            for (let k = 0; k < 6 && this.flying.length + this.landed < 260; k++) {
              const sp = 4 + Math.random() * b.speed * 0.5, a = (Math.random() - 0.5) * 1.6;
              const ca = Math.cos(a), sa = Math.sin(a);
              this.flying.push({
                x: c.x, y: 0.5 + Math.random() * c.h * 0.6, z: c.z,
                vx: (b.x * ca - b.z * sa) * sp, vz: (b.x * sa + b.z * ca) * sp, vy: 2 + Math.random() * 4,
                rx: Math.random() * 6, ry: Math.random() * 6, spin: 4 + Math.random() * 8,
                color: this.base[c.id],
              });
            }
          }
        }
        this.mesh.setMatrixAt(i, this.m);
      });
      this.rubble.count = r;
      this.rubble.instanceMatrix.needsUpdate = true;
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
    if (this.flying.length) {
      const keep = [];
      for (const f of this.flying) {
        f.vy -= 16 * dt;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.z += f.vz * dt;
        f.rx += f.spin * dt;
        const landed = f.y <= 0.55;
        if (landed) f.y = 0.55;
        const idx = landed ? this.landed : this.landed + keep.length;
        this.m.compose(this.v.set(f.x, f.y, f.z), this.q.setFromEuler(this.e.set(f.rx, f.ry, 0)), this.s.set(1, 1, 1));
        if (landed) {
          // Landed: frozen into the persistent part of the pool.
          this.chunks.setMatrixAt(this.landed, this.m);
          this.chunks.setColorAt(this.landed, this.c.setHex(f.color));
          this.landed++;
        } else keep.push(f);
      }
      keep.forEach((f, k) => {
        this.m.compose(this.v.set(f.x, f.y, f.z), this.q.setFromEuler(this.e.set(f.rx, f.ry, 0)), this.s.set(1, 1, 1));
        this.chunks.setMatrixAt(this.landed + k, this.m);
        this.chunks.setColorAt(this.landed + k, this.c.setHex(f.color));
      });
      this.flying = keep;
      this.chunks.count = this.landed + keep.length;
      this.chunks.instanceMatrix.needsUpdate = true;
      this.chunks.instanceColor.needsUpdate = true;
    }
  }
}
