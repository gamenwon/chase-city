// V2.1 elevated road (world/citygen.js places one over an avenue
// junction): two driving levels, destructible pillars, collapse.
//
// Destruction pass: partial collapse. Every other pillar (hazard-striped)
// is a weak one: hard or repeated hits crack it (by impact and the car's
// mass), blasts wear it down, and when it gives way only the deck span it
// carries comes down: from the pillar before it to the pillar after it
// (or the end of the ramp embankment). The rest of the road stays up. A
// car on that span falls with it, a car driving up to the broken edge
// drops off onto the street; what is under the span when it lands is
// crushed; the elevated road leaves the route network (the police and the
// target drive round on the ground); the fallen span stays where it fell
// (drivable rubble, a few solid chunks at its sides) until restart.
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
  return (layout.overpasses || []).map((op, id) => {
    // Where the ramp embankment ends (the deck beyond rests on pillars).
    let solidTo = op.R;
    for (let s = 0; s < op.R; s += 0.25) if (overpassHeight(op, s) >= 3.6) { solidTo = s; break; }
    const pillars = op.pillars.map((q, k) => ({ ...q, id: k, op: id, kind: "pillar", health: PILLAR.health, alive: true })).sort((a, b) => a.s - b.s);
    pillars.forEach((q, k) => (q.weak = pillars.length <= 3 || k % 2 === 0));
    return { ...op, id, state: "up", fellAt: null, solidTo, pillars, debris: [], gaps: [], broken: false };
  });
}
// The span a pillar carries: from the pillar before it to the one after it
// (or the end of the embankment at either end).
export function pillarSpan(op, q) {
  const ps = op.pillars, k = ps.indexOf(q);
  return { s0: k > 0 ? ps[k - 1].s : op.solidTo, s1: k < ps.length - 1 ? ps[k + 1].s : op.L - op.solidTo };
}
// Is the deck missing at s (a span that has fallen or is falling)?
export const overpassGapAt = (op, s) => !!op.gaps?.some((g) => s > g.s0 - 0.2 && s < g.s1 + 0.2);
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
      if (overpassGapAt(op, s)) {
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
  // Only the weak (striped) pillars give; the others shrug it off.
  if (!pillar.weak) return;
  pillar.health -= (impact - PILLAR.hitMin * 0.5) * PILLAR.hitScale * mass;
  pillar.lastHit = sim.elapsed;
  sim.impacts?.push({ id: ++sim.impactId, type: "collision", x: pillar.x, z: pillar.z, strength: impact, kind: "pillar", time: sim.elapsed });
  sim.city?.events.push({ id: ++sim.city.eventId, type: "pillar", action: "crack", x: pillar.x, z: pillar.z, strength: Math.min(15, impact), sound: "crack" });
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
  collapseSpan(sim, op, pillarSpan(op, pillar), pillar);
  sim.refreshNavigation();
}
// Blasts hurt pillars near them (blast.js listener).
export function blastPillars(sim, e, R, s) {
  for (const op of sim.overpasses || [])
    for (const q of op.pillars) {
      if (!q.alive || !q.weak) continue;
      const d = Math.hypot(q.x - e.x, q.z - e.z);
      if (d < R) {
        q.health -= 85 * (1 - d / R) * s;
        if (q.health <= 0) breakPillar(sim, q);
      }
    }
}

