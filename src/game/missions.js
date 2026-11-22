// V2.0 common mission system.
//
// Every mission is one data entry with its own goal, time limit, success and
// failure conditions, reward and map. The simulation runs the same driving,
// collision and city code for all of them; a mission only says which systems
// are on (rules), what to check each step (update) and what the HUD shows.
//
// Mission entry fields:
//   id, title, objective, type ("chase", "collect", later "carry",
//     "stealth", "evade"...), mapId, durationClass ("short" 30-90 s,
//     "challenge" 2-3 min)
//   timeLimit   seconds, or null for no clock (fails with "timeout")
//   target      number the progress counts up to (seconds, items...)
//   reward      { type: "credits", amount } - game credits only
//   rules       { police } - systems this mission uses
//   failOn      results that end the run as a failure
//   continueOn  failures an ad continue may revive (once per run)
//   setup(sim)  after reset, before START (place items...)
//   update(sim) each step after physics, unless the run already ended
//   hud(sim)    the mission card line on the HUD
//
// Order on the select screen is not here: see catalog.js.
import { crossedExit } from "./escape.js";
import { createTarget, TARGET } from "./target.js";

const SURVIVAL_SECONDS = 60;

export const MISSIONS = Object.freeze({
  // The V1.x police chase, unchanged, as one mission among others.
  survival60: Object.freeze({
    id: "survival60",
    type: "chase",
    title: "도시 탈출",
    objective: "60초간 버틴 뒤 외곽 탈출 도로의 최종 게이트를 통과하세요.",
    mapId: "downtown",
    durationClass: "short",
    timeLimit: null,
    target: SURVIVAL_SECONDS,
    reward: Object.freeze({ type: "credits", amount: 500 }),
    rules: Object.freeze({ police: true }),
    failOn: Object.freeze(["arrested", "destroyed"]),
    continueOn: Object.freeze(["arrested", "destroyed"]),
    progressLabel: "생존",
    unit: "초",
    progress: (sim) => Math.min(sim.elapsed, SURVIVAL_SECONDS),
    isComplete: (sim) =>
      sim.escape.phase === "open" &&
      crossedExit(sim.previousPlayer, sim.player, sim.escape.exit),
    update(sim) {
      const m = sim.mission;
      if (sim.elapsed + 1e-7 >= SURVIVAL_SECONDS && sim.escape.phase === "locked") {
        sim.openEscape();
        m.status = "escape";
        return;
      }
      if (this.isComplete(sim)) {
        sim.escape.phase = "escaped";
        completeMission(sim);
      }
    },
    hud: (sim) =>
      sim.escape.phase === "locked"
        ? `생존 ${Math.floor(sim.mission.progress)} / ${SURVIVAL_SECONDS}초`
        : "탈출 · 최종 게이트로 이동",
  }),

  // A short no-police mission: proves the system carries other mission
  // types (collect) on the same map, car and city.
  parcels: Object.freeze({
    id: "parcels",
    type: "collect",
    title: "택배 수거",
    objective: "제한 시간 안에 도시 곳곳의 택배 5개를 모두 수거하세요.",
    mapId: "downtown",
    durationClass: "short",
    timeLimit: 80,
    target: 5,
    reward: Object.freeze({ type: "credits", amount: 300 }),
    rules: Object.freeze({ police: false }),
    failOn: Object.freeze(["destroyed", "timeout"]),
    continueOn: Object.freeze(["destroyed", "timeout"]),
    progressLabel: "수거",
    unit: "개",
    pickupRadius: 4.5,
    progress: (sim) => sim.pickups.filter((p) => p.taken).length,
    setup(sim) {
      sim.pickups = placePickups(sim, this.target);
    },
    update(sim) {
      for (const item of sim.pickups) {
        if (item.taken) continue;
        if (Math.hypot(item.x - sim.player.x, item.z - sim.player.z) < this.pickupRadius) {
          item.taken = true;
          item.takenAt = sim.elapsed;
          sim.events.push({
            id: ++sim.eventId,
            type: "pickup",
            x: item.x,
            z: item.z,
            time: sim.elapsed,
          });
        }
      }
      if (sim.pickups.every((p) => p.taken)) completeMission(sim);
    },
    hud: (sim) =>
      `수거 ${sim.mission.progress} / 5 · 남은 ${Math.max(0, Math.ceil(timeLeft(sim)))}초`,
  }),

  // TARGET HUNT: the player is the hunter. One fleeing target car, no
  // police, no clock (first version: chase quality first). Ram it until
  // it is destroyed.
  targetHunt: Object.freeze({
    id: "targetHunt",
    type: "hunt",
    title: "타깃 헌트",
    objective: "도망치는 타깃 차량을 추격해 들이받아 파괴하세요. 세게 부딪힐수록 큰 피해를 줍니다.",
    mapId: "downtown",
    durationClass: "short",
    timeLimit: null,
    target: 100,
    reward: Object.freeze({ type: "credits", amount: 600 }),
    rules: Object.freeze({ police: false }),
    failOn: Object.freeze(["destroyed"]),
    continueOn: Object.freeze(["destroyed"]),
    progressLabel: "타깃 손상",
    unit: "%",
    progress: (sim) => (sim.target ? Math.round(TARGET.health - sim.target.health) : 0),
    setup(sim) {
      sim.target = createTarget(sim);
    },
    update(sim) {
      const t = sim.target;
      if (t?.state === "wrecked" && sim.elapsed - t.wreckedAt >= TARGET.winDelay) completeMission(sim);
    },
    hud: (sim) => {
      const t = sim.target;
      if (!t) return "";
      if (t.state === "wrecked") return "타깃 파괴!";
      const d = Math.round(Math.hypot(t.x - sim.player.x, t.z - sim.player.z));
      return `타깃 내구도 ${Math.ceil(t.health)}% · ${d} m`;
    },
  }),
});

