// Pin arrest: the player boxed in by police cars, throttle on, going nowhere,
// must be arrested; a car that can still get out, or that is only stuck on
// walls/obstacles, must not be.
//
// The fixtures are real moments from natural chases recorded on the code
// before this fix (755c310): the player's car stood still for 2-20 s among
// parked police cars, never arrested, while the old rule kept finding an
// "escape gap" (a gap only a car-width circle could pass). The audit check
// (12 escape steerings for 5 s on a full copy of the game) could not get the
// car more than 0-5 m away. The "stuck-open" fixtures are the opposite: the
// self-driving bot sat still, but a real way out existed (33-100 m).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
import { makePolice } from "../src/game/police.js";
import { cordonSealed } from "../src/game/cordon.js";
import { CONFIG } from "../src/game/config.js";
import { PIN, probeEscape } from "../src/game/pin.js";
import { escapeAttempts } from "../scripts/audit-arrests.js";
import { random } from "../scripts/autoplay.js";

const layout = createLayout();
const fixture = (name) =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"),
  );

// Rebuild the recorded moment: walls, wrecks and fallen trees, the street
// furniture and civilian cars around the player, the player and the police
// as they stood. The police stay where they were (in the recorded runs they
// stayed parked round the player the whole time); no new pedestrians or
// traffic; the 60-second escape opening is held back.
function load(name, { police = true } = {}) {
  const fx = fixture(name);
  const s = new Simulation(layout, {
    width: fx.source.width,
    height: fx.source.width === 390 ? 664 : 740,
    reinforcements: false,
    barricades: false,
    random: random(7),
    city: true,
    cityBudget: { profile: "test", level: 1, peds: 0, traffic: 0, parked: 0, range: 70 },
  });
  s.start();
  s.staticSolids.push(...fx.extraSolids);
  const byId = new Map(s.city.props.map((q) => [q.id, q]));
  for (const q of fx.props) Object.assign(byId.get(q.id) || {}, q);
  s.city.grid = new Map();
  for (const q of s.city.props) {
    const k = s.city.key(q.x, q.z);
    if (!s.city.grid.has(k)) s.city.grid.set(k, []);
    s.city.grid.get(k).push(q);
  }
  s.city.parking = [];
  s.city.traffic = fx.traffic.map((t) => ({
    lane: { axis: "x", line: 0, dir: 1 },
    cruise: 0,
    timer: 999,
    ...t,
    state: t.state === "wreck" ? "wreck" : "yield",
  }));
  s.city.budget = {
    ...s.city.budget,
    traffic: s.city.traffic.filter((t) => !t.parked).length,
    parked: s.city.traffic.filter((t) => t.parked).length,
  };
  s.refreshNavigation();
  Object.assign(s.player, fx.player);
  s.previousPlayer = { x: s.player.x, z: s.player.z };
  s.police = police
    ? fx.police.map((c) =>
        Object.assign(makePolice(c.id, c.generation), c, { stunTimer: 1e9 }),
      )
    : [];
  s.cordonCooldownUntil = Infinity;
  s.roadblockCooldownUntil = Infinity;
  s.openEscape = () => {};
  return { s, fx };
}

const PINNED = [
  "pinned-1100-evasive-11",
  "pinned-390-roads-9",
  "pinned-390-evasive-5",
];
const OPEN = [
  "stuck-open-1100-roads-8",
  "stuck-open-390-roads-2",
  "stuck-open-1100-roads-3",
];

for (const name of PINNED)
  test(`pinned by police (${name}): throttle on, car stays put, the old rule saw a gap; now BUSTED with a 3 s countdown`, () => {
    const { s, fx } = load(name);
    // The bug as recorded: the old cordon rule did not see a seal.
    assert.equal(fx.oldRule.cordonSealed, false);
    assert.equal(cordonSealed(s), false);
    const start = { x: s.player.x, z: s.player.z };
    // Full throttle (the car always drives forward), no steering: for the
    // first two seconds it goes nowhere while the throttle keeps pushing.
    // `tried`: how far the car's own velocity would have taken it (what the
    // speedometer shows, integrated); `moved`: where it actually got.
    let tried = 0;
    for (let f = 0; f < 120; f++) {
      s.update(1 / 60, {});
      tried += Math.hypot(s.player.vx, s.player.vz) / 60;
    }
    const moved = Math.hypot(s.player.x - start.x, s.player.z - start.z);
    assert.ok(moved < PIN.STILL_DISTANCE, `moved ${moved.toFixed(2)} m`);
    assert.ok(tried >= 1 && moved < tried / 2, `tried ${tried.toFixed(2)} m, moved ${moved.toFixed(2)} m`);
    // Then: arrested, after a visible countdown that only runs up.
    const countdown = [];
    let last = 0;
    for (let f = 0; f < 8 * 60 && !s.result; f++) {
      s.update(1 / 60, {});
      if (s.arrest > 0) countdown.push(s.arrest);
      assert.ok(s.arrest >= last - 1e-9, "countdown never resets on its own");
      last = s.arrest;
    }
    assert.equal(s.result, "arrested", `${name}: ${s.pin.reason}`);
    assert.ok(s.pin.events.some((e) => e.type === "pinned"));
    // The countdown took the full 3 s (it was shown, not skipped).
    assert.ok(countdown.length >= CONFIG.arrestSeconds * 60 - 2);
  });

