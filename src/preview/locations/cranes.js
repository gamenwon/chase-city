// The two big yellow cranes come down (map review pass):
//   gantry   the container yard's gantry crane: hit a leg hard (or twice,
//            or catch it in a blast) and the legs buckle, the top frame
//            with its trolley crashes down tilted toward the broken side
//            and the spreader drops to the ground
//   tower    the construction site's tower crane: its mast buckles half
//            way up and the top (cab, jib, counter-jib) topples into the
//            site, the lower mast crumpling under it
// Scripted keyframes (no physics), dust, flying chunks and a camera kick
// at the impact; whatever is under the falling steel is hit (police and
// civilian cars wrecked or damaged, the player hurt and shoved, parked
// cars, containers and loose props thrown as by a small blast). The
// wreckage stays until the next run.
//
// Never a trap: nothing new becomes solid. The gantry's frame comes to
// rest above the yard's lanes (its low end over the fence line) and the
// tower crane lies inside the site; only the old feet / mast stump stay
// solid. The same rules for the player and the police (vehicle
// destruction power and impact speed decide).
import * as THREE from "three";
import { hurt } from "../../game/durability.js";
import { B, G, cyl, bake, pieceMesh } from "./parts.js";

const YEL = 0xf5c01a, YEL2 = 0xe8a516, DARK = 0x3a3940, STEEL = 0x8a8d93;
const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
// Falling under gravity, a small bounce at the end.
const drop = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.82 ? (t / 0.82) ** 2 : 1 - Math.sin(((t - 0.82) / 0.18) * Math.PI) * 0.06);

