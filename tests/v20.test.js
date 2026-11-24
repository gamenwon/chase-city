import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
import { CONFIG } from "../src/game/config.js";
import { PROPS, addTraffic, laneCenter } from "../src/game/city.js";
import { MISSIONS, getMission, timeLeft } from "../src/game/missions.js";
import { missionOrder, nextMission, DEFAULT_MISSION_ORDER } from "../src/game/catalog.js";
import { createTally, recordCityEvent, tallyRows } from "../src/game/tally.js";
import { VEHICLES, getVehicle } from "../src/game/vehicles.js";
import { MAPS, getMap, mapLayout } from "../src/world/maps.js";
import { Progress } from "../src/game/progress.js";
import { AdBridge, PLACEMENTS } from "../src/platform/ads.js";

const layout = createLayout();
const run = (s, seconds, input = {}) => {
  for (let i = 0; i < seconds * 60 && !s.result; i++) s.update(1 / 60, input);
};
function memory() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
}

// --------------------------------------------------------------- missions --

test("every mission carries its own goal, limit, conditions, reward and map", () => {
  for (const m of Object.values(MISSIONS)) {
    assert.ok(m.title && m.objective && m.type);
    assert.ok(MAPS[m.mapId]?.ready, `${m.id} map`);
    assert.ok(m.timeLimit === null || m.timeLimit > 0);
    assert.ok(["short", "challenge"].includes(m.durationClass));
    assert.equal(m.reward.type, "credits");
    assert.ok(m.reward.amount > 0);
    assert.ok(Array.isArray(m.failOn) && !m.failOn.includes("destroyed"));
    assert.equal(typeof m.update, "function");
    assert.equal(typeof m.hud, "function");
  }
  // The police chase is one mission among others, not the only one.
  assert.equal(getMission("survival60").type, "chase");
  assert.ok(Object.keys(MISSIONS).length >= 2);
});

test("the police chase mission plays exactly as before (same reward, same rules)", () => {
  const s = new Simulation(layout, { mission: "survival60" });
  assert.equal(s.mission.definition.id, "survival60");
  assert.equal(s.police.length, CONFIG.policeCount);
  assert.equal(s.policeEnabled, true);
  assert.equal(s.player.speed, CONFIG.playerSpeed);
  assert.equal(s.mission.definition.hud(s), "생존 0 / 60초");
  // Default with no mission given is still the chase.
  assert.equal(new Simulation(layout).missionId, "survival60");
});

test("mission order is a setting: the host can reorder or hide missions", () => {
  assert.deepEqual(missionOrder({}), [...DEFAULT_MISSION_ORDER]);
  assert.deepEqual(missionOrder({ missionOrder: ["parcels", "survival60"] }), [
    "parcels",
    "survival60",
  ]);
  // Unknown ids dropped, duplicates removed, a broken list falls back.
  assert.deepEqual(missionOrder({ missionOrder: ["nope", "parcels", "parcels"] }), [
    "parcels",
  ]);
  assert.deepEqual(missionOrder({ missionOrder: ["nope"] }), [...DEFAULT_MISSION_ORDER]);
  assert.equal(nextMission("survival60", ["survival60", "parcels"]), "parcels");
  assert.equal(nextMission("parcels", ["survival60", "parcels"]), "survival60");
  assert.equal(nextMission("parcels", ["parcels"]), null);
});

test("parcels: no police at all, five parcels on roads, collecting all succeeds once", () => {
  const s = new Simulation(layout, { mission: "parcels", city: true });
  assert.equal(s.police.length, 0);
  assert.equal(s.pickups.length, 5);
  for (const p of s.pickups) {
    // On a road centre line, away from the start.
    assert.ok(p.x % 30 === 0 || p.z % 30 === 0);
    assert.ok(Math.hypot(p.x - s.player.x, p.z - s.player.z) > 30);
    for (const b of layout.buildings)
      assert.ok(Math.abs(p.x - b.x) > b.w / 2 || Math.abs(p.z - b.z) > b.d / 2);
  }
  s.start();
  run(s, 20, { left: true });
  // No police ever appear (no reinforcements, roadblocks, cordon).
  assert.equal(s.police.length, 0);
  assert.equal(s.cordon, null);
  assert.equal(s.roadblock, null);
  assert.equal(s.arrest, 0);
  // Drive through each parcel.
  for (const p of s.pickups) {
    Object.assign(s.player, { x: p.x, z: p.z });
    s.previousPlayer = { x: p.x, z: p.z };
    s.update(1 / 60);
  }
  assert.equal(s.result, "success");
  assert.equal(s.credits, 300);
  assert.equal(s.mission.status, "completed");
  s.update(1 / 60);
  assert.equal(s.credits, 300);
});

