import { CONFIG } from "./config.js";
import { clearSegment } from "./navigation.js";

// V1.8 roadblocks. The simulation predicts the road the player is fleeing
// along, picks a point mid-block ahead of it and sends one or two officers
// that can get there first. They approach, brake, stop across the road and
// hold still until the player gets past or turns off, then rejoin the chase.
const SPACING = CONFIG.spacing;

// A road as a line: unit direction u, unit normal n, its offset `center`
// (= n . any point on it) and the player's direction along u. The grid's
// roads are the axis-aligned case (axis "x": u = +x, n = +z).
const GRID_U = { x: { u: { x: 1, z: 0 }, n: { x: 0, z: 1 } }, z: { u: { x: 0, z: 1 }, n: { x: 1, z: 0 } } };
const uOf = (road) => road.u ?? GRID_U[road.axis].u;
const nOf = (road) => road.n ?? GRID_U[road.axis].n;
const across = (road, q) => q.x * nOf(road).x + q.z * nOf(road).z;

// The straight road the player is on, if any: axis "x" means driving along x.
// V2.1 generated city (sim given): a straight street of the road graph.
export function playerRoad(player, sim = null) {
  const fx = -Math.sin(player.angle),
    fz = -Math.cos(player.angle);
  if (sim?.layout?.graph) return graphRoad(player, sim.layout.graph, fx, fz);
  const axis = Math.abs(fx) >= Math.abs(fz) ? "x" : "z";
  const along = axis === "x" ? fx : fz;
  // Only commit while the heading is clearly along the road.
  if (Math.abs(along) < 0.85) return null;
  const across = axis === "x" ? player.z : player.x;
  const center = Math.round(across / SPACING) * SPACING || 0; // no -0
  if (Math.abs(across - center) > CONFIG.roadWidth / 2) return null;
  return { axis, dir: Math.sign(along), center, ...GRID_U[axis] };
}
function graphRoad(player, graph, fx, fz) {
  for (const e of graph.edges) {
    if (e.kind !== "road" || e.pts.length !== 2) continue;
    const a = e.pts[0], b = e.pts[1], L = Math.hypot(b.x - a.x, b.z - a.z);
    const ux = (b.x - a.x) / L, uz = (b.z - a.z) / L;
    const al = fx * ux + fz * uz;
    if (Math.abs(al) < 0.85) continue;
    const t = (player.x - a.x) * ux + (player.z - a.z) * uz;
    if (t < 0 || t > L) continue;
    const n = { x: -uz, z: ux }, center = a.x * n.x + a.z * n.z;
    if (Math.abs(player.x * n.x + player.z * n.z - center) > e.width / 2) continue;
    const s0 = a.x * ux + a.z * uz;
    return { key: `e${e.id}`, edge: e.id, u: { x: ux, z: uz }, n, center, dir: Math.sign(al), s0, s1: s0 + L, width: e.width };
  }
  return null;
}

const pointOn = (road, s, o = road.center) => ({
  x: uOf(road).x * s + nOf(road).x * o,
  z: uOf(road).z * s + nOf(road).z * o,
});
const coordOf = (road, p) => p.x * uOf(road).x + p.z * uOf(road).z;

// Car heading that faces across the road (perpendicular to travel).
export function acrossAngle(road) {
  return Math.atan2(nOf(road).x, nOf(road).z);
}

// Cars parked across the road, spaced so every gap (kerb, between cars,
// kerb) is equal over the road's real drivable width [lo, hi].
export function slotPositions(road, s, lo, hi, count) {
  const length = 3.6,
    gap = Math.max(0, (hi - lo - count * length) / (count + 1));
  return Array.from({ length: count }, (_, i) => {
    const o = lo + gap * (i + 1) + length * i + length / 2;
    const p = pointOn(road, s, o);
    return { ...p, angle: acrossAngle(road) };
  });
}

// Fewest cars whose gaps are all narrower than the player car can pass.
export function carsToSeal(width) {
  for (let n = 2; n <= CONFIG.blockMaxCars; n++)
    if ((width - 3.6 * n) / (n + 1) <= CONFIG.blockMaxGap) return n;
  return null;
}