export class Cranes {
  constructor(scene, layout, runtime) {
    this.runtime = runtime;
    this.list = [];
    for (const f of layout.features || []) {
      if (f.kind === "containers" && f.crane) this.list.push(this.buildGantry(scene, f));
      if (f.kind === "bigsite" && f.tower) this.list.push(this.buildTower(scene, f));
    }
    this.stats = { collapsed: 0, shaken: 0 };
  }
  // ---------------------------------------------------------- gantry --
  buildGantry(scene, f) {
    const c = f.crane, S = f.block.S, H = c.h;
    const root = G(scene, c.x, 0, c.z, c.ry);
    const legs = [];
    for (const su of [-1, 1])
      for (const sv of [-1, 1]) {
        const m = pieceMesh((g) => {
          B(g, 0.7, H, 0.7, YEL, 0, 0, 0);
          B(g, 1.1, 0.4, 1.1, DARK, 0, 0, 0);
          for (let k = 1; k < 5; k++) B(g, 0.76, 0.1, 0.76, YEL2, 0, (k * H) / 5, 0);
        });
        m.position.set(su * c.footU, 0, sv * c.footV);
        root.add(m);
        legs.push({ m, su, sv });
      }
    // Top frame: rails, cross beams, braces, trolley and cab (one piece).
    const fg = new THREE.Group();
    for (const su of [-1, 1]) {
      B(fg, 0.9, 1.0, S - 0.4, YEL, su * c.footU, 0, 0);
      for (let k = 0; k < 6; k++) {
        const d = B(fg, 0.12, 2.0, 0.12, 0xc89a10, su * c.footU, -2, -S / 2 + 1 + (k * (S - 2)) / 5);
        d.rotation.x = (k % 2 ? 1 : -1) * 0.6;
      }
    }
    for (const sv of [-1, 1]) B(fg, c.footU * 2 + 0.9, 0.8, 0.9, YEL, 0, 0.1, sv * (S / 2 - 1.2));
    B(fg, c.footU * 2 + 0.4, 0.6, 2.2, 0xe8e4da, 0, 0.9, 1.0);
    B(fg, 1.6, 1.4, 1.6, 0x2457c5, 1.6, -0.6, 1.0);
    const frame = bake(fg);
    const holder = new THREE.Group();
    holder.add(frame);
    holder.position.y = H;
    root.add(holder);
    // Spreader on its cables (falls on its own).
    const sp = new THREE.Group();
    for (const s of [-0.6, 0.6]) B(sp, 0.05, 4.5, 0.05, DARK, s, 0.3, 0);
    B(sp, 5.6, 0.3, 2.2, 0xf0781e, 0, 0, 0);
    const spreader = bake(sp);
    const sh = new THREE.Group();
    sh.add(spreader);
    sh.position.set(0, H - 4.7, 1.0);
    root.add(sh);
    return { kind: "gantry", f, c, S, H, root, legs, frame: holder, spreader: sh, feet: f.solids.filter((s) => s.kind === "craneFoot"), state: "up", damage: 0 };
  }
  // ----------------------------------------------------------- tower --
  buildTower(scene, f) {
    const t = f.tower;
    const root = G(scene, t.x, 0.05, t.z, 0);
    // Lower mast (crumples), upper mast with the cab and jibs (topples).
    const lower = new THREE.Group();
    B(lower, 1.4, 0.4, 1.4, STEEL, 0, 0, 0);
    for (let k = 0; k < 2; k++) B(lower, 0.9, 2.4, 0.9, k % 2 ? YEL : YEL2, 0, 0.4 + k * 2.4, 0);
    const low = bake(lower);
    root.add(low);
    const pivotY = 0.4 + 2 * 2.4;
    // The fall: toward the middle of the site, the jib across the fall.
    const fall = Math.atan2(f.block.cx - t.x, f.block.cz - t.z);
    const pivot = new THREE.Group();
    pivot.position.y = pivotY;
    pivot.rotation.y = fall;
    root.add(pivot);
    const up = new THREE.Group();
    for (let k = 2; k < 7; k++) B(up, 0.9, 2.4, 0.9, k % 2 ? YEL : YEL2, 0, 0.4 + k * 2.4 - pivotY, 0);
    // (The jib lies across the fall line: it ends up flat, sideways.)
    const jib = G(up, 0, 0, 0, 0);
    B(jib, 14, 0.7, 0.7, YEL, 3.5, 17.2 - pivotY, 0);
    B(jib, 2, 1.6, 1.2, 0x55535c, -3, 16.6 - pivotY, 0);
    cyl(jib, 0.04, 0.04, 8, 0x232227, 9, 9.2 - pivotY, 0, 4);
    B(jib, 1.6, 0.6, 1.0, STEEL, 9, 8.6 - pivotY, 0);
    const upper = bake(up);
    pivot.add(upper);
    return { kind: "tower", f, t, root, lower: low, pivot, jib: null, pivotY, fall, feet: f.solids.filter((s) => s.kind === "craneMast"), state: "up", damage: 0 };
  }
  reset() {
    for (const a of this.list) {
      a.state = "up";
      a.damage = 0;
      a.anim = null;
      a.wobble = null;
      a.landed = false;
      if (a.kind === "gantry") {
        for (const l of a.legs) {
          l.m.scale.set(1, 1, 1);
          l.m.rotation.set(0, 0, 0);
        }
        a.frame.position.set(0, a.H, 0);
        a.frame.rotation.set(0, 0, 0);
        a.spreader.position.set(0, a.H - 4.7, 1.0);
        a.spreader.rotation.set(0, 0, 0);
      } else {
        a.lower.scale.set(1, 1, 1);
        a.pivot.position.y = a.pivotY;
        a.pivot.rotation.set(0, a.fall, 0);
      }
    }
    this.stats = { collapsed: 0, shaken: 0 };
  }
  // A car against a foot / the mast. env: its destruction power.
  touch(sim, car, radius, env = 1) {
    for (const a of this.list) {
      if (a.state !== "up") continue;
      for (const s of a.feet) {
        const dx = s.x - car.x, dz = s.z - car.z, d = Math.hypot(dx, dz);
        if (d > radius + s.w / 2 + 0.6 || d < 1e-6) continue;
        const closing = (((car.vx || 0) * dx + (car.vz || 0) * dz) / d) * env;
        if (closing < 2.5) continue;
        if (a.lastHit && sim.elapsed - a.lastHit < 0.5) continue;
        a.lastHit = sim.elapsed;
        // A hard hit brings it down at once; lighter ones add up.
        a.damage += closing / 9;
        if (a.damage >= 1) this.collapse(sim, a, s, car);
        else {
          a.wobble = { at: sim.elapsed, amp: Math.min(0.05, closing * 0.008) };
          this.stats.shaken++;
          sim.city?.events.push({ id: ++sim.city.eventId, type: "prop", action: "hit", x: s.x, z: s.z, strength: 8, sound: "clang" });
        }
        break;
      }
    }
  }
  // A blast close to a foot brings the crane down too.
  blast(sim, e, R, s) {
    for (const a of this.list) {
      if (a.state !== "up") continue;
      const foot = a.feet.find((q) => Math.hypot(q.x - e.x, q.z - e.z) < R * 0.55);
      if (foot && s >= 0.8) this.collapse(sim, a, foot, { x: e.x, z: e.z, vx: foot.x - e.x, vz: foot.z - e.z }, sim.player);
    }
  }
  collapse(sim, a, foot, car) {
    a.state = "falling";
    a.landed = false;
    this.stats.collapsed++;
    sim.stats.cranesDown = (sim.stats.cranesDown || 0) + 1;
    const byPlayer = car === sim.player;
    if (a.kind === "gantry") {
      // Which side gave way (local frame of the crane).
      const c = Math.cos(a.c.ry), sn = Math.sin(a.c.ry);
      const lx = (foot.x - a.c.x) * c - (foot.z - a.c.z) * sn, lz = (foot.x - a.c.x) * sn + (foot.z - a.c.z) * c;
      a.side = Math.sign(lx) || 1;
      a.end = Math.sign(lz) || 1;
    }
    a.anim = { t0: sim.elapsed };
    sim.city?.events.push({ id: ++sim.city.eventId, type: "prop", action: "break", x: foot.x, z: foot.z, strength: 14, sound: "crack", byPlayer });
  }
  step(sim, now) {
    for (const a of this.list) {
      if (a.wobble && a.state === "up") {
        const t = now - a.wobble.at, k = t < 1.4 ? a.wobble.amp * Math.sin(t * 12) * Math.exp(-t * 3) : 0;
        if (a.kind === "gantry") a.frame.rotation.z = k;
        else a.pivot.rotation.x = k;
        if (t >= 1.4) a.wobble = null;
      }
      if (!a.anim) continue;
      const t = now - a.anim.t0;
      if (a.kind === "gantry") this.stepGantry(sim, a, t);
      else this.stepTower(sim, a, t);
    }
  }
  stepGantry(sim, a, t) {
    // 0-0.3 s: the broken side shudders and starts to give; then the
    // frame falls (gravity) onto its buckled legs, tilted to that side.
    const shake = t < 0.3 ? Math.sin(t * 60) * 0.03 : 0;
    const u = drop((t - 0.25) / 0.85);
    const lowEnd = 1.1, highEnd = 3.6, yTo = (lowEnd + highEnd) / 2 - 0.4;
    const tilt = Math.atan2(highEnd - lowEnd, a.c.footU * 2);
    a.frame.position.y = a.H + (yTo - a.H) * u;
    a.frame.rotation.set(0.05 * a.end * u, 0, -a.side * tilt * u + shake);
    a.frame.position.x = a.side * 0.6 * u;
    for (const l of a.legs) {
      const broken = l.su === a.side;
      const target = (broken ? lowEnd : highEnd) / a.H;
      l.m.scale.y = 1 + (target - 1) * u;
      l.m.rotation.z = (broken ? -l.su * 0.55 : l.su * 0.2) * u;
      l.m.rotation.x = (broken ? l.sv * 0.25 : 0) * u;
    }
    // The spreader drops straight down a little later.
    const us = drop((t - 0.4) / 0.6);
    a.spreader.position.y = a.H - 4.7 + (0.2 - (a.H - 4.7)) * us;
    a.spreader.rotation.z = 0.3 * a.side * us;
    if (!a.landed && t >= 0.25 + 0.85 * 0.82) {
      a.landed = true;
      const c = Math.cos(a.c.ry), s = Math.sin(a.c.ry);
      const W = (lx, lz) => ({ x: a.c.x + lx * c + lz * s, z: a.c.z - lx * s + lz * c });
      // The whole footprint takes the blow; the impact is on the low side.
      const inFoot = (car) => {
        const dx = car.x - a.c.x, dz = car.z - a.c.z;
        const lx = dx * c - dz * s, lz = dx * s + dz * c;
        return Math.abs(lx) < a.c.footU + 1.2 && Math.abs(lz) < a.S / 2 && !(car.level > 0);
      };
      this.impact(sim, inFoot, [W(a.side * a.c.footU, 0), W(a.side * a.c.footU, a.S / 3), W(a.side * a.c.footU, -a.S / 3), W(0, 1.0)], 9);
    }
    if (t > 1.4) {
      a.anim = null;
      a.state = "down";
    }
  }
  stepTower(sim, a, t) {
    // The mast buckles (lower part crumples), the top goes over: slow at
    // first, then faster, and lands flat with the jib across.
    const u = drop((t - 0.2) / 1.25);
    a.lower.scale.y = 1 - 0.45 * ease((t - 0.2) / 1.0);
    a.pivot.position.y = a.pivotY * a.lower.scale.y;
    const ang = 1.68 * u;
    a.pivot.rotation.set(0, a.fall, 0);
    a.pivot.rotateX(ang);
    // (A slight twist as it goes.)
    a.pivot.rotateY(0.15 * u);
    if (!a.landed && t >= 0.2 + 1.25 * 0.82) {
      a.landed = true;
      const fx = Math.sin(a.fall), fz = Math.cos(a.fall);
      const along = (k) => ({ x: a.t.x + fx * k, z: a.t.z + fz * k });
      const segDist = (car) => {
        const dx = car.x - a.t.x, dz = car.z - a.t.z, k = Math.max(0, Math.min(12.5, dx * fx + dz * fz));
        return Math.hypot(dx - fx * k, dz - fz * k);
      };
      // The top (cab, jib) lies across the fall line at its end.
      const jx = Math.cos(a.fall), jz = -Math.sin(a.fall);
      const top = along(12);
      const jibDist = (car) => {
        const dx = car.x - top.x, dz = car.z - top.z, k = Math.max(-3, Math.min(10.5, dx * jx + dz * jz));
        return Math.hypot(dx - jx * k, dz - jz * k);
      };
      const under = (car) => !(car.level > 0) && (segDist(car) < 1.8 || jibDist(car) < 1.6);
      this.impact(sim, under, [along(5), along(9), top, { x: top.x + jx * 6, z: top.z + jz * 6 }], 8);
    }
    if (t > 1.6) {
      a.anim = null;
      a.state = "down";
    }
  }
  // The steel lands: cars under it hit, loose things thrown, dust and
  // chunks, a camera kick.
  impact(sim, under, points, R) {
    let crushed = 0;
    for (const c of sim.police) if (c.state === "active" && under(c)) {
      c.health -= 70;
      c.lastDamageCause = "crane";
      crushed++;
    }
    for (const c of sim.city?.traffic || []) if (c.state !== "wreck" && under(c)) c.health = (c.health ?? 100) - 80;
    if (sim.target?.state === "fleeing" && under(sim.target)) sim.target.health = Math.max(1, sim.target.health - 40);
    if (under(sim.player)) {
      hurt(sim, "heavy", 8, "crane");
      const p = sim.player, q = points[0], dx = p.x - q.x, dz = p.z - q.z, d = Math.hypot(dx, dz) || 1;
      p.vx += (dx / d) * 6;
      p.vz += (dz / d) * 6;
    }
    this.stats.crushed = (this.stats.crushed || 0) + crushed;
    const rt = this.runtime;
    for (const q of points) {
      // Parked cars, containers, fences and props near each impact point.
      rt?.blast?.(sim, { x: q.x, z: q.z, id: -1, cause: "crane" }, R / 2, 0.7, (s, run) => rt.pending?.push({ at: sim.elapsed + s, run }), 1);
      rt?.fx?.push({ kind: "dust", x: q.x, z: q.z, born: sim.elapsed, size: 1.3 });
      for (let i = 0; i < 4; i++) rt?.throwChunk?.(1, q.x, q.z, 3 + Math.random() * 4, Math.random() * 6.3);
    }
    sim.city?.events.push({ id: ++sim.city.eventId, type: "prop", action: "break", x: points[0].x, z: points[0].z, strength: 15, sound: "rumble", kick: 0.7 });
  }
}
