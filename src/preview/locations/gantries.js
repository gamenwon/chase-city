// Overhead structures on two posts (the yellow MARKET arch on red posts,
// the orange DEPOT gantry): a strong hit to a post snaps it, the other post
// bends, and the beam (with its sign) drops on the broken side, then falls
// with its weight and lands; a light hit only makes it shake. Scripted
// keyframes (no physics), the wreckage stays until restart.
//
// Never a trap: the broken posts stop being solid, the beam always falls
// away from the road (into the market, out to the city edge for the
// depot) and only becomes solid once no car is inside where it lies.
import * as THREE from "three";
import { B, G, bake, pieceMesh, signBoard, ico } from "./parts.js";

const TOP = 0.03; // site slab level (decor root height)

// Local (site decor frame) to world.
export function gantryWorld(y, lx, lz) {
  const c = Math.cos(y.ry), s = Math.sin(y.ry);
  return { x: y.x + lx * c + lz * s, z: y.z - lx * s + lz * c };
}
// The post solids of a gantry, in world space (sites.js adds them).
export function gantrySolids(y) {
  const g = y.gantry;
  return g.posts.map((px) => {
    const w = gantryWorld(y, g.cx + px, g.lz);
    return { x: w.x, z: w.z, w: g.pw + 0.1, d: g.pw + 0.1, kind: "gantry-post" };
  });
}

function beamPiece(gt) {
  const g = new THREE.Group();
  const b = gt.beam;
  B(g, b.w, b.h, 0.3, gt.beamColor, 0, -b.h / 2, 0);
  const [text, sw, sh, bg, fg] = gt.sign;
  signBoard(g, text, sw, sh, 0, 0, -0.16, Math.PI, bg, fg);
  if (gt.lights) {
    // String lights hanging under the beam between the posts.
    for (let i = 0; i < 12; i++)
      ico(g, 0.1, [0xd62f2a, 0xf5c01a, 0x2f7fe0, 0x5cb23a][i % 4], -4 + i * 0.73, -b.h / 2 - 0.8 - Math.sin((i / 11) * Math.PI) * 0.5, 0);
  }
  return bake(g);
}
function postPiece(gt) {
  return pieceMesh((g) => {
    B(g, gt.pw, gt.h, gt.pw, gt.postColor, 0, 0, 0);
    B(g, gt.pw + 0.12, 0.25, gt.pw + 0.12, 0x55535c, 0, 0, 0); // foot
  });
}

const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const fall = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.85 ? (t / 0.85) ** 2 : 1 + Math.sin(((t - 0.85) / 0.15) * Math.PI) * 0.05);

