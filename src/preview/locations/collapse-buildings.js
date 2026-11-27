// Cumulative building damage (map review pass). Every solid building:
//   stage 1   the first strong hit: the ground floor gives (its shopfront
//             smashes, storefronts.js; a building with no shop gets a
//             cracked ground floor: dust and chips)
//   stage 2   another strong hit on a building already damaged, hard
//             enough for that building, brings the whole thing down: it
//             shudders, the upper floors drop and lean the way it was hit
//             and it settles as a low slab on a heap of rubble, with a big
//             dust cloud, flying chunks and a camera shake. Cars beside it
//             (police, civilians, the target, the player) are hit by the
//             falling debris; parked cars and props around are thrown.
// How hard is hard enough: impact speed x the vehicle's weight x its
// destruction power, more for a taller building (a heavy truck brings a
// tower down where a small car only cracks it). The police follow the
// same rules (their cars ram buildings too).
//
// Mobile: no physics on buildings. The building's own mesh is copied and
// keyframed (scale and tilt about its base), a handful of rubble boxes,
// the shared chunk pool and dust puffs. Its footprint stays solid exactly
// as before, so no route opens or closes; the rubble stays for the run.
import * as THREE from "three";
import { hurt } from "../../game/durability.js";
import { chaosDestroyed } from "../../game/chaos.js";

export const COLLAPSE = Object.freeze({ crack: 8, base: 14, perMetre: 0.3, gap: 0.6 });
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const fallIn = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t);

