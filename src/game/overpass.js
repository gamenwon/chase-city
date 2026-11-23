// V2.1 elevated road (world/citygen.js places one over an avenue
// junction): two driving levels, destructible pillars, collapse.
//
// Levels: every car (player, police, traffic, target) has `level` 0
// (ground) or 1 (on the overpass) and a height `y`. A car driving onto a
// ramp foot along the avenue goes to level 1 and follows the ramp/deck
// height; there it is held between the parapets and ignores everything on
// the ground (and the ground ignores it); it is back on level 0 when it
// leaves at either foot. On the ground the low part of each ramp is solid
// (rampSolids), the high part and the deck can be driven under.
//
// Pillars (4, at the deck ends) are solid on the ground and take damage
// from hard hits (by impact speed and the car's mass) and from blasts.
// When two have gone, the deck section comes down: cars under it are
// crushed, cars on it fall to the ground, the overpass leaves the road
// network (police and the target stop routing over it), and the broken
// deck stays where it fell (drivable rubble, a few solid chunks at the
// sides). A car going up a ramp to the broken edge drops off it onto the
// street below and drives on: never trapped.
import { overpassHeight } from "../world/citygen.js";
import { makePath, project, pointAt } from "./citygraph.js";

export const PILLAR = Object.freeze({ health: 100, hitMin: 5, hitScale: 3.4, collapseAt: 2, fall: 1.1 });

export function createOverpasses(layout) {
  return (layout.overpasses || []).map((op, id) => ({
    ...op,
    id,
    state: "up", // up | falling | down
    fellAt: null,
    pillars: op.pillars.map((q, k) => ({ ...q, id: k, op: id, kind: "pillar", health: PILLAR.health, alive: true })),
    debris: [],
  }));
}
// Solid pillars still standing (the simulation's dynamic solids).
export function pillarSolids(sim) {
  const out = [];
  for (const op of sim.overpasses || []) for (const q of op.pillars) if (q.alive) out.push(q);
  for (const op of sim.overpasses || []) out.push(...op.debris.filter((d) => d.solid));
  return out;
}
// Position along the elevated road (s from its first foot) and sideways
// from its centre line (lat, + to the left), along a straight or curved
// road. Beyond either end, s runs on along the end's direction.
const pathCache = new WeakMap();
export function overpassLocal(op, x, z) {
  let path = pathCache.get(op);
  if (!path) pathCache.set(op, (path = makePath(op.pts || [op.a, { x: op.a.x + op.u.x * op.L, z: op.a.z + op.u.z * op.L }])));
  const before = (x - op.a.x) * op.u.x + (z - op.a.z) * op.u.z;
  if (before < 0) return { s: before, lat: (x - op.a.x) * -op.u.z + (z - op.a.z) * op.u.x };
  const end = op.end || pointAt(path, path.len), ue = op.uEnd || op.u;
  const after = (x - end.x) * ue.x + (z - end.z) * ue.z;
  if (after > 0) return { s: path.len + after, lat: (x - end.x) * -ue.z + (z - end.z) * ue.x };
  const pr = project(path, x, z), q = pointAt(path, pr.s);
  return { s: pr.s, lat: (x - q.x) * -q.uz + (z - q.z) * q.ux, ux: q.ux, uz: q.uz };
}
const local = overpassLocal;
const onDeckSection = (op, s) => s > op.R - 0.4 && s < op.L - op.R + 0.4;

// Level changes and the deck's side walls for one body. Returns true if
// it scraped a parapet. A body on level 1 skips ground collision.
export function constrainLevels(sim, body, radius) {
  for (const op of sim.overpasses) {
    const { s, lat } = local(op, body.x, body.z);
    if (body.level === 1 && body.op === op.id) {
      if (s < -0.3 || s > op.L + 0.3) {
        body.level = 0;
        body.op = null;
        body.y = 0;
        return false;
      }
      if (op.state !== "up" && onDeckSection(op, s)) {
        // The deck is gone under it: it drops to the street below.
        body.level = 0;
        body.op = null;
        body.vy = 0;
        body.falling = true;
        if (body === sim.player) sim.damage?.(14);
        else if (body.health != null) body.health -= 30;
        return false;
      }
      body.y = overpassHeight(op, s);
      const lim = op.W / 2 - radius;
      if (Math.abs(lat) > lim) {
        // The parapet: back inside, the speed into it taken away.
        const loc = local(op, body.x, body.z);
        const nx = -(loc.uz ?? op.u.z), nz = loc.ux ?? op.u.x;
        const back = Math.abs(lat) - lim;
        const sg = Math.sign(lat);
        body.x -= nx * sg * back;
        body.z -= nz * sg * back;
        const vn = body.vx * nx + body.vz * nz;
        if (vn * sg > 0) {
          body.lastImpact = Math.max(body.lastImpact || 0, Math.abs(vn));
          body.vx -= nx * vn;
          body.vz -= nz * vn;
        }
        return true;
      }
      return false;
    }
    // (Cars routed along the ground street beside a ramp do not go up it.)
    if ((body.level || 0) === 0 && !body.falling && !body.noRamp && Math.abs(lat) < op.W / 2 - 0.3) {
      // Onto a ramp at either foot, driving up it.
      const ue = op.uEnd || op.u;
      const up1 = (body.vx || 0) * op.u.x + (body.vz || 0) * op.u.z, up2 = -((body.vx || 0) * ue.x + (body.vz || 0) * ue.z);
      if ((s >= 0 && s <= 2.6 && up1 > 0.5) || (s >= op.L - 2.6 && s <= op.L && up2 > 0.5)) {
        body.level = 1;
        body.op = op.id;
        body.y = overpassHeight(op, s);
        return false;
      }
    }
  }
  return false;
}
export const sameLevel = (a, b) => (a.level || 0) === (b.level || 0);

