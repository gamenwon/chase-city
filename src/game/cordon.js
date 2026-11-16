import { CONFIG, clamp } from "./config.js";

// V1.8 police cordon. When the player is slowed or stopped (typically nose
// into a wall), the simulation works out which directions it could still
// drive out in, parks police cars broadside across exactly those directions,
// and only calls the cordon complete when no gap wide enough for the player's
// car is left. Cars brake to a stop on their slots and hold position; walls
// count as part of the cordon. Officers then get out and cover the player.

export const RING = 3.5; // distance of a cordon car's centre from the player
const RAY_REACH = 5.5; // a gap this deep counts as a way out
const PLAYER_HALF_WIDTH = 1.05;
// Against walls and buildings the physics keeps the player's centre
// CONFIG.radius away (wider than the body), so alleys narrower than that
// are not a way out.
const WALL_RADIUS = CONFIG.radius;
const CAR_HALF = { w: 1.05, l: 1.8 };

// Circle-vs-box tests for the escape rays.
function hitsBox(q, r, b) {
  const dx = Math.max(Math.abs(q.x - b.x) - b.w / 2, 0),
    dz = Math.max(Math.abs(q.z - b.z) - b.d / 2, 0);
  return dx * dx + dz * dz < r * r;
}
export function hitsCar(q, r, car) {
  const rx = Math.cos(car.angle),
    rz = -Math.sin(car.angle),
    fx = -Math.sin(car.angle),
    fz = -Math.cos(car.angle);
  const ox = q.x - car.x,
    oz = q.z - car.z;
  const lx = Math.max(Math.abs(ox * rx + oz * rz) - CAR_HALF.w, 0),
    lz = Math.max(Math.abs(ox * fx + oz * fz) - CAR_HALF.l, 0);
  return lx * lx + lz * lz < r * r;
}

// How far the player's car (as a circle of its half-width) can travel from
// `from` in direction `angle` before touching a wall, the world edge or one of
// the given cars.
export function freeDistance(sim, from, angle, cars, reach = RAY_REACH + 1) {
  const ux = Math.cos(angle),
    uz = Math.sin(angle);
  const near = sim.solids.filter(
    (b) =>
      Math.abs(b.x - from.x) < b.w / 2 + reach + 2 &&
      Math.abs(b.z - from.z) < b.d / 2 + reach + 2,
  );
  for (let s = 0.25; s <= reach; s += 0.25) {
    const q = { x: from.x + ux * s, z: from.z + uz * s };
    if (!sim.navigation.allowed(q)) return s;
    if (near.some((b) => hitsBox(q, WALL_RADIUS, b))) return s;
    if (cars.some((c) => hitsCar(q, PLAYER_HALF_WIDTH, c))) return s;
  }
  return reach;
}

