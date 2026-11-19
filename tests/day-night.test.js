// Day / night: picked 50/50 for every run (start, restart, mission
// change), fixed during the run, can be fixed for testing, and never
// changes the game itself (it does not use the game's random source).
import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
import { buildingWindows } from "../src/render/night.js";
import { random } from "../scripts/autoplay.js";

const layout = createLayout();

test("each run picks day or night (about half each), unchanged during the run", () => {
  const s = new Simulation(layout, { city: true, cityProfile: "mobile" });
  const seen = { day: 0, night: 0 };
  for (let i = 0; i < 400; i++) {
    s.reset();
    seen[s.timeOfDay]++;
  }
  assert.ok(seen.day > 150 && seen.night > 150, JSON.stringify(seen));
  s.reset();
  const tod = s.timeOfDay;
  s.start();
  for (let i = 0; i < 300; i++) s.update(1 / 60, {});
  assert.equal(s.timeOfDay, tod);
  // A mission change is a new run too.
  const picks = new Set();
  for (let i = 0; i < 40; i++) {
    s.reset(i % 2 ? "parcels" : "targetHunt");
    picks.add(s.timeOfDay);
  }
  assert.equal(picks.size, 2);
});

test("the test override fixes it for every run", () => {
  for (const tod of ["day", "night"]) {
    const s = new Simulation(layout, { timeOfDay: tod });
    for (let i = 0; i < 20; i++) {
      s.reset();
      assert.equal(s.timeOfDay, tod);
    }
  }
  // Anything else is ignored (random again).
  const s = new Simulation(layout, { timeOfDay: "noon" });
  const picks = new Set();
  for (let i = 0; i < 40; i++) {
    s.reset();
    picks.add(s.timeOfDay);
  }
  assert.equal(picks.size, 2);
});

test("gameplay is identical by day and by night (same seed, same inputs)", () => {
  const play = (tod) => {
    const s = new Simulation(layout, { random: random(5), city: true, cityProfile: "mobile", timeOfDay: tod });
    s.start();
    for (let f = 0; f < 20 * 60 && !s.result; f++) s.update(1 / 60, { left: f % 240 < 50, right: f % 240 > 160 && f % 240 < 200 });
    return JSON.stringify({ p: [s.player.x, s.player.z, s.player.angle], police: s.police.map((c) => [c.x, c.z, c.state]), health: s.health, result: s.result, events: s.events.length });
  };
  assert.equal(play("day"), play("night"));
});

test("lit windows sit on the building faces (shops on every street face)", () => {
  const b = { x: 15, z: 15, w: 7, d: 7, h: 13 };
  const wins = buildingWindows(b, [1, 1]);
  const shops = wins.filter((w) => w.kind === "shop");
  assert.equal(shops.length, 2);
  for (const w of wins) {
    const onX = Math.abs(Math.abs(w.x - b.x) - (b.w / 2 + 0.06)) < 1e-6;
    const onZ = Math.abs(Math.abs(w.z - b.z) - (b.d / 2 + 0.06)) < 1e-6;
    assert.ok(onX || onZ, "on a face");
    assert.ok(w.y > 0.4 && w.y < b.h + 0.4);
  }
});
