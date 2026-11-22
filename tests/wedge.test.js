// V2.1: the player car wedged between buildings after a crash.
import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../src/game/simulation.js";
import { createLayout, gapFillers, resolveBuilding } from "../src/world/layout.js";
import { CONFIG } from "../src/game/config.js";
import { makePolice } from "../src/game/police.js";
import { wedgeSweep } from "../scripts/wedge-repro.mjs";

const quiet = () => {
  const s = new Simulation(createLayout(), { reinforcements: false, barricades: false });
  s.start();
  s.police = [];
  return s;
};

test("gaps narrower than a car are closed for physics (recessed), alleys a car fits through are not", () => {
  const a = { x: 0, z: 0, w: 7, d: 7 }, narrow = { x: 9.2, z: 0, w: 7, d: 7 }, wide = { x: 13, z: 0, w: 7, d: 7 };
  const f = gapFillers([a, narrow]);
  assert.equal(f.length, 1);
  assert.ok(Math.abs(f[0].x - 4.6) < 1e-9 && Math.abs(f[0].w - 2.22) < 1e-9);
  assert.ok(Math.abs(f[0].d - (7 - 1.2)) < 1e-9, "recessed 0.6 m at each end");
  assert.equal(gapFillers([a, wide]).length, 0, "a 6 m alley stays open");
  // The downtown layout: four per block (the cross-shaped slots).
  const L = createLayout();
  assert.equal(gapFillers(L.buildings).length, L.buildings.length);
});

test("shoved into building gaps and corners at 263 angles/speeds/steering: never stuck, never inside a wall", () => {
  const r = wedgeSweep({});
  assert.ok(r.runs > 200);
  assert.equal(r.stuck.length, 0, JSON.stringify(r.stuck.slice(0, 3)));
  assert.equal(r.overlaps, 0);
});

test("a car left overlapping a building after a step goes back to its last legal spot", () => {
  const s = quiet();
  const p = s.player;
  s.update(1 / 60, {});
  const legal = { ...p.lastLegal };
  const b = s.layout.buildings[0];
  Object.assign(p, { x: b.x + b.w / 2 - 0.3, z: b.z, vx: 0, vz: 0 });
  // Deep inside: the wall push itself cannot fix it this step.
  s.constrain = () => false;
  s.update(1 / 60, {});
  assert.ok(Math.hypot(p.x - legal.x, p.z - legal.z) < 1.5, `restored near ${legal.x},${legal.z}: ${p.x},${p.z}`);
  assert.ok(s.stats.overlapRestores >= 1);
});

// A pocket the car is jammed in: walls all round, only a 1.4 m slot behind
// (narrower than the car): no heading it could drive along is open.
function pocket(s) {
  const p = s.player;
  Object.assign(p, { x: 0, z: 8, angle: 0, vx: 0, vz: -20, speed: 20 });
  const walls = [
    { x: -1.75, z: 8, w: 0.6, d: 6, kind: "test" },
    { x: 1.75, z: 8, w: 0.6, d: 6, kind: "test" },
    { x: 0, z: 4.7, w: 4.1, d: 0.6, kind: "test" },
    { x: -1.4, z: 11.3, w: 1.3, d: 0.6, kind: "test" },
    { x: 1.4, z: 11.3, w: 1.3, d: 0.6, kind: "test" },
  ];
  s.staticSolids.push(...walls);
  s.solids = [...s.staticSolids];
  s.solidGrid = null;
  s.refreshNavigation?.();
  return walls;
}

test("wedged with no open heading and no police near: a short glide (not a jump) to a road point", () => {
  const s = quiet();
  pocket(s);
  const p = s.player;
  let maxStep = 0, last = { x: p.x, z: p.z };
  for (let f = 0; f < 6 * 60; f++) {
    s.update(1 / 60, { right: f % 90 < 45 });
    maxStep = Math.max(maxStep, Math.hypot(p.x - last.x, p.z - last.z));
    last = { x: p.x, z: p.z };
  }
  assert.ok(s.stats.recoveryGlides >= 1, "glided out");
  assert.ok(Math.hypot(p.x, p.z - 8) > 3, `left the pocket: ${p.x},${p.z}`);
  assert.ok(maxStep < 0.6, `moved smoothly (max ${maxStep.toFixed(2)} m a frame)`);
  assert.ok(!s.nearSolids(p.x, p.z, 4).some((b) => resolveBuilding({ x: p.x, z: p.z }, b, CONFIG.radius - 0.05)));
});

test("the recovery is never a way out of the police: with a police car near it does not fire", () => {
  const s = quiet();
  pocket(s);
  s.police = [Object.assign(makePolice(0), { x: 6, z: 8, vx: 0, vz: 0, angle: 0 })];
  s.police[0].update = undefined;
  for (let f = 0; f < 6 * 60; f++) {
    s.police[0].x = 6; s.police[0].z = 8; s.police[0].vx = s.police[0].vz = 0;
    s.update(1 / 60, {});
  }
  assert.equal(s.stats.recoveryGlides || 0, 0);
  assert.ok(Math.hypot(s.player.x, s.player.z - 8) < 3, "still in the pocket");
});
