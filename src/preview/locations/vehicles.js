// Parked / work vehicles: models, damage stages and mass-based collisions.
//
// Stages: 0 intact, 1 dented (crumpled nose, sagging roof, side dent,
// cracked glass), 2 wrecked (crushed, scorched but still its colour, glass
// gone, tyres flat) + a car explosion, flames, then smoke. The broken
// stages are the same model deformed (vertices moved by a fixed function
// of their position, so the shell stays closed and the silhouette stays).
//
// Collisions: a car that hits a vehicle is pushed back and slowed by the
// vehicle's mass; the vehicle is shoved by the car's. A 6 t excavator
// barely moves, a sedan slides away. Damage counts once per hit (0.5 s).
import * as THREE from "three";
import { CONFIG } from "../../game/config.js";
import { C, B, G, cyl, ico, add, coloredGeometry } from "./parts.js";
import { civilianCarGeometry, CAR_SCALE } from "../../render/kit.js";
import { iceTruck, forklift } from "./props.js";

const PLAYER_MASS = 1.3;
const BODY = 0xffffff; // tinted per instance

function wheel(g, x, z, r = 0.38, w = 0.28) {
  const t = cyl(g, r, r, w, C.rubber, x, r - w / 2, z, 10);
  t.rotation.z = Math.PI / 2;
  t.position.y = r;
  const h = cyl(g, r * 0.55, r * 0.55, w + 0.04, 0x9da1a8, x, r - w / 2, z, 8);
  h.rotation.z = Math.PI / 2;
  h.position.y = r;
}
function lamps(g, W, L, y) {
  for (const s of [-1, 1]) {
    B(g, 0.36, 0.16, 0.05, 0xfff6d2, s * (W / 2 - 0.3), y, -L / 2 - 0.03);
    B(g, 0.3, 0.18, 0.05, 0xd8202c, s * (W / 2 - 0.28), y, L / 2 + 0.01);
  }
}
export function van(g) {
  // Delivery van: tall box body, sloped windscreen, sliding door seam,
  // roof rack, bumpers, side stripe.
  const W = 2.0, L = 4.8;
  for (const z of [-1.55, 1.5]) for (const s of [-1, 1]) wheel(g, s * (W / 2 - 0.12), z, 0.38);
  B(g, W, 0.5, L, BODY, 0, 0.32, 0);
  B(g, W, 1.45, L - 1.1, BODY, 0, 0.82, 0.55);
  const nose = B(g, W - 0.04, 0.9, 1.2, BODY, 0, 0.82, -1.75);
  nose.rotation.x = 0.0;
  const ws = B(g, W - 0.2, 0.75, 0.05, C.glassDark, 0, 1.3, -1.55);
  ws.rotation.x = -0.45;
  for (const s of [-1, 1]) {
    B(g, 0.04, 0.5, 0.8, C.glassDark, s * (W / 2 + 0.01), 1.32, -1.05);
    B(g, 0.03, 1.1, 0.03, C.seam, s * (W / 2 + 0.01), 0.85, 0.2);
    B(g, 0.03, 0.18, L - 1.0, 0x2457c5, s * (W / 2 + 0.01), 1.05, 0.4);
  }
  B(g, W - 0.3, 0.06, 2.6, C.metal, 0, 2.3, 0.6);
  for (const z of [-0.5, 0.6, 1.7]) B(g, W - 0.3, 0.1, 0.06, C.metal, 0, 2.34, z);
  B(g, W + 0.06, 0.22, 0.2, C.trim, 0, 0.3, -L / 2 - 0.05);
  B(g, W + 0.06, 0.22, 0.2, C.trim, 0, 0.3, L / 2 + 0.02);
  lamps(g, W, L, 0.7);
}
export function pickup(g) {
  const W = 1.95, L = 4.9;
  for (const z of [-1.55, 1.45]) for (const s of [-1, 1]) wheel(g, s * (W / 2 - 0.12), z, 0.4);
  B(g, W, 0.62, L, BODY, 0, 0.36, 0);
  B(g, W - 0.12, 0.7, 1.7, BODY, 0, 0.98, -0.45); // cab
  const ws = B(g, W - 0.3, 0.6, 0.05, C.glassDark, 0, 1.06, -1.32);
  ws.rotation.x = -0.35;
  for (const s of [-1, 1]) B(g, 0.03, 0.45, 1.2, C.glassDark, s * (W / 2 - 0.05), 1.12, -0.5);
  B(g, W - 0.12, 0.45, 0.04, C.glassDark, 0, 1.15, 0.41);
  // Bed: walls, tailgate, a tool box.
  for (const s of [-1, 1]) B(g, 0.08, 0.4, 2.1, BODY, s * (W / 2 - 0.04), 0.98, 1.4);
  B(g, W, 0.4, 0.08, BODY, 0, 0.98, L / 2 - 0.04);
  B(g, W - 0.3, 0.3, 0.45, C.metal, 0, 0.98, 0.55);
  B(g, W + 0.06, 0.2, 0.2, C.chrome, 0, 0.34, -L / 2 - 0.05);
  B(g, 0.9, 0.3, 0.06, C.trim, 0, 0.7, -L / 2 - 0.02);
  lamps(g, W, L, 0.78);
}
export function dumpTruck(g) {
  // Construction dump truck: yellow cab, big tipping body (orange), six
  // big wheels, ladder, mud flaps.
  const W = 2.4, L = 6.6;
  for (const z of [-2.2, 1.0, 2.3]) for (const s of [-1, 1]) wheel(g, s * (W / 2 - 0.15), z, 0.55, 0.42);
  B(g, W - 0.3, 0.45, L, C.dark, 0, 0.55, 0);
  B(g, W, 1.6, 1.8, C.yellow, 0, 1.0, -2.3);
  B(g, W - 0.3, 0.7, 0.05, C.glassDark, 0, 1.8, -3.21);
  for (const s of [-1, 1]) B(g, 0.04, 0.6, 1.0, C.glassDark, s * (W / 2 + 0.01), 1.85, -2.3);
  const body = G(g, 0, 1.0, 1.0, 0);
  body.rotation.x = -0.08;
  B(body, W, 1.5, 4.2, C.orange, 0, 0, 0);
  B(body, W - 0.3, 0.06, 4.0, 0x7a5a3a, 0, 1.45, 0); // load of earth
  for (let i = 0; i < 4; i++) B(body, W + 0.04, 0.08, 0.1, 0xc95a12, 0, 0.4 + i * 0.3, -2.1);
  for (const s of [-1, 1]) B(g, 0.06, 1.0, 0.06, C.metal, s * (W / 2 + 0.05), 0.9, -1.3);
  B(g, W + 0.1, 0.3, 0.25, C.trim, 0, 0.45, -L / 2 - 0.1);
  for (const s of [-1, 1]) B(g, 0.3, 0.16, 0.05, 0xfff6d2, s * 0.8, 1.2, -3.22);
  cyl(g, 0.1, 0.1, 1.2, C.metal, -0.8, 2.6, -1.6, 6);
}
export function excavator(g) {
  // Tracked excavator: two tracks with rollers, a turntable, the house
  // with cab and counterweight, the boom raised, stick and bucket.
  for (const s of [-1, 1]) {
    B(g, 0.7, 0.75, 3.8, C.dark, s * 1.0, 0, 0);
    for (let i = 0; i < 5; i++) cyl(g, 0.22, 0.22, 0.72, 0x55535c, s * 1.0, 0.15, -1.5 + i * 0.75, 8).rotation.z = Math.PI / 2;
    B(g, 0.72, 0.08, 3.6, 0x3a3940, s * 1.0, 0.75, 0);
  }
  cyl(g, 0.9, 0.9, 0.3, 0x2a292e, 0, 0.8, 0, 8);
  const house = G(g, 0, 1.1, 0.2, 0);
  B(house, 2.5, 1.0, 3.0, C.yellow, 0, 0, 0);
  B(house, 2.5, 0.7, 0.8, 0x2a292e, 0, 0.1, 1.5); // counterweight
  const cab = G(house, -0.6, 1.0, -0.6);
  B(cab, 1.0, 1.4, 1.3, C.yellow, 0, 0, 0);
  B(cab, 0.9, 0.8, 0.04, C.glassDark, 0, 0.45, -0.66);
  B(cab, 0.04, 0.8, 1.0, C.glassDark, -0.51, 0.45, 0);
  B(house, 0.6, 0.6, 0.3, C.metal, 0.8, 1.0, 1.0); // exhaust box
  cyl(house, 0.06, 0.06, 0.8, C.dark, 0.9, 1.6, 1.0, 6);
  // Boom up and forward, stick down, bucket.
  const boom = G(house, 0.5, 0.7, -1.2);
  boom.rotation.x = 0.85;
  B(boom, 0.45, 0.5, 3.6, C.yellow, 0, 0, -1.8);
  const stick = G(boom, 0, 0.2, -3.5);
  stick.rotation.x = -1.9;
  B(stick, 0.36, 0.4, 2.5, C.yellow, 0, 0, -1.25);
  const bucket = G(stick, 0, 0, -2.5);
  bucket.rotation.x = 0.6;
  B(bucket, 1.1, 0.7, 0.9, 0x55535c, 0, -0.35, -0.2);
  for (let i = 0; i < 4; i++) B(bucket, 0.1, 0.1, 0.25, C.metal, -0.4 + i * 0.27, -0.45, -0.75);
  const ram = B(house, 0.15, 0.15, 1.8, 0x9da1a8, 0.5, 0.35, -1.6);
  ram.rotation.x = 0.4;
}