// How far the drivable surface really reaches either side of the road
// centre at this point (kerbs, open plazas and the outer edge differ).
// Widths only change when the solids do (wrecks, barricades), which bumps
// the navigation revision, so they are cached per revision.
const extentCache = new WeakMap();
export function roadExtent(sim, road, point, reach = 9) {
  let cache = extentCache.get(sim.navigation);
  if (!cache || cache.revision !== sim.navigation.revision) {
    cache = { revision: sim.navigation.revision, map: new Map() };
    extentCache.set(sim.navigation, cache);
  }
  const key = `${road.key ?? road.axis}:${road.center}:${Math.round(coordOf(road, point) * 2)}:${reach}`;
  if (!cache.map.has(key))
    cache.map.set(key, measureExtent(sim, road, point, reach));
  return cache.map.get(key);
}
function measureExtent(sim, road, point, reach) {
  const probe = (o) => {
    const q = pointOn(road, coordOf(road, point), road.center + o);
    return sim.navigation.allowed(q) && clearSegment(q, q, sim.solids, 0.02);
  };
  // Take the outermost free point on each side, not the first obstacle: a
  // bench or lamp post on the pavement can be driven round on its far side.
  let lo = 0,
    hi = 0;
  for (let o = 0.1; o <= reach; o += 0.1) {
    if (probe(-o)) lo = -o;
    if (probe(o)) hi = o;
  }
  return { lo: road.center + lo, hi: road.center + hi, width: hi - lo };
}

// Mid-block points ahead of the player that two cars can seal and that the
// player can actually reach on this road.
export function* blockCandidates(sim, road) {
  const p = sim.player,
    start = coordOf(road, p);
  for (let d = CONFIG.blockMinAhead; d <= CONFIG.blockMaxAhead; d += 2) {
    const s = start + road.dir * d;
    // Keep out of intersections so the block actually seals the road.
    if (road.s0 != null) {
      if (s < road.s0 + 9 || s > road.s1 - 9) continue;
    } else {
      const phase = ((s % SPACING) + SPACING) % SPACING;
      if (phase < 9 || phase > SPACING - 9) continue;
    }
    const point = pointOn(road, s);
    if (!sim.navigation.allowed(point)) continue;
    const extent = roadExtent(sim, road, point);
    // Every gap must be narrower than the 2.1-wide player car, or the block
    // cannot seal: skip spots too wide for the cars we can spare.
    const count = carsToSeal(extent.width);
    if (!count) continue;
    if (!sim.navigation.clear(p, point, 1)) continue;
    yield { s, d, point, count, ...extent };
  }
}

// Cars drive the street grid and slow for corners, so estimate arrival from
// the Manhattan distance at a realistic average speed.
function eta(car, slot) {
  const dx = Math.abs(car.x - slot.x),
    dz = Math.abs(car.z - slot.z);
  // Getting up to speed from a slow start, plus a corner when the trip is not
  // along a single street, plus braking to a stop on the slot.
  const start = Math.max(0, 1 - Math.hypot(car.vx, car.vz) / 20) * 0.4;
  const corner = Math.min(dx, dz) > 4 ? 0.3 : 0;
  return (dx + dz) / (CONFIG.frontSprintSpeed * 0.85) + start + corner + 0.25;
}

