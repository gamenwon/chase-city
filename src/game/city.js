import { CONFIG, clamp } from "./config.js";
import { buildLanes, buildWalks, pointAt, project, nearestWalk } from "./citygraph.js";
import { overpassHeight } from "../world/citygen.js";
import { overpassLocal } from "./overpass.js";
import { resolveBuilding } from "../world/layout.js";

// V1.9 city life: destructible street props, pedestrians and civilian
// traffic. Everything here is lightweight arcade physics (circles, simple
// impulses) and only the part of the city near the player is simulated, so
// it runs on phones. Nothing in the city ever explodes: civilian cars end up
// as smoking wrecks and broken props stay where they fell.

const SPACING = CONFIG.spacing; // 30: road grid
const LINES = [-90, -60, -30, 0, 30, 60, 90];
const SIDEWALK = 6.2; // sidewalk line, from a road's centre line
const LANE = 2.75; // driving lane, from a road's centre line
const PARK_LANE = 4.75; // parked cars, against the kerb

// How each prop reacts, by size: radius, the impact speed that breaks it,
// and whether it blocks a car below that speed.
export const PROPS = {
  trash: { r: 0.45, breakAt: 2.5, solid: false },
  sign: { r: 0.25, breakAt: 6, solid: true },
  lamp: { r: 0.3, breakAt: 9, solid: true },
  tree: { r: 0.4, breakAt: 11, solid: true },
  bigTree: { r: 0.75, breakAt: Infinity, solid: true },
  // Fire hydrant: knocked loose by any real hit (it never stops the car);
  // a water jet then shoots up from the broken pipe until restart.
  hydrant: { r: 0.3, breakAt: 4, solid: false },
};

// Per-device budget. Phones (the main platform) get fewer actors; the frame
// rate governor in main.js can lower `level` further at run time.
export const BUDGETS = {
  mobile: { peds: 10, traffic: 6, parked: 10, range: 55 },
  desktop: { peds: 18, traffic: 10, parked: 16, range: 70 },
};
export function cityBudget(profile = "desktop", level = 1) {
  const b = BUDGETS[profile] || BUDGETS.desktop;
  const k = clamp(level, 0.3, 1);
  return {
    profile,
    level: k,
    peds: Math.round(b.peds * k),
    traffic: Math.round(b.traffic * k),
    parked: Math.round(b.parked * k),
    range: b.range,
  };
}

// Small deterministic RNG so the city never touches the game's own random
// sequence (exits, reinforcements, police all stay as they were).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const blockExists = (cx, cz) => Math.abs(cx) <= 75 && Math.abs(cz) <= 75;

// Fixed street furniture along every sidewalk, plus the park trees.
export function cityProps(layout) {
  const props = [];
  let id = 0;
  if (layout.procedural) {
    // V2.1 generated city: furniture placed by the generator along every
    // road's pavement, trees in the parks (big, solid).
    const mk = (kind, x, z, angle) => ({ id: id++, kind, x, z, angle, state: "stand", fall: 0, fallDir: 0, wobble: 0, y: 0, vx: 0, vz: 0, vy: 0, spin: 0, solidId: null, dirty: true });
    for (const q of layout.streetProps || []) props.push(mk(q.kind, q.x, q.z, q.angle));
    for (const t of layout.trees || []) props.push(mk("bigTree", t.x, t.z, 0));
    return props;
  }
  const add = (kind, x, z, angle) =>
    props.push({
      id: id++,
      kind,
      x,
      z,
      angle,
      state: "stand", // stand | falling | down | tumble
      fall: 0,
      fallDir: 0,
      wobble: 0,
      y: 0,
      vx: 0,
      vz: 0,
      vy: 0,
      spin: 0,
      solidId: null,
      dirty: true,
    });
  const kindsAt = ["lamp", "trash", "tree", "sign"];
  for (const n of LINES)
    for (const m of LINES.slice(0, -1))
      for (const side of [-1, 1]) {
        const offsets = [10, 14, 17.5, 21];
        offsets.forEach((o, k) => {
          const h = Math.abs(n * 7 + m * 13 + side * 5 + k * 3);
          let kind = kindsAt[k];
          if (k === 3 && h % 3 === 0) kind = "trash";
          if (k === 2 && h % 4 === 0) kind = "sign";
          // Along a vertical road (x = n) and a horizontal one (z = n).
          if (blockExists(n + side * 15, m + 15))
            add(kind, n + side * SIDEWALK, m + o, 0);
          if (blockExists(m + 15, n + side * 15))
            add(kind, m + o, n + side * SIDEWALK, Math.PI / 2);
        });

      }
  for (const p of layout.parks)
    for (const dx of [-6, 6])
      for (const dz of [-6, 6]) add("bigTree", p.x + dx, p.z + dz, 0);
  // Fire hydrants on about a third of the sidewalk stretches, between the
  // lamp and the bin (added last: the other props keep their ids).
  for (const n of LINES)
    for (const m of LINES.slice(0, -1))
      for (const side of [-1, 1]) {
        const hh = Math.abs((n / 30) * 5 + (m / 30) * 3 + (side > 0 ? 1 : 0));
        if (hh % 3 !== 1) continue;
        if (blockExists(n + side * 15, m + 15)) add("hydrant", n + side * SIDEWALK, m + 12, 0);
        if (blockExists(m + 15, n + side * 15)) add("hydrant", m + 12, n + side * SIDEWALK, Math.PI / 2);
      }
  return props;
}

