import * as THREE from "three";
import { blastStrength } from "../game/blast.js";

// Fragments that have landed are moved into a few InstancedMeshes so every
// piece of debris from the run stays on the road until RESTART at the cost of
// one draw call per material, however many explosions happen.
export class DebrisField {
  constructor(scene, geometry, materials, capacity = 256) {
    this.scene = scene;
    this.geometry = geometry;
    this.materials = materials;
    this.counts = materials.map(() => 0);
    this.meshes = materials.map(() => null);
    this.capacity = 0;
    this.grow(capacity);
  }
  grow(capacity) {
    this.meshes = this.meshes.map((old, i) => {
      const mesh = new THREE.InstancedMesh(
        this.geometry,
        this.materials[i],
        capacity,
      );
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.userData.debrisField = true;
      if (old) {
        for (let k = 0; k < this.counts[i]; k++)
          mesh.instanceMatrix.array.set(
            old.instanceMatrix.array.subarray(k * 16, k * 16 + 16),
            k * 16,
          );
        this.scene.remove(old);
        old.dispose();
      }
      mesh.count = this.counts[i];
      this.scene.add(mesh);
      return mesh;
    });
    this.capacity = capacity;
  }
  add(materialIndex, matrix) {
    if (this.counts[materialIndex] >= this.capacity)
      this.grow(this.capacity * 2);
    const mesh = this.meshes[materialIndex];
    mesh.setMatrixAt(this.counts[materialIndex]++, matrix);
    mesh.count = this.counts[materialIndex];
    mesh.instanceMatrix.needsUpdate = true;
  }
  get total() {
    return this.counts.reduce((a, b) => a + b, 0);
  }
  reset() {
    this.counts = this.counts.map(() => 0);
    for (const mesh of this.meshes) mesh.count = 0;
  }
}

// How big an explosion is: a police or parked car 1.4, a fuel pump island
// 2.6, a major blast (a building, a tanker) 3.4. Chain reactions grow a
// little with each link (more fuel).
export function explosionScale(event) {
  return blastStrength(event);
}


// Chunks thrown by an explosion of this scale (all land and stay).
export const chunkCount = (scale) => Math.round(20 * Math.pow(scale, 0.9));

// How long the smoke column of an explosion keeps rising (s).
export function smokeSeconds(scale) {
  return scale >= 3.2 ? 70 : scale >= 2.2 ? 45 : 14;
}

// Fire colour over a puff's life: white-yellow core, yellow, orange, red,
// then soot (the fireball rolls up into the smoke).
const FIRE_RAMP = [
  [0, new THREE.Color(0xfffdf0)],
  [0.1, new THREE.Color(0xffec6a)],
  [0.26, new THREE.Color(0xffa424)],
  [0.46, new THREE.Color(0xff5e18)],
  [0.66, new THREE.Color(0xc4301a)],
  [0.84, new THREE.Color(0x4a2620)],
  [1, new THREE.Color(0x262224)],
];
function ramp(stops, f, out) {
  for (let i = 1; i < stops.length; i++)
    if (f <= stops[i][0]) {
      const [a, ca] = stops[i - 1],
        [b, cb] = stops[i];
      return out.copy(ca).lerp(cb, (f - a) / (b - a));
    }
  return out.copy(stops[stops.length - 1][1]);
}

// One InstancedMesh holding every live particle of one kind; particles are
// plain objects updated on the CPU, written out each frame (one draw call
// per pool however many explosions are going on).
class Pool {
  constructor(scene, geometry, material, capacity) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 3),
      3,
    );
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.capacity = capacity;
    this.items = [];
  }
  add(p) {
    // Full: the oldest particle gives way (never more than the budget).
    if (this.items.length >= this.capacity) this.evict(this.items.shift());
    this.items.push(p);
    return p;
  }
  evict() {}
  clear() {
    this.items.length = 0;
    this.mesh.count = 0;
  }
}

