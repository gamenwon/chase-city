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

// Two scenes that were never arrested before the fix (screenshot 04).
const TRAPPED = [
  // wrecks on both sides, tree in front: was "stuck-on-obstacle"
  { treeIndex: 0, heading: 4.7, sides: [-1, 1], seed: 11 },
  // wrecks on both sides, live police across the rear 5 m out: was
  // "not-held-by-police"
  { treeIndex: 3, heading: 3.1, sides: [-1, 1], seed: 14 },
];
for (const cfg of TRAPPED)
  test(`tree + police wrecks + police (${JSON.stringify(cfg)}): truly trapped, BUSTED after the 3 s countdown`, () => {
    // When the countdown starts, the full game cannot get the car out.
    const s = wreckScene(cfg);
    let f = 0;
    for (; f < 20 * 60 && !s.pin.trapped && !s.result; f++) {
      s.health = 100;
      s.update(1 / 60, {});
    }
    assert.ok(s.pin.trapped, `countdown started (${s.pin.reason})`);
    assert.ok(truth(s) < 4, "full game cannot get the car out");
    const countdown = [s.arrest];
    countdown.push(...play(s, 6));
    assert.equal(s.result, "arrested", s.pin.reason);
    assert.ok(countdown.length >= CONFIG.arrestSeconds * 60 - 2, "the countdown was shown");
  });

// Stuck against a tree with police round it, but a real way out exists:
// never arrested (the player just has to steer).
for (const cfg of [
  { treeIndex: 3, heading: 3.1, seed: 22 },
  { treeIndex: 3, heading: 4.7, seed: 22 },
])
  test(`stuck on a tree, police near, but a way out exists (${JSON.stringify(cfg)}): no arrest`, () => {
    const s = liveScene(cfg);
    play(s, 12);
    assert.equal(s.result, null, s.pin.reason);
    assert.ok(truth(s) > 10, "the full game does get out");
  });

test("stuck on a big tree with no police at all: never arrested", () => {
  const s = liveScene({ treeIndex: 3, heading: 3.1, seed: 22 });
  s.police = [];
  play(s, 10);
  assert.equal(s.result, null);
  assert.equal(s.arrest, 0);
});

test("the escape check uses the game's tree size and lets lamps fall at the game's break speed", () => {
  const s = liveScene({ treeIndex: 3, heading: 3.1, seed: 22 });
  const w = P.probeWorld(s);
  const tree = w.probePosts.find((q) => Math.abs(q.r - PROPS.bigTree.r) < 1e-9);
  assert.ok(tree, "park trees are circles of the game's radius");
  assert.equal(tree.breakAt, Infinity);
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