// A car that hit a pillar: damage by closing speed and mass.
export function hitPillar(sim, pillar, impact, mass = 1) {
  if (!pillar.alive || impact < PILLAR.hitMin) return;
  // (Map quality pass: the elevated road does not come down for now.)
  if (sim.overpasses[pillar.op]?.destructible === false) return;
  pillar.health -= (impact - PILLAR.hitMin * 0.5) * PILLAR.hitScale * mass;
  sim.impacts?.push({ id: ++sim.impactId, type: "collision", x: pillar.x, z: pillar.z, strength: impact, kind: "pillar", time: sim.elapsed });
  if (pillar.health <= 0) breakPillar(sim, pillar);
}
export function breakPillar(sim, pillar) {
  if (!pillar.alive) return;
  pillar.alive = false;
  pillar.health = 0;
  pillar.brokeAt = sim.elapsed;
  sim.stats.pillarsBroken = (sim.stats.pillarsBroken || 0) + 1;
  sim.city?.events.push({ id: ++sim.city.eventId, type: "prop", action: "break", x: pillar.x, z: pillar.z, strength: 14, byPlayer: true });
  const op = sim.overpasses[pillar.op];
  if (op.state === "up" && op.pillars.filter((q) => !q.alive).length >= PILLAR.collapseAt) collapse(sim, op);
  sim.refreshNavigation();
}
// Blasts hurt pillars near them (blast.js listener).
export function blastPillars(sim, e, R, s) {
  for (const op of sim.overpasses || [])
    for (const q of op.pillars) {
      if (!q.alive || op.destructible === false) continue;
      const d = Math.hypot(q.x - e.x, q.z - e.z);
      if (d < R) {
        q.health -= 85 * (1 - d / R) * s;
        if (q.health <= 0) breakPillar(sim, q);
      }
    }
}

function collapse(sim, op) {
  op.state = "falling";
  op.fellAt = sim.elapsed;
  sim.stats.overpassCollapses = (sim.stats.overpassCollapses || 0) + 1;
  sim.events.push({ id: ++sim.eventId, type: "collapse", op: op.id, x: op.junction.x, z: op.junction.z, time: sim.elapsed });
  if (sim.events.length > 64) sim.events.shift();
  // The deck leaves the road network at once (nobody routes onto it).
  sim.navigation.killOverpass?.(op.id);
}

// Every step: the falling deck lands (crushing what is under it), cars
// that dropped off reach the ground.
export function updateOverpasses(sim, dt) {
  for (const op of sim.overpasses || []) {
    if (op.state === "falling" && sim.elapsed - op.fellAt >= PILLAR.fall) {
      op.state = "down";
      landDeck(sim, op);
    }
  }
  for (const b of [sim.player, ...sim.police, ...(sim.city?.traffic || []), ...(sim.target ? [sim.target] : [])]) {
    if (!b.falling) continue;
    b.vy = (b.vy || 0) - 18 * dt;
    b.y = Math.max(0, (b.y || 0) + b.vy * dt);
    if (b.y <= 0) {
      b.falling = false;
      b.y = 0;
      b.vy = 0;
    }
  }
}
function landDeck(sim, op) {
  const s0 = op.R, s1 = op.L - op.R;
  const inside = (o) => {
    const { s, lat } = local(op, o.x, o.z);
    return (o.level || 0) === 0 && s > s0 - 1 && s < s1 + 1 && Math.abs(lat) < op.W / 2 + 0.5;
  };
  // Crushed: police and civilian cars under it are wrecked; the player is
  // badly hurt and shoved out sideways.
  for (const c of sim.police) if (c.state === "active" && inside(c)) { c.health = 0; c.lastDamageCause = "collapse"; }
  for (const t of sim.city?.traffic || []) if (inside(t)) { t.state = "wreck"; t.health = 0; }
  if (inside(sim.player)) {
    sim.damage?.(35);
    const { lat } = local(op, sim.player.x, sim.player.z);
    const sg = Math.sign(lat) || 1;
    sim.player.vx += op.n.x * sg * 10;
    sim.player.vz += op.n.z * sg * 10;
  }
  // The crash: a big blast-like event at the middle (shake, dust, sound).
  sim.events.push({ id: ++sim.eventId, type: "explosion", cause: "collapse", major: true, x: op.junction.x, z: op.junction.z, angle: 0, time: sim.elapsed, delay: 0, chainDepth: 1, playerX: sim.player.x, playerZ: sim.player.z, noBlast: false });
  if (sim.events.length > 64) sim.events.shift();
  // What stays: the two broken deck halves lying on the street (drivable
  // rubble) and four solid chunks at the sides, clear of the crossing.
  const mid = (s0 + s1) / 2;
  for (const s of [s0 + 1.5, s1 - 1.5])
    for (const side of [-1, 1]) {
      const lat = side * (op.W / 2 - 0.4);
      const x = op.a.x + op.u.x * s + op.n.x * lat, z = op.a.z + op.u.z * s + op.n.z * lat;
      op.debris.push({ x, z, w: 1.6, d: 1.6, kind: "rubble", solid: true });
    }
  op.slabs = [
    { s: (s0 + mid) / 2, len: mid - s0, tilt: 0.12, roll: -0.05 },
    { s: (mid + s1) / 2, len: s1 - mid, tilt: -0.1, roll: 0.06 },
  ];
  sim.refreshNavigation();
}
