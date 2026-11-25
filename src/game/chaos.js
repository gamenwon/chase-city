// CITY CHAOS: the integrated mode. Not a sequence of missions: every
// activity runs at once in one city, for as long as the player stays free
// and the car holds together (BUSTED or WRECKED end it; nothing else does).
//
//   police      the normal pursuit, cordons and arrests, with a wanted
//               level (1-5) that grows with time and with what the player
//               destroys: more cars, roadblocks from level 3, heavy police
//               SUVs and the helicopter from 4, an armored truck at 5
//   target      one fleeing target car at a time; taken down -> score and
//               coins, a new one comes in off screen after a short delay
//   parcels     a few on the roads; driving through picks one up (any
//               number can be carried); a drop-off point appears while
//               carrying; driving through it delivers them all
//   destruction everything the city already does, plus a combo: each
//               player-made destruction within CHAOS.combo.window s of the
//               last raises the multiplier (capped)
//   coins, repairs  as in every mission (coins.js, repairs.js)
//
// Nothing here resets the city: destroyed things stay destroyed.
// Every number is in CHAOS (evaluation build: balance later).
import { createTarget } from "./target.js";
import { spawnView, inspectSpawn } from "./spawning.js";

export const CHAOS = Object.freeze({
  // Start calm: two cars a little way back, the wanted level grows.
  startPolice: 2,
  heat: {
    perSecond: 1, // survival
    police: 5, // a police car the player took out
    civilian: 2, // a civilian car wrecked / blown up
    major: 10, // gas station, depot tank, bridge span, landmark...
    shop: 2, // a shop front
    prop: 0.2, // a sign, a lamp, a bin
    target: 10,
    chainLink: 3, // each further link of a chain reaction
  },
  // Heat needed for wanted level 1..5 (survival alone: 2 at 1:00, 3 at
  // 2:30, 4 at 4:20, 5 at 6:20; a steady rampage gets to 4 in 2-3 min).
  levels: [0, 60, 150, 260, 380],
  // Police cars wanted on the road per level, and how many of them heavy.
  fleet: [2, 4, 5, 6, 7],
  // (Evaluation lineup: patrol cars, the armored truck and the helicopter;
  // the heavy SUV stays available but is not sent.)
  heavySuv: [0, 0, 0, 0, 0],
  armored: [0, 0, 0, 1, 2],
  roadblockFrom: 3,
  helicopterFrom: 4,
  // Destruction counts for the player when the player did it (rammed,
  // crushed, its own blast) or it happened within this range of the car.
  attributeRange: 45,
  combo: {
    window: 3, // s to the next destruction to keep the combo
    step: 0.25, // multiplier per further destruction
    maxMultiplier: 5,
  },
  score: {
    prop: 10,
    traffic: 60, // a civilian car wrecked
    shop: 60,
    civilian: 90, // a civilian car blown up
    police: 150,
    sculpture: 200,
    fireworks: 250,
    landmark: 300,
    wheel: 300,
    depot: 350,
    gas: 400,
    bridge: 500,
    chainLink: 40,
    target: 1000,
    parcel: 150,
    delivery: 400, // per parcel delivered
    survivalPerSecond: 2,
  },
  coins: { target: 8, delivery: 3 }, // per target / per parcel delivered
  target: { respawn: 5, min: 75, max: 120 },
  // Parcels and drop-offs: off in the evaluation build (the parcel mission
  // still has them); the code stays for later.
  parcels: { enabled: false, onMap: 4, respawn: 6, radius: 4.5, minGap: 40, deliveryRadius: 7, deliveryMin: 60, deliveryMax: 130 },
});

const MAJOR = new Set(["gas", "depot", "bridge", "landmark", "wheel", "sculpture", "fireworks"]);