// Is there any path out of the cordon a car can use, straight or not (pivot
// on the spot, then thread diagonally between two car corners)? Flood fill
// of the free space for the player's car as a circle of (nearly) its
// half-width, from where it stands to OUT metres away. Walls, buildings, the
// map edge and the given (parked) cars block. Returns the direction (radians)
// the way out leaves in, or null when there is none.
const FLOOD_CELL = 0.2;
const FLOOD_OUT = 7.5;
const FLOOD_RADIUS = PLAYER_HALF_WIDTH - 0.04; // grid slack, not a smaller car
// With `atRadius`, the direction returned is where that way out crosses the
// circle of that radius (where a cordon car would have to stand to close it).
export function floodEscape(sim, from, cars, atRadius = null) {
  const n = Math.ceil(FLOOD_OUT / FLOOD_CELL);
  const size = 2 * n + 1;
  const near = sim.solids.filter(
    (b) =>
      Math.abs(b.x - from.x) < b.w / 2 + FLOOD_OUT + 2 &&
      Math.abs(b.z - from.z) < b.d / 2 + FLOOD_OUT + 2,
  );
  const state = new Uint8Array(size * size); // 0 unknown, 1 free, 2 blocked
  const point = (i, j) => ({
    x: from.x + (i - n) * FLOOD_CELL,
    z: from.z + (j - n) * FLOOD_CELL,
  });
  const free = (i, j) => {
    const k = j * size + i;
    if (!state[k]) {
      const q = point(i, j);
      state[k] =
        !sim.navigation.allowed(q) ||
        near.some((b) => hitsBox(q, WALL_RADIUS - 0.04, b)) ||
        cars.some((c) => hitsCar(q, FLOOD_RADIUS, c))
          ? 2
          : 1;
    }
    return state[k] === 1;
  };
  // Start from every free cell under the car itself (a pinned car's own
  // centre may touch the car it is pressed against).
  const queue = [];
  const seen = new Uint8Array(size * size);
  const parent = new Int32Array(size * size).fill(-1);
  const reach = Math.ceil(1.2 / FLOOD_CELL);
  for (let j = n - reach; j <= n + reach; j++)
    for (let i = n - reach; i <= n + reach; i++)
      if (Math.hypot(i - n, j - n) * FLOOD_CELL <= 1.2 && free(i, j)) {
        seen[j * size + i] = 1;
        queue.push(j * size + i);
      }
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head],
      i = k % size,
      j = (k - i) / size;
    if (Math.hypot(i - n, j - n) * FLOOD_CELL >= FLOOD_OUT) {
      if (atRadius === null) return Math.atan2(j - n, i - n);
      // Walk back along the path to where it crosses atRadius.
      let c = k;
      while (parent[c] >= 0) {
        const pi = parent[c] % size,
          pj = (parent[c] - pi) / size;
        if (Math.hypot(pi - n, pj - n) * FLOOD_CELL < atRadius) break;
        c = parent[c];
      }
      const ci = c % size;
      return Math.atan2((c - ci) / size - n, ci - n);
    }
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const a = i + di,
        b = j + dj;
      if (a < 0 || b < 0 || a >= size || b >= size) continue;
      const m = b * size + a;
      if (seen[m]) continue;
      seen[m] = 1;
      if (free(a, b)) {
        parent[m] = k;
        queue.push(m);
      }
    }
  }
  return null;
}

// Directions (radians) in which the player could still drive out.
export function escapeDirections(sim, from, cars, steps = 36) {
  const open = [];
  for (let k = 0; k < steps; k++) {
    const a = (k / steps) * Math.PI * 2;
    if (freeDistance(sim, from, a, cars) >= RAY_REACH) open.push(a);
  }
  return open;
}

// Contiguous open arcs [start, end] (radians, end may exceed 2π).
function arcs(open, steps) {
  if (!open.length) return [];
  const step = (Math.PI * 2) / steps;
  if (open.length === steps) return [[0, Math.PI * 2 - step]];
  const idx = open.map((a) => Math.round(a / step));
  const set = new Set(idx);
  const out = [];
  for (const i of idx) {
    if (set.has((i - 1 + steps) % steps)) continue; // not an arc start
    let j = i;
    while (set.has((j + 1) % steps)) j++;
    out.push([i * step, j * step]);
  }
  return out;
}

// Car heading for a slot in direction `angle` from the player: broadside, so
// its 3.6-long body lies across that direction (forward is (-sin a, -cos a),
// which for a = PI - angle is perpendicular to (cos angle, sin angle)).
const broadside = (angle) => Math.PI - angle;

