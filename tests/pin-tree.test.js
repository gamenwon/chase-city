// Tree-related arrest failures (the player nose-in to a big park tree,
// police round it, throttle on). Before the fix the game never ended in
// these: police wrecks were counted as ordinary obstacles ("stuck on
// obstacle"), wrecks and the tree kept live police more than 1 m / 5 m
// away ("not held by police"), and the escape check modelled the tree as a
// smaller box and lamps as unbreakable. Ground truth comes from the
// audit's full-game escape attempts (12 steerings, 5 s, on a copy).
import test from "node:test";
import assert from "node:assert/strict";
import { createLayout } from "../src/world/layout.js";
import { PROPS } from "../src/game/city.js";
import { PIN, PROBE_INTERNALS as P } from "../src/game/pin.js";
import { CONFIG } from "../src/game/config.js";
import { escapeAttempts } from "../scripts/audit-arrests.js";
import { wreckScene } from "../scripts/tree-pin-wrecks.mjs";
import { liveScene } from "../scripts/tree-pin-live.mjs";
import { Simulation } from "../src/game/simulation.js";

const layout = createLayout();
const truth = (s) => Math.max(...escapeAttempts(layout, s, 390, 664).map((a) => a.best));
function play(s, seconds, steer = {}) {
  const countdown = [];
  for (let f = 0; f < seconds * 60 && !s.result; f++) {
    s.health = 100;
    s.update(1 / 60, steer);
    if (s.arrest > 0) countdown.push(s.arrest);
  }
  return countdown;
}

// Truly boxed in: tree in front, police wrecks on both sides and across
// the back (screenshot 04 style). With wrecks only at the sides the car now
// slides out backwards on its own, so those scenes are no longer traps.
// (fixedTree: big trees can be knocked down now; here the tree stands in
// for an obstacle the car cannot break.)
const TRAPPED = [
  { treeIndex: 0, heading: 4.7, sides: [-1, 1], seed: 11, rear: true, fixedTree: true },
  { treeIndex: 3, heading: 4.7, sides: [-1, 1], seed: 14, rear: true, fixedTree: true },
];
for (const cfg of TRAPPED)
  test(`tree + police wrecks + police (${JSON.stringify(cfg)}): truly trapped, BUSTED after the 3 s countdown`, () => {
    // When the countdown starts, the full game cannot get the car out.
    const s = wreckScene(cfg);
    // (The ordinary police-contact countdown may already be running when
    // the pin check confirms the trap: count every countdown frame.)
    const countdown = [];
    for (let f = 0; f < 20 * 60 && !s.pin.trapped && !s.result; f++) {
      s.health = 100;
      s.update(1 / 60, {});
      if (s.arrest > 0) countdown.push(s.arrest);
    }
    assert.ok(s.pin.trapped, `countdown started (${s.pin.reason})`);
    assert.ok(truth(s) < 4, "full game cannot get the car out");
    countdown.push(...play(s, 6));
    assert.equal(s.result, "arrested", s.pin.reason);
    assert.ok(countdown.length >= CONFIG.arrestSeconds * 60 - 2, "the countdown was shown");
  });

// Nose-in to a tree with police coming, but a real way out exists: never
// arrested there; the car slides off the tree and drives away on its own.
for (const cfg of [
  { treeIndex: 3, heading: 3.1, seed: 22 },
  { treeIndex: 3, heading: 4.7, seed: 22 },
])
  test(`stuck on a tree, police near, but a way out exists (${JSON.stringify(cfg)}): no arrest at the tree`, () => {
    const s = liveScene(cfg);
    const start = { x: s.player.x, z: s.player.z };
    let away = 0;
    for (let f = 0; f < 8 * 60 && !s.result; f++) {
      s.health = 100;
      s.update(1 / 60, {});
      away = Math.max(away, Math.hypot(s.player.x - start.x, s.player.z - start.z));
    }
    assert.equal(s.result, null, s.pin.reason);
    assert.ok(away > 15, `the car got away from the tree (${away.toFixed(1)} m)`);
  });

test("stuck on a big tree with no police at all: never arrested there", () => {
  const s = liveScene({ treeIndex: 3, heading: 3.1, seed: 22 });
  s.police = [];
  const start = { x: s.player.x, z: s.player.z };
  // (The car now slides off the tree and drives on; reinforcements may
  // catch it later somewhere else, which is not this case.)
  for (let f = 0; f < 10 * 60 && !s.result; f++) {
    s.health = 100;
    s.update(1 / 60, {});
    if (Math.hypot(s.player.x - start.x, s.player.z - start.z) < 8)
      assert.equal(s.arrest, 0, "no countdown at the tree");
  }
  assert.ok(s.result === null || Math.hypot(s.player.x - start.x, s.player.z - start.z) > 8);
});

test("the escape check uses the game's tree size and lets lamps fall at the game's break speed", () => {
  const s = liveScene({ treeIndex: 3, heading: 3.1, seed: 22 });
  const w = P.probeWorld(s);
  const tree = w.probePosts.find((q) => Math.abs(q.r - PROPS.bigTree.r) < 1e-9);
  assert.ok(tree, "park trees are circles of the game's radius");
  assert.equal(tree.breakAt, PROPS.bigTree.breakAt);
  // A lamp straight ahead at 12 m/s (above its 9 m/s break speed) falls;
  // the same lamp at 5 m/s stops the car.
  for (const [speed, falls] of [[12, true], [5, false]]) {
    const t = new Simulation(layout, { reinforcements: false, barricades: false });
    t.start();
    t.police = [];
    Object.assign(t.player, { x: 0, z: 40, angle: 0, speed, vx: 0, vz: -speed });
    const world = P.probeWorld(t);
    world.probePosts = [{ x: 0, z: 40 - CONFIG.radius - PROPS.lamp.r - 0.05, r: PROPS.lamp.r, breakAt: PROPS.lamp.breakAt }];
    const run = P.newRun(world, t, () => ({}), false);
    P.advance(run, 60, 1, 999);
    assert.equal(!!run.posts[0].down, falls, `speed ${speed}`);
  }
});

test("police wrecks count as police, not as ordinary obstacles", () => {
  const s = wreckScene(TRAPPED[0]);
  play(s, 6);
  const withWrecks = P.probeWorld(s);
  const without = P.probeWorld(s, { noWrecks: true });
  assert.ok(s.wrecks.some((w) => w.solid));
  assert.ok(withWrecks.solids.some((b) => b.kind === "wreck"));
  assert.ok(!without.solids.some((b) => b.kind === "wreck"));
  assert.equal(PIN.MIN_NEAR, 2);
});
