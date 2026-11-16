import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
import { makePolice } from "../src/game/police.js";
import { CONFIG } from "../src/game/config.js";
import {
  PROPS,
  BUDGETS,
  cityBudget,
  addPedestrian,
  addTraffic,
  laneCenter,
} from "../src/game/city.js";

// V1.9 city life. A city sim with no police, reinforcements or roadblocks
// unless a test adds them; pedestrians/traffic budgets are pinned so the
// test's own actors are the only ones.
function citySim(budget = { peds: 0, traffic: 0, parked: 0, range: 70 }) {
  const s = new Simulation(createLayout(), {
    city: true,
    reinforcements: false,
    barricades: false,
    cityBudget: { profile: "test", level: 1, ...budget },
  });
  s.start();
  s.police = [];
  return s;
}

// A standing prop of this kind on a sidewalk beside a horizontal road, and
// the player placed just short of it on the road, driving straight at it.
function driveInto(s, kind, speed) {
  const prop = s.city.props.find(
    (p) =>
      p.kind === kind &&
      p.angle === Math.PI / 2 &&
      Math.abs(p.x) < 70 &&
      Math.abs(p.z) < 70,
  );
  const road = Math.round(prop.z / 30) * 30;
  const side = Math.sign(prop.z - road);
  const gap = CONFIG.radius + PROPS[kind].r + 0.25;
  // Forward is (-sin a, -cos a): angle PI drives +z, angle 0 drives -z.
  Object.assign(s.player, {
    x: prop.x,
    z: prop.z - side * gap,
    angle: side > 0 ? Math.PI : 0,
    vx: 0,
    vz: side * speed,
    speed,
  });
  s.previousPlayer = { x: s.player.x, z: s.player.z };
  return prop;
}
const run = (s, seconds, input = {}) => {
  for (let i = 0; i < seconds * 60 && !s.result; i++) s.update(1 / 60, input);
};

test("the city is off unless asked for, and the real game turns it on", () => {
  const plain = new Simulation(createLayout());
  assert.equal(plain.city, null);
  const s = citySim();
  assert.ok(s.city.props.length > 400);
  const kinds = new Set(s.city.props.map((p) => p.kind));
  for (const k of ["trash", "sign", "lamp", "tree", "bigTree"])
    assert.ok(kinds.has(k));
  // No prop stands inside a building.
  for (const p of s.city.props)
    for (const b of s.layout.buildings)
      assert.ok(
        Math.abs(p.x - b.x) > b.w / 2 || Math.abs(p.z - b.z) > b.d / 2,
        `${p.kind} ${p.id} inside a building`,
      );
});

test("a trash can is knocked flying even at low speed, spills rubbish and stays where it lands", () => {
  const s = citySim();
  const prop = driveInto(s, "trash", 5);
  run(s, 0.2);
  assert.notEqual(prop.state, "stand");
  assert.equal(s.city.stats.trashKnocked, 1);
  assert.equal(s.city.litter.length, 7);
  // Barely slows the car.
  assert.ok(Math.hypot(s.player.vx, s.player.vz) > 4);
  run(s, 3);
  assert.equal(prop.state, "down");
  const rest = { x: prop.x, z: prop.z };
  const spilled = s.city.litter.slice(0, 7).map((l) => ({ ...l }));
  // Still there much later (the car drives on and may hit other things).
  Object.assign(s.player, { x: 0, z: 8 });
  run(s, 10);
  assert.equal(prop.state, "down");
  assert.deepEqual({ x: prop.x, z: prop.z }, rest);
  assert.deepEqual(s.city.litter.slice(0, 7), spilled);
});

test("reaction depends on impact speed and size: light props go at a touch, posts and trees need a hard hit, big trees never", () => {
  const at = (kind, speed) => {
    const s = citySim();
    const prop = driveInto(s, kind, speed);
    run(s, 0.25);
    return { s, prop };
  };
  // 7 m/s: bin and sign go down, lamp and street tree only shake.
  assert.notEqual(at("trash", 7).prop.state, "stand");
  assert.notEqual(at("sign", 7).prop.state, "stand");
  const lamp = at("lamp", 7);
  assert.equal(lamp.prop.state, "stand");
  assert.ok(lamp.prop.wobble > 0);
  assert.equal(at("tree", 7).prop.state, "stand");
  // A hard hit brings the lamp and the tree down.
  assert.equal(at("lamp", 14).prop.state, "falling");
  assert.equal(at("tree", 16).prop.state, "falling");
  // A post the car cannot break stops it like a wall.
  assert.ok(Math.hypot(lamp.s.player.vx, lamp.s.player.vz) < 4);
});

