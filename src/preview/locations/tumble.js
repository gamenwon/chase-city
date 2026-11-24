// Big loose pieces (casual pass): giant sculptures knocked off roofs, a
// Ferris wheel rolling down the street, a dinosaur's head, a robot's arm.
// Lightweight rigid bodies, only while they move: thrown -> fall (gravity,
// tumbling) -> bounce -> roll (round ones, a long way) or slide -> rest.
// While moving they bounce off building walls and hit what they meet:
// cars (damage by speed and mass; civilian cars may catch fire), loose
// props, shop windows. At rest they are never solid: a car that touches
// one shoves it on, so nothing ever blocks a road for good.
//
// piece: { mesh, def: { r, lift, mass, rolls, wheel }, pos, vel, q, w,
//          state: "mounted" | "fall" | "roll" | "slide" | "rest" }
import * as THREE from "three";
import { damageCar } from "../../game/city.js";

const UP = new THREE.Vector3(0, 1, 0);

export class Tumblers {
  constructor(runtime, storefronts) {
    this.runtime = runtime;
    this.storefronts = storefronts;
    this.pieces = [];
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.q2 = new THREE.Quaternion();
    this.stats = { hits: 0, landed: 0 };
  }
  add(piece) {
    Object.assign(piece, { hitAt: {}, lastBonk: -9 });
    piece.pos ||= new THREE.Vector3();
    piece.vel ||= new THREE.Vector3();
    piece.q ||= new THREE.Quaternion();
    piece.w ||= new THREE.Vector3();
    this.pieces.push(piece);
    return piece;
  }
  reset() {
    this.stats = { hits: 0, landed: 0 };
    for (const p of this.pieces) Object.assign(p, { hitAt: {}, lastBonk: -9, roll: 0 });
  }
  // Throw a piece (from mounted or resting): velocity, tumble.
  launch(p, vx, vy, vz, spin = 3) {
    p.state = "fall";
    p.vel.set(vx, vy, vz);
    p.w.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.6, Math.random() - 0.5).normalize().multiplyScalar(spin * (0.6 + Math.random() * 0.8));
    if (p.def.wheel) {
      const h = Math.hypot(vx, vz) || 1;
      p.w.set(vz / h, 0, -vx / h).multiplyScalar(-spin);
    }
  }
  step(sim, dt) {
    const now = sim.elapsed;
    let cars = null;
    for (const pc of this.pieces) {
      if (pc.state === "mounted" || pc.state === "fixed") continue;
      cars ||= [sim.player, ...sim.police.filter((c) => c.state === "active")];
      const def = pc.def, p = pc.pos, v = pc.vel;
      if (pc.state === "rest") {
        for (const car of cars) {
          if ((car.level || 0) !== 0) continue;
          const dx = p.x - car.x, dz = p.z - car.z, d = Math.hypot(dx, dz);
          const sp = Math.hypot(car.vx || 0, car.vz || 0);
          if (d < def.r + 1.3 && sp > 2) {
            // Shoved on (a heavy one only a little).
            const k = 1 / Math.max(1, Math.sqrt(def.mass));
            pc.state = "fall";
            v.set(((car.vx || 0) * 0.9 + (dx / (d || 1)) * 2) * k, 2.5 * k, ((car.vz || 0) * 0.9 + (dz / (d || 1)) * 2) * k);
            sim.city?.events.push({ id: ++sim.city.eventId, type: "prop", action: "break", x: p.x, z: p.z, strength: 9, sound: "bonk" });
          }
        }
        continue;
      }
      if (pc.state === "fall") v.y -= 18 * dt;
      p.addScaledVector(v, dt);
      const floor = (pc.floor ?? 0.05) + def.lift;
      if (pc.state === "fall" && p.y <= floor) {
        p.y = floor;
        const hit = -v.y;
        if (now - pc.lastBonk > 0.25) {
          pc.lastBonk = now;
          this.stats.landed++;
          sim.city?.events.push({ id: ++sim.city.eventId, type: "sculpture", action: "land", x: p.x, z: p.z, strength: Math.min(15, 6 + hit), sound: def.mass > 3 ? "rumble" : "bonk", kick: Math.min(0.5, (hit / 45) * Math.sqrt(def.mass)) });
          this.runtime?.fx.push({ kind: "dust", x: p.x, z: p.z, born: now, size: 0.6 + Math.min(0.9, (hit / 20) * Math.sqrt(def.mass)) });
          if (hit > 6) sim.cameraKick = Math.max(sim.cameraKick || 0, Math.min(0.35, (hit / 40) * Math.sqrt(def.mass)));
          this.hitCars(sim, pc, cars, Math.max(hit, v.length()), true);
        }
        if (hit > 3.5) {
          v.y = hit * 0.32;
          v.x *= 0.75;
          v.z *= 0.75;
          pc.w.multiplyScalar(0.6);
        } else {
          v.y = 0;
          pc.state = def.rolls ? "roll" : "slide";
          if (def.rolls) {
            v.x *= 1.15;
            v.z *= 1.15;
          }
        }
      }
      const hs = Math.hypot(v.x, v.z);
      if (pc.state === "roll" || pc.state === "slide") {
        const f = Math.exp(-dt * (pc.state === "roll" ? (def.wheel ? 0.18 : 0.3) : 2.4));
        v.x *= f;
        v.z *= f;
        p.y = floor;
      }
      if (pc.state === "fall") {
        this.q2.setFromAxisAngle(this.v.copy(pc.w).normalize(), pc.w.length() * dt);
        pc.q.premultiply(this.q2);
      } else if (pc.state === "roll" && hs > 0.05) {
        if (def.wheel) {
          // Upright like a wheel: its axle across the motion.
          const yaw = Math.atan2(v.x, v.z) + Math.PI / 2;
          pc.roll = (pc.roll || 0) + (hs / def.r) * dt;
          this.q.setFromAxisAngle(UP, yaw);
          this.q2.setFromAxisAngle(this.s.set(0, 0, 1), -pc.roll);
          pc.q.copy(this.q).multiply(this.q2);
          if (pc.axleX) pc.q.multiply(this.q2.setFromAxisAngle(this.s.set(0, 1, 0), Math.PI / 2));
        } else {
          this.q2.setFromAxisAngle(this.v.set(v.z / hs, 0, -v.x / hs), (hs / Math.max(0.6, def.lift)) * dt);
          pc.q.premultiply(this.q2);
        }
      }
      if (hs > 0.8) {
        for (const box of sim.nearSolids(p.x, p.z, def.r + 1)) {
          if (box.w > 60 || box.d > 60 || pc.ignore?.has(box)) continue;
          const px = box.w / 2 + def.r * 0.8 - Math.abs(p.x - box.x), pz = box.d / 2 + def.r * 0.8 - Math.abs(p.z - box.z);
          if (px <= 0 || pz <= 0) continue;
          if (px < pz) {
            p.x += Math.sign(p.x - box.x || 1) * px;
            v.x = -v.x * 0.4;
          } else {
            p.z += Math.sign(p.z - box.z || 1) * pz;
            v.z = -v.z * 0.4;
          }
          // A big one hitting a pillar wears it down (overpass.js).
          if (box.kind === "pillar" && hs * def.mass > 10) this.runtime?.hitPillar?.(sim, box, hs, def.mass);
        }
        this.hitCars(sim, pc, cars, hs, false);
        const fake = { x: p.x, z: p.z, vx: v.x, vz: v.z, speed: hs };
        this.runtime?.touchItems?.(fake, def.r, hs);
        this.runtime?.flyers?.touch(sim, fake, def.r, hs);
        if (hs > 6) this.storefronts?.touch(sim, fake, def.r);
        pc.onMove?.(sim, pc, fake);
      }
      if (pc.state !== "fall" && hs < 0.3) {
        pc.state = "rest";
        v.set(0, 0, 0);
        pc.onRest?.(pc);
      }
      if (Math.max(Math.abs(p.x), Math.abs(p.z)) > 106) {
        p.x = Math.max(-106, Math.min(106, p.x));
        p.z = Math.max(-106, Math.min(106, p.z));
        v.set(0, 0, 0);
        pc.state = "rest";
        pc.onRest?.(pc);
      }
    }
  }
  hitCars(sim, pc, cars, speed, landing) {
    const p = pc.pos, def = pc.def, now = sim.elapsed;
    const all = [...cars, ...(sim.city?.traffic || [])];
    if (sim.target?.state === "fleeing") all.push(sim.target);
    for (const car of all) {
      if ((car.level || 0) !== 0) continue;
      const dx = car.x - p.x, dz = car.z - p.z, d = Math.hypot(dx, dz);
      if (d > def.r + 1.1) continue;
      const key = car === sim.player ? "p" : car.id ?? car;
      if (now - (pc.hitAt[key] ?? -9) < 0.6) continue;
      pc.hitAt[key] = now;
      const k = Math.min(1.6, speed / 10) * Math.min(4, def.mass) * (landing ? 1.4 : 1);
      const ux = dx / (d || 1), uz = dz / (d || 1);
      if (car === sim.player) {
        sim.damage?.(Math.min(18, 6 * k));
        car.vx += ux * 4 * Math.min(2, k);
        car.vz += uz * 4 * Math.min(2, k);
      } else if (sim.police.includes(car)) {
        car.health -= 38 * k;
        car.vx += ux * 6 * k;
        car.vz += uz * 6 * k;
        if (car.health <= 0) car.lastDamageCause = "sculpture";
      } else if (sim.city?.traffic.includes(car)) {
        damageCar(sim, car, 14 * k);
        car.vx = (car.vx || 0) + ux * 5 * k;
        car.vz = (car.vz || 0) + uz * 5 * k;
        // A hard hit flips it over (casual pass: the car pops up and rolls).
        if (k > 1.2) car.flip = { at: now, dir: Math.atan2(ux, uz), h: Math.min(2.2, 0.6 + k * 0.6) };
      } else if (car === sim.target) car.health = Math.max(1, car.health - 25 * k);
      this.stats.hits++;
      pc.vel.x *= def.mass > 3 ? 0.85 : 0.6;
      pc.vel.z *= def.mass > 3 ? 0.85 : 0.6;
      sim.city?.events.push({ id: ++sim.city.eventId, type: "sculpture", action: "hit", x: car.x, z: car.z, strength: Math.min(15, 6 + speed), sound: "bonk" });
    }
  }
}