// An officer ahead of the player on its road, going the same way.
function aheadBlock(sim, road, active, nearest, pace) {
  const p = sim.player,
    start = coordOf(road, p);
  const ahead = active
    .filter((c) => {
      const along = (coordOf(road, c) - start) * road.dir,
        acr = across(road, c),
        heading =
          ((c.vx * uOf(road).x + c.vz * uOf(road).z) * road.dir) /
          (Math.hypot(c.vx, c.vz) || 1);
      return (
        along > 10 &&
        along < 70 &&
        Math.abs(acr - road.center) < (road.width ?? CONFIG.roadWidth) / 2 + 1 &&
        heading > 0.5
      );
    })
    .sort((a, b) => coordOf(road, a) * road.dir - coordOf(road, b) * road.dir);
  const lead = ahead[0];
  if (!lead) return null;
  // Where it can actually stop: its braking distance further on, but never
  // closer to the player than 14.
  const speed = Math.hypot(lead.vx, lead.vz);
  const stop = (speed * speed) / (2 * CONFIG.blockDecel);
  const along = Math.max((coordOf(road, lead) - start) * road.dir + stop, 14);
  const s = start + road.dir * along;
  const point = pointOn(road, s);
  if (!sim.navigation.allowed(point)) return null;
  const extent = roadExtent(sim, road, point);
  const count = carsToSeal(extent.width) ?? CONFIG.blockMaxCars;
  const spots = slotPositions(road, s, extent.lo, extent.hi, count);
  const playerEta = along / pace;
  const helpers = active
    .filter((c) => c !== lead && c !== nearest)
    .map((c) => ({ c, t: Math.min(...spots.map((q) => eta(c, q))) }))
    .filter((e) => e.t < playerEta + CONFIG.blockEtaSlack)
    .sort((a, b) => a.t - b.t)
    .slice(0, count - 1)
    .map((e) => e.c);
  const cars = [lead, ...helpers];
  // Fewer cars than the road needs: spread them evenly over its width; the
  // player can still try to squeeze past or ram through.
  const slots =
    cars.length === count
      ? spots
      : slotPositions(road, s, extent.lo, extent.hi, cars.length);
  const lateral = (q) => across(road, q);
  return {
    found: {
      s,
      d: along,
      point,
      count,
      partial: cars.length < count,
      ...extent,
    },
    slots,
    chosen: cars.sort((a, b) => lateral(a) - lateral(b)),
  };
}

export function releaseRoadblock(sim, reason) {
  const block = sim.roadblock;
  if (!block) return;
  const members = sim.police.filter((c) => c.blockId === block.id);
  const holding = members.filter((c) => c.blockState === "hold").length;
  for (const car of sim.police)
    if (car.blockId === block.id) {
      car.blockId = null;
      car.blockSlot = null;
      car.blockState = null;
      car.route = [];
      car.routeTimer = 0;
    }
  sim.roadblockEvents.push({
    id: block.id,
    type: "release",
    reason,
    time: sim.elapsed,
    held: block.heldAt === null ? 0 : sim.elapsed - block.heldAt,
    members: members.length,
    holding,
  });
  sim.roadblock = null;
  sim.roadblockCooldownUntil = sim.elapsed + CONFIG.blockCooldown;
}

