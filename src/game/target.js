// TARGET HUNT: the fleeing target car and how the player takes it down.
//
// The target drives the road grid junction to junction. At every junction
// it picks the next one to get away: far from the player, not towards
// him, and not a junction it passed recently (so it never settles into a
// loop), with a little randomness so it is not predictable. It steers
// smoothly through the corners (limited turn rate, slows for a turn),
// moves with the game's own collision code (it cannot pass through a
// building, a wall or a wreck) and, if it ever stalls against something,
// backs out and re-plans; it never jumps or teleports.
//
// Only real contact hurts it: the player's car and the target's body
// boxes touch, and the damage follows the closing speed of the impact.
// At zero durability it crashes and explodes, and the mission is won.
import { CONFIG, clamp, angleDelta } from "./config.js";
import { policeContact } from "./police.js";
import { addWreck } from "./wrecks.js";
import { makePath, pointAt, project } from "./citygraph.js";
import { spillCoins, SPILL } from "./coins.js";

export const TARGET = Object.freeze({
  health: 100,
  cruise: 19, // m/s on a straight (the player's car does 24)
  corner: 11.5, // m/s through a turn
  accel: 5.5, // m/s^2 (no instant acceleration)
  brake: 11,
  turnRate: 2.4, // rad/s
  radius: 1.25, // for walls and buildings
  laneOffset: 2.2, // keeps to the right of the road
  minHit: 2.5, // closing speed (m/s) below which a touch does nothing
  hitCooldown: 0.6, // one shove is one hit
  surge: 3, // m/s extra for a moment after a hit (it tries to break away)
  surgeTime: 1.8,
  memory: 10, // junctions remembered to avoid loops
  winDelay: 1.6, // s from the takedown to the result screen
});

const SPACING = CONFIG.spacing;
const LINES = [-90, -60, -30, 0, 30, 60, 90];
const key = (n) => `${n.x},${n.z}`;
const segKey = (a, b) => `${key(a)}>${key(b)}`;
const fwd = (a) => ({ x: -Math.sin(a), z: -Math.cos(a) });
const headingTo = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz));

function neighbours(n) {
  const out = [];
  for (const [dx, dz] of [[SPACING, 0], [-SPACING, 0], [0, SPACING], [0, -SPACING]]) {
    const x = n.x + dx, z = n.z + dz;
    if (Math.abs(x) <= 90 && Math.abs(z) <= 90) out.push({ x, z });
  }
  return out;
}
const nearestNode = (x, z) => ({
  x: clamp(Math.round(x / SPACING) * SPACING, -90, 90),
  z: clamp(Math.round(z / SPACING) * SPACING, -90, 90),
});