export const timeLeft = (sim) =>
  sim.mission.definition.timeLimit === null
    ? Infinity
    : sim.mission.definition.timeLimit + sim.mission.extraTime - sim.elapsed;

export function getMission(id) {
  const definition = MISSIONS[id];
  if (!definition) throw new Error(`Unknown mission: ${id}`);
  return definition;
}

export function createMission(id = "survival60") {
  return {
    definition: getMission(id),
    progress: 0,
    status: "pending",
    rewardGranted: false,
    continued: false,
    extraTime: 0,
  };
}

// Success: grant the mission reward once and end the run.
export function completeMission(sim) {
  const m = sim.mission;
  m.status = "completed";
  if (!m.rewardGranted) {
    sim.credits += m.definition.reward.amount;
    m.rewardGranted = true;
  }
  sim.result = "success";
}

export function updateMission(sim) {
  const m = sim.mission,
    def = m.definition;
  m.progress = def.progress(sim);
  if (sim.result) {
    m.status = "failed";
    return;
  }
  if (def.timeLimit !== null && timeLeft(sim) <= 1e-7) {
    sim.result = "timeout";
    m.status = "failed";
    return;
  }
  def.update(sim);
}

// Five parcels on road centre lines, spread over the city, none at the
// start. Deterministic per run (the simulation's random source).
function placePickups(sim, count) {
  const roads = [-90, -60, -30, 0, 30, 60, 90];
  const spots = [];
  // V2.1 generated city: on the road network (navigation nodes away from
  // junctions, alleys included).
  if (sim.layout.graph)
    for (const n of sim.navigation.nodes)
      if (n.id < (sim.navigation.baseNodeCount ?? sim.navigation.nodes.length) && n.neighbors.length === 2) spots.push({ x: n.x, z: n.z });
  if (!sim.layout.graph)
  for (const line of roads)
    for (const mid of [-75, -45, -15, 15, 45, 75]) {
      spots.push({ x: line, z: mid });
      spots.push({ x: mid, z: line });
    }
  const start = sim.player;
  const pool = spots.filter(
    (s) =>
      Math.hypot(s.x - start.x, s.z - start.z) > 30 &&
      Math.hypot(s.x - start.x, s.z - start.z) < 95,
  );
  const picked = [];
  let guard = 0;
  while (picked.length < count && guard++ < 500) {
    const s = pool[Math.floor(sim.random() * pool.length)];
    if (picked.every((q) => Math.hypot(q.x - s.x, q.z - s.z) > 32))
      picked.push(s);
  }
  return picked.map((s, i) => ({ id: i, x: s.x, z: s.z, taken: false }));
}