// Road points for parcels and drop-offs: plain stretches of road (not
// junctions, not up on the elevated road).
function roadSpots(sim) {
  const nav = sim.navigation, out = [];
  for (const n of nav.nodes)
    if (n.id < (nav.baseNodeCount ?? nav.nodes.length) && n.neighbors.length === 2 && !n.level && !n.foot) out.push({ x: n.x, z: n.z });
  return out;
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function createChaos(sim) {
  const c = {
    level: 1,
    maxLevel: 1,
    heat: 0,
    score: 0,
    combo: { count: 0, multiplier: 1, until: -1, best: 0, chain: false, label: "" },
    counts: { police: 0, civilian: 0, facilities: 0, props: 0, targets: 0, parcels: 0, deliveries: 0 },
    carried: 0,
    delivery: null, // { x, z } while carrying
    targetDueAt: null,
    targetSerial: 1,
    parcelSerial: 0,
    spots: roadSpots(sim),
    feed: [], // { text, kind, time } short callouts for the HUD
    levelUpAt: -9,
    survivalScored: 0,
    heliFrom: CHAOS.helicopterFrom,
  };
  sim.chaos = c;
  sim.pickups = [];
  if (CHAOS.parcels.enabled) for (let i = 0; i < CHAOS.parcels.onMap; i++) sim.pickups.push(placeParcel(sim, c));
  sim.target = createTarget(sim);
  if (sim.target) sim.target.serial = c.targetSerial;
  return c;
}

function placeParcel(sim, c) {
  const p = sim.player;
  const others = sim.pickups.filter((q) => !q.taken);
  const pool = c.spots.filter((s) => dist(s, p) > 35 && dist(s, p) < 110 && others.every((q) => dist(q, s) > CHAOS.parcels.minGap));
  const list = pool.length ? pool : c.spots;
  const s = list[Math.floor(sim.random() * list.length)] || { x: p.x + 40, z: p.z };
  return { id: ++c.parcelSerial, x: s.x, z: s.z, taken: false };
}

function pickDelivery(sim, c) {
  const p = sim.player;
  const pool = c.spots.filter((s) => dist(s, p) >= CHAOS.parcels.deliveryMin && dist(s, p) <= CHAOS.parcels.deliveryMax);
  const list = pool.length ? pool : c.spots;
  const s = list[Math.floor(sim.random() * list.length)];
  return s ? { x: s.x, z: s.z, since: sim.elapsed } : null;
}

function callout(c, sim, text, kind) {
  c.feed.push({ text, kind, time: sim.elapsed });
  if (c.feed.length > 6) c.feed.shift();
}

// Coins for an activity (not destruction: not under the destruction cap).
function payCoins(sim, amount, x, z, reason) {
  if (!amount || sim.result) return;
  sim.runCoins += amount;
  sim.coinStats.rewards++;
  sim.coinFx.push({ x, y: 2, z, value: amount, time: sim.elapsed, kind: "reward", reason });
  if (sim.coinFx.length > 40) sim.coinFx.shift();
}

function addScore(c, base) {
  c.score += Math.round(base);
}

// Something was destroyed (coins.js awardCoins, storefronts, the tally):
// kind as in CHAOS.score, key unique per object, `byPlayer` when the cause
// is known to be the player's own.
export function chaosDestroyed(sim, kind, key, x, z, chainDepth = 0, byPlayer = false) {
  const c = sim.chaos;
  if (!c || sim.result || !sim.started) return false;
  c.seen ||= new Set();
  if (c.seen.has(key)) return false;
  c.seen.add(key);
  const near = Math.hypot(x - sim.player.x, z - sim.player.z) <= CHAOS.attributeRange;
  if (!byPlayer && !near) return false;
  // Counters for the result screen.
  if (kind === "police") c.counts.police++;
  else if (kind === "civilian" || kind === "traffic") c.counts.civilian++;
  else if (kind === "prop") c.counts.props++;
  else c.counts.facilities++;
  // Wanted heat.
  const H = CHAOS.heat, pace = sim.chaosPace || 1;
  c.heat += pace * (kind === "police" ? H.police : kind === "civilian" || kind === "traffic" ? H.civilian : MAJOR.has(kind) ? H.major : kind === "shop" ? H.shop : H.prop);
  if (chainDepth > 0) c.heat += H.chainLink * pace;
  // Combo.
  const now = sim.elapsed, k = c.combo;
  if (now <= k.until) k.count++;
  else {
    k.count = 1;
    k.chain = false;
  }
  if (chainDepth > 0) k.chain = true;
  k.until = now + CHAOS.combo.window;
  k.multiplier = Math.min(CHAOS.combo.maxMultiplier, 1 + CHAOS.combo.step * (k.count - 1));
  k.best = Math.max(k.best, k.count);
  k.label = k.count >= 20 ? "CITY CHAOS" : k.count >= 10 ? "MASSIVE DESTRUCTION" : k.chain ? "CHAIN REACTION" : "COMBO";
  const S = CHAOS.score;
  addScore(c, ((S[kind] ?? S.prop) + (chainDepth > 0 ? S.chainLink : 0)) * k.multiplier);
  return true;
}

function setLevel(sim, c) {
  let level = 1;
  CHAOS.levels.forEach((h, i) => {
    if (c.heat >= h) level = i + 1;
  });
  // (Never back down within a run.)
  if (level > c.level) {
    c.level = level;
    c.levelUpAt = sim.elapsed;
    c.maxLevel = Math.max(c.maxLevel, level);
    callout(c, sim, `WANTED ${"★".repeat(level)}`, "wanted");
  }
}

// Police cars wanted on the road now, and of which kind the next one is.
export function chaosFleet(sim) {
  return CHAOS.fleet[(sim.chaos?.level || 1) - 1];
}
export function chaosNextPoliceKind(sim) {
  const c = sim.chaos;
  if (!c) return null;
  const i = c.level - 1, active = sim.police.filter((q) => q.state === "active");
  if (active.filter((q) => q.heavy === "armored").length < CHAOS.armored[i]) return "armored";
  if (active.filter((q) => q.heavy === "suv").length < CHAOS.heavySuv[i]) return "suv";
  return null;
}

function hiddenFrom(sim) {
  const view = spawnView(sim.cameraRig?.camera);
  return view ? (pos) => inspectSpawn(view, pos, 0, 6).outside : null;
}

export function updateChaos(sim, dt) {
  const c = sim.chaos;
  if (!c || sim.result) return;
  const p = sim.player, now = sim.elapsed;
  // Survival: heat and a trickle of score.
  c.heat += CHAOS.heat.perSecond * dt * (sim.chaosPace || 1);
  const whole = Math.floor(now);
  if (whole > c.survivalScored) {
    addScore(c, CHAOS.score.survivalPerSecond * (whole - c.survivalScored));
    c.survivalScored = whole;
  }
  setLevel(sim, c);
  if (now > c.combo.until && c.combo.count) {
    c.combo.count = 0;
    c.combo.multiplier = 1;
  }
  // Target: taken down -> reward; then a new one comes in off screen.
  const t = sim.target;
  if (t && t.state === "wrecked" && !t.rewarded) {
    t.rewarded = true;
    c.counts.targets++;
    c.heat += CHAOS.heat.target;
    addScore(c, CHAOS.score.target);
    payCoins(sim, CHAOS.coins.target, t.x, t.z, "target");
    callout(c, sim, "TARGET DOWN!", "target");
    c.targetDueAt = now + CHAOS.target.respawn;
  }
  if ((!t || t.state === "wrecked") && c.targetDueAt != null && now >= c.targetDueAt) {
    const next = createTarget(sim, { min: CHAOS.target.min, max: CHAOS.target.max, hidden: hiddenFrom(sim) });
    if (next) {
      next.serial = ++c.targetSerial;
      sim.target = next;
      c.targetDueAt = null;
      callout(c, sim, "NEW TARGET", "target");
    } else c.targetDueAt = now + 1; // try again shortly
  }
  // Parcels: pick up by driving through (never from the air).
  const R = CHAOS.parcels;
  for (let i = 0; i < sim.pickups.length; i++) {
    const q = sim.pickups[i];
    if (q.taken) {
      if (now - q.takenAt >= R.respawn) sim.pickups[i] = placeParcel(sim, c);
      continue;
    }
    if ((p.y || 0) > 3 || Math.hypot(q.x - p.x, q.z - p.z) > R.radius) continue;
    q.taken = true;
    q.takenAt = now;
    c.carried++;
    c.counts.parcels++;
    addScore(c, CHAOS.score.parcel);
    sim.events.push({ id: ++sim.eventId, type: "pickup", x: q.x, z: q.z, time: now });
    if (sim.events.length > 64) sim.events.shift();
    if (!c.delivery) c.delivery = pickDelivery(sim, c);
    callout(c, sim, c.carried > 1 ? `택배 ${c.carried}개` : "택배 획득", "parcel");
  }
  // Drop-off: drive through it while carrying.
  if (c.delivery && c.carried > 0 && (p.y || 0) < 3 && Math.hypot(c.delivery.x - p.x, c.delivery.z - p.z) <= R.deliveryRadius) {
    const n = c.carried;
    c.counts.deliveries++;
    c.delivered = (c.delivered || 0) + n;
    addScore(c, CHAOS.score.delivery * n);
    payCoins(sim, CHAOS.coins.delivery * n, c.delivery.x, c.delivery.z, "delivery");
    sim.events.push({ id: ++sim.eventId, type: "delivery", x: c.delivery.x, z: c.delivery.z, count: n, time: now });
    if (sim.events.length > 64) sim.events.shift();
    callout(c, sim, `배송 완료 ×${n}`, "delivery");
    c.carried = 0;
    c.delivery = null;
  }
}