// V2.1: the road network the target drives. Downtown: the 30 m grid.
// A generated city: its road graph (junctions joined by straight or
// curved streets); `lanePoint` then follows the real street.
let NET = null;
function useNet(sim) {
  const g = sim.layout?.graph;
  if (!g) return (NET = null);
  if (NET && NET.graph === g) return NET;
  const nodes = new Map(g.nodes.map((n) => [n.id, { x: n.x, z: n.z, id: n.id, ring: n.ring }]));
  const adj = new Map([...nodes.keys()].map((id) => [id, []]));
  const paths = new Map();
  for (const e of g.edges) {
    if ((e.kind !== "road" && e.kind !== "overpass") || e.a == null) continue;
    adj.get(e.a).push(nodes.get(e.b));
    adj.get(e.b).push(nodes.get(e.a));
    paths.set(`${e.a}>${e.b}`, Object.assign(makePath(e.pts), { width: e.width }));
    paths.set(`${e.b}>${e.a}`, Object.assign(makePath(e.pts.slice().reverse()), { width: e.width }));
  }
  return (NET = { graph: g, nodes, adj, paths });
}
const pathOf = (a, b) => NET?.paths.get(`${a.id}>${b.id}`);
const segLength = (a, b) => (NET ? pathOf(a, b)?.len ?? Math.hypot(b.x - a.x, b.z - a.z) : SPACING);
// Distance along the street from a to b reached by (x, z).
function progress(a, b, x, z) {
  const path = NET && pathOf(a, b);
  if (path) return project(path, x, z).s;
  return SPACING - Math.hypot(b.x - x, b.z - z);
}
function neighboursOf(n) {
  if (!NET) return neighbours(n);
  return NET.adj.get(n.id) || [];
}
function nearestOf(x, z) {
  if (!NET) return nearestNode(x, z);
  let best = null, bd = Infinity;
  for (const n of NET.nodes.values()) {
    const d = Math.hypot(n.x - x, n.z - z);
    if (d < bd && (NET.adj.get(n.id) || []).length) (bd = d), (best = n);
  }
  return best;
}
// Point on the right-hand lane of the road from a to b, `along` metres
// from a.
function lanePoint(a, b, along) {
  const path = NET && pathOf(a, b);
  if (path) {
    const q = pointAt(path, along);
    // On the wide avenue under the elevated road: the lane beside the ramps.
    const off = path.width >= 18 ? path.width / 2 - 2.6 : TARGET.laneOffset;
    return { x: q.x - q.uz * off, z: q.z + q.ux * off };
  }
  const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;
  // Right of travel in this world (forward (-sin a, -cos a)): (-uz, ux)
  // matches the traffic lanes (city.js laneCenter).
  return {
    x: a.x + ux * along - uz * TARGET.laneOffset,
    z: a.z + uz * along + ux * TARGET.laneOffset,
  };
}

// Where to place the target at the start: a road segment 40-60 m from the
// player, preferably ahead of him, clear of solids; it starts driving away.
// (CITY CHAOS: a replacement target spawns further out, off screen:
// opts { min, max, hidden(point) }.)
export function createTarget(sim, opts = {}) {
  useNet(sim);
  const dMin = opts.min ?? 45, dMax = opts.max ?? 62;
  const p = sim.player,
    f = fwd(p.angle);
  const segs = [];
  const junctions = NET ? [...NET.nodes.values()] : LINES.flatMap((x) => LINES.map((z) => ({ x, z })));
  for (const { x, z, id } of junctions)
      for (const nb of neighboursOf(NET ? NET.nodes.get(id) : { x, z })) {
        const mid = { x: (x + nb.x) / 2, z: (z + nb.z) / 2 };
        const d = Math.hypot(mid.x - p.x, mid.z - p.z);
        if (d < dMin || d > dMax) continue;
        const ahead = ((mid.x - p.x) * f.x + (mid.z - p.z) * f.z) / d;
        // Leaving away from the player (it has a head start).
        const away = Math.hypot(nb.x - p.x, nb.z - p.z) > Math.hypot(x - p.x, z - p.z);
        if (!away) continue;
        segs.push({ from: NET ? NET.nodes.get(id) : { x, z }, to: nb, score: ahead + sim.random() * 0.6 });
      }
  segs.sort((a, b) => b.score - a.score);
  let pick = segs[0];
  if (!pick) return null;
  for (const s of segs) {
    const pos = lanePoint(s.from, s.to, segLength(s.from, s.to) / 2);
    if (sim.navigation.allowed(pos) && !sim.nearSolids(pos.x, pos.z, 2).length && (!opts.hidden || opts.hidden(pos))) {
      pick = s;
      break;
    }
  }
  const pos = lanePoint(pick.from, pick.to, segLength(pick.from, pick.to) / 2);
  return {
    x: pos.x,
    z: pos.z,
    angle: headingTo(pick.from.x, pick.from.z, pick.to.x, pick.to.z),
    // Already rolling when the mission starts (no standing start).
    vx: 0,
    vz: 0,
    speed: TARGET.cruise,
    health: TARGET.health,
    state: "waiting", // waiting | fleeing | wrecked
    from: pick.from,
    to: pick.to,
    next: null,
    visited: [key(pick.from)],
    surge: 0,
    blocked: new Map(), // road -> until (found blocked: a fallen tree, a wreck)
    detour: [], // waypoints back to the road after backing out
    reverse: 0,
    lastHitAt: -10,
    hits: 0,
    damageTaken: 0,
    biggestHit: 0,
    turns: 0,
    stuckFor: 0,
    replans: 0,
    anchor: { x: pos.x, z: pos.z, at: 0 },
    wreckedAt: null,
  };
}