// Recorded as pinned, but the full game says otherwise: a quick left-right
// steering knocks the street lamp beside the car over and it drives away
// (30+ m). The earlier probe treated the lamp as unbreakable and arrested;
// the probe now breaks lamps at the game's break speed, so: no arrest.
test("pinned-1100-roads-5: the lamp beside the car gives way (full game drives out), so no arrest", () => {
  const { s, fx } = load("pinned-1100-roads-5");
  for (let f = 0; f < 150; f++) s.update(1 / 60, {});
  const best = Math.max(...escapeAttempts(layout, s, fx.source.width, 740).map((a) => a.best));
  assert.ok(best > 10, `full-game escape ${best} m`);
  for (let f = 0; f < 8 * 60 && !s.result; f++) s.update(1 / 60, {});
  assert.equal(s.result, null, s.pin.reason);
});

for (const name of OPEN)
  test(`stuck but a real way out exists (${name}): never arrested`, () => {
    const { s } = load(name);
    for (let f = 0; f < 10 * 60 && !s.result; f++) s.update(1 / 60, {});
    assert.equal(s.result, null);
    assert.equal(s.arrest, 0);
    // ...and the way out is real: the probe drives out.
    assert.equal(probeEscape(s).escaped, true);
  });

test("the pinned fixtures really are closed: the audit's full-game escape attempts fail", () => {
  for (const name of PINNED) {
    const { s, fx } = load(name);
    const best = Math.max(
      ...escapeAttempts(layout, s, fx.source.width, fx.source.width === 390 ? 664 : 740).map(
        (a) => a.best,
      ),
    );
    assert.ok(best < 9, `${name}: got ${best} m away`);
  }
});

test("the same spot with the police gone: free to drive, no arrest", () => {
  const { s } = load("pinned-390-roads-9", { police: false });
  const start = { x: s.player.x, z: s.player.z };
  for (let f = 0; f < 5 * 60; f++) s.update(1 / 60, {});
  assert.equal(s.result, null);
  assert.ok(Math.hypot(s.player.x - start.x, s.player.z - start.z) > 10);
});

test("countdown is cancelled the moment the player really gets away", () => {
  const { s } = load("pinned-390-roads-9");
  for (let f = 0; f < 6 * 60 && s.arrest < 1.5; f++) s.update(1 / 60, {});
  assert.ok(s.arrest >= 1.5 && s.pin.trapped);
  // The police pull off (e.g. a car driven away): the way opens.
  s.police = [];
  for (let f = 0; f < 60 && s.arrest > 0; f++) s.update(1 / 60, {});
  assert.equal(s.arrest, 0);
  assert.equal(s.pin.trapped, false);
  assert.ok(
    s.pin.events.some(
      (e) => e.type === "released" && ["escaped", "way-out", "no-police"].includes(e.why),
    ),
  );
  for (let f = 0; f < 4 * 60; f++) s.update(1 / 60, {});
  assert.equal(s.result, null);
});

test("a police car crashing/exploding beside a pinned player does not reset the countdown when the car is still boxed in", () => {
  const { s } = load("pinned-1100-evasive-11");
  for (let f = 0; f < 6 * 60 && s.arrest < 1; f++) s.update(1 / 60, {});
  assert.ok(s.arrest >= 1, `arrest ${s.arrest}`);
  // A police car that is not holding the player (farthest of the nearby
  // ones) is wrecked and explodes.
  const p = s.player;
  const far = s.police
    .filter((c) => c.state === "active")
    .sort(
      (a, b) =>
        Math.hypot(b.x - p.x, b.z - p.z) - Math.hypot(a.x - p.x, a.z - p.z),
    )[0];
  const before = s.arrest;
  far.health = 0;
  s.explodePolice(far);
  let min = Infinity;
  for (let f = 0; f < 4 * 60 && !s.result; f++) {
    s.update(1 / 60, {});
    min = Math.min(min, s.arrest);
  }
  assert.ok(min >= before - 1e-9, `countdown dropped to ${min}`);
  assert.equal(s.result, "arrested");
});