export function createCity(layout, options = {}) {
  const props = cityProps(layout);
  const grid = new Map();
  const key = (x, z) => Math.floor(x / 10) * 1000 + Math.floor(z / 10);
  for (const p of props) {
    const k = key(p.x, p.z);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  }
  // Parking spots: one per sidewalk block side where the hash says so.
  const parking = [];
  if (layout.procedural) {
    for (const q of layout.parking || []) parking.push({ x: q.x, z: q.z, angle: q.angle });
    for (const lot of layout.lots || []) for (const q of lot.bays) if (q.car) parking.push({ x: q.x, z: q.z, angle: q.angle });
  } else
  for (const n of LINES)
    for (const m of LINES.slice(0, -1))
      for (const side of [-1, 1]) {
        const h = Math.abs(n * 11 + m * 3 + side * 17);
        if (h % 2) continue;
        if (blockExists(n + side * 15, m + 15))
          parking.push({ x: n + side * PARK_LANE, z: m + 15, angle: 0 });
        if (blockExists(m + 15, n + side * 15))
          parking.push({
            x: m + 15,
            z: n + side * PARK_LANE,
            angle: Math.PI / 2,
          });
      }
  // Static boxes (buildings, benches) by 10 m cell, so pedestrians and
  // traffic only test the few near them.
  const boxes = new Map();
  for (const b of [...layout.buildings, ...(layout.obstacles || [])])
    for (
      let gx = Math.floor((b.x - b.w / 2 - 2) / 10);
      gx <= Math.floor((b.x + b.w / 2 + 2) / 10);
      gx++
    )
      for (
        let gz = Math.floor((b.z - b.d / 2 - 2) / 10);
        gz <= Math.floor((b.z + b.d / 2 + 2) / 10);
        gz++
      ) {
        const k = gx * 1000 + gz;
        if (!boxes.has(k)) boxes.set(k, []);
        boxes.get(k).push(b);
      }
  return {
    props,
    grid,
    key,
    boxes,
    moving: new Set(), // props that are wobbling, falling or tumbling
    solids: [], // fallen trees, shared with the simulation's solids
    // Big trees never fall: the police route planner steers round them
    // (the collision itself stays the tree's own, with its damage).
    navObstacles: props
      .filter((p) => p.kind === "bigTree")
      .map((p) => ({ x: p.x, z: p.z, w: 1.8, d: 1.8, kind: "tree" })),
    pedestrians: [],
    traffic: [],
    // V2.1: lanes and pavement walks along a generated city's roads.
    graphLife: layout.procedural ? { ...buildLanes(layout.graph), walks: buildWalks(layout.graph) } : null,
    parking: parking.map((p, i) => ({ ...p, id: i, car: null })),
    litter: [],
    jets: [], // broken hydrants spraying water (until restart)
    events: [],
    eventId: 0,
    nextId: 1,
    random: rng(options.seed ?? 9031),
    budget: options.budget || cityBudget(options.profile),
    stats: {
      propHits: 0,
      propsBroken: 0,
      treesDown: 0,
      trashKnocked: 0,
      pedestrianScares: 0,
      pedestrianDives: 0,
      nearMisses: 0,
      pedestrianHits: 0,
      trafficBrakes: 0,
      honks: 0,
      trafficCollisions: 0,
      trafficWrecks: 0,
      cityExplosions: 0,
    },
  };
}

const NONE = [];
function boxesNear(city, x, z) {
  return city.boxes.get(Math.floor(x / 10) * 1000 + Math.floor(z / 10)) || NONE;
}

function event(city, sim, e) {
  const ev = { id: ++city.eventId, time: sim.elapsed, ...e };
  city.events.push(ev);
  if (city.events.length > 64) city.events.shift();
  // V2.0: every event also goes straight to the simulation (mission
  // results count what was destroyed from these, never from the trimmed
  // list above).
  sim.onCityEvent?.(ev);
}

// ---------------------------------------------------------------- props --

function nearbyProps(city, x, z, reach = 4) {
  const out = [];
  for (
    let gx = Math.floor((x - reach) / 10);
    gx <= Math.floor((x + reach) / 10);
    gx++
  )
    for (
      let gz = Math.floor((z - reach) / 10);
      gz <= Math.floor((z + reach) / 10);
      gz++
    ) {
      const cell = city.grid.get(gx * 1000 + gz);
      if (cell) out.push(...cell);
    }
  return out;
}

// A fallen tree lies along its fall direction: snapped to the nearest axis
// so it is an ordinary box obstacle for the physics and the police routes.
function fallenTreeSolid(prop) {
  const along =
    Math.abs(Math.sin(prop.fallDir)) > Math.abs(Math.cos(prop.fallDir));
  const cx = prop.x + Math.sin(prop.fallDir) * 2.2,
    cz = prop.z + Math.cos(prop.fallDir) * 2.2;
  return along
    ? { x: cx, z: cz, w: 4.4, d: 0.9, kind: "fallen-tree", propId: prop.id }
    : { x: cx, z: cz, w: 0.9, d: 4.4, kind: "fallen-tree", propId: prop.id };
}

function breakProp(sim, city, prop, car, impact) {
  const speed = Math.hypot(car.vx, car.vz) || 1;
  // Falls the way the car was going; if that is into a building, it falls
  // along the sidewalk instead (where it can be seen, and lies across the
  // pavement and the kerb).
  prop.fallDir = Math.atan2(car.vx / speed, car.vz / speed);
  const reach = prop.kind === "tree" ? 3.5 : 3;
  const tip = {
    x: prop.x + Math.sin(prop.fallDir) * reach,
    z: prop.z + Math.cos(prop.fallDir) * reach,
  };
  if (
    boxesNear(city, tip.x, tip.z).some(
      (b) =>
        Math.abs(tip.x - b.x) < b.w / 2 + 0.3 &&
        Math.abs(tip.z - b.z) < b.d / 2 + 0.3,
    )
  ) {
    // Sidewalk direction: along z beside a vertical road (angle 0), along
    // x beside a horizontal one.
    const alongZ = prop.angle === 0;
    const v = alongZ ? car.vz : car.vx;
    const sign = v < 0 ? -1 : 1;
    prop.fallDir = alongZ ? (sign > 0 ? 0 : Math.PI) : sign * (Math.PI / 2);
  }
  city.stats.propsBroken++;
  if (prop.kind === "hydrant") {
    // Knocked loose and thrown a little; the broken pipe left behind
    // shoots water up from now until restart (one jet per hydrant).
    prop.state = "tumble";
    prop.vx = car.vx * 0.5 + (city.random() - 0.5) * 2;
    prop.vz = car.vz * 0.5 + (city.random() - 0.5) * 2;
    prop.vy = 2 + impact * 0.1;
    prop.spin = (city.random() - 0.5) * 10;
    if (!prop.jet) {
      prop.jet = true;
      city.jets.push({ x: prop.x, z: prop.z, born: sim.elapsed, id: prop.id });
      city.stats.hydrants = (city.stats.hydrants || 0) + 1;
    }
  } else if (prop.kind === "trash") {
    prop.state = "tumble";
    prop.vx = car.vx * 0.9 + (city.random() - 0.5) * 3;
    prop.vz = car.vz * 0.9 + (city.random() - 0.5) * 3;
    prop.vy = 2.5 + impact * 0.12;
    prop.spin = (city.random() - 0.5) * 14;
    city.stats.trashKnocked++;
    // Rubbish spills where it was hit.
    for (let i = 0; i < 7; i++)
      city.litter.push({
        x:
          prop.x +
          (city.random() - 0.5) * 2.4 +
          (car.vx / speed) * city.random() * 2.5,
        z:
          prop.z +
          (city.random() - 0.5) * 2.4 +
          (car.vz / speed) * city.random() * 2.5,
        angle: city.random() * Math.PI,
        color: Math.floor(city.random() * 4),
      });
    if (city.litter.length > 300)
      city.litter.splice(0, city.litter.length - 300);
  } else {
    prop.state = "falling";
    prop.fall = 0;
    if (prop.kind === "tree") city.stats.treesDown++;
  }
  prop.dirty = true;
  city.moving.add(prop);
  event(city, sim, {
    type: "prop",
    action: "break",
    kind: prop.kind,
    targetId: prop.id,
    x: prop.x,
    z: prop.z,
    strength: impact,
    byPlayer: car === sim.player,
  });
}