// The next junction after `cur`, coming from `prev`.
function chooseNext(sim, t, cur, prev) {
  const p = sim.player;
  const open = (n) => !((t.blocked.get(segKey(cur, n)) ?? -1) > sim.elapsed);
  let options = neighboursOf(cur).filter((n) => (!prev || key(n) !== key(prev)) && open(n));
  if (!options.length) options = neighboursOf(cur).filter(open);
  if (!options.length) options = neighboursOf(cur);
  const toPlayer = { x: p.x - cur.x, z: p.z - cur.z };
  const dp = Math.hypot(toPlayer.x, toPlayer.z) || 1;
  const straight = prev ? { x: cur.x - prev.x, z: cur.z - prev.z } : null;
  const scored = [];
  for (const n of options) {
    const dx = n.x - cur.x, dz = n.z - cur.z;
    // Away from the player (the far end's distance), never straight at him.
    let s = Math.hypot(n.x - p.x, n.z - p.z) * 0.9;
    s -= Math.max(0, (dx * toPlayer.x + dz * toPlayer.z) / ((Math.hypot(dx, dz) || 1) * dp)) * 28;
    // Recently visited junctions are avoided (no loops).
    const seen = t.visited.filter((k) => k === key(n)).length;
    s -= seen * 30;
    // Mostly keeps going, but turns are fine (no long predictable runs).
    if (straight && dx * straight.x + dz * straight.z > 0) s += 5;
    // Not into the map's edge corners (fewer ways out there).
    if (Math.abs(n.x) === 90 && Math.abs(n.z) === 90) s -= 12;
    s += sim.random() * 22; // not predictable
    scored.push({ n, s });
  }
  scored.sort((a, b) => b.s - a.s);
  // Now and then a juke: the second-best way when it is nearly as good.
  if (scored.length > 1 && scored[0].s - scored[1].s < 25 && sim.random() < 0.3) return scored[1].n;
  return scored[0].n;
}