export class BuildingCollapse {
  constructor(scene, layout, runtime) {
    this.scene = scene;
    this.rt = runtime;
    this.layout = layout;
    this.state = new Map(); // building index -> { damagedAt, collapsing, ... }
    this.prev = new Map(); // car -> its velocity a step ago
    this.active = [];
    this.stats = { cracked: 0, collapsed: 0 };
  }
  get world() {
    return this.rt.renderer?.world;
  }
  reset() {
    for (const a of this.active) {
      this.scene.remove(a.pivot);
      this.scene.remove(a.rubble);
      a.rubble.geometry.dispose();
      const e = this.world?.entries?.[a.i];
      if (e) {
        e.gone = false;
        const st = this.state.get(a.i);
        if (st?.fullTop) e.visualBounds.max.y = st.fullTop;
        this.world.batch?.setVisibleAt(e.batchId, true);
      }
    }
    this.active = [];
    this.rt.ads?.restoreFootprints?.();
    this.state.clear();
    this.prev.clear();
    this.stats = { cracked: 0, collapsed: 0 };
  }
  // A shopfront smashed (storefronts.js): that building's ground floor is
  // damaged.
  shopBroken(b) {
    const i = this.layout.buildings.indexOf(b);
    if (i < 0) return;
    const s = this.state.get(i) || {};
    if (s.damagedAt == null) s.damagedAt = this.rt.sim?.elapsed ?? 0;
    this.state.set(i, s);
  }
  // Each car each step. mass, env: its weight and destruction power.
  touch(sim, car, radius, mass, env) {
    const pv = this.prev.get(car);
    this.prev.set(car, { vx: car.vx || 0, vz: car.vz || 0 });
    if (!pv || car.level > 0) return;
    const entries = this.world?.entries;
    if (!entries) return;
    const L = this.layout.buildings;
    for (let i = 0; i < L.length; i++) {
      const b = L[i];
      if (b.destructible || !entries[i]?.batchId && entries[i]?.batchId !== 0) continue;
      const dx = car.x - b.x, dz = car.z - b.z;
      const ox = Math.abs(dx) - b.w / 2, oz = Math.abs(dz) - b.d / 2;
      if (ox > radius + 0.5 || oz > radius + 0.5) continue;
      // The face it is against, and the speed it had into that face.
      const nx = ox > oz ? Math.sign(dx) : 0, nz = ox > oz ? 0 : Math.sign(dz);
      const closing = -(pv.vx * nx + pv.vz * nz);
      if (closing < 4) continue;
      const power = closing * mass * env;
      const s = this.state.get(i) || {};
      if (s.collapsing) continue;
      if (s.lastHit != null && sim.elapsed - s.lastHit < COLLAPSE.gap) continue;
      if (power < COLLAPSE.crack) continue;
      s.lastHit = sim.elapsed;
      this.state.set(i, s);
      const need = COLLAPSE.base + COLLAPSE.perMetre * b.h;
      if (s.damagedAt != null && sim.elapsed - s.damagedAt > COLLAPSE.gap && power >= need) {
        this.collapse(sim, i, -nx, -nz, car);
      } else if (s.damagedAt == null) {
        // First strong hit: the ground floor gives (shops break on their
        // own; a plain wall cracks: dust and chips at the hit).
        s.damagedAt = sim.elapsed;
        this.stats.cracked++;
        const hx = b.x + nx * (b.w / 2), hz = b.z + nz * (b.d / 2);
        const wx = nx ? hx : car.x, wz = nz ? hz : car.z;
        this.rt.fx?.push({ kind: "dust", x: wx, z: wz, born: sim.elapsed, size: 0.8 });
        for (let k = 0; k < 6; k++) this.rt.throwChunk?.(1, wx, wz, 2 + Math.random() * 3, Math.atan2(nx, nz) + (Math.random() - 0.5) * 1.6);
        sim.city?.events.push({ id: ++sim.city.eventId, type: "prop", action: "break", x: wx, z: wz, strength: 12, sound: "crack" });
      }
    }
  }
  collapse(sim, i, fx, fz, car) {
    const b = this.layout.buildings[i];
    const e = this.world.entries[i];
    const s = this.state.get(i);
    s.collapsing = true;
    this.stats.collapsed++;
    sim.stats.buildingsCollapsed = (sim.stats.buildingsCollapsed || 0) + 1;
    const byPlayer = car === sim.player;
    if (sim.chaos) chaosDestroyed(sim, "building", `building:${i}`, b.x, b.z, 0, byPlayer);
    // The building leaves the batch; its own copy comes down.
    e.gone = true;
    this.world.batch.setVisibleAt(e.batchId, false);
    if (e.ghost) e.ghost.visible = false;
    // (Camera fading and spawn sight lines see the low heap from now on.)
    s.fullTop = e.visualBounds.max.y;
    e.visualBounds.max.y = 3;
    // It leans the way it was pushed (fx, fz: away from the car), pivoting
    // on its base edge on that side.
    const px = b.x + fx * (b.w / 2), pz = b.z + fz * (b.d / 2);
    const pivot = new THREE.Group();
    pivot.position.set(px, 0, pz);
    const mesh = new THREE.Mesh(e.geometry, this.world.buildingMaterial);
    mesh.position.set(-px, 0, -pz);
    mesh.castShadow = mesh.receiveShadow = true;
    pivot.add(mesh);
    this.scene.add(pivot);
    const rubble = this.rubbleFor(b, e.geometry, fx, fz);
    rubble.visible = false;
    this.scene.add(rubble);
    // What goes with it: lit windows, signs, the roof sculpture, awnings.
    this.rt.renderer?.night?.hideBuilding?.(i);
    const ads = this.rt.ads, rec = ads?.buildings?.get(b);
    if (rec) {
      for (const sg of rec.signs) ads.hideSign?.(sg);
      ads.tubeOff?.(rec);
      if (rec.sculpture?.state === "mounted") ads.detach?.(sim, rec.sculpture, fx, fz, 14);
    }
    // Neon outline, billboards and their frames, screens: gone with it.
    ads?.clearFootprint?.(b);
    const sf = this.rt.storefronts;
    if (sf) {
      const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      for (const f of sf.faces) if (f.b === b && f.index != null) sf.awnings.setMatrixAt(f.index, zero);
      sf.awnings.instanceMatrix.needsUpdate = true;
    }
    this.active.push({ i, b, pivot, mesh, rubble, fx, fz, t0: sim.elapsed, landed: false, byPlayer });
    sim.city?.events.push({ id: ++sim.city.eventId, type: "prop", action: "break", x: b.x, z: b.z, strength: 15, sound: "rumble", kick: 0.5 });
  }
  // A rubble heap over the footprint, in the building's own colours.
  rubbleFor(b, geo, fx, fz) {
    const col = geo.attributes.color, n = col.count;
    const pick = (k) => new THREE.Color(col.getX(k), col.getY(k), col.getZ(k));
    const parts = [];
    let seed = Math.abs(Math.round(b.x * 13 + b.z * 7));
    const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const count = 10 + Math.min(8, Math.floor((b.w * b.d) / 40));
    for (let k = 0; k < count; k++) {
      const w = 1.2 + R() * 2.6, h = 0.6 + R() * 1.6, d = 1.2 + R() * 2.6;
      const g = new THREE.BoxGeometry(w, h, d);
      g.rotateY(R() * Math.PI);
      g.rotateX((R() - 0.5) * 0.6);
      // Spread over the footprint, heaped toward the side it fell to.
      const x = b.x + (R() - 0.5) * (b.w - 1) + fx * R() * 1.5, z = b.z + (R() - 0.5) * (b.d - 1) + fz * R() * 1.5;
      g.translate(x, h / 2 - 0.1 + R() * 0.6, z);
      const c = pick(Math.floor(R() * n)).multiplyScalar(0.75 + R() * 0.25);
      const ng = g.toNonIndexed();
      g.dispose();
      const a = new Float32Array(ng.attributes.position.count * 3);
      for (let v = 0; v < ng.attributes.position.count; v++) a.set([c.r, c.g, c.b], v * 3);
      ng.setAttribute("color", new THREE.BufferAttribute(a, 3));
      ng.deleteAttribute("uv");
      parts.push(ng);
    }
    const merged = new THREE.BufferGeometry();
    const total = parts.reduce((s, p) => s + p.attributes.position.count, 0);
    const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), cl = new Float32Array(total * 3);
    let o = 0;
    for (const p of parts) {
      pos.set(p.attributes.position.array, o * 3);
      nor.set(p.attributes.normal.array, o * 3);
      cl.set(p.attributes.color.array, o * 3);
      o += p.attributes.position.count;
      p.dispose();
    }
    merged.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    merged.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    merged.setAttribute("color", new THREE.BufferAttribute(cl, 3));
    const m = new THREE.Mesh(merged, this.world.buildingMaterial);
    m.castShadow = m.receiveShadow = true;
    return m;
  }
  step(sim, now) {
    for (const a of this.active) {
      const t = now - a.t0;
      if (a.done) continue;
      const b = a.b;
      // 0-0.35 s: a shudder; then the upper floors come down (falling),
      // leaning over the pivot edge; settled by 1.7 s.
      const shake = t < 0.35 ? Math.sin(t * 70) * 0.012 : 0;
      const u = fallIn((t - 0.3) / 1.1);
      const lean = 0.2 * ease((t - 0.3) / 1.3);
      a.pivot.scale.y = 1 - 0.86 * u;
      // Rotate about the horizontal axis along the pivot edge: top toward
      // (fx, fz).
      a.pivot.rotation.set(a.fz * lean + shake, 0, -a.fx * lean - shake);
      if (t > 0.5 && !a.dusted) {
        a.dusted = true;
        this.rt.fx?.push({ kind: "dust", x: b.x, z: b.z, born: sim.elapsed, size: 1.6 });
      }
      if (!a.landed && t >= 1.15) {
        a.landed = true;
        a.rubble.visible = true;
        this.impact(sim, a);
      }
      if (t >= 1.8) {
        a.done = true;
        a.pivot.scale.y = 0.14;
      }
    }
  }
  // The debris lands around the footprint.
  impact(sim, a) {
    const b = a.b, reach = 3.2;
    const near = (c) => Math.abs(c.x - b.x) < b.w / 2 + reach && Math.abs(c.z - b.z) < b.d / 2 + reach && !(c.level > 0);
    const shove = (c, k) => {
      const dx = c.x - b.x, dz = c.z - b.z, d = Math.hypot(dx, dz) || 1;
      c.vx = (c.vx || 0) + (dx / d) * k;
      c.vz = (c.vz || 0) + (dz / d) * k;
    };
    for (const c of sim.police) if (c.state === "active" && near(c)) {
      c.health -= 65;
      c.lastDamageCause = "building";
      shove(c, 5);
    }
    for (const c of sim.city?.traffic || []) if (c.state !== "wreck" && near(c)) c.health = (c.health ?? 100) - 75;
    if (sim.target?.state === "fleeing" && near(sim.target)) sim.target.health = Math.max(1, sim.target.health - 35);
    if (near(sim.player)) {
      hurt(sim, "heavy", 6, `building:${a.i}`);
      shove(sim.player, 6);
    }
    const rt = this.rt;
    rt.blast?.(sim, { x: b.x, z: b.z, id: -1, cause: "building" }, Math.max(b.w, b.d) / 2 + 5, 1, (s, run) => rt.pending?.push({ at: sim.elapsed + s, run }), 1);
    for (const [ox, oz] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) rt.fx?.push({ kind: "dust", x: b.x + ox * b.w * 0.45, z: b.z + oz * b.d * 0.45, born: sim.elapsed, size: 1.5 });
    for (let k = 0; k < 14; k++) {
      const ang = Math.random() * Math.PI * 2;
      rt.throwChunk?.(1, b.x + Math.sin(ang) * b.w * 0.4, b.z + Math.cos(ang) * b.d * 0.4, 4 + Math.random() * 5, ang);
    }
    sim.city?.events.push({ id: ++sim.city.eventId, type: "prop", action: "break", x: b.x, z: b.z, strength: 15, sound: "rumble", kick: 1.0 });
  }
}