// An explosion at (x, z) of radius R and strength s (blast.js): street
// props within reach are thrown or broken (in the blast's direction; big
// trees only shake), civilian cars are damaged and shoved, wrecked ones
// slide. Returns the civilian cars it destroyed (they may go up).
export function blastCity(sim, city, x, z, R, s) {
  for (const prop of nearbyProps(city, x, z, R)) {
    if (prop.state !== "stand") continue;
    const dx = prop.x - x, dz = prop.z - z, d = Math.hypot(dx, dz);
    if (d >= R * 0.8 || d < 1e-6) continue;
    const k = 1 - d / (R * 0.8);
    const impact = 22 * k * Math.sqrt(s);
    const spec = PROPS[prop.kind];
    const push = { vx: (dx / d) * impact, vz: (dz / d) * impact };
    if (impact >= spec.breakAt) breakProp(sim, city, prop, push, impact);
    else {
      prop.wobble = Math.min(1, prop.wobble + impact / 8);
      prop.dirty = true;
      city.moving.add(prop);
    }
  }
  const wrecked = [];
  for (const t of city.traffic) {
    const dx = t.x - x, dz = t.z - z, d = Math.hypot(dx, dz);
    if (d >= R || d < 1e-6) continue;
    const k = 1 - d / R;
    const push = 11 * k * Math.sqrt(s) / (t.parked || t.state === "wreck" ? 1.4 : 1);
    t.vx = (t.vx || 0) + (dx / d) * push;
    t.vz = (t.vz || 0) + (dz / d) * push;
    if (t.state === "wreck") continue;
    if (t.state === "drive") {
      t.state = "yield";
      t.timer = 2.5;
    }
    damageTraffic(sim, city, t, 22 * k * s, false);
    if (t.state === "wreck") wrecked.push(t);
  }
  return wrecked;
}

// Standing props that stop a car (big trees, and posts below their break
// speed): the player's movement treats them like walls when it looks for a
// way to slide off (simulation.js drivePlayer).
export function standingPostsNear(city, x, z, reach = 4) {
  return nearbyProps(city, x, z, reach).filter(
    (q) => q.state === "stand" && PROPS[q.kind].solid,
  );
}

function hitProps(sim, city, car, radius, isPlayer, ram = 1) {
  for (const prop of nearbyProps(city, car.x, car.z)) {
    const spec = PROPS[prop.kind];
    if (prop.state !== "stand" && prop.state !== "down") continue;
    const dx = prop.x - car.x,
      dz = prop.z - car.z,
      d = Math.hypot(dx, dz);
    if (prop.state === "down") {
      // Lying debris: drive over it and get slowed a little; a lying trash
      // can gets kicked along.
      if (
        prop.kind === "trash" &&
        d < radius + spec.r &&
        Math.hypot(car.vx, car.vz) > 3
      ) {
        prop.state = "tumble";
        prop.vx = car.vx * 0.6;
        prop.vz = car.vz * 0.6;
        prop.vy = 1.2;
        prop.dirty = true;
        city.moving.add(prop);
      }
      continue;
    }
    if (d >= radius + spec.r || d < 1e-6) continue;
    const nx = dx / d,
      nz = dz / d;
    const impact = Math.max(0, car.vx * nx + car.vz * nz);
    // A new contact (not the same car still pressed against the same prop
    // a moment later): only a new one shakes the camera, hurts or sounds.
    const fresh =
      !isPlayer ||
      car.propContact?.id !== prop.id ||
      sim.elapsed - car.propContact.at > 0.35;
    car.propContact = { id: prop.id, at: sim.elapsed };
    city.stats.propHits++;
    if (impact >= spec.breakAt * ram) {
      breakProp(sim, city, prop, car, impact);
      // Knocking it over costs some speed: more for heavier props.
      const keep =
        prop.kind === "trash" ? 0.96 : prop.kind === "sign" ? 0.9 : 0.75;
      car.vx *= keep;
      car.vz *= keep;
      if (isPlayer) car.speed = (car.speed ?? 0) * keep;
      if (impact > 6)
        sim.cameraKick = Math.max(
          sim.cameraKick || 0,
          prop.kind === "trash" ? 0.08 : 0.22,
        );
      continue;
    }
    if (!spec.solid) continue;
    // Too slow to break it (or a big tree): it stops the car like a post.
    const push = radius + spec.r - d + 0.001;
    car.x -= nx * push;
    car.z -= nz * push;
    car.vx -= nx * impact * 1.3;
    car.vz -= nz * impact * 1.3;
    if (isPlayer) car.speed = Math.max(0, (car.speed ?? 0) - impact * 0.6);
    prop.wobble = Math.min(1, prop.wobble + impact / 10);
    prop.dirty = true;
    city.moving.add(prop);
    if (!fresh) continue;
    if (impact > 2)
      event(city, sim, {
        type: "prop",
        action: "hit",
        kind: prop.kind,
        x: prop.x,
        z: prop.z,
        strength: impact,
        byPlayer: isPlayer,
      });
    // A big tree does real damage; posts and small trees only shake you.
    if (prop.kind === "bigTree" && impact > 7) {
      if (isPlayer) sim.damage(Math.round(4 + impact * 0.35));
      else {
        car.health = Math.max(0, car.health - impact * 1.2);
        if (car.health <= 0) car.lastDamageCause = "tree";
      }
      sim.cameraKick = Math.max(sim.cameraKick || 0, isPlayer ? 0.35 : 0);
    }
  }
}

// V2.0 fix: a tree that comes down on top of a car must not become a wall
// around it (the car was locked inside the new obstacle for good). Its
// obstacle waits until no car overlaps the trunk.
function carsOverlap(sim, city, b) {
  const hit = (c, r) =>
    Math.abs(c.x - b.x) < b.w / 2 + r && Math.abs(c.z - b.z) < b.d / 2 + r;
  return (
    hit(sim.player, CONFIG.radius) ||
    sim.police.some((c) => c.state === "active" && hit(c, CONFIG.policeRadius)) ||
    city.traffic.some((c) => hit(c, 0.95))
  );
}
function addTreeSolid(city, prop, solid) {
  city.solids.push(solid);
  prop.solidId = city.solids.length - 1;
  prop.solidPending = null;
}