// Vehicle kinds: model, footprint, mass (t), whether the body is tinted.
export const VEHICLES = {
  sedan: { geometry: () => civilianCarGeometry(), L: 4.3 * CAR_SCALE, W: 1.9 * CAR_SCALE, H: 1.5 * CAR_SCALE, mass: 1.0, tint: true },
  van: { build: van, L: 4.8, W: 2.0, H: 2.35, mass: 1.8, tint: true },
  pickup: { build: pickup, L: 4.9, W: 1.95, H: 1.7, mass: 1.5, tint: true },
  iceTruck: { build: (g) => iceTruck(g), L: 4.6, W: 2.0, H: 2.6, mass: 2.0, tint: false },
  forklift: { build: forklift, L: 2.6, W: 1.3, H: 2.2, mass: 1.2, tint: false },
  dumpTruck: { build: dumpTruck, L: 6.6, W: 2.4, H: 3.0, mass: 4.5, tint: false },
  excavator: { build: excavator, L: 4.0, W: 2.6, H: 3.2, mass: 6.0, tint: false },
};
const geoCache = {};
function baseGeometry(kind) {
  const def = VEHICLES[kind];
  if (def.geometry) return def.geometry();
  const g = new THREE.Group();
  def.build(g);
  return coloredGeometry(g);
}
// Deterministic pseudo-random per position (same corner -> same offset).
const h3 = (x, y, z, k) => {
  let n = Math.imul(Math.round(x * 50) * 73856093 ^ Math.round(y * 50) * 19349663 ^ Math.round(z * 50) * 83492791, 0x5bd1e995) ^ k;
  n ^= n >>> 13;
  n = Math.imul(n, 0x5bd1e995);
  return ((n ^ (n >>> 15)) >>> 0) / 4294967296 - 0.5;
};
function deformed(geo, def, stage) {
  const g = geo.clone();
  const p = g.attributes.position, col = g.attributes.color;
  const L = def.L, W = def.W, H = def.H;
  const crush = stage === 1 ? 0.22 : 0.62, sag = stage === 1 ? 0.1 : 0.32, dent = stage === 1 ? 0.18 : 0.38;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ox = x, oy = y, oz = z;
    // Nose pushed in; front corners folded.
    const front = -L / 2 + 0.9;
    if (z < front) z = front - (front - z) * (1 - crush / 0.9) + crush * 0.15;
    // Roof sags in the middle.
    if (y > H * 0.62) y -= sag * Math.max(0, 1 - Math.abs(x) / (W * 0.6));
    // Driver side dent round the middle.
    if (x > W * 0.3) x -= dent * Math.exp(-(z * z) / 1.6) * Math.min(1, y / (H * 0.5));
    // Crumple noise, stronger when wrecked.
    const n = stage === 1 ? 0.04 : 0.09;
    x += h3(ox, oy, oz, 1) * n;
    y += h3(ox, oy, oz, 2) * n;
    z += h3(ox, oy, oz, 3) * n;
    // Wrecked: settles on flat tyres.
    if (stage === 2) y = Math.max(0.02, y - 0.12);
    p.setXYZ(i, x, y, z);
    if (col) {
      let r = col.getX(i), gg = col.getY(i), b = col.getZ(i);
      const glass = b > r + 0.15 && b > 0.35 && r < 0.65; // blue-ish glass
      if (stage === 1 && glass) r = gg = b = 0.12 + (b - 0.12) * 0.5;
      if (stage === 2) {
        // Scorched: darker, soot patches, but the paint hue still shows.
        const soot = h3(Math.round(ox * 1.5), Math.round(oy * 1.5), Math.round(oz * 1.5), 7) > 0.15 ? 0.35 : 0.68;
        r *= soot;
        gg *= soot * 0.95;
        b *= soot * 0.9;
        if (glass) r = gg = b = 0.06;
      }
      col.setXYZ(i, r, gg, b);
    }
  }
  g.computeVertexNormals();
  return g;
}
export function stageGeometry(kind, stage) {
  const key = `${kind}|${stage}`;
  if (geoCache[key]) return geoCache[key];
  const base = geoCache[`${kind}|0`] || (geoCache[`${kind}|0`] = baseGeometry(kind));
  return (geoCache[key] = stage ? deformed(base, VEHICLES[kind], stage) : base);
}

