// TARGET HUNT evaluation (full game simulation, city on, no police).
//
// 1. Target alone for 120 s (the player parked out of the way): it must
//    never be inside a solid, never jump, keep moving, visit many junctions
//    and not loop.
// 2. Interceptions: a bot with only the game's left/right controls (auto
//    forward) chases it: straight at it when the line is clear, otherwise
//    along a road route; counts hits, damage per hit, time to takedown.
//
//   node scripts/hunt-eval.mjs [seeds] [layout: base|preview]
import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
import { previewLayout } from "../src/preview/locations/layout.js";
import { angleDelta } from "../src/game/config.js";
import { resolveBuilding } from "../src/world/layout.js";
import { random } from "./autoplay.js";

const seeds = +(process.argv[2] || 8);
const layout = process.argv[3] === "preview" ? previewLayout() : createLayout();
const make = (seed) => {
  const s = new Simulation(layout, { width: 390, height: 664, random: random(seed + 7000), city: true, cityProfile: "mobile", mission: "targetHunt" });
  s.start();
  return s;
};

// ------------------------------------------------------------ 1. alone --
function alone(seed, seconds = 120) {
  const s = make(seed), t = s.target;
  Object.assign(s.player, { x: 200, z: 200 }); // out of the world's way? keep it parked at its start instead
  const s2 = make(seed), t2 = s2.target;
  let inside = 0, jumps = 0, stuck = 0, maxStep = 0, topSpeed = 0;
  const junctions = new Set(), seq = [];
  let lastKey = "", last = { x: t2.x, z: t2.z }, still = 0;
  const park = { x: s2.player.x, z: s2.player.z, angle: s2.player.angle };
  for (let f = 0; f < seconds * 60; f++) {
    Object.assign(s2.player, { ...park, vx: 0, vz: 0, speed: 0 });
    s2.health = 100;
    s2.update(1 / 60, {});
    const step = Math.hypot(t2.x - last.x, t2.z - last.z);
    maxStep = Math.max(maxStep, step);
    if (step > 0.6) jumps++;
    still = step < 0.02 ? still + 1 / 60 : 0;
    if (still > 2) stuck++;
    last = { x: t2.x, z: t2.z };
    topSpeed = Math.max(topSpeed, Math.hypot(t2.vx, t2.vz));
    for (const b of s2.nearSolids(t2.x, t2.z, 3))
      if (resolveBuilding({ x: t2.x, z: t2.z }, b, 0.6)) inside++;
    const k = `${t2.from.x},${t2.from.z}`;
    if (k !== lastKey) {
      junctions.add(k);
      seq.push(k);
      lastKey = k;
    }
  }
  // Loops: the same 4-junction sequence repeated back to back.
  let loops = 0;
  for (let i = 8; i <= seq.length; i++) {
    const a = seq.slice(i - 8, i - 4).join("|"), b = seq.slice(i - 4, i).join("|");
    if (a === b) loops++;
  }
  return { seed, junctions: junctions.size, legs: seq.length, turns: t2.turns, replans: t2.replans, inside, jumps, maxStep: +maxStep.toFixed(2), stuckSeconds: stuck / 60, loops, topSpeed: +topSpeed.toFixed(1), state: t2.state };
}

// ------------------------------------------------------------ 2. chase --
function chase(seed, seconds = 150, skill = 1) {
  const s = make(seed), t = s.target;
  let route = [], routeAt = -9, firstHitAt = null;
  const hits = [];
  let lastHits = 0;
  for (let f = 0; f < seconds * 60 && !s.result; f++) {
    const p = s.player;
    // Lead the target a little (where it will be), more when far.
    const d = Math.hypot(t.x - p.x, t.z - p.z);
    const lead = Math.min(1.2, d / 22) * skill;
    const aim = { x: t.x + t.vx * lead, z: t.z + t.vz * lead };
    let goal = aim;
    if (!s.navigation.clear(p, aim, 1.2)) {
      if (s.elapsed - routeAt > 0.8 || !route.length) {
        route = s.navigation.findPath(p, aim, 1.2);
        routeAt = s.elapsed;
      }
      while (route.length > 1 && Math.hypot(route[0].x - p.x, route[0].z - p.z) < 6) route.shift();
      if (route.length) goal = route[Math.min(1, route.length - 1)] && s.navigation.clear(p, route[1] || route[0], 1.2) ? route[1] || route[0] : route[0];
    } else route = [];
    const want = Math.atan2(-(goal.x - p.x), -(goal.z - p.z));
    const delta = angleDelta(want, p.angle);
    const dead = 0.05 + (1 - skill) * 0.3;
    s.update(1 / 60, { left: delta > dead, right: delta < -dead });
    if (t.hits > lastHits) {
      hits.push(+(t.biggestHit).toFixed(1));
      lastHits = t.hits;
      if (firstHitAt === null) firstHitAt = s.elapsed;
    }
  }
  return {
    seed,
    skill,
    result: s.result || "running",
    takedownAt: t.state === "wrecked" ? +t.wreckedAt.toFixed(1) : null,
    firstHitAt: firstHitAt && +firstHitAt.toFixed(1),
    hits: t.hits,
    damage: Math.round(t.damageTaken),
    perHit: t.hits ? Math.round(t.damageTaken / t.hits) : 0,
    health: Math.round(t.health),
    police: s.police.length,
    playerHealth: Math.round(s.health),
    turns: t.turns,
    replans: t.replans,
  };
}

const A = Array.from({ length: seeds }, (_, i) => alone(i + 1));
console.log("ALONE", JSON.stringify(A));
const sum = (k) => A.reduce((n, r) => n + r[k], 0);
console.log(`alone: junctions avg ${(sum("junctions") / A.length).toFixed(1)}, turns avg ${(sum("turns") / A.length).toFixed(1)}, inside ${sum("inside")}, jumps ${sum("jumps")}, stuck s ${sum("stuckSeconds").toFixed(1)}, loops ${sum("loops")}, replans ${sum("replans")}`);
for (const skill of [1, 0.6]) {
  const C = Array.from({ length: seeds }, (_, i) => chase(i + 1, 150, skill));
  console.log("CHASE", skill, JSON.stringify(C));
  const won = C.filter((r) => r.takedownAt !== null);
  console.log(`chase skill ${skill}: takedowns ${won.length}/${C.length}, median time ${won.map((r) => r.takedownAt).sort((a, b) => a - b)[Math.floor(won.length / 2)]}, police ${C.reduce((n, r) => n + r.police, 0)}`);
}