export function updateTarget(sim, dt) {
  const t = sim.target;
  if (!t || t.state === "wrecked") return;
  useNet(sim);
  if (t.state === "waiting") {
    if (!sim.started) return;
    t.state = "fleeing";
    t.anchor = { x: t.x, z: t.z, at: sim.elapsed };
  }
  // Plan one junction ahead so the corner can be taken smoothly.
  const toTo = Math.hypot(t.to.x - t.x, t.to.z - t.z);
  // (Not while it is still finding its way back onto the road.)
  const detouring = t.detour.length > 0;
  if (!detouring && !t.next && toTo < 26) t.next = chooseNext(sim, t, t.to, t.from);
  // Progress along the next road (from the junction), once it is chosen.
  const seg = { x: t.to.x - t.from.x, z: t.to.z - t.from.z };
  const segLen = Math.hypot(seg.x, seg.z) || 1;
  const past = ((t.x - t.to.x) * seg.x + (t.z - t.to.z) * seg.z) / (NET ? segLen * segLen / SPACING : SPACING);
  let into = -Infinity;
  if (t.next) {
    const nl = NET ? Math.hypot(t.next.x - t.to.x, t.next.z - t.to.z) || 1 : SPACING;
    const nx = (t.next.x - t.to.x) / nl, nz = (t.next.z - t.to.z) / nl;
    into = (t.x - t.to.x) * nx + (t.z - t.to.z) * nz;
  }
  // Reached the junction (onto the next road, or past it going straight):
  // move on.
  if (!detouring && t.next && ((into > 3.5 && toTo < 12) || past > -0.2 || toTo < 2)) {
    const turned = (t.next.x - t.to.x) * seg.x + (t.next.z - t.to.z) * seg.z <= 0;
    if (turned) t.turns++;
    t.from = t.to;
    t.to = t.next;
    t.next = null;
    t.visited.push(key(t.from));
    if (t.visited.length > TARGET.memory) t.visited.shift();
  }
  // Steering: aim along the lane ahead; near a junction where it turns,
  // aim into the next road, the aim sliding along it as the car comes
  // round, so it arcs through the corner.
  const d = Math.hypot(t.to.x - t.x, t.to.z - t.z);
  const turning =
    t.next && (t.next.x - t.to.x) * (t.to.x - t.from.x) + (t.next.z - t.to.z) * (t.to.z - t.from.z) <= 0;
  let aim;
  // Back to the road along a route after backing out of a stall.
  while (t.detour.length && Math.hypot(t.detour[0].x - t.x, t.detour[0].z - t.z) < 3) t.detour.shift();
  if (t.detour.length) aim = t.detour[0];
  else if (t.next && d < 10) {
    const nl = NET ? Math.hypot(t.next.x - t.to.x, t.next.z - t.to.z) || 1 : SPACING;
    const nx = (t.next.x - t.to.x) / nl, nz = (t.next.z - t.to.z) / nl;
    const along = Math.max(0, (t.x - t.to.x) * nx + (t.z - t.to.z) * nz);
    aim = lanePoint(t.to, t.next, along + 8);
  } else {
    const L = segLength(t.from, t.to);
    aim = lanePoint(t.from, t.to, clamp(progress(t.from, t.to, t.x, t.z) + 9, 0, L));
  }
  let want = headingTo(t.x, t.z, aim.x, aim.z);
  if (t.reverse > 0) {
    // Backing out of a stall: reverse with the wheels turned to the aim.
    t.reverse -= dt;
    const back = angleDelta(want, t.angle);
    t.angle -= clamp(back, -TARGET.turnRate * dt, TARGET.turnRate * dt) * 0.8;
    t.speed = Math.max(-5, t.speed - TARGET.brake * dt);
  } else {
    const turn = angleDelta(want, t.angle);
    t.angle += clamp(turn, -TARGET.turnRate * dt, TARGET.turnRate * dt);
    let target = TARGET.cruise;
    if (turning && d < 16) target = TARGET.corner;
    if (Math.abs(turn) > 0.5) target = Math.min(target, TARGET.corner);
    if (t.surge > 0) {
      t.surge -= dt;
      target += TARGET.surge;
    }
    const rate = target > t.speed ? TARGET.accel : TARGET.brake;
    t.speed += clamp(target - t.speed, -rate * dt, rate * dt);
  }
  // Up a ramp only when its road is the elevated one.
  t.noRamp = !(NET && t.from.foot && t.to.foot);
  // Move: velocity eases to the heading (a shove from a hit dies away).
  const f = fwd(t.angle);
  const grip = 1 - Math.exp(-6 * dt);
  t.vx += (f.x * t.speed - t.vx) * grip;
  t.vz += (f.z * t.speed - t.vz) * grip;
  if (sim.move(t, dt, TARGET.radius)) t.speed *= 0.7;
  // Stalled (pressed into something, or hit into a corner): back out,
  // then re-plan from the nearest junction.
  if (Math.hypot(t.x - t.anchor.x, t.z - t.anchor.z) > 3) t.anchor = { x: t.x, z: t.z, at: sim.elapsed };
  else if (sim.elapsed - t.anchor.at > 1.6 && t.reverse <= 0) {
    t.reverse = 0.9;
    t.replans++;
    // That road is blocked for a while: take another, and get back onto
    // the roads along a real route (round benches, wrecks, fallen trees).
    t.blocked.set(segKey(t.from, t.to), sim.elapsed + 25);
    t.blocked.set(segKey(t.to, t.from), sim.elapsed + 25);
    const here = nearestOf(t.x, t.z);
    t.from = here;
    t.to = chooseNext(sim, t, here, null);
    t.next = null;
    const back = lanePoint(t.from, t.to, 6);
    t.detour = sim.navigation.findPath(t, back, TARGET.radius).slice(1);
    t.detour.push(back);
    t.anchor = { x: t.x, z: t.z, at: sim.elapsed };
  }
  // Civilian cars in the way get shoved (it does not stop for them).
  for (const c of sim.city?.traffic || []) {
    const dx = c.x - t.x, dz = c.z - t.z, dist = Math.hypot(dx, dz);
    if (dist > 2.5 || dist < 1e-6) continue;
    const push = (2.5 - dist) / 2;
    c.x += (dx / dist) * push;
    c.z += (dz / dist) * push;
    t.x -= (dx / dist) * push * 0.4;
    t.z -= (dz / dist) * push * 0.4;
  }
}