test("parcels: the clock runs out -> timeout failure, no reward", () => {
  const s = new Simulation(layout, { mission: "parcels" });
  s.start();
  run(s, 81, { left: true });
  assert.equal(s.result, "timeout");
  assert.equal(s.mission.status, "failed");
  assert.equal(s.credits, 0);
  assert.ok(timeLeft(s) < 0.02);
});

test("reset keeps the chosen mission; another mission can be chosen on reset", () => {
  const s = new Simulation(layout, { mission: "parcels" });
  s.reset();
  assert.equal(s.missionId, "parcels");
  s.reset("survival60");
  assert.equal(s.missionId, "survival60");
  assert.equal(s.pickups.length, 0);
  assert.equal(s.police.length, CONFIG.policeCount);
});

// ----------------------------------------------------------- destruction --

test("destruction record: only the player's, each object once, by kind", () => {
  const t = createTally();
  const ev = (o) => recordCityEvent(t, { time: 1, ...o });
  assert.equal(ev({ type: "prop", action: "break", kind: "trash", targetId: 4, byPlayer: true }), true);
  // The same trash can again (kicked while lying) is not counted again.
  assert.equal(ev({ type: "prop", action: "break", kind: "trash", targetId: 4, byPlayer: true }), false);
  // A police car knocking a sign over is not the player's.
  assert.equal(ev({ type: "prop", action: "break", kind: "sign", targetId: 5, byPlayer: false }), false);
  // Hits and crashes are not destruction; a wreck is.
  assert.equal(ev({ type: "prop", action: "hit", kind: "tree", targetId: 6, byPlayer: true }), false);
  assert.equal(ev({ type: "traffic", action: "crash", targetId: 9, byPlayer: true }), false);
  assert.equal(ev({ type: "traffic", action: "wreck", targetId: 9, byPlayer: true }), true);
  assert.equal(ev({ type: "traffic", action: "wreck", targetId: 9, byPlayer: true }), false);
  ev({ type: "prop", action: "break", kind: "tree", targetId: 7, byPlayer: true });
  ev({ type: "prop", action: "break", kind: "trash", targetId: 8, byPlayer: true });
  assert.deepEqual(
    tallyRows(t).map((r) => r.text),
    ["쓰레기통 2개", "가로수 1그루", "일반 차량 1대"],
  );
  assert.equal(t.total, 4);
});

test("destruction record from the real game: knock over a trash can and a tree", () => {
  const s = new Simulation(layout, {
    city: true,
    mission: "parcels",
    cityBudget: { profile: "test", level: 1, peds: 0, traffic: 0, parked: 0, range: 70 },
  });
  s.start();
  const hit = (kind, speed) => {
    const prop = s.city.props.find(
      (p) => p.kind === kind && p.angle === Math.PI / 2 && Math.abs(p.x) < 70 && Math.abs(p.z) < 70 && p.state === "stand",
    );
    const road = Math.round(prop.z / 30) * 30;
    const side = Math.sign(prop.z - road);
    const gap = CONFIG.radius + PROPS[kind].r + 0.25;
    Object.assign(s.player, {
      x: prop.x,
      z: prop.z - side * gap,
      angle: side > 0 ? Math.PI : 0,
      vx: 0,
      vz: side * speed,
      speed,
      // (teleported: drop any turn-round still under way from the last hit)
      postEscape: null,
      wallStuck: null,
    });
    s.previousPlayer = { x: s.player.x, z: s.player.z };
    run(s, 1.2);
    return prop;
  };
  const can = hit("trash", 8);
  const tree = hit("tree", 20);
  assert.equal(can.state === "down" || can.state === "tumble", true);
  assert.equal(s.tally.counts.trash >= 1, true);
  assert.equal(s.tally.counts.tree, 1);
  // Matches the city's own counts (nothing counted twice or missed).
  assert.equal(s.tally.counts.trash, s.city.stats.trashKnocked);
  assert.equal(s.tally.counts.tree, s.city.stats.treesDown);
  assert.ok(tree.state !== "stand");
});