function updateProps(sim, city, dt) {
  let solidsChanged = false;
  for (const prop of city.moving) {
    if (prop.solidPending) {
      if (!carsOverlap(sim, city, prop.solidPending)) {
        addTreeSolid(city, prop, prop.solidPending);
        solidsChanged = true;
        city.moving.delete(prop);
      }
      continue;
    }
    if (
      prop.state !== "falling" &&
      prop.state !== "tumble" &&
      prop.wobble <= 0
    ) {
      city.moving.delete(prop);
      continue;
    }
    if (prop.wobble > 0) {
      prop.wobble = Math.max(0, prop.wobble - dt * 1.5);
      prop.dirty = true;
    }
    if (prop.state === "falling") {
      prop.fall = Math.min(
        1,
        prop.fall + dt * (prop.kind === "tree" ? 1.6 : 2.6),
      );
      prop.dirty = true;
      if (prop.fall >= 1) {
        prop.state = "down";
        if (prop.kind === "tree") {
          const solid = fallenTreeSolid(prop);
          if (carsOverlap(sim, city, solid)) prop.solidPending = solid;
          else {
            addTreeSolid(city, prop, solid);
            solidsChanged = true;
          }
        }
        event(city, sim, {
          type: "prop",
          action: "land",
          kind: prop.kind,
          x: prop.x + Math.sin(prop.fallDir) * 2,
          z: prop.z + Math.cos(prop.fallDir) * 2,
          strength: prop.kind === "tree" ? 10 : 6,
        });
      }
    } else if (prop.state === "tumble") {
      prop.x += prop.vx * dt;
      prop.z += prop.vz * dt;
      prop.y += prop.vy * dt;
      prop.vy -= 18 * dt;
      prop.fall = Math.min(1, prop.fall + dt * 4);
      prop.dirty = true;
      if (prop.y <= 0) {
        prop.y = 0;
        prop.vy = Math.abs(prop.vy) > 2 ? -prop.vy * 0.35 : 0;
        prop.vx *= 0.7;
        prop.vz *= 0.7;
        if (Math.hypot(prop.vx, prop.vz) < 0.6 && prop.vy === 0) {
          prop.state = "down";
          prop.vx = prop.vz = 0;
          // Re-file it in the grid where it came to rest.
          for (const cell of city.grid.values()) {
            const i = cell.indexOf(prop);
            if (i >= 0) cell.splice(i, 1);
          }
          const k = city.key(prop.x, prop.z);
          if (!city.grid.has(k)) city.grid.set(k, []);
          city.grid.get(k).push(prop);
        }
      }
      // Bounces off buildings.
      for (const b of boxesNear(city, prop.x, prop.z))
        if (resolveBuilding(prop, b, 0.45)) {
          prop.vx *= -0.4;
          prop.vz *= -0.4;
        }
    }
  }
  if (solidsChanged) sim.refreshNavigation();
}

// ----------------------------------------------------------- pedestrians --

// Walk around a block on its sidewalk: perimeter parameter u in [0, 4L).
const HALF = 15 - SIDEWALK; // 8.8 from the block centre
const SIDE = HALF * 2;
function loopPoint(cx, cz, u) {
  const L = SIDE,
    t = ((u % (4 * L)) + 4 * L) % (4 * L);
  if (t < L) return { x: cx - HALF + t, z: cz - HALF };
  if (t < 2 * L) return { x: cx + HALF, z: cz - HALF + (t - L) };
  if (t < 3 * L) return { x: cx + HALF - (t - 2 * L), z: cz + HALF };
  return { x: cx - HALF, z: cz + HALF - (t - 3 * L) };
}
function nearestBlock(x, z) {
  const c = (v) =>
    clamp(Math.round((v - 15) / SPACING) * SPACING + 15, -75, 75);
  return { cx: c(x), cz: c(z) };
}
function projectOnLoop(cx, cz, x, z) {
  // Closest point on the block's sidewalk rectangle, as a perimeter u.
  const px = clamp(x, cx - HALF, cx + HALF),
    pz = clamp(z, cz - HALF, cz + HALF);
  const d = [
    { u: px - (cx - HALF), dist: Math.abs(z - (cz - HALF)) },
    { u: SIDE + (pz - (cz - HALF)), dist: Math.abs(x - (cx + HALF)) },
    { u: 2 * SIDE + (cx + HALF - px), dist: Math.abs(z - (cz + HALF)) },
    { u: 3 * SIDE + (cz + HALF - pz), dist: Math.abs(x - (cx - HALF)) },
  ].sort((a, b) => a.dist - b.dist);
  return d[0].u;
}

// A pedestrian on the sidewalk loop of block (cx, cz) at perimeter u. Each
// one walks, reacts and runs at its own pace.
export function addPedestrian(city, at) {
  const r = city.random;
  const q = {
    id: city.nextId++,
    dir: r() < 0.5 ? 1 : -1,
    walk: 1.0 + r() * 0.6,
    react: 0.12 + r() * 0.5,
    run: 4 + r() * 2,
    state: "walk", // walk | cross | alert | flee | dive | recover
    timer: 0,
    fleeX: 0,
    fleeZ: 0,
    heading: 0,
    color: Math.floor(r() * 6),
    skin: Math.floor(r() * 3),
    phase: r() * 10,
    cross: null,
    threat: null,
    closest: Infinity,
    ...Object.fromEntries(Object.entries(at).filter(([, v]) => v !== undefined)),
  };
  city.pedestrians.push(q);
  return q;
}

function spawnPedestrian(sim, city) {
  const p = sim.player,
    r = city.random;
  if (city.graphLife) {
    const walks = city.graphLife.walks;
    for (let tries = 0; tries < 10; tries++) {
      const w = walks[Math.floor(r() * walks.length)], s = r() * w.len;
      const q = pointAt(w, s), d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < 20 || d > 55) continue;
      if (boxesNear(city, q.x, q.z).some((b) => Math.abs(b.x - q.x) < b.w / 2 + 0.4 && Math.abs(b.z - q.z) < b.d / 2 + 0.4)) continue;
      addPedestrian(city, { x: q.x, z: q.z, walk: undefined, walkId: w.id, s });
      return;
    }
    return;
  }
  for (let tries = 0; tries < 8; tries++) {
    const a = r() * Math.PI * 2,
      dist = 22 + r() * 30;
    const { cx, cz } = nearestBlock(
      p.x + Math.cos(a) * dist,
      p.z + Math.sin(a) * dist,
    );
    const u = r() * 4 * SIDE;
    const q = loopPoint(cx, cz, u);
    if (Math.hypot(q.x - p.x, q.z - p.z) < 18) continue;
    addPedestrian(city, { x: q.x, z: q.z, cx, cz, u });
    return;
  }
}

function vehicles(sim, city) {
  const list = [{ car: sim.player, r: CONFIG.radius, who: "player" }];
  for (const c of sim.police)
    if (c.state === "active")
      list.push({ car: c, r: CONFIG.policeRadius, who: "police" });
  for (const t of city.traffic) list.push({ car: t, r: 1.3, who: "traffic" });
  return list;
}

// Is this vehicle coming at the pedestrian? Time until it gets there, or
// null.
function threatTime(ped, v) {
  const c = v.car,
    speed = Math.hypot(c.vx, c.vz);
  if (speed < 3) return null;
  const dx = ped.x - c.x,
    dz = ped.z - c.z;
  const along = (dx * c.vx + dz * c.vz) / speed;
  if (along < -1 || along > speed * 1.8 + 3) return null;
  const lateral = Math.abs(dx * c.vz - dz * c.vx) / speed;
  if (lateral > v.r + 1.6) return null;
  return Math.max(0, along) / speed;
}