const COLORS = [0x2457c5, 0xf4f4f0, 0xd62f2a, 0x3a3940, 0x2fa36b, 0xf5c01a, 0xf0781e, 0x1f6e6a, 0x7a3fb8];

export class VehicleSystem {
  // batch: PropBatch; specs: [{ kind, x, z, y, ry, color? }];
  // hooks: { boom(sim, veh) }. Each vehicle is three batch instances (one
  // per damage stage); only the current one is shown.
  constructor(batch, specs, hooks) {
    this.batch = batch;
    this.hooks = hooks;
    this.list = specs.map((spec, i) => {
      const def = VEHICLES[spec.kind];
      const ids = [0, 1, 2].map((stage) => batch.instance(batch.geometry(`veh:${spec.kind}:${stage}`, () => stageGeometry(spec.kind, stage)), false, spec.x, spec.z));
      return { spec, i, def, ids };
    });
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.c = new THREE.Color();
    this.UP = new THREE.Vector3(0, 1, 0);
    this.reset();
  }
  reset() {
    for (const v of this.list) {
      Object.assign(v, { x: v.spec.x, z: v.spec.z, ry: v.spec.ry, vx: 0, vz: 0, spin: 0, dmg: 0, hitAt: -9, stage: -1, moving: false, color: COLORS[(v.spec.color ?? v.i) % COLORS.length] });
      v.ids.forEach((id, stage) => {
        this.batch.color(id, v.def.tint ? this.c.setHex(v.color) : this.c.setHex(stage === 2 ? 0xb0a8a8 : 0xffffff));
        this.batch.visible(id, false);
      });
      this.setStage(v, 0);
    }
  }
  setStage(v, stage) {
    if (v.stage >= 0) this.batch.visible(v.ids[v.stage], false);
    v.stage = stage;
    this.batch.visible(v.ids[stage], true);
    this.pose(v);
  }
  pose(v) {
    this.q.setFromAxisAngle(this.UP, v.ry);
    this.m.compose(this.v.set(v.x, v.spec.y ?? 0.05, v.z), this.q, this.s.set(1, 1, 1));
    this.batch.matrix(v.ids[v.stage], this.m);
  }
  // A car (player or police) against the vehicles near it.
  touch(sim, car, radius, isPlayer) {
    for (const v of this.list) {
      if (Math.abs(car.x - v.x) > 6 || Math.abs(car.z - v.z) > 6) continue;
      const ax = Math.sin(v.ry), az = Math.cos(v.ry);
      const r = v.def.W / 2 + 0.05, n = Math.max(2, Math.ceil(v.def.L / v.def.W));
      for (let k = 0; k < n; k++) {
        const o = -v.def.L / 2 + r + ((v.def.L - 2 * r) * k) / (n - 1);
        const cx = v.x + ax * o, cz = v.z + az * o;
        const dx = cx - car.x, dz = cz - car.z, d = Math.hypot(dx, dz);
        if (d >= radius + r || d < 1e-6) continue;
        const nx = dx / d, nz = dz / d, push = radius + r - d;
        const m = v.def.mass, share = m / (m + PLAYER_MASS);
        // The car gives way in proportion to the vehicle's mass...
        // (a heavy one hardly creeps when a car leans on it).
        const give = (1 - share) * (1 - share);
        car.x -= nx * push * (1 - give);
        car.z -= nz * push * (1 - give);
        v.x += nx * push * give;
        v.z += nz * push * give;
        const closing = Math.max(0, (car.vx || 0) * nx + (car.vz || 0) * nz - v.vx * nx - v.vz * nz);
        // ...is slowed by it, and shoves it.
        car.vx -= nx * closing * share * 0.9;
        car.vz -= nz * closing * share * 0.9;
        if (isPlayer) car.speed = Math.max(0, (car.speed ?? 0) - closing * share * 0.8);
        // Heavy vehicles take far less of the blow (a 6 t excavator on
        // tracks barely shifts; a sedan slides away).
        // Leaning on a heavy vehicle with the throttle on (no real impact)
        // hardly moves it.
        const imp = closing * Math.pow(1 - share, 1.5) * 1.3 * (closing > 4 || m < 2.5 ? 1 : 0.15);
        v.vx += nx * imp;
        v.vz += nz * imp;
        v.spin += (nx * az - nz * ax) * imp * 0.4 * Math.sign(o || 1);
        v.moving = true;
        // Damage: real hits only (pressing against it does none).
        if (closing > 6 && sim.elapsed - v.hitAt > 0.5) {
          v.hitAt = sim.elapsed;
          v.dmg += closing;
          sim.city?.events.push({ id: ++sim.city.eventId, type: "prop", action: "crash", x: v.x, z: v.z, strength: closing });
          const dentAt = 6 * Math.sqrt(m) + 2, wreckAt = 15 * Math.sqrt(m) + 3;
          if (v.stage === 0 && v.dmg >= dentAt) this.setStage(v, 1);
          if (v.stage === 1 && v.dmg >= wreckAt) {
            this.setStage(v, 2);
            this.hooks.boom?.(sim, v);
          }
        }
      }
    }
  }
  // An explosion nearby (blast.js): damage by distance, strength and the
  // vehicle's mass, a shove (heavy ones hardly move); a vehicle it wrecks
  // goes up a moment later (later = the blast system's delay queue), once.
  blast(sim, x, z, R, s, later, delay) {
    for (const v of this.list) {
      const dx = v.x - x, dz = v.z - z, d = Math.hypot(dx, dz);
      if (d >= R || d < 1e-6 || v.stage === 2) continue;
      const k = 1 - d / R, m = v.def.mass;
      v.dmg += 40 * k * s;
      const push = (11 * k * Math.sqrt(s)) / Math.sqrt(m);
      v.vx += (dx / d) * push;
      v.vz += (dz / d) * push;
      v.spin += (Math.random() - 0.5) * push * 0.5;
      v.moving = true;
      const dentAt = 6 * Math.sqrt(m) + 2, wreckAt = 15 * Math.sqrt(m) + 3;
      if (v.stage === 0 && v.dmg >= dentAt) this.setStage(v, 1);
      if (v.stage >= 0 && v.stage < 2 && v.dmg >= wreckAt) {
        this.setStage(v, 2);
        later(delay(), () => this.hooks.boom?.(sim, v));
      }
    }
  }
  // Body circles along a vehicle (same as the car collision shape).
  circles(v) {
    const ax = Math.sin(v.ry), az = Math.cos(v.ry);
    const r = v.def.W / 2 + 0.05, n = Math.max(2, Math.ceil(v.def.L / v.def.W));
    const out = [];
    for (let k = 0; k < n; k++) {
      const o = -v.def.L / 2 + r + ((v.def.L - 2 * r) * k) / (n - 1);
      out.push({ x: v.x + ax * o, z: v.z + az * o, r });
    }
    return out;
  }
  // A shoved vehicle that runs into another pushes it (by mass) instead of
  // passing through it; momentum is shared.
  separate(v) {
    for (const u of this.list) {
      if (u === v || Math.abs(u.x - v.x) > 8 || Math.abs(u.z - v.z) > 8) continue;
      for (const a of this.circles(v))
        for (const b of this.circles(u)) {
          const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), min = a.r + b.r;
          if (d >= min || d < 1e-6) continue;
          const nx = dx / d, nz = dz / d, push = min - d;
          const mv = v.def.mass, mu = u.def.mass, su = mv / (mv + mu);
          v.x -= nx * push * (1 - su);
          v.z -= nz * push * (1 - su);
          u.x += nx * push * su;
          u.z += nz * push * su;
          const rel = (v.vx - u.vx) * nx + (v.vz - u.vz) * nz;
          if (rel > 0) {
            v.vx -= nx * rel * su;
            v.vz -= nz * rel * su;
            u.vx += nx * rel * (1 - su) * 0.8;
            u.vz += nz * rel * (1 - su) * 0.8;
            u.moving = true;
          }
          this.pose(u);
        }
    }
  }
  update(sim, dt) {
    for (const v of this.list) {
      if (!v.moving) continue;
      const was = { x: v.x, z: v.z };
      v.x += v.vx * dt;
      v.z += v.vz * dt;
      v.ry += v.spin * dt;
      // Heavier vehicles stop sooner (tyre and track friction).
      const k = Math.exp(-dt * (2 + v.def.mass * 1.4));
      v.vx *= k;
      v.vz *= k;
      v.spin *= k;
      sim.constrain(v, v.def.W / 2 + 0.3, was);
      this.separate(v);
      if (Math.hypot(v.vx, v.vz) < 0.05 && Math.abs(v.spin) < 0.02) {
        v.vx = v.vz = v.spin = 0;
        v.moving = false; // settled: no more updates
      }
      this.pose(v);
    }
  }
}