test("a civilian car the player wrecks counts once, however often it is hit after", () => {
  const s = new Simulation(layout, {
    city: true,
    mission: "parcels",
    cityBudget: { profile: "test", level: 1, peds: 0, traffic: 1, parked: 0, range: 400 },
  });
  s.start();
  const lane = { axis: "x", line: 30, dir: 1 };
  const z = laneCenter(lane);
  const t = addTraffic(s.city, lane, 0, z, { cruise: 0, speed: 0, state: "yield", timer: 999 });
  // Ram it again and again (also after it is wrecked).
  for (let k = 0; k < 14; k++) {
    Object.assign(s.player, { x: t.x - 3, z: t.z, angle: -Math.PI / 2, vx: 22, vz: 0, speed: 22 });
    s.previousPlayer = { x: s.player.x, z: s.player.z };
    run(s, 0.25);
    s.health = 100;
    s.hitCooldown = 0;
  }
  assert.equal(t.state, "wreck");
  assert.equal(s.tally.counts.traffic, 1);
  assert.equal(s.city.stats.trafficWrecks, 1);
});

// --------------------------------------------------------------- vehicles --

test("starter car stats are exactly the pre-V2.0 values; the player car takes no damage", () => {
  const v = getVehicle("starter");
  assert.equal(v.stats.topSpeed, CONFIG.playerSpeed);
  assert.equal(v.stats.turnRate, CONFIG.turnRate);
  assert.equal(v.stats.durability, 100);
  assert.equal(getVehicle("nope").id, "starter");
  const s = new Simulation(layout);
  s.damage(20);
  assert.equal(s.health, 100);
  const tough = new Simulation(layout, { vehicle: "boxy" });
  assert.equal(tough.player.speed, VEHICLES.boxy.stats.topSpeed);
  tough.damage(20);
  assert.equal(tough.health, 100);
  assert.equal(VEHICLES.boxy.unlock.type, "credits");
});

test("a different car drives differently (speed, turning)", () => {
  const a = new Simulation(layout, { mission: "parcels" }),
    b = new Simulation(layout, { mission: "parcels", vehicle: "boxy" });
  a.start();
  b.start();
  run(a, 1, { left: true });
  run(b, 1, { left: true });
  assert.ok(Math.abs(a.player.angle - b.player.angle) > 0.05);
  assert.ok(a.player.speed > b.player.speed);
});

// ------------------------------------------------------------------- maps --

test("maps: downtown is built and playable; other maps are registered but not built", () => {
  assert.equal(getMap("downtown").city, true);
  assert.equal(mapLayout("downtown"), mapLayout("downtown"));
  assert.deepEqual(
    mapLayout("downtown").buildings.length,
    createLayout().buildings.length,
  );
  for (const id of ["harbor", "mountain", "suburb"]) {
    assert.equal(MAPS[id].ready, false);
    assert.throws(() => getMap(id));
  }
});

// --------------------------------------------------------------- progress --

test("credits: paid once per run part, double reward is its own part, stored", () => {
  const store = memory();
  const p = new Progress(store);
  assert.equal(p.credits, 0);
  assert.equal(p.pay("s:1", "base", 500), 500);
  assert.equal(p.pay("s:1", "base", 500), 0);
  assert.equal(p.pay("s:1", "ad-double", 500), 500);
  assert.equal(p.pay("s:1", "ad-double", 500), 0);
  assert.equal(p.pay("s:2", "base", 0), 0);
  assert.equal(p.credits, 1000);
  p.recordRun("survival60", { success: true, time: 71.2 });
  p.recordRun("survival60", { success: false, time: 20 });
  assert.deepEqual(p.missionRecord("survival60"), { plays: 2, clears: 1, bestTime: 71.2 });
  // Reloaded from storage.
  const again = new Progress(store);
  assert.equal(again.credits, 1000);
  assert.equal(again.selectedVehicle, "starter");
  // No point-app field exists in the save.
  assert.equal(JSON.stringify(again.data).includes("point"), false);
});

test("progress survives blocked storage (session only)", () => {
  const broken = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  const p = new Progress(broken);
  assert.equal(p.pay("x", "base", 300), 300);
  assert.equal(p.credits, 300);
});

// -------------------------------------------------------------------- ads --

test("ads: no provider -> unavailable, nothing is ever rewarded", async () => {
  const ads = new AdBridge();
  assert.equal(ads.status(PLACEMENTS.continue), "unavailable");
  assert.deepEqual(await ads.showRewarded(PLACEMENTS.continue), {
    rewarded: false,
    reason: "unavailable",
  });
  // A malformed provider is refused.
  assert.equal(ads.register({ isReady: () => true }), false);
  assert.equal(ads.status(PLACEMENTS.doubleReward), "unavailable");
});

