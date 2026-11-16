import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// V1.9 city life renderer. Everything is instanced (one draw call per part
// type), nothing casts shadows, and props are only re-uploaded when they
// change, so it stays cheap on phones. Same flat low-poly style as the rest
// of the city.

const PROP_PARTS = {
  trash: [
    { geo: "cyl", size: [0.42, 0.85, 0.42], at: [0, 0.43, 0], color: 0x2f7d55 },
    { geo: "box", size: [0.95, 0.12, 0.95], at: [0, 0.9, 0], color: 0x1c4a34 },
  ],
  sign: [
    { geo: "box", size: [0.1, 2.4, 0.1], at: [0, 1.2, 0], color: 0x9aa7ab },
    { geo: "box", size: [0.9, 0.9, 0.08], at: [0, 2.3, 0], color: 0x2364ce },
    { geo: "box", size: [0.5, 0.12, 0.09], at: [0, 2.3, 0], color: 0xffffff },
  ],
  lamp: [
    { geo: "box", size: [0.14, 4.4, 0.14], at: [0, 2.2, 0], color: 0x233c48 },
    { geo: "box", size: [0.4, 0.18, 1.4], at: [0, 4.4, 0.6], color: 0xffeac3 },
  ],
  tree: [
    { geo: "box", size: [0.3, 1.6, 0.3], at: [0, 0.8, 0], color: 0x7f4926 },
    { geo: "ico", size: [1.15, 1.4, 1.15], at: [0, 2.3, 0], color: 0x2f9d45 },
  ],
  bigTree: [
    { geo: "box", size: [0.55, 2.2, 0.55], at: [0, 1.1, 0], color: 0x6f3d1f },
    { geo: "ico", size: [1.8, 2.25, 1.8], at: [0, 3.2, 0], color: 0x168a37 },
  ],
};
const SHIRTS = [0xe8473b, 0x2f6fd8, 0xf2b636, 0x3aa776, 0x9b59d0, 0xf07fb0];
const SKIN = [0xf1c8a0, 0xc68a5a, 0x7d4f2f];
const CAR_COLORS = [0x4f8fd8, 0xe8e2d4, 0xd8463b, 0x3d4a52, 0x58b56d, 0xe8a23a];

function geometry(kind) {
  if (kind === "cyl") return new THREE.CylinderGeometry(0.5, 0.45, 1, 8);
  if (kind === "ico") return new THREE.IcosahedronGeometry(1, 0);
  return new THREE.BoxGeometry(1, 1, 1);
}

// One merged civilian car (vertex colours: body white so the per-instance
// colour paints it, windows/wheels dark).
function carGeometry() {
  const parts = [];
  const add = (w, h, d, x, y, z, color) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    const c = new THREE.Color(color);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = c.r;
      colors[i + 1] = c.g;
      colors[i + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    parts.push(g);
  };
  add(1.8, 0.6, 3.5, 0, 0.62, 0, 0xffffff); // body
  add(1.55, 0.55, 1.7, 0, 1.18, 0.2, 0x26404c); // cabin glass
  add(1.6, 0.1, 1.55, 0, 1.5, 0.2, 0xffffff); // roof
  for (const x of [-0.95, 0.95])
    for (const z of [-1.1, 1.1]) add(0.28, 0.62, 0.62, x, 0.36, z, 0x17252b);
  for (const x of [-0.55, 0.55]) {
    add(0.4, 0.18, 0.06, x, 0.7, -1.76, 0xfff3c4);
    add(0.4, 0.16, 0.06, x, 0.7, 1.76, 0xff3028);
  }
  const merged = mergeGeometries(parts);
  parts.forEach((g) => g.dispose());
  return merged;
}