test("a big tree never breaks and damages the car that hits it", () => {
  const s = citySim();
  const prop = s.city.props.find((p) => p.kind === "bigTree");
  Object.assign(s.player, {
    x: prop.x,
    z: prop.z - (CONFIG.radius + PROPS.bigTree.r + 0.25),
    angle: Math.PI,
    vx: 0,
    vz: 22,
    speed: 22,
  });
  run(s, 0.3);
  assert.equal(prop.state, "stand");
  assert.ok(s.health < 100, "the player car is damaged");
  const police = Object.assign(makePolice(0), {
    x: prop.x,
    z: prop.z - (CONFIG.policeRadius + PROPS.bigTree.r + 0.25),
    angle: Math.PI,
    vx: 0,
    vz: 22,
    // Coasting straight on (the police route planner itself steers round
    // big trees).
    stunTimer: 1,
  });
  s.police = [police];
  Object.assign(s.player, { x: prop.x + 30, z: prop.z + 30 });
  run(s, 0.1);
  assert.equal(prop.state, "stand");
  assert.ok(police.health < 100);
});

test("a felled tree stays on the road as an obstacle the police route around", () => {
  const s = citySim();
  const prop = driveInto(s, "tree", 18);
  run(s, 1.5);
  assert.equal(prop.state, "down");
  assert.ok(s.city.solids.length >= 1);
  const log = s.city.solids[0];
  assert.equal(log.propId, prop.id);
  assert.equal(log.kind, "fallen-tree");
  assert.ok(s.solids.includes(log), "it is a physical obstacle");
  // Navigation knows it: a straight line through the log is not clear.
  const across = { x: log.x - (log.w / 2 + 2), z: log.z },
    beyond = { x: log.x + (log.w / 2 + 2), z: log.z };
  const along = { x: log.x, z: log.z - (log.d / 2 + 2) },
    past = { x: log.x, z: log.z + (log.d / 2 + 2) };
  const blocked =
    !s.navigation.clear(across, beyond, 0.5) ||
    !s.navigation.clear(along, past, 0.5);
  assert.ok(blocked);
  // Still there 30 s later.
  Object.assign(s.player, { x: 0, z: 8 });
  run(s, 30);
  assert.equal(s.city.solids[0], log);
  assert.ok(s.solids.includes(log));
  assert.equal(prop.state, "down");
});

test("pedestrians each react at their own speed, get out of the way sideways and are never run over", () => {
  const s = citySim({ peds: 3, traffic: 0, parked: 0, range: 70 });
  // Three people standing on the same sidewalk line, a car coming.
  const peds = [0, 1, 2].map((i) =>
    addPedestrian(s.city, {
      x: 6.2,
      z: -40 - i * 0.01,
      cx: 15,
      cz: -45,
      u: 0,
      state: "walk",
      walk: 0,
      react: [0.1, 0.35, 0.6][i],
    }),
  );
  for (const q of peds) q.u = 3 * 17.6 + (q.z - (-45 - 8.8));
  Object.assign(s.player, {
    x: 6.2,
    z: -20,
    angle: 0,
    vx: 0,
    vz: -20,
    speed: 20,
  });
  s.previousPlayer = { x: 6.2, z: -20 };
  const fled = new Map();
  for (let i = 0; i < 90; i++) {
    s.update(1 / 60, {});
    for (const q of peds)
      if ((q.state === "flee" || q.state === "dive") && !fled.has(q))
        fled.set(q, s.elapsed);
  }
  assert.equal(fled.size, 3, "everyone ran");
  const times = peds.map((q) => fled.get(q));
  assert.ok(times[0] < times[1] && times[1] < times[2], "own reaction times");
  for (const q of peds)
    assert.ok(Math.abs(q.x - 6.2) > 1, "moved off the car's line");
  assert.equal(s.city.stats.pedestrianHits, 0);
});

