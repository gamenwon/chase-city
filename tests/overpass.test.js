// Elevated road (map quality pass): a multi-block elevated roadway above
// an avenue, straight or curved, two driving levels, police on both.
import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../src/game/simulation.js";
import { generateCity, overpassHeight } from "../src/world/citygen.js";
import { createLayout, resolveBuilding } from "../src/world/layout.js";
import { makePath, pointAt } from "../src/game/citygraph.js";
import { hitPillar, breakPillar, overpassLocal, pillarSpan, overpassGapAt } from "../src/game/overpass.js";
import { makePolice } from "../src/game/police.js";
import { CONFIG } from "../src/game/config.js";

const find = (curved) => {
  for (let seed = 1; seed < 80; seed++) {
    const L = generateCity(seed);
    if (L.overpasses[0] && L.overpasses[0].curved === curved) return seed;
  }
  return null;
};
const STRAIGHT = find(false), CURVED = find(true);
const make = (seed) => {
  const s = new Simulation(createLayout(), { cityGenerator: generateCity, seed, reinforcements: false, barricades: false });
  s.start();
  s.police = [];
  return s;
};
// Steer (left/right only) for a point a few metres further along a path.
function follow(s, path, offset = 0) {
  const p = s.player;
  let best = 0, bd = Infinity;
  for (let t = 0; t <= path.len; t += 1) {
    const q = pointAt(path, t), d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d < bd) (bd = d), (best = t);
  }
  const q = pointAt(path, Math.min(path.len, best + 9));
  const tx = q.x - q.uz * offset, tz = q.z + q.ux * offset;
  const want = Math.atan2(-(tx - p.x), -(tz - p.z));
  const d = Math.atan2(Math.sin(want - p.angle), Math.cos(want - p.angle));
  return { left: d > 0.04, right: d < -0.04 };
}
const startAt = (s, op, back, side = 0) => {
  const p = s.player;
  const x = op.a.x - op.u.x * back - op.u.z * side, z = op.a.z - op.u.z * back + op.u.x * side;
  Object.assign(p, { x, z, angle: Math.atan2(-op.u.x, -op.u.z), vx: op.u.x * 22, vz: op.u.z * 22, speed: 22, level: 0, y: 0 });
  s.previousPlayer = { x, z };
};

test("elevated roads: most cities get one, 2-3 blocks long (80 m+), some curved; the city connects without it", () => {
  let n = 0, curved = 0;
  for (let seed = 1; seed <= 24; seed++) {
    const L = generateCity(seed), op = L.overpasses[0];
    if (!op) continue;
    n++;
    curved += op.curved;
    assert.ok(op.L >= 80, `seed ${seed}: ${op.L.toFixed(0)} m`);
    assert.equal(op.R, 28, "long, eased ramps");
    // Gradual: the steepest part of a ramp is under 17 degrees.
    let steep = 0;
    for (let t = 0; t < op.R; t += 0.5) steep = Math.max(steep, (overpassHeight(op, t + 0.5) - overpassHeight(op, t)) / 0.5);
    assert.ok(Math.atan(steep) < (17 * Math.PI) / 180, `slope ${steep.toFixed(2)}`);
  }
  assert.ok(n >= 15, `${n}/24 with an elevated road`);
  assert.ok(curved >= 3, `${curved} curved`);
  assert.ok(STRAIGHT && CURVED);
});

for (const [label, seed] of [["straight", STRAIGHT], ["curved", CURVED]])
  test(`${label} elevated road: up the ramp, along the whole deck (level 1, ${5.2} m), down the far ramp, steering only`, () => {
    const s = make(seed), op = s.overpasses[0];
    const path = makePath(op.pts);
    startAt(s, op, 14);
    let maxY = 0, levels = [], scrapes = 0;
    for (let f = 0; f < 60 * 12; f++) {
      s.update(1 / 60, follow(s, path));
      maxY = Math.max(maxY, s.player.y || 0);
      if (levels.at(-1) !== (s.player.level || 0)) levels.push(s.player.level || 0);
      if (s.player.level && s.player.lastImpact > 4) scrapes++;
      if (levels.length === 3) break;
    }
    assert.ok(Math.abs(maxY - op.H) < 0.05, `max height ${maxY}`);
    assert.deepEqual(levels, [0, 1, 0]);
    const loc = overpassLocal(op, s.player.x, s.player.z);
    assert.ok(loc.s > op.L - 1, "came off at the far end");
    assert.ok(scrapes < 10, `hit the parapets ${scrapes} times`);
  });

test("ground traffic drives beside the ramp (avenue side lane) and on under the deck", () => {
  const s = make(STRAIGHT), op = s.overpasses[0];
  startAt(s, op, 14, 6.4); // the right-hand lane of the 18 m avenue
  let lv = 0;
  const p0 = { x: s.player.x, z: s.player.z };
  for (let f = 0; f < 60 * 3; f++) {
    s.update(1 / 60, {});
    lv = Math.max(lv, s.player.level || 0);
  }
  assert.equal(lv, 0, "stayed on the ground");
  const along = (s.player.x - p0.x) * op.u.x + (s.player.z - p0.z) * op.u.z;
  assert.ok(along > 45, `drove on beside it (${along.toFixed(0)} m)`);
  assert.ok(!s.solids.some((b) => resolveBuilding({ x: s.player.x, z: s.player.z }, b, CONFIG.radius - 0.05)));
});