// The player rams the target: box contact, damage by closing speed.
export function resolveTargetContact(sim) {
  const t = sim.target,
    p = sim.player;
  if (!t || t.state !== "fleeing" || (t.level || 0) !== (p.level || 0)) return 0;
  const contact = policeContact(p, t);
  if (!contact) return 0;
  const { x: nx, z: nz, depth } = contact;
  // Separate (the target is a little lighter than the player's car).
  p.x -= nx * depth * 0.45;
  p.z -= nz * depth * 0.45;
  t.x += nx * depth * 0.55;
  t.z += nz * depth * 0.55;
  const closing = (p.vx - t.vx) * nx + (p.vz - t.vz) * nz;
  if (closing <= 0) return 0;
  // Momentum: the player loses some, the target is shoved along the hit.
  p.vx -= nx * closing * 0.55;
  p.vz -= nz * closing * 0.55;
  t.vx += nx * closing * 0.75;
  t.vz += nz * closing * 0.75;
  if (closing < TARGET.minHit || sim.elapsed - t.lastHitAt < TARGET.hitCooldown) return 0;
  t.lastHitAt = sim.elapsed;
  // Proportional to impact severity: a rear-end bump ~5-12, a hard ram
  // 20-30, a T-bone at full speed up to 34.
  // (A car with more impact power takes it down in fewer hits.)
  // CITY CHAOS: the target is the coin carrier: it cannot be destroyed;
  // every hit throws coins out round it. (TARGET HUNT: taking it down is
  // the mission, so there it takes damage as before.)
  const carrier = !!sim.chaos;
  const damage = carrier ? 0 : clamp((closing - 2) * 3.2, 2, 34) * Math.sqrt(sim.vehicle?.stats.impact || 1);
  t.health = Math.max(0, t.health - damage);
  if (carrier) spillCoins(sim, t.x, t.z, SPILL.count);
  t.hits++;
  t.damageTaken += damage;
  t.biggestHit = Math.max(t.biggestHit, closing);
  // Knocked about (its speed drops with the hit), then it floors it.
  t.speed *= clamp(1 - closing * 0.03, 0.5, 0.9);
  t.surge = TARGET.surgeTime;
  sim.recordImpact?.(p, closing, "player-target");
  sim.events.push({ id: ++sim.eventId, type: "targetHit", x: (p.x + t.x) / 2, z: (p.z + t.z) / 2, strength: closing, damage, time: sim.elapsed });
  if (sim.events.length > 64) sim.events.shift();
  if (t.health <= 0) takedown(sim);
  return closing;
}

function takedown(sim) {
  const t = sim.target;
  t.state = "wrecked";
  t.wreckedAt = sim.elapsed;
  t.speed = 0;
  sim.events.push({
    id: ++sim.eventId,
    type: "explosion",
    cause: "target",
    x: t.x,
    z: t.z,
    angle: t.angle,
    time: sim.elapsed,
    delay: 0,
    chainDepth: 2,
    playerX: sim.player.x,
    playerZ: sim.player.z,
  });
  if (sim.events.length > 64) sim.events.shift();
  // The burnt-out shell stays where it stopped.
  addWreck(sim, t);
}