test("ads: rewarded only when the provider says so; errors and closes are not rewards", async () => {
  // Test doubles standing in for the host's ad module (tests only).
  let answer = { rewarded: true };
  const provider = {
    isReady: () => true,
    showRewarded: async () => {
      if (answer === "throw") throw new Error("sdk");
      return answer;
    },
  };
  const ads = new AdBridge(provider);
  assert.equal(ads.status(PLACEMENTS.continue), "ready");
  assert.equal((await ads.showRewarded(PLACEMENTS.continue)).rewarded, true);
  answer = { rewarded: false };
  assert.equal((await ads.showRewarded(PLACEMENTS.continue)).rewarded, false);
  answer = {};
  assert.equal((await ads.showRewarded(PLACEMENTS.continue)).rewarded, false);
  answer = "throw";
  assert.equal((await ads.showRewarded(PLACEMENTS.continue)).rewarded, false);
  provider.isReady = () => false;
  assert.equal(ads.status(PLACEMENTS.continue), "loading");
});

// ---------------------------------------------------------------- continue --

test("player durability is disabled: heavy hits never wreck the car or end the run", () => {
  const s = new Simulation(layout, { mission: "survival60" });
  s.start();
  for (let i = 0; i < 30; i++) {
    s.hitCooldown = 0;
    s.damage(80);
    s.update(1 / 60);
  }
  assert.equal(s.health, 100);
  assert.notEqual(s.result, "destroyed");
  assert.ok(s.collisions >= 30, "hits are still counted");
  assert.ok(!s.mission.definition.failOn.includes("destroyed"));
});

test("continue after BUSTED: the cordon pulls back and the player can drive away", () => {
  const s = new Simulation(layout, {
    mission: "survival60",
    reinforcements: false,
    barricades: false,
  });
  s.start();
  run(s, 2);
  s.arrest = CONFIG.arrestSeconds;
  s.result = "arrested";
  const p = s.player;
  for (const c of s.police) Object.assign(c, { x: p.x + 4, z: p.z + 4 });
  assert.equal(s.revive(), true);
  assert.equal(s.arrest, 0);
  assert.equal(s.cordon, null);
  for (const c of s.police)
    assert.ok(Math.hypot(c.x - p.x, c.z - p.z) > 5 || c.stunTimer > 0);
  run(s, 3, { left: true });
  assert.notEqual(s.result, "arrested");
});

test("continue on timeout adds 20 seconds; success can never be continued", () => {
  const s = new Simulation(layout, { mission: "parcels" });
  s.start();
  run(s, 81);
  assert.equal(s.result, "timeout");
  assert.equal(s.revive(), true);
  assert.ok(timeLeft(s) > 18);
  run(s, 5);
  assert.equal(s.result, null);
  const w = new Simulation(layout, { mission: "parcels" });
  w.start();
  w.result = "success";
  assert.equal(w.revive(), false);
});

test("fix: a tree falling onto a car does not lock the car inside its obstacle", () => {
  const s = new Simulation(layout, {
    city: true,
    mission: "parcels",
    cityBudget: { profile: "test", level: 1, peds: 0, traffic: 0, parked: 0, range: 70 },
  });
  s.start();
  const prop = s.city.props.find(
    (p) => p.kind === "tree" && p.angle === Math.PI / 2 && Math.abs(p.x) < 70 && Math.abs(p.z) < 70,
  );
  const road = Math.round(prop.z / 30) * 30;
  const side = Math.sign(prop.z - road);
  Object.assign(s.player, {
    x: prop.x,
    z: prop.z - side * (CONFIG.radius + PROPS.tree.r + 0.25),
    angle: side > 0 ? Math.PI : 0,
    vx: 0,
    vz: side * 20,
    speed: 20,
  });
  s.previousPlayer = { x: s.player.x, z: s.player.z };
  for (let i = 0; i < 20 && prop.state === "stand"; i++) s.update(1 / 60);
  assert.equal(prop.state, "falling");
  // Park the car right where the trunk will land, and hold it there.
  const tip = { x: prop.x + Math.sin(prop.fallDir) * 2.2, z: prop.z + Math.cos(prop.fallDir) * 2.2 };
  for (let i = 0; i < 60; i++) {
    Object.assign(s.player, { x: tip.x, z: tip.z, vx: 0, vz: 0, speed: 0 });
    s.previousPlayer = { x: tip.x, z: tip.z };
    s.update(1 / 60);
  }
  assert.equal(prop.state, "down");
  assert.ok(prop.solidPending, "obstacle waits while the car is on the trunk");
  assert.equal(s.solids.some((b) => b.propId === prop.id), false);
  // The car drives off; then the trunk becomes an obstacle.
  Object.assign(s.player, { x: tip.x + side * 0, z: tip.z - side * 8, vx: 0, vz: 0, speed: 0 });
  s.previousPlayer = { x: s.player.x, z: s.player.z };
  s.update(1 / 60);
  s.update(1 / 60);
  assert.equal(prop.solidPending, null);
  assert.ok(s.solids.some((b) => b.propId === prop.id));
});