// A valid slot near direction `angle`: on the ring if possible, nudged
// toward `inward` (the open side) or out a little if the car would sit in a
// wall. Returns null when nothing fits.
function slotAt(
  sim,
  center,
  angle,
  inward = 0,
  radii = [RING, RING + 0.4, RING + 0.8, RING + 1.2],
  accept = null,
) {
  const deg = Math.PI / 180;
  // Nudge toward the open side (or either side when unknown); broadside is
  // best, but an angled or end-on car still closes a narrow gap.
  const turns = [0, 1, 2, 3, 4, 5, 6, 7].flatMap((k) =>
    inward ? [k * inward * 5 * deg] : k ? [k * 5 * deg, -k * 5 * deg] : [0],
  );
  const twists = [0, 45 * deg, -45 * deg, 90 * deg];
  for (const twist of twists)
    for (const turn of turns)
      for (const radius of radii) {
        const dir = angle + turn;
        const slot = {
          x: center.x + Math.cos(dir) * radius,
          z: center.z + Math.sin(dir) * radius,
          angle: broadside(dir) + twist,
          dir,
        };
        const corners = [
          [CAR_HALF.w, CAR_HALF.l],
          [-CAR_HALF.w, CAR_HALF.l],
          [CAR_HALF.w, -CAR_HALF.l],
          [-CAR_HALF.w, -CAR_HALF.l],
          [0, 0],
          [0, CAR_HALF.l],
          [0, -CAR_HALF.l],
        ].map(([w, l]) => ({
          x: slot.x + Math.cos(slot.angle) * w - Math.sin(slot.angle) * l,
          z: slot.z - Math.sin(slot.angle) * w - Math.cos(slot.angle) * l,
        }));
        // Walls must clear the whole body; the map edge, like the physics,
        // only the car's centre. Never on top of another police car.
        const inWall =
          !sim.navigation.allowed(slot) ||
          corners.some((q) => sim.solids.some((b) => hitsBox(q, 0.05, b))) ||
          sim.police.some(
            (c) =>
              c.state === "active" &&
              c.blockState === "hold" &&
              Math.hypot(c.x - slot.x, c.z - slot.z) < 3.2,
          );
        if (!inWall && (!accept || accept(slot))) return slot;
      }
  return null;
}

// Slots that close every open arc. A full circle gets cars evenly spaced; an
// arc that ends at walls gets a car hard against each end (so no gap is left
// between car and wall) and enough in between that the gap between two car
// ends is narrower than the player's car.
export function planSlots(sim, center, fixedCars = []) {
  const steps = 36;
  const open = escapeDirections(sim, center, fixedCars, steps);
  const spacing = 2 * Math.asin(Math.min(1, (CAR_HALF.l + 0.95) / RING));
  const step = (Math.PI * 2) / steps;
  const slots = [];
  for (const [start, end] of arcs(open, steps)) {
    const full = open.length === steps;
    if (full) {
      const count = Math.ceil((Math.PI * 2) / spacing - 1e-9);
      for (let i = 0; i < count; i++) {
        const slot = slotAt(sim, center, (i * Math.PI * 2) / count);
        if (slot) slots.push(slot);
      }
      continue;
    }
    const width = end - start;
    const count = Math.max(1, Math.ceil(width / spacing - 1e-9) + 1);
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      // The end cars sit at the arc's edge, toward the wall; if that overlaps
      // the wall they are turned in toward the open side.
      const angle = start + width * t;
      const inward = i === 0 ? 1 : i === count - 1 ? -1 : 0;
      const slot = slotAt(sim, center, angle, inward);
      if (slot) slots.push(slot);
    }
  }
  return slots;
}

function release(sim, reason) {
  const cordon = sim.cordon;
  if (!cordon) return;
  for (const c of sim.police)
    if (c.blockId === cordon.id) {
      c.blockId = null;
      c.blockSlot = null;
      c.blockState = null;
      c.route = [];
      c.routeTimer = 0;
    }
  sim.cordonEvents.push({
    id: cordon.id,
    type: "release",
    reason,
    time: sim.elapsed,
    sealedFor: cordon.sealedAt === null ? 0 : sim.elapsed - cordon.sealedAt,
  });
  sim.cordon = null;
  sim.cordonCooldownUntil = sim.elapsed + 1;
}

// A car the cordon may use: unassigned, already its own, or parked in a
// roadblock the player has already been stopped by but too far from the
// player to be part of the wall round it (its spot closes nothing).
function available(sim, cordon, c) {
  if (c.state !== "active") return false;
  if (!c.blockId || c.blockId === cordon.id) return true;
  return (
    !!sim.roadblock &&
    c.blockId === sim.roadblock.id &&
    c.blockState === "hold" &&
    Math.hypot(c.x - sim.player.x, c.z - sim.player.z) > RAY_REACH + 1
  );
}