function updatePedestrians(sim, city, dt) {
  const p = sim.player,
    budget = city.budget;
  city.pedestrians = city.pedestrians.filter(
    (q) => Math.hypot(q.x - p.x, q.z - p.z) < budget.range + 20,
  );
  if (city.pedestrians.length < budget.peds) spawnPedestrian(sim, city);
  // Over budget (the frame-rate governor lowered it): drop the person
  // furthest from the player, never one in the middle of the action.
  while (city.pedestrians.length > budget.peds) {
    const far = city.pedestrians.reduce((a, b) =>
      Math.hypot(b.x - p.x, b.z - p.z) > Math.hypot(a.x - p.x, a.z - p.z)
        ? b
        : a,
    );
    city.pedestrians.splice(city.pedestrians.indexOf(far), 1);
  }
  const cars = vehicles(sim, city);
  for (const q of city.pedestrians) {
    q.phase += dt;
    // Who is coming at me?
    let worst = null;
    for (const v of cars) {
      const t = threatTime(q, v);
      if (t !== null && (!worst || t < worst.t)) worst = { t, v };
    }
    const playerDist = Math.hypot(q.x - p.x, q.z - p.z);
    // Almost on top of them: a reflex jump aside, no reaction delay.
    if (worst && worst.t < 0.35 && q.state !== "dive" && q.state !== "flee") {
      const c = worst.v.car,
        sp = Math.hypot(c.vx, c.vz) || 1;
      const side = Math.sign((q.x - c.x) * c.vz - (q.z - c.z) * c.vx) || 1;
      q.fleeX = (c.vz / sp) * side;
      q.fleeZ = (-c.vx / sp) * side;
      q.state = "dive";
      q.timer = 0.45;
      q.closest = Infinity;
      city.stats.pedestrianDives++;
    }
    if (
      (q.state === "walk" || q.state === "cross" || q.state === "recover") &&
      worst &&
      worst.t < 1.6
    ) {
      q.state = "alert";
      q.timer = q.react;
      q.threat = worst.v.car;
      city.stats.pedestrianScares++;
    }
    if (q.state === "alert") {
      q.timer -= dt;
      if (q.timer <= 0 && !q.threat) {
        // The car that startled them is gone: nothing to run from.
        q.state = "recover";
      } else if (q.timer <= 0) {
        // Run off sideways, away from the car's path.
        const c = q.threat,
          s = Math.hypot(c.vx, c.vz) || 1;
        const side = Math.sign((q.x - c.x) * c.vz - (q.z - c.z) * c.vx) || 1;
        q.fleeX = (c.vz / s) * side;
        q.fleeZ = (-c.vx / s) * side;
        q.state = "flee";
        q.timer = 0.9 + city.random() * 0.6;
        q.closest = Infinity;
      }
    }
    // Last-moment dive if a car is about to touch them anyway: nobody gets
    // run over; this is a game about dodging them.
    for (const v of cars) {
      const d = Math.hypot(q.x - v.car.x, q.z - v.car.z);
      if (q.state === "flee" || q.state === "dive")
        q.closest = Math.min(q.closest, d);
      const moving = Math.hypot(v.car.vx, v.car.vz) > 3;
      // A car standing still is just in the way: step round it.
      if (!moving && d < v.r + 0.35 && d > 1e-6) {
        q.x = v.car.x + ((q.x - v.car.x) / d) * (v.r + 0.35);
        q.z = v.car.z + ((q.z - v.car.z) / d) * (v.r + 0.35);
        continue;
      }
      if (moving && d < v.r + 1.0 && q.state !== "dive") {
        const c = v.car,
          s = Math.hypot(c.vx, c.vz) || 1;
        const side = Math.sign((q.x - c.x) * c.vz - (q.z - c.z) * c.vx) || 1;
        q.fleeX = (c.vz / s) * side;
        q.fleeZ = (-c.vx / s) * side;
        q.state = "dive";
        q.timer = 0.45;
        city.stats.pedestrianDives++;
        if (v.who === "player") {
          event(city, sim, {
            type: "ped",
            action: "dive",
            x: q.x,
            z: q.z,
            strength: s,
          });
        }
      }
    }
    if (q.state === "walk" && q.walkId != null) {
      // Generated city: along the pavement, turning back at its ends.
      const w = city.graphLife.walks[q.walkId];
      q.s += q.dir * q.walk * dt;
      if (q.s < 0 || q.s > w.len) {
        q.dir = -q.dir;
        q.s = Math.max(0, Math.min(w.len, q.s));
      }
      const at = pointAt(w, q.s);
      q.heading = Math.atan2(at.x - q.x, at.z - q.z) || q.heading;
      q.x = at.x;
      q.z = at.z;
    } else if (q.state === "walk") {
      q.u += q.dir * q.walk * dt;
      const L = SIDE,
        t = ((q.u % (4 * L)) + 4 * L) % (4 * L);
      // At a corner, sometimes cross the road on the zebra crossing.
      if (
        Math.min(t % L, L - (t % L)) < 0.05 &&
        city.random() < dt * 4 &&
        !q.justCrossed
      ) {
        const corner = loopPoint(q.cx, q.cz, Math.round(q.u / L) * L);
        const ox = Math.sign(corner.x - q.cx),
          oz = Math.sign(corner.z - q.cz);
        const horizontal = city.random() < 0.5;
        const to = horizontal
          ? { cx: q.cx + ox * SPACING, cz: q.cz }
          : { cx: q.cx, cz: q.cz + oz * SPACING };
        if (blockExists(to.cx, to.cz)) {
          const end = horizontal
            ? { x: corner.x + ox * SIDEWALK * 2, z: corner.z - oz * 0.8 }
            : { x: corner.x - ox * 0.8, z: corner.z + oz * SIDEWALK * 2 };
          q.cross = { to, end };
          q.state = "cross";
        }
        q.justCrossed = true;
      } else if (Math.min(t % L, L - (t % L)) > 1) q.justCrossed = false;
      const at = loopPoint(q.cx, q.cz, q.u);
      q.heading = Math.atan2(at.x - q.x, at.z - q.z) || q.heading;
      q.x = at.x;
      q.z = at.z;
    } else if (q.state === "cross" || q.state === "recover") {
      const target =
        q.state === "cross" ? q.cross.end : q.walkId != null ? pointAt(city.graphLife.walks[q.walkId], q.s) : loopPoint(q.cx, q.cz, q.u);
      const dx = target.x - q.x,
        dz = target.z - q.z,
        d = Math.hypot(dx, dz);
      const speed = q.state === "cross" ? q.walk * 1.25 : q.walk * 1.4;
      if (d < 0.2) {
        if (q.state === "cross") {
          q.cx = q.cross.to.cx;
          q.cz = q.cross.to.cz;
          q.cross = null;
        }
        if (q.walkId == null) q.u = projectOnLoop(q.cx, q.cz, q.x, q.z);
        q.state = "walk";
      } else {
        q.heading = Math.atan2(dx, dz);
        q.x += (dx / d) * Math.min(d, speed * dt);
        q.z += (dz / d) * Math.min(d, speed * dt);
      }
    } else if (q.state === "flee" || q.state === "dive") {
      const speed = q.state === "dive" ? 6.5 : q.run;
      q.x += q.fleeX * speed * dt;
      q.z += q.fleeZ * speed * dt;
      q.heading = Math.atan2(q.fleeX, q.fleeZ);
      q.timer -= dt;
      if (q.timer <= 0) {
        if (q.closest < 3.2) city.stats.nearMisses++;
        // Back to the nearest sidewalk.
        if (city.graphLife) {
          const n = nearestWalk(city.graphLife.walks, q.x, q.z);
          q.walkId = n.walk.id;
          q.s = n.s;
        } else {
          const { cx, cz } = nearestBlock(q.x, q.z);
          q.cx = cx;
          q.cz = cz;
          q.u = projectOnLoop(cx, cz, q.x, q.z);
        }
        q.state = "recover";
        q.cross = null;
      }
    }
    // Never inside a building.
    for (const b of boxesNear(city, q.x, q.z)) resolveBuilding(q, b, 0.35);
    q.playerDist = playerDist;
  }
  // Final dodge, after everyone has moved: anyone a moving car is about to
  // touch hops clear to the side of its path away from the car (drawn as a
  // dive). Police cars turning toward the player can curve into someone who
  // already jumped, so this runs every step, against every moving car.
  for (const q of city.pedestrians)
    for (const v of cars) {
      const c = v.car,
        speed = Math.hypot(c.vx, c.vz);
      if (speed <= 3) continue;
      const dx = q.x - c.x,
        dz = q.z - c.z;
      if (Math.hypot(dx, dz) >= v.r + 0.6) continue;
      const ux = c.vx / speed,
        uz = c.vz / speed;
      const along = dx * ux + dz * uz,
        side = Math.sign(dx * uz - dz * ux) || 1;
      // Beside the car's path, just clear of its body.
      q.x = c.x + ux * along + uz * side * (v.r + 0.7);
      q.z = c.z + uz * along - ux * side * (v.r + 0.7);
      for (const b of boxesNear(city, q.x, q.z)) resolveBuilding(q, b, 0.35);
      if (q.state !== "dive") {
        q.state = "dive";
        q.timer = 0.45;
        q.closest = Infinity;
        city.stats.pedestrianDives++;
      }
      q.fleeX = uz * side;
      q.fleeZ = -ux * side;
      // Only if a wall pins them in the car's way does it count as a hit.
      if (Math.hypot(q.x - c.x, q.z - c.z) < v.r * 0.6)
        city.stats.pedestrianHits++;
    }
}