// A span starts to fall (merged with a gap next to it).
function collapseSpan(sim, op, span, pillar) {
  const gap = { id: op.gaps.length, s0: span.s0, s1: span.s1, state: "falling", fellAt: sim.elapsed, pillar: pillar?.id };
  op.gaps.push(gap);
  op.broken = true;
  op.fellAt = sim.elapsed;
  sim.stats.overpassCollapses = (sim.stats.overpassCollapses || 0) + 1;
  const mid = spanPoint(op, (gap.s0 + gap.s1) / 2);
  sim.events.push({ id: ++sim.eventId, type: "collapse", op: op.id, gap: gap.id, x: mid.x, z: mid.z, time: sim.elapsed });
  // Dust off the broken pillar at once.
  if (pillar) sim.events.push({ id: ++sim.eventId, type: "explosion", dust: true, strength: 1.0, x: pillar.x, z: pillar.z, angle: 0, time: sim.elapsed, delay: 0, chainDepth: 0, playerX: sim.player.x, playerZ: sim.player.z });
  while (sim.events.length > 64) sim.events.shift();
  // The elevated road is no longer a route (nobody routes onto it).
  sim.navigation.killOverpass?.(op.id);
}
// Point s along the elevated road (and its direction).
export function spanPoint(op, s) {
  let path = pathCache.get(op);
  if (!path) pathCache.set(op, (path = makePath(op.pts || [op.a, { x: op.a.x + op.u.x * op.L, z: op.a.z + op.u.z * op.L }])));
  return pointAt(path, Math.max(0, Math.min(path.len, s)));
}

// Every step: falling spans land (crushing what is under them), cars that
// dropped off reach the ground.
export function updateOverpasses(sim, dt) {
  for (const op of sim.overpasses || [])
    for (const g of op.gaps || [])
      if (g.state === "falling" && sim.elapsed - g.fellAt >= PILLAR.fall) {
        g.state = "down";
        landSpan(sim, op, g);
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
function landSpan(sim, op, g) {
  const inside = (o) => {
    const { s, lat } = local(op, o.x, o.z);
    return (o.level || 0) === 0 && s > g.s0 - 0.5 && s < g.s1 + 0.5 && Math.abs(lat) < op.W / 2 + 0.5;
  };
  // Crushed: police and civilian cars under it are wrecked (a police car
  // goes up); the player is hurt and shoved out sideways.
  let crushed = 0;
  for (const c of sim.police) if (c.state === "active" && inside(c)) { c.health = 0; c.lastDamageCause = "collapse"; crushed++; }
  for (const t of sim.city?.traffic || []) if (t.state !== "wreck" && inside(t)) { t.state = "wreck"; t.health = 0; crushed++; }
  if (sim.target?.state === "fleeing" && inside(sim.target)) sim.target.health = Math.max(1, sim.target.health - 60);
  if (inside(sim.player)) {
    sim.damage?.(30);
    const { lat } = local(op, sim.player.x, sim.player.z);
    const q = spanPoint(op, (g.s0 + g.s1) / 2), sg = Math.sign(lat) || 1;
    sim.player.vx += -q.uz * sg * 10;
    sim.player.vz += q.ux * sg * 10;
  }
  g.crushed = crushed;
  sim.stats.crushedByDeck = (sim.stats.crushedByDeck || 0) + crushed;
  // The crash: a long cloud of concrete dust along the span, a rumble.
  const m = spanPoint(op, (g.s0 + g.s1) / 2);
  sim.events.push({ id: ++sim.eventId, type: "explosion", dust: true, strength: 2.2, x: m.x, z: m.z, along: { x: m.ux, z: m.uz }, len: g.s1 - g.s0, angle: 0, time: sim.elapsed, delay: 0, chainDepth: 1, playerX: sim.player.x, playerZ: sim.player.z });
  while (sim.events.length > 64) sim.events.shift();
  // What stays solid: chunks at the span's ends, out at the deck's sides
  // (the lanes beside and under the middle stay drivable).
  for (const s of [g.s0 + 1.2, g.s1 - 1.2])
    for (const side of [-1, 1]) {
      const q = spanPoint(op, s), lat = side * (op.W / 2 - 0.4);
      op.debris.push({ x: q.x - q.uz * lat, z: q.z + q.ux * lat, w: 1.4, d: 1.4, kind: "rubble", solid: true, gap: g.id });
    }
  sim.refreshNavigation();
}
