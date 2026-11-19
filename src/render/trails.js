import * as THREE from "three";
import { clamp } from "../game/config.js";
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
  constructor(scene, capacity = SKID_CAPACITY) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, 0, -0.5); // strip runs from its origin along -z
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = -1;
    scene.add(this.mesh);
    this.capacity = capacity;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.c = new THREE.Color();
    this.light = new THREE.Color(0x2c2b30);
    this.dark = new THREE.Color(0x0b0b0d);
    this.reset();
  }
  reset() {
    this.next = 0;
    this.total = 0;
    this.last = [null, null];
    this.mesh.count = 0;
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
    const amount = running ? skidAmount(player) : 0;
    if (amount <= 0.05) {
      // The slide ended: the next one starts a new trail.
      this.last = [null, null];
      return;
    }
    const points = this.tires(player);
    let changed = false;
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
      changed = true;
    });
    if (changed) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
    }
  }
  add(from, dx, dz, d, amount) {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.total++;
    // Overlap a little so a curve has no gaps between strips.
    this.q.setFromAxisAngle(this.up, Math.atan2(-dx, -dz));
    this.m.compose(this.v.set(from.x, ROAD_Y, from.z), this.q, this.s.set(0.32, 1, d + 0.06));
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.setColorAt(i, this.c.copy(this.light).lerp(this.dark, 0.45 + 0.55 * amount));
    this.mesh.count = Math.min(this.total, this.capacity);
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