test("police follow the player up onto the deck and along it (two-level routing)", () => {
  for (const seed of [STRAIGHT, CURVED]) {
    const s = make(seed), op = s.overpasses[0];
    const path = makePath(op.pts);
    const mid = pointAt(path, op.L / 2);
    assert.ok(s.navigation.findPath({ x: op.a.x - op.u.x * 14, z: op.a.z - op.u.z * 14 }, { x: mid.x, z: mid.z, level: 1 }).some((q) => q.level === 1));
    const p = s.player;
    Object.assign(p, { x: mid.x, z: mid.z, level: 1, op: 0, y: op.H, vx: 0, vz: 0, speed: 0 });
    s.police = [Object.assign(makePolice(0), { x: op.a.x - op.u.x * 14, z: op.a.z - op.u.z * 14, angle: Math.atan2(-op.u.x, -op.u.z) })];
    let reached = false;
    for (let f = 0; f < 60 * 12 && !reached; f++) {
      Object.assign(p, { x: mid.x, z: mid.z, vx: 0, vz: 0 });
      s.update(1 / 60, {});
      const c = s.police[0];
      reached = c.level === 1 && Math.hypot(c.x - p.x, c.z - p.z) < 9;
    }
    assert.ok(reached, `seed ${seed}`);
  }
});

test("pillars stand in the median, out of every crossing street; weak (striped) ones crack and break, strong ones do not", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const L = generateCity(seed), op = L.overpasses[0];
    if (!op) continue;
    const roads = L.graph.edges.filter((e) => e.kind === "road" && !e.avenue);
    for (const q of op.pillars)
      for (const e of roads)
        for (let k = 1; k < e.pts.length; k++) {
          const a = e.pts[k - 1], b = e.pts[k], vx = b.x - a.x, vz = b.z - a.z, l2 = vx * vx + vz * vz;
          const t = Math.max(0, Math.min(1, ((q.x - a.x) * vx + (q.z - a.z) * vz) / l2));
          assert.ok(Math.hypot(a.x + vx * t - q.x, a.z + vz * t - q.z) > e.width / 2, `seed ${seed}: pillar in a street`);
        }
  }
  const s = make(STRAIGHT), op = s.overpasses[0];
  const weak = op.pillars.find((q) => q.weak), strong = op.pillars.find((q) => !q.weak);
  // One light hit: a crack, still standing; repeated hard hits (heavier
  // car: fewer) bring it down.
  hitPillar(s, weak, 12, 1);
  assert.ok(weak.alive && weak.health < 100);
  let hits = 0;
  while (weak.alive && hits < 20) hitPillar(s, weak, 26, 1.5), hits++;
  assert.ok(!weak.alive && hits <= 4, `${hits} hits`);
  if (strong) {
    for (let k = 0; k < 10; k++) hitPillar(s, strong, 40, 2);
    assert.ok(strong.alive, "a strong pillar never gives");
  }
});

test("a broken pillar brings down only its own span: cars on it fall, cars under it are crushed, the rest stands; police re-route", () => {
  for (const seed of [STRAIGHT, CURVED]) {
    const s = make(seed), op = s.overpasses[0];
    const path = makePath(op.pts);
    const weak = op.pillars.filter((q) => q.weak)[Math.floor(op.pillars.filter((q) => q.weak).length / 2)];
    const span = pillarSpan(op, weak);
    // A police car on the deck in that span, one under it, one on the deck
    // outside it (on a part still standing).
    const on = pointAt(path, (span.s0 + span.s1) / 2), safeS = span.s1 + 6 < op.L - op.solidTo ? span.s1 + 6 : span.s0 - 6;
    const off = pointAt(path, safeS);
    const mk = (q, level, k) => Object.assign(makePolice(k), { x: q.x, z: q.z, level, op: level ? 0 : null, y: level ? op.H : 0, angle: Math.atan2(-q.ux, -q.uz), vx: 0, vz: 0, speed: 0 });
    s.police = [mk(on, 1, 0), mk({ ...on, x: on.x - on.uz * 0.5, z: on.z + on.ux * 0.5 }, 0, 1), mk(off, 1, 2)];
    for (const c of s.police) c.cooldown = 99, c.routeTimer = 99;
    s.player.x = op.a.x - op.u.x * 60;
    s.player.z = op.a.z - op.u.z * 60;
    breakPillar(s, weak);
    assert.equal(op.gaps.length, 1);
    assert.ok(Math.abs(op.gaps[0].s0 - span.s0) < 0.01 && Math.abs(op.gaps[0].s1 - span.s1) < 0.01);
    assert.ok(span.s1 - span.s0 < op.L * 0.6, "only part of the road");
    // Nobody routes over the elevated road any more.
    const mid = pointAt(path, op.L / 2);
    assert.ok(!s.navigation.findPath({ x: op.a.x - op.u.x * 14, z: op.a.z - op.u.z * 14 }, { x: mid.x, z: mid.z, level: 1 }).some((q) => q.level === 1 && q.op === 0 && !q.dead));
    let fell = false;
    for (let f = 0; f < 60 * 2.5; f++) {
      for (const c of s.police) Object.assign(c, { vx: c.vx * 0.5, vz: c.vz * 0.5 });
      s.update(1 / 60, {});
      if (s.police[0].falling || s.police[0].level === 0) fell = true;
    }
    assert.ok(fell, "the car on the span fell");
    assert.equal(op.gaps[0].state, "down");
    assert.ok(op.gaps[0].crushed >= 1, "the car under it was crushed");
    // The deck outside the span is still there.
    assert.ok(!overpassGapAt(op, safeS));
    assert.ok(op.debris.length >= 2 && op.debris.every((d) => d.solid));
  }
});