test("pedestrians also dodge police cars and civilian traffic", () => {
  const s = citySim({ peds: 1, traffic: 0, parked: 0, range: 70 });
  const q = addPedestrian(s.city, {
    x: 30 + 2.75,
    z: -10,
    cx: 45,
    cz: -15,
    u: 0,
    walk: 0,
    react: 0.2,
  });
  // The police car chases the player down this road, past the pedestrian.
  s.police = [
    Object.assign(makePolice(0), { x: 30 + 2.75, z: 15, angle: 0, vz: -20 }),
  ];
  Object.assign(s.player, { x: 30 + 2.75, z: -40, angle: 0, vx: 0, vz: -24 });
  let ran = false;
  for (let i = 0; i < 90; i++) {
    s.update(1 / 60, {});
    ran ||= q.state === "flee" || q.state === "dive";
  }
  assert.ok(ran, "ran from the police car");
  const s2 = citySim({ peds: 1, traffic: 1, parked: 0, range: 400 });
  const lane = { axis: "z", line: 30, dir: -1 };
  const q2 = addPedestrian(s2.city, {
    x: laneCenter(lane),
    z: -10,
    cx: 45,
    cz: -15,
    u: 0,
    walk: 0,
    react: 0.2,
  });
  const civ = addTraffic(s2.city, lane, laneCenter(lane), 10, {
    cruise: 11,
    speed: 11,
  });
  Object.assign(s2.player, { x: -60, z: 60 });
  let ran2 = false;
  for (let i = 0; i < 120; i++) {
    s2.update(1 / 60, {});
    ran2 ||= q2.state !== "walk";
  }
  // Either the person got out of the way, or the driver stopped for them.
  const waited =
    civ.speed < 0.5 && Math.hypot(civ.x - q2.x, civ.z - q2.z) > 2.5;
  assert.ok(ran2 || waited, "the civilian car and the pedestrian never meet");
  assert.equal(s2.city.stats.pedestrianHits, 0);
});

test("civilian cars follow lanes and junctions and never drive into buildings", () => {
  const s = citySim({ peds: 0, traffic: 1, parked: 0, range: 400 });
  const lane = { axis: "x", line: 0, dir: 1 };
  const car = addTraffic(s.city, lane, -40, laneCenter(lane));
  Object.assign(s.player, { x: 80, z: 80 });
  const lanes = new Set();
  for (let i = 0; i < 60 * 40; i++) {
    s.update(1 / 60, {});
    lanes.add(`${car.lane.axis}${car.lane.line}`);
    for (const b of s.layout.buildings)
      assert.ok(
        Math.abs(car.x - b.x) > b.w / 2 || Math.abs(car.z - b.z) > b.d / 2,
        "inside a building",
      );
    // On a road: within the road width of its lane's line.
    const across = car.lane.axis === "x" ? car.z : car.x;
    assert.ok(Math.abs(across - car.lane.line) < 5.6);
  }
  assert.ok(lanes.size >= 3, "it turned at junctions");
});

test("a chase coming through makes traffic brake hard and honk; crashes push and damage but never explode", () => {
  const s = citySim({ peds: 0, traffic: 1, parked: 0, range: 400 });
  const lane = { axis: "x", line: 30, dir: 1 };
  const car = addTraffic(s.city, lane, -20, laneCenter(lane), {
    cruise: 10,
    speed: 10,
  });
  Object.assign(s.player, { x: 60, z: -60 });
  run(s, 1);
  assert.ok(car.speed > 8);
  // A police car arrives with its siren on.
  s.police = [Object.assign(makePolice(0), { x: car.x + 18, z: car.z + 6 })];
  run(s, 1.2);
  assert.equal(car.state, "yield");
  assert.ok(car.speed < 2, "braked hard");
  assert.ok(s.city.events.some((e) => e.action === "honk"));
  // The player rams it: pushed, damaged.
  s.police = [];
  const before = { x: car.x, z: car.z, health: car.health };
  Object.assign(s.player, {
    x: car.x - 4,
    z: car.z,
    angle: -Math.PI / 2,
    vx: 20,
    vz: 0,
    speed: 20,
  });
  s.previousPlayer = { x: s.player.x, z: s.player.z };
  run(s, 0.3);
  assert.ok(car.health < before.health);
  assert.ok(Math.hypot(car.x - before.x, car.z - before.z) > 0.5, "pushed");
  // Ram it until it is wrecked: smoke, no explosion anywhere.
  for (let k = 0; k < 6 && car.state !== "wreck"; k++) {
    Object.assign(s.player, {
      x: car.x - 4,
      z: car.z,
      angle: -Math.PI / 2,
      vx: 24,
      vz: 0,
      speed: 24,
    });
    s.previousPlayer = { x: s.player.x, z: s.player.z };
    run(s, 0.4);
  }
  assert.equal(car.state, "wreck");
  assert.equal(s.stats.explosions, 0);
  assert.equal(s.events.length, 0);
});