function assign(sim, cordon, slots, keepParked = false) {
  const p = sim.player;
  // keepParked: this cordon's parked cars stay exactly where they are (they
  // are part of the wall); only the others are (re)assigned.
  const parked = keepParked
    ? sim.police.filter(
        (c) => c.blockId === cordon.id && c.blockState === "hold",
      )
    : [];
  const free = sim.police.filter(
    (c) =>
      !parked.includes(c) &&
      available(sim, cordon, c) &&
      Math.hypot(c.x - p.x, c.z - p.z) < CONFIG.cordonRecruitRange,
  );
  // Current members are reassigned from scratch, but one whose new slot is
  // (almost) where it already is keeps its slot and state (no twitching).
  const previous = new Map();
  for (const c of free)
    if (c.blockId === cordon.id) {
      previous.set(c, { slot: c.blockSlot, state: c.blockState });
      c.blockId = null;
      c.blockSlot = null;
      c.blockState = null;
    }
  // Slots the player is heading for matter most (it is sliding toward
  // them): they get the closest cars first, the rest nearest-first.
  const speed = Math.hypot(p.vx, p.vz);
  const urgency = (s) =>
    speed > 2 ? (Math.cos(s.dir) * p.vx + Math.sin(s.dir) * p.vz) / speed : 0;
  const ordered = [...slots].sort((a, b) => urgency(b) - urgency(a));
  const usedCars = new Set(),
    usedSlots = new Set();
  const plan = [];
  for (const s of ordered) {
    const c = free
      .filter((car) => !usedCars.has(car))
      .sort(
        (a, b) =>
          Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z),
      )[0];
    if (!c) break;
    usedCars.add(c);
    usedSlots.add(s);
    plan.push({ c, s });
  }
  for (const { c, s } of plan) {
    const before = previous.get(c);
    const keep =
      before?.slot &&
      Math.hypot(before.slot.x - s.x, before.slot.z - s.z) < 0.6;
    c.blockId = cordon.id;
    c.blockKind = "cordon";
    if (keep) {
      c.blockSlot = before.slot;
      c.blockState = before.state;
    } else {
      c.blockSlot = s;
      c.blockBest = Infinity;
      c.blockStall = 0;
      c.blockState = "approach";
      c.route = [];
      c.routeTimer = 0;
    }
  }
  cordon.slots = [...parked.map((c) => c.blockSlot), ...slots];
  cordon.unfilled = slots.filter((s) => !usedSlots.has(s)).length;
}

// Officers who got out, by car. Up to four, at least two.
function dismount(sim, cordon) {
  const p = sim.player;
  const held = sim.police
    .filter((c) => c.blockId === cordon.id && c.blockState === "hold")
    .sort(
      (a, b) =>
        Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
    );
  if (!held.length) return;
  const cars = held.slice(0, 4);
  const plan = cars.map((c) => [c, 1]);
  if (cars.length === 1) plan[0][1] = 2;
  let n = 0;
  for (const [car, count] of plan)
    for (let k = 0; k < count; k++) {
      // Out on the far side of the car and round to cover behind its body,
      // aiming across it at the player.
      const dx = p.x - car.x,
        dz = p.z - car.z,
        d = Math.hypot(dx, dz) || 1,
        ux = dx / d,
        uz = dz / d,
        tx = -uz,
        tz = ux,
        side = count === 2 ? (k ? 1 : -1) : n % 2 ? 1 : -1;
      sim.officers.push({
        id: ++sim.officerId,
        carId: car.id,
        cordonId: cordon.id,
        x: car.x - ux * 1.2 + tx * side * 0.6,
        z: car.z - uz * 1.2 + tz * side * 0.6,
        door: {
          x: car.x - ux * 1.2 + tx * side * 0.6,
          z: car.z - uz * 1.2 + tz * side * 0.6,
        },
        stance: {
          x: car.x - ux * 1.55 + tx * side * 1.15,
          z: car.z - uz * 1.55 + tz * side * 1.15,
        },
        angle: Math.atan2(-ux, -uz),
        state: "exit",
        delay: n * 0.18,
        role: n % 2 ? "scan" : "aim",
        t: 0,
      });
      n++;
    }
  cordon.dismountedAt = sim.elapsed;
}