// --------------------------------------------------------------- traffic --

const TRAFFIC_COLORS = 6;
function laneCenter(lane) {
  // Keep to the right of the road for the direction of travel.
  return lane.line + lane.dir * LANE * (lane.axis === "x" ? 1 : -1);
}
function headingOf(lane) {
  // Forward is (-sin a, -cos a).
  return lane.axis === "x"
    ? lane.dir > 0
      ? -Math.PI / 2
      : Math.PI / 2
    : lane.dir > 0
      ? Math.PI
      : 0;
}

// A civilian car driving its lane at its own cruising speed.
export function addTraffic(city, lane, x, z, extra = {}) {
  const r = city.random;
  const cruise = 8 + r() * 3.5;
  const t = {
    id: city.nextId++,
    x,
    z,
    lane,
    angle: lane.axis ? headingOf(lane) : 0,
    vx: 0,
    vz: 0,
    speed: cruise,
    cruise,
    state: "drive", // drive | yield | wreck
    timer: 0,
    health: 100,
    honkAt: -10,
    color: Math.floor(r() * TRAFFIC_COLORS),
    parked: false,
    ...extra,
  };
  city.traffic.push(t);
  return t;
}
export { laneCenter };

function spawnTraffic(sim, city) {
  const p = sim.player,
    r = city.random;
  if (city.graphLife) {
    const lanes = city.graphLife.lanes;
    for (let tries = 0; tries < 10; tries++) {
      const lane = lanes[Math.floor(r() * lanes.length)], s = r() * lane.len;
      const q = pointAt(lane, s), d = Math.hypot(q.x - p.x, q.z - p.z);
      if (d < 32 || d > 68) continue;
      if ([...city.traffic, ...sim.police].some((o) => Math.hypot(o.x - q.x, o.z - q.z) < 8)) continue;
      addTraffic(city, lane, q.x, q.z, { s, angle: Math.atan2(-q.ux, -q.uz) });
      return;
    }
    return;
  }
  for (let tries = 0; tries < 8; tries++) {
    const axis = r() < 0.5 ? "x" : "z";
    const line = LINES[1 + Math.floor(r() * (LINES.length - 2))];
    const dir = r() < 0.5 ? 1 : -1;
    const along =
      (axis === "x" ? p.x : p.z) + (r() < 0.5 ? -1 : 1) * (35 + r() * 30);
    if (Math.abs(along) > 85) continue;
    const lane = { axis, line, dir };
    const c = laneCenter(lane);
    const x = axis === "x" ? along : c,
      z = axis === "x" ? c : along;
    if (Math.hypot(x - p.x, z - p.z) < 30) continue;
    // Not on top of another car.
    if (
      [...city.traffic, ...sim.police].some(
        (o) => Math.hypot(o.x - x, o.z - z) < 8,
      )
    )
      continue;
    addTraffic(city, lane, x, z);
    return;
  }
}

function syncParked(sim, city) {
  const p = sim.player,
    range = city.budget.range;
  let active = city.traffic.filter((t) => t.parked).length;
  for (const spot of city.parking) {
    const d = Math.hypot(spot.x - p.x, spot.z - p.z);
    // Wrecks always come back (few, and they show what happened); ordinary
    // parked cars only up to the budget.
    if (
      !spot.car &&
      d < range &&
      (spot.wrecked || active < city.budget.parked)
    ) {
      spot.car = {
        id: city.nextId++,
        x: spot.x,
        z: spot.z,
        angle: spot.angle,
        vx: 0,
        vz: 0,
        speed: 0,
        state: "parked",
        health: 100,
        color: spot.color ?? (spot.id * 7) % TRAFFIC_COLORS,
        parked: true,
        spot,
      };
      if (spot.wrecked) {
        spot.car.state = "wreck";
        spot.car.health = 0;
      }
      city.traffic.push(spot.car);
      active++;
    }
  }
  // Parked cars far away go back to their spot data (where they ended up).
  city.traffic = city.traffic.filter((t) => {
    if (!t.parked) return true;
    if (Math.hypot(t.x - p.x, t.z - p.z) < range + 15) return true;
    t.spot.x = t.x;
    t.spot.z = t.z;
    t.spot.angle = t.angle;
    t.spot.wrecked = t.state === "wreck";
    t.spot.car = null;
    return false;
  });
}

function sirenNear(sim, car, range) {
  return sim.police.some(
    (c) => c.state === "active" && Math.hypot(c.x - car.x, c.z - car.z) < range,
  );
}

