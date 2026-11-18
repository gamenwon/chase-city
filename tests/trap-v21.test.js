// Permanent trapping and sustained-contact camera shake (critical collision
// bugs). The game's auto-forward car must never stay pressed against a big
// tree, a post, a parked car or a building corner for ever, and only a new
// impact (not the same contact going on) may shake the camera.
import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
import { addTraffic, laneCenter } from "../src/game/city.js";
import { random } from "../scripts/autoplay.js";

const layout = createLayout();
function citySim(budget = { peds: 0, traffic: 0, parked: 0, range: 70 }) {
  const s = new Simulation(layout, { width: 390, height: 664, reinforcements: false, barricades: false, random: random(3), city: true,
    cityBudget: { profile: "test", level: 1, ...budget } });
  s.start();
  s.police = [];
  return s;
}
// The renderer shakes the camera for each new player event of strength > 5
// (src/render/city.js updateEvents): count those.
function run(s, seconds, steer = {}, only = () => true) {
  const start = { x: s.player.x, z: s.player.z };
  let away = 0, last = s.city.eventId, shakes = 0;
  for (let f = 0; f < seconds * 60; f++) {
    s.health = 100;
    s.update(1 / 60, steer);
    for (const e of s.city.events)
      if (e.id > last && e.byPlayer && e.strength > 5 && only(e)) shakes++;
    last = s.city.eventId;
    away = Math.max(away, Math.hypot(s.player.x - start.x, s.player.z - start.z));
  }
  return { away, shakes };
}
function aim(s, x, z, heading, back, speed = 24) {
  const fx = -Math.sin(heading), fz = -Math.cos(heading);
  Object.assign(s.player, { x: x - fx * back, z: z - fz * back, angle: heading, speed, vx: fx * speed, vz: fz * speed });
  s.previousPlayer = { x: s.player.x, z: s.player.z };
}

test("dead-centre into a big park tree, no steering: the car slides off and drives on", () => {
  for (const treeIndex of [0, 3, 6, 9])
    for (const heading of [0, 1.57, 3.14, 4.71]) {
      const s = citySim();
      const tree = s.city.props.filter((q) => q.kind === "bigTree")[treeIndex];
      aim(s, tree.x, tree.z, heading, 12);
      const r = run(s, 8);
      assert.ok(r.away > 20, `tree ${treeIndex} heading ${heading}: stuck (${r.away.toFixed(1)} m)`);
    }
});

test("held against a big tree (steering into it): one shake for the hit, none while pressed", () => {
  const s = citySim();
  const tree = s.city.props.filter((q) => q.kind === "bigTree")[3];
  aim(s, tree.x, tree.z, 0, 4, 14);
  const first = run(s, 0.6);
  assert.ok(first.shakes <= 2);
  // Now press into it: steering keeps the nose on the tree for a while.
  let shakes = 0;
  for (let i = 0; i < 10; i++) {
    aim(s, tree.x, tree.z, s.player.angle, 2.0, 3);
    shakes += run(s, 0.4, { left: true }, (e) => Math.hypot(e.x - tree.x, e.z - tree.z) < 1).shakes;
  }
  assert.ok(shakes <= 1, `sustained contact shook the camera ${shakes} times`);
});

test("pushing a parked car nose-on: no continuous shake", () => {
  const s = citySim({ peds: 0, traffic: 1, parked: 0, range: 400 });
  const lane = { axis: "x", line: 0, dir: 1 };
  const car = addTraffic(s.city, lane, 10, laneCenter(lane), { parked: true, speed: 0, cruise: 0 });
  aim(s, car.x, car.z, Math.PI / 2, 8, 10);
  const r = run(s, 4);
  assert.ok(r.shakes <= 2, `${r.shakes} shakes`);
});

test("into a building corner at 45 degrees: never stuck", () => {
  let checked = 0;
  for (const b of layout.buildings.slice(0, 6)) {
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const cx = b.x + (sx * b.w) / 2, cz = b.z + (sz * b.d) / 2;
      // Heading toward the corner from outside, diagonally.
      const heading = Math.atan2(sx, sz);
      const s = citySim();
      aim(s, cx, cz, heading, 10, 20);
      if (!s.navigation.allowed({ x: s.player.x, z: s.player.z })) continue;
      checked++;
      const r = run(s, 8);
      assert.ok(r.away > 15, `building ${b.x},${b.z} corner ${sx},${sz}: stuck (${r.away.toFixed(1)} m)`);
    }
  }
  assert.ok(checked >= 8);
});