function updateOfficers(sim, dt) {
  const p = sim.player;
  for (const o of sim.officers) {
    o.t += dt;
    if (o.t < o.delay) continue;
    const target = o.state === "return" ? o.door : o.stance;
    const dx = target.x - o.x,
      dz = target.z - o.z,
      d = Math.hypot(dx, dz);
    const speed = o.state === "return" ? 6 : 3.2;
    if (d > 0.02) {
      const step = Math.min(d, speed * dt);
      o.x += (dx / d) * step;
      o.z += (dz / d) * step;
      o.walking = true;
    } else o.walking = false;
    // Face where they are going, then the player once in position. Scanning
    // officers sweep their aim across the surroundings.
    const toPlayer = Math.atan2(-(p.x - o.x), -(p.z - o.z));
    if (o.state === "exit" && d < 0.05) o.state = "aim";
    if (o.state === "aim")
      o.angle = toPlayer + (o.role === "scan" ? Math.sin(o.t * 1.3) * 0.75 : 0);
    else if (d > 0.05) o.angle = Math.atan2(-dx, -dz);
  }
  sim.officers = sim.officers.filter(
    (o) =>
      !(
        o.state === "return" &&
        Math.hypot(o.door.x - o.x, o.door.z - o.z) < 0.05
      ),
  );
}

// Would these cars (with the walls) leave the player no way out at all,
// straight or crooked?
function sealedBy(sim, cars) {
  if (escapeDirections(sim, sim.player, cars).length) return false;
  return floodEscape(sim, sim.player, cars) === null;
}

// Is the player sealed in? Only cars parked in a cordon or roadblock slot
// count: they are braced and cannot be shoved aside, whereas a police car
// merely standing there can be pushed out of the way.
export function cordonSealed(sim) {
  return sealedBy(
    sim,
    sim.police.filter(
      (c) =>
        c.state === "active" &&
        c.blockState === "hold" &&
        Math.hypot(c.x - sim.player.x, c.z - sim.player.z) < 9,
    ),
  );
}

// A police car that has stopped right by the player joins the cordon where
// it stands and is braced there (parked), so it really is part of the wall.
const ADOPT_RANGE = 6.5;
function adoptStopped(sim, id) {
  const p = sim.player;
  const cars = sim.police.filter(
    (c) =>
      c.state === "active" &&
      !c.blockId &&
      Math.hypot(c.vx, c.vz) < 3 &&
      Math.hypot(c.x - p.x, c.z - p.z) < ADOPT_RANGE,
  );
  for (const c of cars) {
    c.blockId = id;
    c.blockKind = "cordon";
    c.blockSlot = { x: c.x, z: c.z, angle: c.angle, dir: 0 };
    c.blockState = "hold";
    c.blockBest = Infinity;
    c.blockStall = 0;
    c.vx = 0;
    c.vz = 0;
  }
  return cars;
}

// Where to centre the cordon: a player scraping along a wall is boxed in a
// little further along its slide, where it will be when the cars arrive.
function aimPoint(sim) {
  const p = sim.player,
    speed = Math.hypot(p.vx, p.vz);
  if (speed < 2) return { x: p.x, z: p.z };
  const angle = Math.atan2(p.vz, p.vx);
  const ahead = Math.min(
    8,
    speed * 1.2,
    freeDistance(sim, p, angle, [], 10) - 1,
  );
  return {
    x: p.x + Math.cos(angle) * Math.max(0, ahead),
    z: p.z + Math.sin(angle) * Math.max(0, ahead),
  };
}