function driveTraffic(sim, city, t, dt) {
  const lane = t.lane;
  const gdir = lane.axis ? null : pointAt(lane, (t.s ?? 0) + 2);
  const fx = gdir ? gdir.ux : lane.axis === "x" ? lane.dir : 0,
    fz = gdir ? gdir.uz : lane.axis === "z" ? lane.dir : 0;
  // Anything ahead in my lane? (cars, the player, police, pedestrians)
  let gap = Infinity;
  const ahead = (o, r) => {
    const dx = o.x - t.x,
      dz = o.z - t.z;
    const along = dx * fx + dz * fz,
      side = Math.abs(dx * fz - dz * fx);
    if (along > 0 && side < 1.6 + r) gap = Math.min(gap, along);
  };
  for (const o of city.traffic) if (o !== t) ahead(o, 0.3);
  for (const c of sim.police) if (c.state === "active") ahead(c, 0.3);
  ahead(sim.player, 0.3);
  for (const q of city.pedestrians) ahead(q, -0.6);
  // A chase coming through: honk, pull over to the kerb and stop.
  const p = sim.player;
  // Caught inside a police cordon round the player: get out of the way
  // (drive off) rather than sit in the gap the police need to close.
  if (sim.cordon && Math.hypot(p.x - t.x, p.z - t.z) < 10) t.leaving = true;
  else if (t.leaving && Math.hypot(p.x - t.x, p.z - t.z) > 25)
    t.leaving = false;
  const chase =
    !t.leaving &&
    (sirenNear(sim, t, 26) ||
      (Math.hypot(p.x - t.x, p.z - t.z) < 18 && Math.hypot(p.vx, p.vz) > 12));
  if (t.leaving && t.state === "yield") t.state = "drive";
  if (t.state === "drive" && chase) {
    t.state = "yield";
    t.timer = 2.2 + city.random() * 1.2;
    city.stats.trafficBrakes++;
    if (sim.elapsed - t.honkAt > 3) {
      t.honkAt = sim.elapsed;
      city.stats.honks++;
      event(city, sim, {
        type: "traffic",
        action: "honk",
        x: t.x,
        z: t.z,
        strength: 1,
      });
    }
  }
  let target = t.cruise;
  if (t.state === "yield") {
    target = 0;
    t.timer -= dt;
    if (t.timer <= 0 && !chase) t.state = "drive";
  }
  target = Math.min(target, Math.max(0, (gap - 4.5) * 1.6));
  // Hard braking is visible: brake much faster than accelerating.
  const rate = target < t.speed ? 9 : 3;
  t.speed += clamp(target - t.speed, -rate * dt, rate * dt);
  if (!lane.axis) {
    driveGraphLane(sim, city, t, dt);
    return;
  }
  // Lane keeping (pulled over towards the kerb while yielding).
  const want =
    laneCenter(t.lane) +
    (t.state === "yield"
      ? t.lane.dir * 0.8 * (t.lane.axis === "x" ? 1 : -1)
      : 0);
  const across = t.lane.axis === "x" ? t.z : t.x;
  const correct = clamp(want - across, -2 * dt, 2 * dt);
  // At a junction: straight on, or turn left/right onto the crossing road
  // (never off the map; a U-turn only at a dead end).
  const along = lane.axis === "x" ? t.x : t.z;
  const next = Math.round(along / SPACING) * SPACING;
  const junction = `${lane.axis}:${next}`;
  if (
    LINES.includes(next) &&
    Math.abs(along - next) < t.speed * dt + 0.05 &&
    (along - next) * lane.dir <= 0 &&
    t.lastJunction !== junction
  ) {
    const options = [];
    if (Math.abs(next + lane.dir * SPACING) <= 90) options.push(null, null);
    for (const d of [-1, 1])
      if (Math.abs(lane.line + d * SPACING) <= 90)
        options.push({
          axis: lane.axis === "x" ? "z" : "x",
          line: next,
          dir: d,
        });
    const pick = options.length
      ? options[Math.floor(city.random() * options.length)]
      : { ...lane, dir: -lane.dir };
    if (pick) {
      t.lane = pick;
      // Onto the new road's lane; its next junction is the one we are on.
      if (pick.axis === "x") t.z = laneCenter(pick);
      else t.x = laneCenter(pick);
      t.lastJunction = `${pick.axis}:${pick.axis === "x" ? Math.round(t.x / SPACING) * SPACING : Math.round(t.z / SPACING) * SPACING}`;
    } else t.lastJunction = junction;
  }
  const nl = t.lane;
  const nfx = nl.axis === "x" ? nl.dir : 0,
    nfz = nl.axis === "z" ? nl.dir : 0;
  t.vx = nfx * t.speed;
  t.vz = nfz * t.speed;
  t.x += t.vx * dt + (nl.axis === "z" ? correct : 0);
  t.z += t.vz * dt + (nl.axis === "x" ? correct : 0);
  const heading = headingOf(nl);
  const diff = Math.atan2(
    Math.sin(heading - t.angle),
    Math.cos(heading - t.angle),
  );
  t.angle += clamp(diff, -4 * dt, 4 * dt);
}

// Generated city: follow the lane's polyline, steering for a point a few
// metres ahead (so a shove off the lane is recovered and the turn across a
// junction onto the next lane is a smooth curve); at the lane's end pick a
// lane leaving that junction (rarely back the way it came).
function driveGraphLane(sim, city, t, dt) {
  const life = city.graphLife;
  let lane = t.lane;
  const opOf = (l) => (l.op != null ? sim.overpasses?.[l.op] : null);
  const pr = project(lane, t.x, t.z);
  t.s = Math.max(t.s ?? 0, pr.s);
  if (t.s >= lane.len - 1.5) {
    const next = (life.from.get(lane.end) || []).filter((l) => l.edge !== lane.edge && (!opOf(l) || opOf(l).state === "up"));
    const pick = next.length ? next[Math.floor(city.random() * next.length)] : life.lanes.find((l) => l.edge === lane.edge && l.dir !== lane.dir);
    if (pick) {
      t.lane = lane = pick;
      t.s = project(pick, t.x, t.z).s;
    }
  }
  const aim = pointAt(lane, t.s + 3.5 + (t.state === "yield" ? 0 : 0));
  // Pulled towards the kerb while yielding.
  const ax = aim.x + (t.state === "yield" ? -aim.uz * 0.8 : 0), az = aim.z + (t.state === "yield" ? aim.ux * 0.8 : 0);
  const heading = Math.atan2(-(ax - t.x), -(az - t.z));
  const diff = Math.atan2(Math.sin(heading - t.angle), Math.cos(heading - t.angle));
  t.angle += clamp(diff, -3 * dt, 3 * dt);
  t.vx = -Math.sin(t.angle) * t.speed;
  t.vz = -Math.cos(t.angle) * t.speed;
  t.x += t.vx * dt;
  t.z += t.vz * dt;
  t.s += t.speed * dt * Math.max(0, Math.cos(diff));
  // On the overpass: up on its deck (or, if it has come down, a wreck on
  // the street below).
  const op = opOf(lane);
  if (op) {
    const s = overpassLocal(op, t.x, t.z).s;
    if (op.state !== "up" && s > op.R - 0.5 && s < op.L - op.R + 0.5) {
      t.state = "wreck";
      t.health = 0;
      t.level = 0;
      t.falling = true;
      return;
    }
    t.level = 1;
    t.y = overpassHeight(op, s);
  } else if (t.level) {
    t.level = 0;
    t.y = 0;
  }
}