test("a car stuck on walls only (no police) is never arrested", () => {
  const s = new Simulation(layout, { reinforcements: false, barricades: false });
  s.start();
  s.police = [];
  // Nose into a building corner, throttle on.
  const b = layout.buildings[0];
  Object.assign(s.player, {
    x: b.x + b.w / 2 + 1.2,
    z: b.z + b.d / 2 - 0.5,
    angle: Math.PI / 2,
    vx: -10,
    vz: 0,
    speed: 10,
  });
  s.previousPlayer = { x: s.player.x, z: s.player.z };
  for (let f = 0; f < 10 * 60; f++) s.update(1 / 60, {});
  assert.equal(s.result, null);
  assert.equal(s.arrest, 0);
});

test("stopped next to a single police car: no arrest", () => {
  const { s } = load("pinned-390-roads-9");
  const p = s.player;
  const nearest = s.police
    .filter((c) => c.state === "active")
    .sort(
      (a, b) =>
        Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
    )[0];
  s.police = [nearest];
  for (let f = 0; f < 8 * 60 && !s.result; f++) s.update(1 / 60, {});
  assert.equal(s.result, null);
});

test("boxed in by walls on every side, police touching through a thin wall: stuck on obstacles, not an arrest", () => {
  const s = new Simulation(layout, { reinforcements: false, barricades: false });
  s.start();
  const at = { x: 0, z: 15 };
  // A closed box of thin walls round the car (an obstacle trap).
  s.staticSolids.push(
    { x: at.x, z: at.z - 2.3, w: 4.6, d: 0.2 },
    { x: at.x, z: at.z + 2.3, w: 4.6, d: 0.2 },
    { x: at.x - 1.55, z: at.z, w: 0.2, d: 4.6 },
    { x: at.x + 1.55, z: at.z, w: 0.2, d: 4.6 },
  );
  s.refreshNavigation();
  Object.assign(s.player, { ...at, angle: 0, vx: 0, vz: -5, speed: 5 });
  s.previousPlayer = { ...at };
  s.police = [
    Object.assign(makePolice(0), { x: at.x - 3.1, z: at.z, angle: 0, vx: 0, vz: 0, stunTimer: 1e9 }),
    Object.assign(makePolice(1), { x: at.x + 3.1, z: at.z, angle: 0, vx: 0, vz: 0, stunTimer: 1e9 }),
  ];
  s.cordonCooldownUntil = Infinity;
  s.roadblockCooldownUntil = Infinity;
  for (let f = 0; f < 8 * 60 && !s.result; f++) {
    s.player.policeContactAt = s.elapsed; // as if touching all the time
    s.update(1 / 60, {});
  }
  assert.equal(s.result, null);
  assert.equal(s.arrest, 0);
  assert.equal(s.pin.trapped, false);
  // The probe found that even without the police there is no way out.
  assert.equal(s.pin.lastProbe?.obstacle, true);
  assert.equal(s.pin.events.some((e) => e.type === "pinned"), false);
});

test("wrecks and debris alone never arrest: the same boxed-in spot with every police car wrecked", () => {
  const { s } = load("pinned-390-evasive-5");
  // Every police car round the player crashes and explodes where it stands:
  // the wrecks stay as obstacles, but no police car is holding the player.
  for (const c of s.police) {
    if (c.state !== "active") continue;
    c.health = 0;
    s.explodePolice(c);
  }
  let maxArrest = 0;
  for (let f = 0; f < 10 * 60 && !s.result; f++) {
    s.update(1 / 60, {});
    maxArrest = Math.max(maxArrest, s.arrest);
  }
  assert.notEqual(s.result, "arrested");
  assert.equal(maxArrest, 0);
  assert.equal(s.pin.events.some((e) => e.type === "pinned"), false);
});

test("police ramming a car that keeps driving (crashes, contact) never starts a countdown", () => {
  const s = new Simulation(layout, { reinforcements: false, barricades: false });
  s.start();
  // Two police cars glued to the player's sides while it drives down a
  // long straight road: contact every frame, but the car really moves.
  Object.assign(s.player, { x: 0, z: 80, angle: 0, vx: 0, vz: -20, speed: 20 });
  s.previousPlayer = { x: 0, z: 80 };
  s.police = [makePolice(0), makePolice(1)];
  let maxArrest = 0;
  for (let f = 0; f < 4 * 60 && !s.result; f++) {
    const p = s.player;
    Object.assign(s.police[0], { x: p.x - 2.0, z: p.z, angle: p.angle, vx: p.vx, vz: p.vz, stunTimer: 1e9 });
    Object.assign(s.police[1], { x: p.x + 2.0, z: p.z, angle: p.angle, vx: p.vx, vz: p.vz, stunTimer: 1e9 });
    s.update(1 / 60, {});
    maxArrest = Math.max(maxArrest, s.arrest);
  }
  assert.ok(Math.hypot(s.player.x, s.player.z - 80) > 30, "the car kept going");
  assert.equal(maxArrest, 0);
  assert.equal(s.pin.trapped, false);
});
