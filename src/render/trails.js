import * as THREE from "three";
import { clamp } from "../game/config.js";
import { groundHeight } from "../game/jumps.js";
export function trailIntensity(player) {
  const speed = Math.hypot(player.vx, player.vz);
  return {
    speed,
    turn: clamp(
      Math.abs(player.turn) / 1.75 + (player.slip || 0) * 0.12,
      0,
      1.7,
    ),
    active: speed > 4,
  };
}
// How hard the car is sliding in a turn (0 = not at all): the same rule as
// the tire screech (a held hard turn at speed; a tap or a slow turn is 0).
export function skidAmount(player) {
  const speed = Math.hypot(player.vx, player.vz);
  const lateral = Math.abs(player.vx * Math.cos(player.angle) - player.vz * Math.sin(player.angle));
  const turnLoad = (Math.abs(player.turn || 0) * speed) / 24 + lateral * 0.2;
  return clamp((turnLoad - 1.05) / 0.75, 0, 1) * clamp((speed - 9) / 7, 0, 1);
}

// Persistent tire marks: dark strips on the road from both rear tires while
// the car slides through a hard turn, joined point to point so they curve
// with the slide. One instanced mesh with a fixed budget (a ring buffer):
// when it is full the oldest strip (from early in the run, normally far
// away) is reused, so nothing recent ever vanishes. Opaque, just above the
// asphalt with a polygon offset (no z-fighting), never sorted.
export const SKID_CAPACITY = 6000;
const ROAD_Y = 0.135; // road top 0.11, lane paint just above it
const REAR = 1.15,
  TRACK = 0.72,
  STEP = 0.32; // a new strip every 32 cm of travel
export class SkidMarks {
  // The budget is split into chunks of consecutive strips (a stretch of
  // trail each) with their own bounds, so stretches off screen are culled
  // and cost nothing; at most CHUNKS draw calls.
  constructor(scene, capacity = SKID_CAPACITY, chunks = 8) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, -0.5); // strip runs from its origin along -z
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.per = Math.ceil(capacity / chunks);
    this.capacity = this.per * chunks;
    this.chunks = Array.from({ length: chunks }, () => {
      const mesh = new THREE.InstancedMesh(geometry, material, this.per);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.per * 3), 3);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.renderOrder = -1;
      mesh.boundingSphere = new THREE.Sphere();
      scene.add(mesh);
      return { mesh, box: new THREE.Box3(), dirty: false };
    });
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.xAxis = new THREE.Vector3(1, 0, 0);
    this.tilt = new THREE.Quaternion();
    this.c = new THREE.Color();
    this.light = new THREE.Color(0x2c2b30);
    this.dark = new THREE.Color(0x0b0b0d);
    // Snow (weather.js): every metre driven leaves tracks, grey ruts in
    // the white.
    this.snow = false;
    this.snowLight = new THREE.Color(0xb6c0ca);
    this.snowDark = new THREE.Color(0x7d8894);
    this.reset();
  }
  // Strips drawn (all chunks).
  get count() {
    return this.chunks.reduce((n, c) => n + c.mesh.count, 0);
  }
  reset() {
    this.next = 0;
    this.total = 0;
    this.last = [null, null];
    for (const c of this.chunks) {
      c.mesh.count = 0;
      c.mesh.visible = false;
      c.box.makeEmpty();
    }
  }
  // Rear tire contact points (left, right) of the car now.
  tires(p) {
    const fx = -Math.sin(p.angle), fz = -Math.cos(p.angle);
    const rx = Math.cos(p.angle), rz = -Math.sin(p.angle);
    return [-1, 1].map((side) => ({
      x: p.x - fx * REAR + rx * side * TRACK,
      z: p.z - fz * REAR + rz * side * TRACK,
    }));
  }
  update(player, running) {
    let amount = running ? skidAmount(player) : 0;
    if (this.snow && running && Math.hypot(player.vx, player.vz) > 2.5 && !player.air) amount = Math.max(amount, 0.3);
    if (amount <= 0.05) {
      // The slide ended: the next one starts a new trail.
      this.last = [null, null];
      return;
    }
    const points = this.tires(player);
    points.forEach((pt, i) => {
      const prev = this.last[i];
      if (!prev) {
        this.last[i] = pt;
        return;
      }
      const dx = pt.x - prev.x, dz = pt.z - prev.z, d = Math.hypot(dx, dz);
      if (d < STEP) return;
      if (d > 3) {
        // A jump (respawn, teleport): do not draw across it.
        this.last[i] = pt;
        return;
      }
      this.add(prev, dx, dz, d, amount);
      this.last[i] = pt;
    });
    this.flush();
  }
  add(from, dx, dz, d, amount) {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.total++;
    const chunk = this.chunks[Math.floor(i / this.per)], j = i % this.per;
    // Reusing a chunk from its start: its old stretch is replaced.
    if (j === 0 && this.total > this.capacity) chunk.box.makeEmpty();
    // Overlap a little so a curve has no gaps between strips.
    this.q.setFromAxisAngle(this.up, Math.atan2(-dx, -dz));
    // (On a hill street: on its surface, tilted with it.)
    let y = ROAD_Y;
    if (this.hills?.length) {
      const h0 = groundHeight(this.hills, from.x, from.z), h1 = groundHeight(this.hills, from.x + dx, from.z + dz);
      if (h0 > 0 || h1 > 0) {
        y += h0 + 0.02;
        this.q.multiply(this.tilt.setFromAxisAngle(this.xAxis, Math.atan2(h1 - h0, d)));
      }
    }
    this.m.compose(this.v.set(from.x, y, from.z), this.q, this.s.set(0.32, 1, d + 0.06));
    chunk.mesh.setMatrixAt(j, this.m);
    chunk.mesh.setColorAt(j, this.snow ? this.c.copy(this.snowLight).lerp(this.snowDark, amount) : this.c.copy(this.light).lerp(this.dark, 0.45 + 0.55 * amount));
    chunk.mesh.count = Math.max(chunk.mesh.count, j + 1);
    chunk.box.expandByPoint(this.v);
    chunk.dirty = true;
  }
  flush() {
    for (const c of this.chunks) {
      if (!c.dirty) continue;
      c.dirty = false;
      c.mesh.instanceMatrix.needsUpdate = true;
      c.mesh.instanceColor.needsUpdate = true;
      c.box.getBoundingSphere(c.mesh.boundingSphere);
      c.mesh.boundingSphere.radius += 1.5;
      c.mesh.visible = c.mesh.count > 0;
    }
  }
}