export class CityLifeRenderer {
  constructor(scene) {
    this.scene = scene;
    this.ready = false;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.part = new THREE.Matrix4();
    this.base = new THREE.Matrix4();
  }
  material(color, extra = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      flatShading: true,
      ...extra,
    });
  }
  instanced(geo, mat, count) {
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.count = count;
    this.scene.add(mesh);
    return mesh;
  }
  build(city) {
    this.city = city;
    // Props: one instanced mesh per (kind, part).
    this.propMeshes = [];
    for (const [kind, parts] of Object.entries(PROP_PARTS)) {
      const props = city.props.filter((p) => p.kind === kind);
      if (!props.length) continue;
      const meshes = parts.map((part) => ({
        part,
        mesh: this.instanced(
          geometry(part.geo),
          this.material(part.color),
          props.length,
        ),
      }));
      this.propMeshes.push({ kind, props, meshes });
      props.forEach((p) => (p.dirty = true));
    }
    // Litter: small flat scraps, persistent.
    this.litterMesh = this.instanced(
      new THREE.BoxGeometry(0.3, 0.03, 0.2),
      this.material(0xffffff),
      300,
    );
    this.litterMesh.count = 0;
    this.litterShown = 0;
    // Pedestrians: torso, head, two legs, two arms.
    const P = 24;
    this.pedMeshes = {
      torso: this.instanced(
        new THREE.BoxGeometry(0.42, 0.62, 0.26),
        this.material(0xffffff),
        P,
      ),
      head: this.instanced(
        new THREE.BoxGeometry(0.26, 0.28, 0.26),
        this.material(0xffffff),
        P,
      ),
      legs: this.instanced(
        new THREE.BoxGeometry(0.15, 0.7, 0.17),
        this.material(0x223040),
        P * 2,
      ),
      arms: this.instanced(
        new THREE.BoxGeometry(0.12, 0.55, 0.13),
        this.material(0xffffff),
        P * 2,
      ),
    };
    // Civilian cars (moving, parked, wrecked) in one draw call.
    this.carMesh = this.instanced(
      carGeometry(),
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.6,
        flatShading: true,
      }),
      40,
    );
    this.carMesh.count = 0;
    // Impact particles: leaves, sparks, dust, rubbish.
    this.particles = [];
    this.particleMesh = this.instanced(
      new THREE.BoxGeometry(0.16, 0.16, 0.16),
      this.material(0xffffff),
      140,
    );
    this.particleMesh.count = 0;
    this.smokeMesh = this.instanced(
      new THREE.IcosahedronGeometry(0.5, 0),
      this.material(0x6b6f70, { transparent: true, opacity: 0.55 }),
      40,
    );
    this.smokeMesh.count = 0;
    this.lastEvent = 0;
    this.color = new THREE.Color();
    this.ready = true;
  }
  // Prop pose: standing (with a wobble), falling over its base in fallDir,
  // or tumbling through the air (trash).
  propMatrix(p, out) {
    let tilt =
      p.state === "stand" ? Math.sin(p.wobble * 18) * p.wobble * 0.25 : 0;
    if (p.state === "falling" || p.state === "down")
      tilt = (p.kind === "trash" ? 1 : 0.98) * (Math.PI / 2) * easeOut(p.fall);
    if (p.state === "tumble")
      tilt = p.fall * Math.PI * 2 * (p.spin > 0 ? 1 : -1);
    if (p.state === "down" && p.kind === "trash") tilt = Math.PI / 2;
    // Rotate about X (toward +z), then yaw so +z points along fallDir.
    this.e.set(tilt, p.state === "stand" ? p.angle : p.fallDir, 0, "YXZ");
    this.q.setFromEuler(this.e);
    this.v.set(
      p.x,
      p.y + (p.state === "down" && p.kind === "trash" ? 0.45 : 0),
      p.z,
    );
    this.s.set(1, 1, 1);
    out.compose(this.v, this.q, this.s);
  }
  update(city, sim, camera, dt, kick) {
    if (!city) return;
    if (!this.ready || this.city !== city) {
      if (this.ready) this.dispose();
      this.build(city);
    }
    // Props (only changed ones are re-uploaded).
    for (const group of this.propMeshes) {
      let changed = false;
      group.props.forEach((p, i) => {
        if (!p.dirty) return;
        changed = true;
        this.propMatrix(p, this.base);
        for (const { part, mesh } of group.meshes) {
          this.part.compose(
            this.v.set(...part.at),
            this.q.identity(),
            this.s.set(...part.size),
          );
          this.m.multiplyMatrices(this.base, this.part);
          mesh.setMatrixAt(i, this.m);
        }
      });
      if (changed)
        for (const { mesh } of group.meshes)
          mesh.instanceMatrix.needsUpdate = true;
    }
    for (const g of this.propMeshes) for (const p of g.props) p.dirty = false;
    // Litter (append only).
    const litter = city.litter;
    if (litter.length !== this.litterShown) {
      litter.forEach((l, i) => {
        this.e.set(0, l.angle, 0);
        this.q.setFromEuler(this.e);
        this.m.compose(this.v.set(l.x, 0.17, l.z), this.q, this.s.set(1, 1, 1));
        this.litterMesh.setMatrixAt(i, this.m);
        this.litterMesh.setColorAt(
          i,
          this.color.set([0xf2efe4, 0x9fc6e8, 0xd9b48f, 0x8a9c6b][l.color]),
        );
      });
      this.litterMesh.count = litter.length;
      this.litterMesh.instanceMatrix.needsUpdate = true;
      if (this.litterMesh.instanceColor)
        this.litterMesh.instanceColor.needsUpdate = true;
      this.litterShown = litter.length;
    }
    this.updatePeds(city, sim);
    this.updateCars(city, sim);
    this.updateEvents(city, sim, kick);
    this.updateParticles(dt);
  }
  updatePeds(city, sim) {
    const M = this.pedMeshes;
    let n = 0;
    // Colours only go to the GPU when the set of people changes.
    const key = city.pedestrians.map((q) => q.id).join(",");
    const recolor = key !== this.pedKey;
    this.pedKey = key;
    for (const q of city.pedestrians) {
      if (n >= 24) break;
      const running =
        q.state === "flee" || q.state === "dive" || q.state === "recover";
      const speed = running ? 14 : 8;
      const swing = Math.sin(q.phase * speed) * (running ? 0.9 : 0.45);
      const dive = q.state === "dive" ? 1 : 0;
      this.e.set(dive * 1.1, q.heading, 0, "YXZ");
      this.q.setFromEuler(this.e);
      // A little larger than life so people read on a phone screen.
      this.base.compose(
        this.v.set(q.x, 0.12 + dive * 0.25, q.z),
        this.q,
        this.s.setScalar(1.3),
      );
      const put = (mesh, i, x, y, z, rx, color) => {
        this.part.compose(
          this.v.set(x, y, z),
          this.q.setFromEuler(this.e.set(rx, 0, 0)),
          this.s.set(1, 1, 1),
        );
        this.m.multiplyMatrices(this.base, this.part);
        mesh.setMatrixAt(i, this.m);
        if (recolor && color !== undefined)
          mesh.setColorAt(i, this.color.set(color));
      };
      put(M.torso, n, 0, 1.08, 0, 0, SHIRTS[q.color]);
      put(M.head, n, 0, 1.55, 0, 0, SKIN[q.skin]);
      // Pivot legs/arms near the hip/shoulder by offsetting half their length.
      put(M.legs, n * 2, -0.11, 0.42 + 0.0, 0, swing);
      put(M.legs, n * 2 + 1, 0.11, 0.42, 0, -swing);
      const armUp = running ? 0.4 : 0;
      put(M.arms, n * 2, -0.29, 1.1, 0, -swing * 0.8 - armUp, SHIRTS[q.color]);
      put(
        M.arms,
        n * 2 + 1,
        0.29,
        1.1,
        0,
        swing * 0.8 - armUp,
        SHIRTS[q.color],
      );
      n++;
    }
    M.torso.count = n;
    M.head.count = n;
    M.legs.count = n * 2;
    M.arms.count = n * 2;
    if (!n && !this.pedCount) return;
    this.pedCount = n;
    for (const mesh of Object.values(M)) {
      mesh.instanceMatrix.needsUpdate = true;
      if (recolor && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
  updateCars(city, sim) {
    let n = 0,
      smoke = 0;
    const key = city.traffic
      .map(
        (t) => `${t.id}${t.state === "wreck" ? "w" : t.health < 60 ? "h" : ""}`,
      )
      .join(",");
    const recolor = key !== this.carKey;
    this.carKey = key;
    for (const t of city.traffic) {
      if (n >= 40) break;
      const wreck = t.state === "wreck";
      const hurt = t.health < 60;
      this.e.set(0, t.angle, wreck ? 0.12 : 0, "YXZ");
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(t.x, 0, t.z), this.q, this.s.set(1, 1, 1));
      this.carMesh.setMatrixAt(n, this.m);
      if (recolor) {
        this.color.set(CAR_COLORS[t.color]);
        if (wreck) this.color.multiplyScalar(0.35);
        else if (hurt) this.color.multiplyScalar(0.7);
        this.carMesh.setColorAt(n, this.color);
      }
      n++;
      // Smoke from wrecked civilian cars (no fire, no explosion).
      if (wreck && smoke < 38)
        for (let k = 0; k < 2; k++) {
          const age = ((t.smoke || 0) * 0.6 + k * 0.5) % 1;
          this.m.compose(
            this.v.set(t.x + Math.sin(age * 9) * 0.3, 1.4 + age * 3, t.z - 0.9),
            this.q.identity(),
            this.s.setScalar(0.6 + age * 1.2),
          );
          this.smokeMesh.setMatrixAt(smoke++, this.m);
        }
    }
    if (n || this.carMesh.count) {
      this.carMesh.count = n;
      this.carMesh.instanceMatrix.needsUpdate = true;
      if (recolor && this.carMesh.instanceColor)
        this.carMesh.instanceColor.needsUpdate = true;
    }
    if (smoke || this.smokeMesh.count) {
      this.smokeMesh.count = smoke;
      this.smokeMesh.instanceMatrix.needsUpdate = true;
    }
  }
  burst(x, z, count, color, power, lift = 4) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= 140) this.particles.shift();
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        x,
        y: 0.6 + Math.random(),
        z,
        vx: Math.cos(a) * power * (0.4 + Math.random()),
        vz: Math.sin(a) * power * (0.4 + Math.random()),
        vy: lift * (0.5 + Math.random()),
        life: 0.7 + Math.random() * 0.5,
        color,
        spin: Math.random() * 6,
      });
    }
  }
  updateEvents(city, sim, kick) {
    for (const e of city.events) {
      if (e.id <= this.lastEvent) continue;
      this.lastEvent = e.id;
      const near = Math.hypot(e.x - sim.player.x, e.z - sim.player.z) < 45;
      if (!near) continue;
      if (e.type === "prop") {
        if (e.kind === "tree" || e.kind === "bigTree")
          this.burst(e.x, e.z, e.action === "land" ? 14 : 9, 0x3faa4a, 3, 3);
        else if (e.kind === "lamp" || e.kind === "sign")
          this.burst(e.x, e.z, 8, 0xffd84a, 5, 5);
        else if (e.kind === "trash") this.burst(e.x, e.z, 10, 0xd8d0b8, 4, 4);
        if (e.action === "land") this.burst(e.x, e.z, 6, 0xb9a98a, 2, 1.5);
      } else if (e.type === "traffic" && e.action !== "honk") {
        this.burst(e.x, e.z, 10, 0xc9d3d6, 4, 3);
      }
      if (kick && e.byPlayer && e.strength > 5)
        kick(Math.min(0.3, e.strength / 50));
    }
  }
  updateParticles(dt) {
    const mesh = this.particleMesh;
    if (!this.particles.length && !mesh.count) return;
    let n = 0;
    this.particles = this.particles.filter((p) => (p.life -= dt) > 0);
    for (const p of this.particles) {
      p.vy -= 12 * dt;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.y = Math.max(0.15, p.y + p.vy * dt);
      if (p.y <= 0.15) {
        p.vx *= 0.8;
        p.vz *= 0.8;
      }
      this.e.set(p.spin * p.life, p.spin, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(
        this.v.set(p.x, p.y, p.z),
        this.q,
        this.s.setScalar(Math.min(1, p.life * 1.5)),
      );
      mesh.setMatrixAt(n, this.m);
      mesh.setColorAt(n, this.color.set(p.color));
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  dispose() {
    const all = [
      ...this.propMeshes.flatMap((g) => g.meshes.map((m) => m.mesh)),
      this.litterMesh,
      ...Object.values(this.pedMeshes),
      this.carMesh,
      this.particleMesh,
      this.smokeMesh,
    ];
    for (const mesh of all) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.dispose?.();
    }
    this.ready = false;
  }
  reset() {
    if (this.ready) this.dispose();
    this.city = null;
    this.particles = [];
  }
}

function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}
