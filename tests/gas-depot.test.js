// Gas storage depot: a hard ram ruptures a tank in a major blast and the
// others follow in a chain; a blast next to a tank sets it off; a soft
// touch does nothing; fragments land and stay near the depot; it is all
// back for the next run. It is in the shared preview layout (survival and
// TARGET HUNT alike).
import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";

// Sign boards draw text on a canvas: a do-nothing canvas for Node.
if (!globalThis.document) {
  const ctx = new Proxy({}, { get: (o, k) => (k === "measureText" ? () => ({ width: 10 }) : k in o ? o[k] : () => {}), set: (o, k, v) => ((o[k] = v), true) });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx }) };
}
import { GasDepot, GASDEPOT, GD_PLAN, depotSolids } from "../src/preview/locations/gasdepot.js";
import { previewLayout } from "../src/preview/locations/layout.js";
import { explosionScale } from "../src/render/explosions.js";

function world() {
  const events = [];
  const sim = {
    elapsed: 0, eventId: 0, events, police: [], health: 100,
    player: { x: 0, z: 0, vx: 0, vz: 0 }, target: null,
    damage(n) { this.health -= n; },
    explodePolice(c) { c.state = "wreck"; },
  };
  const rt = { fx: [], flyers: { items: [], launch() {} }, throwChunk() {} };
  const depot = new GasDepot(new THREE.Scene(), rt);
  return { sim, rt, depot };
}
const run = (w, seconds) => {
  for (let i = 0; i < seconds * 60; i++) {
    w.sim.elapsed += 1 / 60;
    w.depot.step(w.sim, w.sim.elapsed, 1 / 60);
  }
};

test("the depot is in the preview layout with solid tanks and open driveways", () => {
  const L = previewLayout();
  assert.equal(L.locations.gasDepot, GASDEPOT);
  for (const s of depotSolids()) assert.ok(L.obstacles.includes(s) || L.obstacles.some((o) => o.x === s.x && o.z === s.z && o.kind === s.kind));
  // No city building left in the block.
  assert.ok(!L.buildings.some((b) => Math.abs(b.x - GASDEPOT.x) < 10 && Math.abs(b.z - GASDEPOT.z) < 10));
});

test("a hard ram ruptures a tank (major blast) and the chain takes the rest; police near it are wrecked", () => {
  const w = world();
  w.depot.step(w.sim, 0, 1 / 60);
  const b = GD_PLAN.bullets[1];
  const cop = { state: "active", x: GASDEPOT.x + b.x + 5, z: GASDEPOT.z + b.z, vx: 0, vz: 0, health: 100 };
  w.sim.police.push(cop);
  // Soft touch: nothing.
  const car = { x: GASDEPOT.x + b.x - b.len / 2 - 1.4, z: GASDEPOT.z + b.z, vx: 4, vz: 0 };
  w.depot.touch(w.sim, car, 1.15, 4);
  assert.equal(w.depot.stats.ruptured, 0);
  // Hard ram: it goes up, then the others one after another.
  car.vx = 20;
  w.depot.touch(w.sim, car, 1.15, 20);
  assert.equal(w.depot.stats.ruptured, 1);
  const blast = w.sim.events.find((e) => e.type === "explosion");
  assert.ok(blast.major && explosionScale(blast) > explosionScale({ type: "explosion" }) * 2);
  assert.equal(cop.state, "wreck");
  run(w, 2.5);
  assert.deepEqual(w.depot.vessels.map((v) => v.state), ["burst", "burst", "burst"]);
  assert.equal(w.sim.events.filter((e) => e.type === "explosion").length, 3);
  // Fragments landed and stay near the depot (not out on the roads).
  run(w, 3);
  assert.equal(w.depot.flying.length, 0);
  for (const v of w.depot.vessels)
    for (const m of v.parts) {
      assert.ok(m.visible);
      assert.ok(Math.abs(m.position.x) < 13 && Math.abs(m.position.z) < 13, `${m.position.x.toFixed(1)},${m.position.z.toFixed(1)}`);
    }
  assert.ok(w.rt.fx.filter((f) => f.kind === "burn").length >= 6, "fires keep burning");
  // Next run: all back.
  w.depot.reset();
  assert.ok(w.depot.vessels.every((v) => v.state === "intact" && v.live.visible && !v.wreck.visible));
});

test("an explosion next to a tank sets it off (a police car blowing up, the hunted target)", () => {
  const w = world();
  w.depot.step(w.sim, 0, 1 / 60);
  const s = GD_PLAN.sphere;
  w.sim.events.push({ id: ++w.sim.eventId, type: "explosion", cause: "target", x: GASDEPOT.x + s.x + 5, z: GASDEPOT.z + s.z, time: 0 });
  run(w, 0.6);
  assert.ok(w.depot.stats.ruptured >= 1);
});