export class Gantries {
  constructor(scene, yards) {
    this.list = [];
    for (const y of yards || []) {
      if (!y.gantry) continue;
      const gt = y.gantry;
      const root = G(scene, y.x, TOP, y.z, y.ry);
      const posts = gt.posts.map((px) => {
        const m = postPiece(gt);
        m.position.set(gt.cx + px, 0, gt.lz);
        root.add(m);
        return m;
      });
      const beam = beamPiece(gt);
      const holder = new THREE.Group();
      holder.add(beam);
      holder.position.set(gt.cx, gt.beam.y + gt.beam.h / 2, gt.lz);
      root.add(holder);
      this.list.push({ y, gt, root, posts, beam: holder, state: "up", solids: null });
    }
    this.stats = { toppled: 0, shaken: 0 };
  }
  // Called each run: everything back up, the post solids back.
  reset(sim) {
    for (const a of this.list) {
      a.state = "up";
      a.anim = null;
      a.wobble = null;
      a.posts.forEach((m, i) => {
        m.position.set(a.gt.cx + a.gt.posts[i], 0, a.gt.lz);
        m.rotation.set(0, 0, 0);
      });
      a.beam.position.set(a.gt.cx, a.gt.beam.y + a.gt.beam.h / 2, a.gt.lz);
      a.beam.rotation.set(0, 0, 0);
      if (sim && a.solidRefs) {
        for (const s of a.solidRefs) if (!sim.staticSolids.includes(s)) sim.staticSolids.push(s);
        sim.refreshNavigation();
      }
      a.pendingSolid = null;
    }
    if (sim?.city?.solids) {
      const n = sim.city.solids.length;
      sim.city.solids = sim.city.solids.filter((b) => b.kind !== "gantry-beam");
      if (n !== sim.city.solids.length) sim.refreshNavigation();
    }
    this.stats = { toppled: 0, shaken: 0 };
  }
  // A car near a post: shake on a light hit, topple on a strong one.
  touch(sim, car, radius) {
    for (const a of this.list) {
      if (a.state !== "up") continue;
      a.gt.posts.forEach((px, i) => {
        if (a.state !== "up") return;
        const w = gantryWorld(a.y, a.gt.cx + px, a.gt.lz);
        const dx = w.x - car.x, dz = w.z - car.z, d = Math.hypot(dx, dz);
        if (d > radius + a.gt.pw / 2 + 0.5 || d < 1e-6) return;
        const closing = ((car.vx || 0) * dx + (car.vz || 0) * dz) / d;
        if (closing >= 8) this.topple(sim, a, i, car);
        else if (closing >= 2.5 && (!a.wobble || sim.elapsed - a.wobble.at > 0.6)) {
          a.wobble = { at: sim.elapsed, amp: Math.min(0.08, closing * 0.012) };
          this.stats.shaken++;
        }
      });
    }
  }
  topple(sim, a, hit, car) {
    a.state = "falling";
    this.stats.toppled++;
    const gt = a.gt;
    // Which way it falls (local z): set per structure, away from the road.
    const fz = gt.fallDir;
    const side = gt.posts[hit] < 0 ? -1 : 1; // hit post on the left (-) or right (+)
    const t0 = sim.elapsed;
    a.anim = {
      t0,
      posts: gt.posts.map((px, i) =>
        i === hit
          ? // Snapped at the foot: kicked along, toppling over.
            { start: 0, dur: 0.55, to: { x: gt.cx + px + side * 0.6, y: 0, z: gt.lz + fz * 0.5, rx: fz * 1.42, rz: -side * 0.25 } }
          : // Bent over by the beam's weight.
            { start: 0.25, dur: 0.6, to: { x: gt.cx + px, y: 0, z: gt.lz, rx: fz * 0.55, rz: side * 0.12 } },
      ),
      beam: [
        // The broken end drops first (hinging on the other post)...
        { start: 0.05, dur: 0.35, to: { x: gt.cx + side * 0.3, y: gt.beam.y + gt.beam.h / 2 - 1.1, z: gt.lz + fz * 0.3, rx: fz * 0.15, rz: -side * 0.42 } },
        // ...then the whole beam comes down and lands, sign up.
        { start: 0.4, dur: 0.75, to: { x: gt.cx + side * 0.8, y: 0.45, z: gt.lz + fz * (gt.beam.y * 0.8), rx: fz * 1.45, rz: -side * 0.12 } },
      ],
    };
    // The posts are not solid any more (both broken/bent).
    a.solidRefs = sim.staticSolids.filter(
      (s) => s.kind === "gantry-post" && gt.posts.some((px) => {
        const w = gantryWorld(a.y, gt.cx + px, gt.lz);
        return Math.abs(s.x - w.x) < 0.05 && Math.abs(s.z - w.z) < 0.05;
      }),
    );
    if (a.solidRefs.length) {
      sim.staticSolids = sim.staticSolids.filter((s) => !a.solidRefs.includes(s));
      sim.refreshNavigation();
    }
    // Where the beam ends up: solid once clear of cars.
    const c = gantryWorld(a.y, gt.cx + side * 0.8, gt.lz + fz * (gt.beam.y * 0.8));
    const alongX = Math.abs(Math.cos(a.y.ry)) > 0.5;
    a.pendingSolid = { x: c.x, z: c.z, w: alongX ? gt.beam.w : 1.0, d: alongX ? 1.0 : gt.beam.w, kind: "gantry-beam", at: t0 + 1.3 };
    sim.city?.events.push({ id: ++sim.city.eventId, type: "prop", action: "break", x: car.x, z: car.z, strength: 14, byPlayer: car === sim.player });
  }
  step(sim, now) {
    for (const a of this.list) {
      if (a.wobble && a.state === "up") {
        const t = now - a.wobble.at;
        const k = t < 1.6 ? a.wobble.amp * Math.sin(t * 13) * Math.exp(-t * 2.8) : 0;
        a.posts.forEach((m) => (m.rotation.x = k));
        a.beam.rotation.x = k * 1.3;
        a.beam.position.z = a.gt.lz + k * (a.gt.beam.y + 0.5);
        if (t >= 1.6) a.wobble = null;
      }
      if (a.anim) {
        const t = now - a.anim.t0;
        a.anim.posts.forEach((k, i) => this.apply(a.posts[i], k, t));
        // Beam: two stages in turn.
        const [s1, s2] = a.anim.beam;
        if (t < s2.start) this.apply(a.beam, s1, t);
        else {
          if (!s2.from) s2.from = this.read(a.beam);
          this.applyFrom(a.beam, s2, t, s2.from, fall);
        }
        if (t > s2.start + s2.dur && a.anim.posts.every((k) => t > k.start + k.dur)) {
          a.anim = null;
          a.state = "down";
        }
      }
      if (a.pendingSolid && now >= a.pendingSolid.at && sim?.city?.solids) {
        const b = a.pendingSolid;
        const cars = [sim.player, ...sim.police.filter((c) => c.state === "active"), ...(sim.target ? [sim.target] : [])];
        if (!cars.some((c) => Math.abs(c.x - b.x) < b.w / 2 + 1.5 && Math.abs(c.z - b.z) < b.d / 2 + 1.5)) {
          sim.city.solids.push({ x: b.x, z: b.z, w: b.w, d: b.d, kind: "gantry-beam" });
          sim.refreshNavigation();
          a.pendingSolid = null;
        }
      }
    }
  }
  read(m) {
    return { x: m.position.x, y: m.position.y, z: m.position.z, rx: m.rotation.x, rz: m.rotation.z };
  }
  apply(m, k, t) {
    if (!k.from) k.from = this.read(m);
    this.applyFrom(m, k, t, k.from, k.dur > 0.5 ? fall : ease);
  }
  applyFrom(m, k, t, f, curve) {
    const u = curve((t - k.start) / k.dur);
    m.position.set(f.x + (k.to.x - f.x) * u, f.y + (k.to.y - f.y) * u, f.z + (k.to.z - f.z) * u);
    m.rotation.set(f.rx + (k.to.rx - f.rx) * u, 0, f.rz + (k.to.rz - f.rz) * u);
  }
}