// Two round bodies bump: they separate by mass and swap momentum along the
// contact normal, with a little bounce.
export function bump(a, ra, ma, b, rb, mb) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    d = Math.hypot(dx, dz);
  if (d >= ra + rb || d < 1e-6) return 0;
  const nx = dx / d,
    nz = dz / d,
    depth = ra + rb - d;
  const wa = mb / (ma + mb),
    wb = ma / (ma + mb);
  a.x -= nx * depth * wa;
  a.z -= nz * depth * wa;
  b.x += nx * depth * wb;
  b.z += nz * depth * wb;
  const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  if (closing <= 0) return 0;
  const j = (closing * 1.2) / (1 / ma + 1 / mb);
  a.vx -= (j / ma) * nx;
  a.vz -= (j / ma) * nz;
  b.vx += (j / mb) * nx;
  b.vz += (j / mb) * nz;
  return closing;
}

// byPlayer: the player hit this car, or shoved a car into it moments ago.
function damageTraffic(sim, city, t, closing, byPlayer = false) {
  if (t.state === "wreck") return;
  t.health -= closing * 4.5;
  if (t.health <= 0) {
    t.health = 0;
    t.state = "wreck";
    t.speed = 0;
    city.stats.trafficWrecks++;
    event(city, sim, {
      type: "traffic",
      action: "wreck",
      targetId: t.id,
      x: t.x,
      z: t.z,
      strength: closing,
      byPlayer,
    });
  }
}

function updateTraffic(sim, city, dt) {
  const p = sim.player,
    budget = city.budget;
  syncParked(sim, city);
  city.traffic = city.traffic.filter((t) => {
    if (t.parked || Math.hypot(t.x - p.x, t.z - p.z) < budget.range + 25)
      return true;
    // A wrecked car stays where it ended up: it is kept as a (wrecked)
    // parked spot and shows again when the player comes back.
    if (t.state === "wreck")
      city.parking.push({
        id: city.parking.length,
        x: t.x,
        z: t.z,
        angle: t.angle,
        color: t.color,
        wrecked: true,
        car: null,
      });
    return false;
  });
  const moving = city.traffic.filter((t) => !t.parked);
  if (moving.length < budget.traffic) spawnTraffic(sim, city);
  else if (moving.length > budget.traffic) {
    // Over budget: the car furthest from the player goes.
    const far = moving.reduce((a, b) =>
      Math.hypot(b.x - p.x, b.z - p.z) > Math.hypot(a.x - p.x, a.z - p.z)
        ? b
        : a,
    );
    city.traffic.splice(city.traffic.indexOf(far), 1);
  }
  for (const t of city.traffic) {
    if (t.parked || t.state === "wreck") {
      // Shoved cars slide to a stop.
      t.vx *= Math.exp(-dt * 4);
      t.vz *= Math.exp(-dt * 4);
      t.x += t.vx * dt;
      t.z += t.vz * dt;
      if (t.state === "wreck") t.smoke = (t.smoke || 0) + dt;
      continue;
    }
    driveTraffic(sim, city, t, dt);
  }
  // Collisions: with the player, the police and each other.
  const lvl = (o) => o.level || 0;
  for (const t of city.traffic) {
    const m = t.parked || t.state === "wreck" ? 1.6 : 1;
    // The player's car is heavier the sturdier it is (a heavy car shoves
    // a civilian car further and loses less itself).
    const pm = 1.3 * ((sim.vehicle?.stats.durability || 100) / 100);
    let closing = lvl(p) === lvl(t) ? bump(p, CONFIG.radius, pm, t, 1.1, m) : 0;
    if (closing > 0) {
      p.speed = Math.max(0, p.speed - closing * 0.4);
      if (closing > 6) sim.damage(5);
      if (closing > 3) {
        city.stats.trafficCollisions++;
        t.playerHitAt = sim.elapsed;
        damageTraffic(sim, city, t, closing, true);
        if (t.state === "drive") {
          t.state = "yield";
          t.timer = 2.5;
        }
        event(city, sim, {
          type: "traffic",
          action: "crash",
          x: t.x,
          z: t.z,
          strength: closing,
          byPlayer: true,
        });
        sim.cameraKick = Math.max(
          sim.cameraKick || 0,
          Math.min(0.35, closing / 40),
        );
      }
    }
    for (const c of sim.police) {
      if (c.state !== "active" || lvl(c) !== lvl(t)) continue;
      // A police car parked in a cordon or roadblock is braced: a civilian
      // car bumping it moves itself, not the police car.
      closing = bump(
        c,
        CONFIG.policeRadius,
        c.blockState === "hold" ? 1e6 : 1.4,
        t,
        1.1,
        m,
      );
      if (closing > 3) {
        city.stats.trafficCollisions++;
        damageTraffic(sim, city, t, closing);
        // Police take a knock but civilian traffic never wrecks them.
        if (closing > 8) c.health = Math.max(1, c.health - closing * 0.8);
        event(city, sim, {
          type: "traffic",
          action: "crash",
          x: t.x,
          z: t.z,
          strength: closing,
        });
      }
    }
  }
  for (let i = 0; i < city.traffic.length; i++)
    for (let j = i + 1; j < city.traffic.length; j++) {
      const a = city.traffic[i],
        b = city.traffic[j];
      if ((a.level || 0) !== (b.level || 0)) continue;
      const closing = bump(
        a,
        0.95,
        a.parked ? 1.6 : 1,
        b,
        0.95,
        b.parked ? 1.6 : 1,
      );
      if (closing > 4) {
        const shoved = [a, b].some(
          (c) => sim.elapsed - (c.playerHitAt ?? -Infinity) < 2,
        );
        damageTraffic(sim, city, a, closing, shoved);
        damageTraffic(sim, city, b, closing, shoved);
      }
    }
  // Keep traffic out of buildings.
  const dynamic =
    sim.solids.length > sim.staticSolids.length
      ? sim.solids.slice(sim.staticSolids.length)
      : [];
  for (const t of city.traffic) {
    for (const b of boxesNear(city, t.x, t.z)) resolveBuilding(t, b, 1.0);
    for (const b of dynamic) resolveBuilding(t, b, 1.0);
  }
}

// ------------------------------------------------------------------ main --

export function updateCity(sim, dt) {
  const city = sim.city;
  if (!city) return;
  sim.cameraKick = 0;
  const p = sim.player;
  if (!p.level) hitProps(sim, city, p, CONFIG.radius, true);
  for (const c of sim.police)
    if (
      c.state === "active" &&
      !c.level &&
      Math.hypot(c.x - p.x, c.z - p.z) < city.budget.range
    )
      // Police cars ram through street furniture: posts and street trees
      // go down at half the speed a normal car needs.
      hitProps(sim, city, c, CONFIG.policeRadius, false, 0.5);
  for (const t of city.traffic)
    if (!t.parked && t.state !== "wreck") hitProps(sim, city, t, 1.3, false);
  // TARGET HUNT: the fleeing car crashes through street furniture too.
  if (sim.target?.state === "fleeing") hitProps(sim, city, sim.target, 1.25, false, 0.7);
  updateProps(sim, city, dt);
  updatePedestrians(sim, city, dt);
  updateTraffic(sim, city, dt);
}