test("police cars knocking into traffic are slowed and dented but civilians never wreck them", () => {
  const s = citySim({ peds: 0, traffic: 1, parked: 0, range: 400 });
  const lane = { axis: "x", line: 30, dir: 1 };
  const car = addTraffic(s.city, lane, 0, laneCenter(lane), {
    cruise: 0,
    speed: 0,
    state: "yield",
    timer: 99,
  });
  const cop = Object.assign(makePolice(0), {
    x: -4,
    z: laneCenter(lane),
    angle: -Math.PI / 2,
    vx: 26,
    health: 5,
  });
  s.police = [cop];
  Object.assign(s.player, { x: -60, z: -60 });
  run(s, 0.4);
  assert.equal(cop.state, "active");
  assert.ok(cop.health >= 1);
  assert.equal(s.stats.explosions, 0);
  assert.ok(car.health < 100);
});

test("budgets: phones get fewer actors, and the governor level scales them", () => {
  assert.ok(BUDGETS.mobile.peds < BUDGETS.desktop.peds);
  assert.ok(BUDGETS.mobile.traffic < BUDGETS.desktop.traffic);
  const low = cityBudget("mobile", 0.4);
  assert.ok(low.peds < BUDGETS.mobile.peds && low.peds > 0);
  const s = new Simulation(createLayout(), {
    city: true,
    cityProfile: "mobile",
  });
  s.start();
  for (let i = 0; i < 60 * 20 && !s.result; i++) {
    s.update(1 / 60, { right: i % 300 < 40 });
    assert.ok(s.city.pedestrians.length <= BUDGETS.mobile.peds);
    assert.ok(
      s.city.traffic.filter((t) => !t.parked).length <= BUDGETS.mobile.traffic,
    );
    assert.ok(
      s.city.traffic.filter((t) => t.parked).length <= BUDGETS.mobile.parked,
    );
  }
});

test("a full chase with the city on: no city explosions, nobody run over, police still arrest", () => {
  const s = new Simulation(createLayout(), {
    city: true,
    cityProfile: "mobile",
    random: () => 0.3,
  });
  s.start();
  for (let i = 0; i < 60 * 60 && !s.result; i++)
    s.update(1 / 60, { right: Math.round(s.elapsed * 60) > 0 });
  assert.equal(s.result, "arrested");
  assert.equal(s.city.stats.cityExplosions, 0);
  assert.equal(s.city.stats.pedestrianHits, 0);
  assert.ok(s.events.every((e) => e.cause !== "unknown"));
});

test("a tree knocked toward a building falls along the sidewalk instead, in plain view", () => {
  const s = citySim();
  const prop = driveInto(s, "tree", 18);
  run(s, 1.5);
  assert.equal(prop.state, "down");
  const log = s.city.solids[0];
  for (const b of s.layout.buildings)
    assert.ok(
      Math.abs(log.x - b.x) > b.w / 2 || Math.abs(log.z - b.z) > b.d / 2,
      "the fallen tree is not inside a building",
    );
});

test("a wrecked civilian car stays where it was wrecked, even after the player leaves and comes back", () => {
  const s = citySim({ peds: 0, traffic: 1, parked: 0, range: 70 });
  const lane = { axis: "x", line: 30, dir: 1 };
  const car = addTraffic(s.city, lane, 0, laneCenter(lane), {
    state: "wreck",
    health: 0,
    speed: 0,
  });
  Object.assign(s.player, { x: -10, z: 20 });
  run(s, 0.2);
  const at = { x: car.x, z: car.z };
  // Far away: it leaves the simulated area...
  Object.assign(s.player, { x: -80, z: -80 });
  s.update(1 / 60, {});
  assert.ok(!s.city.traffic.includes(car));
  // ...and is there again on return, still wrecked.
  Object.assign(s.player, { x: at.x - 10, z: at.z });
  s.update(1 / 60, {});
  const back = s.city.traffic.find(
    (t) => Math.hypot(t.x - at.x, t.z - at.z) < 0.5,
  );
  assert.ok(back, "the wreck is back");
  assert.equal(back.state, "wreck");
});