// Opacity of each puff of a column that hides a car.
export const SEE_THROUGH = 0.1;

const dummy = new THREE.Object3D();
const tint = new THREE.Color();
const tint2 = new THREE.Color();

export class ExplosionEffects {
  constructor(scene, onStart = null) {
    this.scene = scene;
    this.onStart = onStart;
    this.lastEvent = 0;
    this.lastTime = null;
    this.pending = [];
    this.columns = []; // smoke (and fire) emitters left by each blast
    this.rings = [];
    // Angular low-poly shapes throughout: fire and smoke are faceted
    // icosahedra and dodecahedra, debris is boxes and wedges.
    this.chunkGeometry = new THREE.BoxGeometry(0.4, 0.35, 0.55);
    const puff = new THREE.IcosahedronGeometry(1, 0);
    const smokePuff = new THREE.DodecahedronGeometry(1, 0);
    this.chunkMaterials = [0x2a292e, 0xd62f2a, 0xff8a1a].map(
      (color) => new THREE.MeshStandardMaterial({ color }),
    );
    this.debris = new DebrisField(
      scene,
      this.chunkGeometry,
      this.chunkMaterials,
    );
    // Fire: unlit so it reads as light, opaque so it costs no sorting.
    this.fire = new Pool(
      scene,
      puff,
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      900,
    );
    // Flash and glow: additive (fades by darkening the colour).
    this.glow = new Pool(
      scene,
      puff,
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      96,
    );
    // Smoke: lit, faceted, dark; opaque chunky plumes.
    this.smoke = new Pool(
      scene,
      smokePuff,
      new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }),
      1600,
    );
    // The same smoke, see-through: puffs of a column that is hiding the
    // player (or a police car) are drawn here instead, with a per-puff
    // alpha (like buildings the car passes behind), never sorted, no depth
    // writes. Unhidden smoke stays opaque and dense above.
    const fadeMaterial = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      flatShading: true,
      transparent: true,
      depthWrite: false,
    });
    fadeMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aAlpha;\nvarying float vAlpha;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvAlpha = aAlpha;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vAlpha;")
        .replace("vec4 diffuseColor = vec4( diffuse, opacity );", "vec4 diffuseColor = vec4( diffuse, opacity * vAlpha );");
    };
    this.smokeFade = new Pool(scene, smokePuff, fadeMaterial, 1600);
    this.fadeAlpha = new THREE.InstancedBufferAttribute(new Float32Array(1600), 1);
    this.fadeAlpha.setUsage(THREE.DynamicDrawUsage);
    this.smokeFade.mesh.geometry = smokePuff.clone();
    this.smokeFade.mesh.geometry.setAttribute("aAlpha", this.fadeAlpha);
    this.smokeFade.mesh.renderOrder = 2;
    this.viewers = null;
    // Flying chunks (land into the debris field above).
    this.chunks = new Pool(
      scene,
      this.chunkGeometry,
      new THREE.MeshStandardMaterial({ color: 0xffffff }),
      500,
    );
    this.chunks.mesh.castShadow = true;
    // A chunk pushed out of a full pool lands where it is (debris is never
    // lost, only its flight cut short).
    this.chunks.evict = (p) => {
      dummy.position.set(p.x, 0.2, p.z);
      dummy.rotation.set(p.rx, p.ry, p.rz);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      this.debris.add(p.material, this.matrix.copy(dummy.matrix));
    };
    this.ringGeometry = new THREE.TorusGeometry(1, 0.09, 3, 24);
    this.matrix = new THREE.Matrix4();
    this.seed = 1;
  }
  rand() {
    // Deterministic per effect (screenshots repeat), cheap.
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  // Live particles (performance overlay / tests).
  get counts() {
    return {
      fire: this.fire.items.length,
      glow: this.glow.items.length,
      smoke: this.smoke.items.length,
      chunks: this.chunks.items.length,
      columns: this.columns.filter((c) => (this.now ?? 0) <= c.until).length,
      seeThrough: this.smokeFade.mesh.count,
      debris: this.debris.total,
    };
  }
  // Where the camera is and which cars must stay visible (the player and
  // the police near it): set by the renderer each frame.
  setViewers(camera, targets) {
    this.viewers = { camera, targets };
  }
  spawn(event) {
    this.pending.push({ event, at: event.time + (event.delay || 0) });
  }
  start(event, now) {
    const s = explosionScale(event);
    this.seed = (event.id * 2654435761) >>> 0 || 1;
    const R = () => this.rand();
    const x = event.x,
      z = event.z;
    if (event.dust) {
      // A structure coming down (an elevated road span, a pillar): no
      // fire, a rolling cloud of concrete dust and broken concrete.
      this.onStart?.(event, s * 0.7);
      const n = Math.round(26 * Math.sqrt(s)), sq = Math.sqrt(s);
      const along = event.along || { x: 0, z: 0 }, len = event.len || 0;
      for (let i = 0; i < n; i++) {
        const a = R() * Math.PI * 2, sp = (2 + R() * 5) * sq, t = (R() - 0.5) * len;
        this.smoke.add({
          x: x + along.x * t + Math.sin(a) * 1.5, y: 0.5 + R() * 2.5, z: z + along.z * t + Math.cos(a) * 1.5,
          vx: Math.sin(a) * sp, vy: 0.8 + R() * 2.2, vz: Math.cos(a) * sp,
          born: now + R() * 0.25, life: 1.9 + R() * 1.1,
          s0: 0.8 * sq, s1: 2.1 * sq, drag: 2.4, lift: 0.5,
          c0: 0xc4bdb1, c1: 0x9a948b, rx: R() * 6, ry: R() * 6, spin: 0.6,
        });
      }
      const nChunk = Math.round(chunkCount(s) * 0.8);
      for (let i = 0; i < nChunk; i++) {
        const a = R() * Math.PI * 2, sp = (3 + R() * 5) * Math.pow(s, 0.4), t = (R() - 0.5) * len;
        this.chunks.add({
          x: x + along.x * t, y: 1.5, z: z + along.z * t,
          vx: Math.sin(a) * sp, vy: 3 + R() * 5, vz: Math.cos(a) * sp,
          born: now, material: 0, color: [0x9f9a91, 0xbab5ac, 0x7d7870][i % 3],
          scale: 0.9 + R() * (0.6 + s * 0.3), rx: R() * 6, ry: R() * 6, rz: R() * 6,
          wx: (R() - 0.5) * 8, wy: (R() - 0.5) * 8,
        });
      }
      return;
    }
    this.onStart?.(event, s);
    // 1. Flash: a bright white-yellow core and a ground glow, a fraction of
    // a second.
    this.glow.add({ kind: "flash", x, y: 1.4 * s, z, born: now, life: 0.16, size: 2.6 * s, color: 0xfff6d8 });
    this.glow.add({ kind: "flash", x, y: 1.8 * s, z, born: now, life: 0.32, size: 3.2 * s, color: 0xb05a14 });
    this.glow.add({ kind: "flash", x, y: 0.3, z, born: now, life: 0.3, size: 3.6 * s, flat: true, color: 0x8a3a10 });
    // 2. Fireball: angular puffs thrown up and out, cooling from white
    // through orange and red into soot.
    const nFire = Math.round(30 * s);
    for (let i = 0; i < nFire; i++) {
      // The first third is the core: slower, held white-yellow longer.
      const hot = i < nFire / 3;
      const a = R() * Math.PI * 2,
        up = 0.35 + R() * 0.65,
        sp = (hot ? 1.5 + R() * 2.5 : 3 + R() * 6) * Math.sqrt(s);
      this.fire.add({
        hot,
        x: x + Math.sin(a) * R() * 0.8 * s,
        y: 0.6 + R() * 0.8 * s,
        z: z + Math.cos(a) * R() * 0.8 * s,
        vx: Math.sin(a) * sp * (1 - up * 0.6),
        vy: sp * up + 2,
        vz: Math.cos(a) * sp * (1 - up * 0.6),
        born: now + R() * 0.12,
        life: 1.5 + R() * 1.2 + s * 0.25,
        s0: (0.6 + R() * 0.5) * Math.sqrt(s),
        s1: (1.6 + R() * 1.5) * Math.sqrt(s),
        drag: 2.2,
        lift: 3.5,
        rx: R() * 6,
        ry: R() * 6,
        spin: (R() - 0.5) * 3,
      });
    }
    // Embers: small bright bits on high arcs.
    const nEmber = Math.round(14 * s);
    for (let i = 0; i < nEmber; i++) {
      const a = R() * Math.PI * 2,
        sp = 6 + R() * 9;
      this.fire.add({
        x, y: 1, z,
        vx: Math.sin(a) * sp, vy: 7 + R() * 9, vz: Math.cos(a) * sp,
        born: now, life: 1.2 + R() * 1.0,
        s0: 0.16, s1: 0.1, drag: 0.3, lift: -14,
        rx: R() * 6, ry: R() * 6, spin: 8, ember: true,
      });
    }
    // The smoke column (emits in emitColumns) is created first so the dust
    // ring belongs to it too (for the see-through check).
    const column = {
      x, z, s, born: now, until: now + smokeSeconds(s),
      fireUntil: now + (s >= 2.2 ? 12 : 4),
      acc: 0, fireAcc: 0, alpha: 1,
    };
    // 3. Shockwave: a fast flat ring and a dust ring rolling outwards.
    this.rings.push({ x, z, born: now, life: 0.38, radius: 9 * s, mesh: null });
    const nDust = Math.round(14 * Math.sqrt(s));
    for (let i = 0; i < nDust; i++) {
      const a = (i / nDust) * Math.PI * 2 + R() * 0.3,
        sp = (8 + R() * 5) * Math.sqrt(s);
      this.smoke.add({
        x: x + Math.sin(a) * 1.2, y: 0.4, z: z + Math.cos(a) * 1.2,
        vx: Math.sin(a) * sp, vy: 0.4, vz: Math.cos(a) * sp,
        born: now, life: 1.6 + R() * 0.8,
        s0: 0.6 * Math.sqrt(s), s1: 1.6 * Math.sqrt(s), drag: 3.2, lift: 0,
        c0: 0x8d8478, c1: 0x6f6a64, rx: R() * 6, ry: R() * 6, spin: 1,
        col: column,
      });
    }
    // 4. Chunks: up and out, spinning; they land and stay (debris field).
    const nChunk = chunkCount(s);
    for (let i = 0; i < nChunk; i++) {
      const a = R() * Math.PI * 2,
        sp = (4 + R() * 7) * Math.pow(s, 0.45),
        vy = 6 + R() * 8 * Math.pow(s, 0.4);
      const kind = i % 3;
      this.chunks.add({
        x: x + Math.sin(a) * 0.5, y: 1, z: z + Math.cos(a) * 0.5,
        vx: Math.sin(a) * sp, vy, vz: Math.cos(a) * sp,
        born: now, material: kind,
        color: [0x2a292e, 0xd62f2a, 0xff8a1a][kind],
        scale: 0.8 + R() * (0.5 + s * 0.35),
        rx: R() * 6, ry: R() * 6, rz: R() * 6,
        wx: (R() - 0.5) * 12, wy: (R() - 0.5) * 12,
      });
    }
    // 5. Smoke column: thick dark plumes keep rolling up long after the
    // fire (a car 14 s, a fuel island 45 s, a major blast over a minute),
    // with flames licking at the base for the first part.
    this.columns.push(column);
  }
  emitColumns(now, dt) {
    const R = () => Math.random();
    for (const c of [...this.columns]) {
      if (now > c.until + 12) {
        // Its last puffs have gone: forget it.
        this.columns.splice(this.columns.indexOf(c), 1);
        continue;
      }
      if (now > c.until) continue;
      const age = now - c.born,
        left = (c.until - now) / (c.until - c.born);
      // Dense at first, thinning out towards the end.
      // A heavy burst of smoke for the first seconds, then a steady thinner
      // column (so it never blots out the street from the chase camera).
      const rate =
        age < 2.5
          ? 3 + 7 * Math.sqrt(c.s)
          : (1.2 + 2.2 * Math.sqrt(c.s)) * (0.4 + 0.6 * Math.min(1, left * 1.6));
      c.acc += rate * dt;
      while (c.acc >= 1) {
        c.acc -= 1;
        const r = 0.4 + 0.5 * c.s;
        const a = R() * Math.PI * 2;
        this.smoke.add({
          x: c.x + Math.sin(a) * R() * r,
          y: 0.8 + R() * 0.6,
          z: c.z + Math.cos(a) * R() * r,
          vx: (R() - 0.5) * 0.8 + 0.6, // light breeze
          vy: 2.4 + R() * 1.6 + c.s * 0.5,
          vz: (R() - 0.5) * 0.8 + 0.3,
          born: now,
          life: 4 + R() * 2 + c.s * 0.5,
          s0: (0.6 + R() * 0.35) * Math.sqrt(c.s),
          s1: (age < 2.5 ? 2 + R() * 1.1 : 1.3 + R() * 0.7) * Math.sqrt(c.s),
          drag: 0.4, lift: 0.3,
          c0: 0x1e1c1f, c1: 0x4b484d,
          rx: R() * 6, ry: R() * 6, spin: (R() - 0.5) * 0.6,
          col: c,
        });
      }
      if (now < c.fireUntil) {
        c.fireAcc += (6 + 6 * c.s) * dt;
        while (c.fireAcc >= 1) {
          c.fireAcc -= 1;
          const a = R() * Math.PI * 2,
            r = R() * (0.5 + 0.6 * c.s);
          this.fire.add({
            x: c.x + Math.sin(a) * r, y: 0.4, z: c.z + Math.cos(a) * r,
            vx: (R() - 0.5) * 0.6, vy: 2 + R() * 2, vz: (R() - 0.5) * 0.6,
            born: now, life: 0.6 + R() * 0.5,
            s0: (0.4 + R() * 0.3) * Math.sqrt(c.s), s1: 0.15,
            drag: 1, lift: 2, rx: R() * 6, ry: R() * 6, spin: 2,
            start: 0.18, // already past the white-hot core
          });
        }
      }
    }
  }
  update(events, time) {
    for (const event of events)
      if (event.id > this.lastEvent) {
        // Only explosions (not target hits, wall breaks or a collapse
        // starting, which have their own effects).
        if (!event.type || event.type === "explosion") this.spawn(event);
        this.lastEvent = event.id;
      }
    const dt =
      this.lastTime === null ? 0 : Math.min(0.05, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    for (const p of [...this.pending])
      if (time >= p.at) {
        this.pending.splice(this.pending.indexOf(p), 1);
        this.start(p.event, time);
      }
    this.now = time;
    if (dt > 0) this.emitColumns(time, dt);
    this.seeThrough(time, dt);
    this.stepFire(time, dt);
    this.stepGlow(time);
    this.stepSmoke(time, dt);
    this.stepChunks(time, dt);
    this.stepRings(time);
  }
  stepFire(now, dt) {
    const pool = this.fire,
      mesh = pool.mesh;
    let n = 0;
    const keep = [];
    for (const p of pool.items) {
      const t = now - p.born;
      if (t > p.life) continue;
      keep.push(p);
      if (t < 0) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vz *= k;
      p.vy = p.vy * k + p.lift * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.ember && p.y < 0.1) p.life = 0;
      const f = Math.min(1, (p.start || 0) + t / p.life);
      // Swell fast, then shrink as it cools.
      const grow = Math.min(1, t / 0.25);
      const size = (p.s0 + (p.s1 - p.s0) * grow) * (f > 0.7 ? 1 - (f - 0.7) / 0.3 * 0.8 : 1);
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rx + t * p.spin, p.ry + t * p.spin * 0.7, 0);
      dummy.scale.setScalar(Math.max(0.01, size));
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      ramp(FIRE_RAMP, p.ember ? Math.min(f, 0.4) : p.hot ? Math.pow(f, 1.5) : f, tint);
      mesh.setColorAt(n, tint);
      n++;
    }
    pool.items = keep;
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }
  stepGlow(now) {
    const pool = this.glow,
      mesh = pool.mesh;
    let n = 0;
    pool.items = pool.items.filter((p) => now - p.born <= p.life);
    for (const p of pool.items) {
      const t = now - p.born,
        f = t / p.life;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, 0, 0);
      const size = p.size * (0.6 + 0.6 * Math.sin(Math.min(1, f * 2.5) * Math.PI * 0.5));
      if (p.flat) dummy.scale.set(size, 0.15, size);
      else dummy.scale.setScalar(size);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      tint.set(p.color).multiplyScalar(Math.max(0, 1 - f * f));
      mesh.setColorAt(n, tint);
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  // Does a smoke column stand between the camera and a car that must stay
  // visible? One cheap test per column and car (never per puff): the
  // column is a cylinder drifting with the breeze as it rises, plus its low
  // dust ring while fresh; the camera-to-car line is sampled from the car
  // up to the column's top (where smoke can hide it). A hiding column fades to SEE_THROUGH and
  // back, smoothly (no flicker).
  seeThrough(now, dt) {
    const v = this.viewers;
    for (const c of this.columns) {
      let hides = false;
      if (v?.camera && v.targets?.length) {
        const age = now - c.born,
          rs = Math.sqrt(c.s);
        const radius = 1.3 + 1.7 * rs,
          top = Math.min(4 + age * 3.2, 26 + 4 * c.s);
        const cam = v.camera;
        for (const car of v.targets) {
          if (!car) continue;
          // Far away from both: skip at once.
          if (Math.abs(car.x - c.x) > 40 || Math.abs(car.z - c.z) > 40) continue;
          // Sample the line of sight by height, from the car's roof up to
          // the top of the column (the camera itself is far above).
          const uTop = Math.min(1, (top - 0.8) / Math.max(1, cam.y - 0.8));
          for (let i = 1; i <= 10 && !hides; i++) {
            const u = (uTop * i) / 10;
            const px = car.x + (cam.x - car.x) * u,
              py = 0.8 + (cam.y - 0.8) * u,
              pz = car.z + (cam.z - car.z) * u;
            // Column axis at that height (breeze drift as it rises).
            const ax = c.x + py * 0.2,
              az = c.z + py * 0.1;
            const ring = age < 2.5 && py < 2.2 ? 7 * rs : 0;
            if (Math.hypot(px - ax, pz - az) < Math.max(radius, ring)) hides = true;
          }
          // The car right inside the base of the cloud.
          if (!hides && Math.hypot(car.x - c.x, car.z - c.z) < radius * 0.9) hides = true;
          if (hides) break;
        }
      }
      c.hides = hides;
      // Low per puff: several overlap along the line of sight.
      const target = hides ? SEE_THROUGH : 1;
      c.alpha += (target - c.alpha) * (1 - Math.exp(-6 * dt));
      if (Math.abs(c.alpha - target) < 0.01) c.alpha = target;
    }
  }
  stepSmoke(now, dt) {
    const pool = this.smoke,
      mesh = pool.mesh,
      fade = this.smokeFade.mesh;
    let n = 0,
      nf = 0;
    const keep = [];
    for (const p of pool.items) {
      const t = now - p.born;
      if (t > p.life) continue;
      keep.push(p);
      if (t < 0) continue;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vz *= k;
      p.vy = p.vy * Math.exp(-0.15 * dt) + p.lift * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const f = t / p.life;
      // Billow out, then shrink away at the top (no transparency needed).
      const size =
        (p.s0 + (p.s1 - p.s0) * Math.min(1, f * 1.8)) *
        (f > 0.75 ? 1 - (f - 0.75) / 0.25 : 1);
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rx + t * p.spin, p.ry + t * p.spin * 0.6, 0);
      dummy.scale.setScalar(Math.max(0.01, size));
      dummy.updateMatrix();
      tint.set(p.c0).lerp(tint2.set(p.c1), Math.min(1, f * 1.3));
      const alpha = p.col ? p.col.alpha : 1;
      if (alpha < 0.99) {
        // Part of a column hiding a car: drawn see-through.
        fade.setMatrixAt(nf, dummy.matrix);
        fade.setColorAt(nf, tint);
        this.fadeAlpha.array[nf] = alpha;
        nf++;
      } else {
        mesh.setMatrixAt(n, dummy.matrix);
        mesh.setColorAt(n, tint);
        n++;
      }
    }
    pool.items = keep;
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    fade.count = nf;
    if (nf) {
      fade.instanceMatrix.needsUpdate = true;
      fade.instanceColor.needsUpdate = true;
      this.fadeAlpha.needsUpdate = true;
    }
  }
  stepChunks(now, dt) {
    const pool = this.chunks,
      mesh = pool.mesh;
    let n = 0;
    const keep = [];
    for (const p of pool.items) {
      if (now < p.born) {
        keep.push(p);
        continue;
      }
      p.vy -= 18 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rx += p.wx * dt;
      p.ry += p.wy * dt;
      dummy.position.set(p.x, Math.max(0.2, p.y), p.z);
      dummy.rotation.set(p.rx, p.ry, p.rz);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      if (p.y <= 0.2 && p.vy < 0) {
        // Landed: it stays where it fell until restart.
        this.debris.add(p.material, this.matrix.copy(dummy.matrix));
        continue;
      }
      keep.push(p);
      mesh.setMatrixAt(n, dummy.matrix);
      mesh.setColorAt(n, tint.set(p.color));
      n++;
    }
    pool.items = keep;
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  stepRings(now) {
    for (const r of [...this.rings]) {
      const t = now - r.born;
      if (!r.mesh) {
        r.mesh = new THREE.Mesh(
          this.ringGeometry,
          new THREE.MeshBasicMaterial({
            color: 0xffd08a,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        r.mesh.rotation.x = -Math.PI / 2;
        r.mesh.position.set(r.x, 0.35, r.z);
        this.scene.add(r.mesh);
      }
      if (t > r.life) {
        this.scene.remove(r.mesh);
        r.mesh.material.dispose();
        this.rings.splice(this.rings.indexOf(r), 1);
        continue;
      }
      const f = t / r.life;
      r.mesh.scale.set(1 + r.radius * Math.sqrt(f), 1 + r.radius * Math.sqrt(f), 1 + 6 * f);
      r.mesh.material.opacity = 1 - f;
    }
  }
  reset() {
    for (const r of this.rings) {
      if (r.mesh) {
        this.scene.remove(r.mesh);
        r.mesh.material.dispose();
      }
    }
    this.rings = [];
    this.pending = [];
    this.columns = [];
    for (const pool of [this.fire, this.glow, this.smoke, this.smokeFade, this.chunks]) pool.clear();
    this.debris.reset();
    this.lastEvent = 0;
    this.lastTime = null;
  }
}