export function updateRoadblock(sim, dt) {
  const p = sim.player,
    block = sim.roadblock;
  if (block) {
    const members = sim.police.filter(
      (c) => c.blockId === block.id && c.state === "active",
    );
    if (!members.length) return releaseRoadblock(sim, "members-lost");
    const road = block.road;
    // Signed distance from the player to the block along the road.
    const ahead = (block.s - coordOf(road, p)) * road.dir;
    const offRoad = Math.abs(across(road, p) - road.center) > (road.width ?? CONFIG.roadWidth) / 2 + 1;
    const heading = playerRoad(p, sim);
    const sameRoad =
      heading &&
      (heading.key ?? heading.axis) === (road.key ?? road.axis) &&
      heading.center === road.center &&
      heading.dir === road.dir;
    // Scraping along the block while pinned against it changes the player's
    // heading; that is not turning off, so only count it away from the block.
    const atBlock = Math.hypot(block.x - p.x, block.z - p.z) < 10;
    block.lostFor =
      !atBlock && (offRoad || (!sameRoad && Math.hypot(p.vx, p.vz) > 6))
        ? block.lostFor + dt
        : 0;
    if (atBlock) block.engaged = true;
    if (members.every((c) => c.blockState === "hold") && block.heldAt === null)
      block.heldAt = sim.elapsed;
    // Got past the block: escaped through or around it.
    if (ahead < -3) return releaseRoadblock(sim, "player-passed");
    // Backed off and got away from a block it ran into: chase again.
    if (block.engaged && Math.hypot(block.x - p.x, block.z - p.z) > 18)
      return releaseRoadblock(sim, "player-escaped");
    // Turned off onto another road: the block no longer matters.
    if (block.lostFor > CONFIG.blockLostSeconds)
      return releaseRoadblock(sim, "player-turned");
    if (sim.elapsed - block.born > CONFIG.blockMaxSeconds && ahead > 12)
      return releaseRoadblock(sim, "timeout");
    return;
  }
  if (sim.elapsed < (sim.roadblockCooldownUntil || 0)) return;
  // Planning is a search, so it runs four times a second, not every frame.
  if (sim.elapsed < (sim.roadblockCheckAt || 0)) return;
  sim.roadblockCheckAt = sim.elapsed + 0.25;
  // Only against a car that is really driving away, never while a cordon
  // forms.
  if (
    (p.netSpeed ?? 0) < 13 ||
    p.contained ||
    p.cordonCandidate ||
    p.cordonActive
  )
    return;
  const road = playerRoad(p, sim);
  if (!road) return;
  const active = sim.police.filter(
    (c) => c.state === "active" && c.mode !== "contain" && !c.blockId,
  );
  if (!active.length) return;
  // A planned (full) block waits until the chase is under way; an officer
  // already ahead of the player on its road blocks straight away.
  const planFull =
    sim.elapsed >= 1 && (p.fleeSpeed ?? 0) >= 13 && active.length >= 3;
  // Never the officer tailing the player: it keeps the rear pressure.
  const nearest = [...active].sort(
    (a, b) =>
      Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
  )[0];
  const pace = Math.max(12, p.groundSpeed || 24);
  // The nearest spot ahead where enough officers can arrive before the
  // player does: further down the road if the near ones are out of reach.
  let found = null,
    slots = null,
    chosen = null;
  for (const candidate of planFull ? blockCandidates(sim, road) : []) {
    const spots = slotPositions(
      road,
      candidate.s,
      candidate.lo,
      candidate.hi,
      candidate.count,
    );
    const playerEta = candidate.d / pace;
    const able = active
      .filter((c) => c !== nearest)
      .map((c) => ({ c, t: Math.min(...spots.map((q) => eta(c, q))) }))
      .filter((e) => e.t < playerEta + CONFIG.blockEtaSlack)
      .sort((a, b) => a.t - b.t);
    if (able.length < candidate.count) continue;
    // Hand out the slots in order across the road, matching the officers'
    // own order across it, so their paths to the slots do not cross.
    const lateral = (q) => across(road, q);
    found = candidate;
    slots = spots;
    chosen = able
      .slice(0, candidate.count)
      .map((e) => e.c)
      .sort((a, b) => lateral(a) - lateral(b));
    break;
  }
  // No full block in reach, but an officer is already driving ahead of the
  // player on this road: it must not just keep driving ahead. It brakes to a
  // stop across the road where it can, and whoever can get there in time
  // joins it to close the rest.
  if (!found) {
    const emergency = aheadBlock(sim, road, active, nearest, pace);
    if (!emergency) return;
    ({ found, slots, chosen } = emergency);
  }
  const id = (sim.roadblockId = (sim.roadblockId || 0) + 1);
  sim.roadblock = {
    id,
    road,
    s: found.s,
    x: found.point.x,
    z: found.point.z,
    slots,
    born: sim.elapsed,
    heldAt: null,
    lostFor: 0,
    engaged: false,
  };
  chosen.forEach((c, i) => {
    c.blockId = id;
    c.blockKind = "roadblock";
    c.blockSlot = slots[i];
    c.blockState = "approach";
    c.route = [];
    c.routeTimer = 0;
  });
  sim.roadblockEvents.push({
    id,
    type: "plan",
    time: sim.elapsed,
    x: found.point.x,
    z: found.point.z,
    cars: chosen.map((c) => c.id),
    ahead: found.d,
    partial: !!found.partial,
  });
}