export function updateCordon(sim, dt) {
  const p = sim.player;
  updateOfficers(sim, dt);
  for (const c of sim.police) if (c.cordonGaveUp > 0) c.cordonGaveUp -= dt;
  const cordon = sim.cordon;
  if (cordon) {
    const members = sim.police.filter(
      (c) => c.blockId === cordon.id && c.state === "active",
    );
    const away = Math.hypot(p.x - cordon.x, p.z - cordon.z);
    // The player drove out: officers back in the cars, then chase again.
    // A burst of speed while scraping round a corner is not an escape;
    // getting clear of the cordon is (sustained speed, or well away from it).
    cordon.fastFor =
      (p.netSpeed ?? 0) > 14 && !sim.enclosure.trapped
        ? (cordon.fastFor || 0) + dt
        : 0;
    const escaped = away > CONFIG.cordonEscapeDistance || cordon.fastFor > 0.8;
    if (escaped || !members.length) {
      if (!cordon.releasing) {
        cordon.releasing = true;
        cordon.releaseReason = members.length
          ? "player-escaped"
          : "members-lost";
        for (const o of sim.officers)
          if (o.cordonId === cordon.id) o.state = "return";
      }
      if (!sim.officers.some((o) => o.cordonId === cordon.id))
        release(sim, cordon.releaseReason);
      return;
    }
    // The player slid on along the wall before the cordon closed: plan again
    // around where it is now (cars whose slot hardly moves keep it).
    // (A player spinning its wheels against a wall is not sliding on: its
    // real ground movement decides, so no replan every frame.)
    const aim = aimPoint(sim);
    if (
      !sim.enclosure.trapped &&
      away > CONFIG.cordonReplanDistance &&
      (p.netSpeed ?? 0) > 1 &&
      // Only a car still scraping along slowly is followed; one driving off
      // faster than that is getting away (or the cordon would trail it for
      // ever and never let go).
      (p.netSpeed ?? 0) <= CONFIG.cordonStartSpeed
    ) {
      const center = aim;
      cordon.x = center.x;
      cordon.z = center.z;
      const fixed = sim.police.filter(
        (c) =>
          c.state === "active" &&
          c.blockState === "hold" &&
          c.blockId !== cordon.id,
      );
      assign(sim, cordon, planSlots(sim, center, fixed));
      cordon.replans = (cordon.replans || 0) + 1;
      return;
    }
    for (const c of adoptStopped(sim, cordon.id)) {
      members.push(c);
      cordon.slots.push(c.blockSlot);
    }
    const held = members.filter((c) => c.blockState === "hold");
    const allHeld = held.length === members.length;
    // Everyone parked, the player stopped, and still a way out: the slots
    // were planned while the player was moving (or before a roadblock had
    // settled). Plan again from what is really round it now.
    if (
      allHeld &&
      !sim.enclosure.trapped &&
      (p.groundSpeed ?? 0) < 1 &&
      sim.elapsed - (cordon.plannedAt ?? cordon.born) > 1.2 &&
      (cordon.reshapes || 0) < 2
    ) {
      cordon.plannedAt = sim.elapsed;
      cordon.reshapes = (cordon.reshapes || 0) + 1;
      cordon.x = p.x;
      cordon.z = p.z;
      // Every parked car (this cordon's too) stays put as part of the wall;
      // only the gaps left between them get new slots.
      const fixed = sim.police.filter(
        (c) => c.state === "active" && c.blockState === "hold",
      );
      const slots = planSlots(sim, p, fixed);
      if (slots.length) assign(sim, cordon, slots, true);
      return;
    }
    if (allHeld && cordon.heldAt === null) cordon.heldAt = sim.elapsed;
    const sealed = sim.enclosure.trapped;
    if (sealed && cordon.sealedAt === null) cordon.sealedAt = sim.elapsed;
    if (!sealed) cordon.sealedAt = null;
    // Sealed and the player has stopped: officers get out.
    if (
      sealed &&
      cordon.dismountedAt === null &&
      (p.groundSpeed ?? 0) < 2.5 &&
      sim.elapsed - cordon.sealedAt > 0.25
    )
      dismount(sim, cordon);
    // A way out is still open even counting the cars on their way to their
    // slots (a car wedged short of its slot, too few cars at first): send the
    // nearest spare car to close it. Slots never move under parked cars.
    if (!sealed && sim.elapsed - (cordon.patchedAt ?? cordon.born) > 0.4) {
      cordon.patchedAt = sim.elapsed;
      const settled = sim.police.filter(
        (c) =>
          c.state === "active" &&
          c.blockId !== cordon.id &&
          c.blockState === "hold",
      );
      // Cars of this cordon count where they are going to be.
      const planned = members.map((c) =>
        c.blockState === "hold" ? c : { ...c, ...c.blockSlot },
      );
      const blockers = [...settled, ...planned];
      const straight = escapeDirections(sim, p, blockers);
      // No straight way out but a crooked one (pivot, then squeeze between
      // two corners): close that one.
      const crooked = straight.length
        ? null
        : floodEscape(sim, p, blockers, RING + 0.5);
      const open = crooked === null ? straight : [crooked];
      const closes = (cars, target) =>
        crooked === null
          ? !escapeDirections(sim, p, cars).includes(target)
          : (() => {
              const a = floodEscape(sim, p, cars);
              return (
                a === null ||
                Math.abs(
                  Math.atan2(Math.sin(a - target), Math.cos(a - target)),
                ) > 0.6
              );
            })();
      // Cars that can be sent: free ones (not one that just gave up on a
      // slot it could not reach), and parked cordon cars whose spot closes
      // nothing (taking them away leaves the same ways out).
      const candidates = [
        ...sim.police.filter(
          (c) =>
            c.blockId !== cordon.id &&
            available(sim, cordon, c) &&
            !(c.cordonGaveUp > 0),
        ),
        ...members.filter(
          (c) =>
            c.blockState === "hold" &&
            escapeDirections(
              sim,
              p,
              blockers.filter((b) => b.id !== c.id),
            ).length === straight.length &&
            // With only a crooked way out, never pull a parked car: which
            // cars that path depends on is not known.
            crooked === null,
        ),
      ];
      // Close the gap the player is facing most first, else the others.
      const speed = Math.hypot(p.vx, p.vz) || 1;
      const facing = (a) =>
        (Math.cos(a) * (p.vx || -Math.sin(p.angle)) +
          Math.sin(a) * (p.vz || -Math.cos(p.angle))) /
        speed;
      let spare = null,
        slot = null;
      for (const target of [...open].sort((a, b) => facing(b) - facing(a))) {
        // The car nearest the gap goes, not the one nearest the player (that
        // one may be on the far side of the wall of cars).
        const gx = p.x + Math.cos(target) * 5,
          gz = p.z + Math.sin(target) * 5;
        const reachable = (c) => {
          const vx = gx - c.x,
            vz = gz - c.z,
            len2 = vx * vx + vz * vz || 1,
            t = clamp(((p.x - c.x) * vx + (p.z - c.z) * vz) / len2, 0, 1);
          return Math.hypot(c.x + vx * t - p.x, c.z + vz * t - p.z) > 3;
        };
        // Cars with a clear run come first; if there are none, any car is
        // sent (it drives round by the road network).
        const pool = candidates.some(reachable)
          ? candidates.filter(reachable)
          : candidates;
        const ordered = pool
          .slice()
          .sort(
            (a, b) =>
              Math.hypot(a.x - gx, a.z - gz) - Math.hypot(b.x - gx, b.z - gz),
          );
        for (const car of ordered.slice(0, 3)) {
          const others = blockers.filter((b) => b.id !== car.id);
          // Slightly further out first: still closes the gap, and can be
          // reached from outside instead of from inside the cordon. A slot
          // only counts if a car parked there really shuts that way out.
          slot = slotAt(sim, p, target, 0, [5, 4.4, 3.8, 5.5], (q) =>
            closes([...others, q], target),
          );
          if (slot) {
            spare = car;
            break;
          }
        }
        if (slot) break;
      }
      // Last resort, for a crooked gap with no car left to send: move one of
      // this cordon's parked cars, but only to a spot where the whole
      // cordon then really seals the player in (checked in full, at most
      // every 2 s since it is the costly check).
      if (
        !spare &&
        crooked !== null &&
        sim.elapsed - (cordon.shuffledAt ?? -Infinity) > 2
      ) {
        cordon.shuffledAt = sim.elapsed;
        const movable = members
          .filter((c) => c.blockState === "hold")
          .sort(
            (a, b) =>
              Math.hypot(a.x - p.x, a.z - p.z) -
              Math.hypot(b.x - p.x, b.z - p.z),
          );
        for (const car of movable) {
          const others = blockers.filter((b) => b.id !== car.id);
          slot = slotAt(sim, p, crooked, 0, [RING, RING + 0.6], (q) =>
            sealedBy(sim, [...others, q]),
          );
          if (slot) {
            spare = car;
            break;
          }
        }
      }
      if (spare) {
        spare.blockId = cordon.id;
        spare.blockKind = "cordon";
        spare.blockSlot = slot;
        spare.blockBest = Infinity;
        spare.blockStall = 0;
        spare.blockState = "approach";
        spare.blockReroutes = 0;
        spare.route = [];
        cordon.slots.push(slot);
        cordon.patches = (cordon.patches || 0) + 1;
      }
    }
    return;
  }
  if (sim.elapsed < (sim.cordonCooldownUntil || 0)) return;
  // Start when the player is slowed right down (stopped, or scraping along
  // a wall) and police are close enough to box it in.
  if ((p.netSpeed ?? 24) > CONFIG.cordonStartSpeed) return;
  const near = sim.police.filter(
    (c) =>
      c.state === "active" &&
      !c.blockId &&
      Math.hypot(c.x - p.x, c.z - p.z) < CONFIG.cordonRecruitRange,
  );
  // Cars already parked round the player (a roadblock it ran into) stay as
  // they are and count as part of the cordon.
  const fixed = sim.police.filter(
    (c) =>
      c.state === "active" &&
      c.blockState === "hold" &&
      Math.hypot(c.x - p.x, c.z - p.z) < 10,
  );
  if (!near.length || near.length + fixed.length < 2) return;
  const id = `cordon-${(sim.cordonId = (sim.cordonId || 0) + 1)}`;
  const center = aimPoint(sim);
  sim.cordon = {
    id,
    x: center.x,
    z: center.z,
    born: sim.elapsed,
    heldAt: null,
    sealedAt: null,
    dismountedAt: null,
    slots: [],
  };
  // Already sealed in by the cars stopped around it: keep every car exactly
  // where it is (moving one to a "better" slot would open the seal it is
  // part of) and brace them there.
  const settled = sim.police.filter(
    (c) =>
      c.state === "active" &&
      !c.blockId &&
      Math.hypot(c.vx, c.vz) < 3 &&
      Math.hypot(c.x - p.x, c.z - p.z) < ADOPT_RANGE,
  );
  const parked = sim.police.filter(
    (c) =>
      c.state === "active" &&
      c.blockState === "hold" &&
      Math.hypot(c.x - p.x, c.z - p.z) < 9,
  );
  let slots;
  if (settled.length && sealedBy(sim, [...settled, ...parked])) {
    slots = adoptStopped(sim, id).map((c) => c.blockSlot);
    sim.cordon.slots = slots;
    sim.cordon.adopted = true;
  } else {
    slots = planSlots(sim, center, fixed);
    // Nothing to close (the parked cars already wall it in): no cordon yet.
    if (!slots.length) {
      sim.cordon = null;
      sim.cordonId--;
      return;
    }
    assign(sim, sim.cordon, slots);
  }
  sim.cordonEvents.push({
    id,
    type: "plan",
    time: sim.elapsed,
    x: p.x,
    z: p.z,
    slots: slots.length,
    cars: sim.police.filter((c) => c.blockId === id).map((c) => c.id),
  });
}