// Fixed pools: no geometry/material allocations while driving or on restart.
export class VehicleTrails {
  constructor(scene) {
    this.dustGeometry = new THREE.IcosahedronGeometry(0.22, 0);
    this.dust = Array.from({ length: 48 }, () => {
      const mesh = new THREE.Mesh(
        this.dustGeometry,
        new THREE.MeshBasicMaterial({
          color: 0xffca3a,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      mesh.visible = false;
      scene.add(mesh);
      return { mesh, age: 99, life: 1, vx: 0, vz: 0 };
    });
    // Tire marks: persistent, see SkidMarks.
    this.skids = new SkidMarks(scene);
    this.reset();
  }
  reset() {
    this.clock = 0;
    this.dustIndex = 0;
    this.emission = 0;
    for (const p of this.dust) {
      p.age = 99;
      p.mesh.visible = false;
    }
    this.skids?.reset();
  }
  update(player, dt, running) {
    if (dt <= 0) return;
    const state = trailIntensity(player);
    this.clock += dt;
    for (const p of this.dust) {
      p.age += dt;
      if (p.age >= p.life) {
        p.mesh.visible = false;
        continue;
      }
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.position.y += dt * 0.45;
      p.mesh.scale.setScalar(1 + p.age * 2);
      p.mesh.material.opacity = (1 - p.age / p.life) * 0.55;
    }
    this.skids.update(player, running);
    if (!running || !state.active) return;
    this.emission += dt;
    const interval = state.turn > 0.7 ? 0.035 : 0.075;
    if (this.emission >= interval) {
      this.emission = 0;
      const p = this.dust[this.dustIndex++ % this.dust.length];
      const side = this.dustIndex % 2 ? 1 : -1;
      p.age = 0;
      p.life = 0.2 + state.speed / 120 + state.turn * 0.12;
      p.mesh.position.set(
        player.x +
          Math.sin(player.angle) * 1.8 +
          Math.cos(player.angle) * side * 0.65,
        0.28,
        player.z +
          Math.cos(player.angle) * 1.8 -
          Math.sin(player.angle) * side * 0.65,
      );
      p.vx =
        Math.sin(player.angle) * (1 + state.speed * 0.09) +
        Math.cos(player.angle) * side * state.turn;
      p.vz =
        Math.cos(player.angle) * (1 + state.speed * 0.09) -
        Math.sin(player.angle) * side * state.turn;
      p.mesh.visible = true;
      p.mesh.material.opacity = 0.55;
    }
  }
}
