// DESTROYER: a hostile ram truck (CITY CHAOS). Not a police car: it never
// arrests, blocks or joins a cordon; it hunts the player's car and tries to
// wreck it by ramming.
//
// Cycle
//   chase    drives at the player (straight when the way is clear, along
//            the road graph otherwise)
//   charge   within DESTROYER.range of the player, same level, nothing
//            solid in between: the gauge fills over chargeSeconds; out of
//            range (or the view blocked) it drops to zero at once
//   attack   full: a lunge at 150% acceleration toward where the player is
//            heading; only a real hit hurts (the player can still dodge)
//   recover  recoverSeconds slow and harmless, then chase again
//
// The player fights back with the car itself: a hit's force (speed toward
// the truck, the car's mass and impact, a side or rear hit counts more)
// takes its health; a hard enough hit breaks its charge. Blasts, police
// cars it smashes into, walls and a collapsing deck hurt it too. Wrecked:
// a big explosion, a wreck left in the street, a coin reward (once), and
// a new one later. At most one at a time. Every number is in DESTROYER.
import { CONFIG, clamp, angleDelta } from "./config.js";
import { hurt } from "./durability.js";
import { addWreck } from "./wrecks.js";
import { spawnView, inspectSpawn } from "./spawning.js";
import { updateJump } from "./jumps.js";
import { chaosReward } from "./chaos.js";
import { hitProps } from "./city.js";

export const DESTROYER = Object.freeze({
  max: 1,
  firstAt: [30, 60], // s into the run
  respawn: [45, 60], // s after one is wrecked
  range: 11, // m: about 2.5 car lengths
  chargeSeconds: 2,
  recoverSeconds: 3,
  attackSeconds: 2.0, // the lunge gives up after this long
  attackAccel: 1.5, // x its normal acceleration
  attackDamage: 17, // HP for a 100 HP car, before the car's resistance
  attackCap: 20, // (the damage window lets this one hit through whole)
  touchDamage: 2.5, // ordinary contact (not a charged ram), at most once a second
  accel: 9,
  topSpeed: 21,
  attackTop: 25,
  turnRate: 2.3,
  attackTurn: 0.85, // it can only correct a little once it lunges
  grip: 4,
  radius: 1.6,
  mass: 2.6,
  health: 3 * CONFIG.policeHealth,
  interruptHit: 14, // damage from one player hit that breaks the charge
  reward: { coins: 10, score: 750, heat: 25 }, // 5x a police car
  spawnMin: 55,
  spawnMax: 100,
});

const rand = (sim, [a, b]) => a + (b - a) * sim.random();
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function destroyerEnabled(sim) {
  return !!(sim.chaos || sim.destroyerOption) && sim.policeEnabled !== false;
}
export function resetDestroyer(sim) {
  sim.destroyer = null;
  sim.destroyerDueAt = null;
  sim.destroyerSerial = 0;
  sim.destroyerStats = { spawns: 0, charges: 0, resets: 0, attacks: 0, hits: 0, misses: 0, interrupts: 0, playerHits: 0, damageToPlayer: 0, damageTaken: 0, kills: 0, recalls: 0 };
}

// A road node out of sight, DESTROYER.spawnMin-spawnMax m from the player,
// from which the player can be reached.
function spawnPoint(sim) {
  const nav = sim.navigation, p = sim.player;
  const view = spawnView(sim.cameraRig?.camera);
  const cands = nav.nodes.filter((n) => {
    const d = dist(n, p);
    return !n.dead && !n.level && !n.foot && (nav.baseNodeCount === undefined || n.id < nav.baseNodeCount) && d >= DESTROYER.spawnMin && d <= DESTROYER.spawnMax && nav.clear(n, n, DESTROYER.radius) && (!view || inspectSpawn(view, n, 0, 10).outside);
  });
  // Nearest first (it should arrive, not wander), a few route checks.
  cands.sort((a, b) => dist(a, p) - dist(b, p));
  for (const n of cands.slice(0, 6)) {
    const route = nav.findPath(n, p, CONFIG.policeRadius);
    if (route.length >= 2) return { n, route };
  }
  return null;
}
function spawn(sim) {
  const s = spawnPoint(sim);
  if (!s) return null;
  const { n, route } = s;
  const next = route[1];
  const angle = Math.atan2(-(next.x - n.x), -(next.z - n.z));
  sim.destroyerStats.spawns++;
  const d = {
    id: ++sim.destroyerSerial,
    x: n.x, z: n.z, y: 0, angle, vx: 0, vz: 0, speed: 0, level: 0,
    health: DESTROYER.health, maxHealth: DESTROYER.health,
    state: "chase", stateAt: sim.elapsed, charge: 0, route, routeAt: sim.elapsed,
    stuck: 0, lastProgress: { x: n.x, z: n.z, t: sim.elapsed },
    hitThisAttack: false, spawnedAt: sim.elapsed,
  };
  sim.destroyer = d;
  chaosReward(sim, { text: "DESTROYER 출현!", kind: "destroyer" });
  return d;
}

// Within range, on the same level, nothing solid in between.
export function inStrikeRange(sim, d) {
  const p = sim.player;
  if ((d.level || 0) !== (p.level || 0) || d.falling || p.falling) return false;
  if (dist(d, p) > DESTROYER.range) return false;
  return sim.navigation.clear(d, p, 0.3);
}

function setState(sim, d, state) {
  d.state = state;
  d.stateAt = sim.elapsed;
}

// Steering toward a point: heading turns at `turn` rad/s, speed eases to
// `want`; the velocity follows the heading with some grip (so a shove or a
// knock-back carries it for a moment).
function drive(d, tx, tz, want, accel, turn, dt) {
  const head = Math.atan2(-(tx - d.x), -(tz - d.z));
  d.angle += clamp(angleDelta(head, d.angle), -turn * dt, turn * dt);
  d.speed += clamp(want - d.speed, -accel * 1.6 * dt, accel * dt);
  const fx = -Math.sin(d.angle), fz = -Math.cos(d.angle), k = Math.min(1, DESTROYER.grip * dt);
  d.vx += (fx * d.speed - d.vx) * k;
  d.vz += (fz * d.speed - d.vz) * k;
}

function chaseTarget(sim, d) {
  const p = sim.player, nav = sim.navigation;
  const sameLevel = (d.level || 0) === (p.level || 0);
  if (sameLevel && dist(d, p) < 45 && nav.clear(d, p, 1.2)) return { x: p.x + (p.vx || 0) * 0.3, z: p.z + (p.vz || 0) * 0.3 };
  if (!d.route?.length || sim.elapsed - d.routeAt > 0.7) {
    d.route = nav.findPath(d, p, CONFIG.policeRadius);
    d.routeAt = sim.elapsed;
  }
  while (d.route?.length > 1 && dist(d, d.route[0]) < 4.5) d.route.shift();
  return d.route?.[0] || p;
}

export function updateDestroyer(sim, dt) {
  if (!sim.destroyerStats) resetDestroyer(sim);
  if (!destroyerEnabled(sim) || sim.result) return;
  const now = sim.elapsed;
  if (sim.destroyerDueAt == null && !sim.destroyer) sim.destroyerDueAt = now + (sim.destroyerFirstAt ?? rand(sim, DESTROYER.firstAt));
  let d = sim.destroyer;
  if ((!d || d.state === "wrecked") && sim.destroyerDueAt != null && now >= sim.destroyerDueAt) {
    if (spawn(sim)) sim.destroyerDueAt = null;
    else sim.destroyerDueAt = now + 1; // no hidden spot yet: try again
    d = sim.destroyer;
  }
  if (!d || d.state === "wrecked") return;
  const p = sim.player, S = sim.destroyerStats;
  const D = DESTROYER;
  // The police are closing in for an arrest: it holds off (no charging),
  // so a cordon and a ram never land together.
  const arresting = sim.arrest > 0 || p.contained || sim.pin?.trapped;
  const strike = !arresting && inStrikeRange(sim, d);
  if (d.state === "chase" || d.state === "charge") {
    if (strike) {
      if (d.state === "chase") {
        setState(sim, d, "charge");
        S.charges++;
      }
      d.charge = Math.min(1, d.charge + dt / D.chargeSeconds);
      if (d.charge >= 1) {
        // Full: lunge at where the player is heading.
        setState(sim, d, "attack");
        d.charge = 0;
        d.flashAt = now;
        d.hitThisAttack = false;
        d.aim = { x: p.x + (p.vx || 0) * 0.35, z: p.z + (p.vz || 0) * 0.35 };
        // (It jumps forward: at least the player's pace plus a kick.)
        d.speed = Math.max(d.speed, Math.hypot(p.vx || 0, p.vz || 0)) + 4;
        S.attacks++;
      }
    } else if (d.state === "charge") {
      // Escaped: the gauge is gone at once.
      d.charge = 0;
      setState(sim, d, "chase");
      S.resets++;
    }
  }
  // Driving.
  d.noRamp = !(p.level === 1 || d.route?.some((q) => q.level === 1));
  if (d.state === "chase" || d.state === "charge") {
    const t = chaseTarget(sim, d);
    const close = dist(d, p);
    // (Charging: keeps pace a few metres off rather than bumping early.)
    const want = d.state === "charge" ? clamp(Math.hypot(p.vx || 0, p.vz || 0) + (close - 6) * 1.2, 2, D.topSpeed) : D.topSpeed;
    drive(d, t.x, t.z, want, D.accel, D.turnRate, dt);
  } else if (d.state === "attack") {
    // Locked on its aim, a little correction toward the player.
    d.aim.x += (p.x - d.aim.x) * Math.min(1, dt * 0.6);
    d.aim.z += (p.z - d.aim.z) * Math.min(1, dt * 0.6);
    drive(d, d.aim.x, d.aim.z, D.attackTop, D.accel * D.attackAccel, D.attackTurn, dt);
    const fx = -Math.sin(d.angle), fz = -Math.cos(d.angle);
    const past = (p.x - d.x) * fx + (p.z - d.z) * fz < -3;
    if (d.hitThisAttack || past || now - d.stateAt > D.attackSeconds) {
      if (!d.hitThisAttack) S.misses++;
      setState(sim, d, "recover");
    }
  } else if (d.state === "recover" || d.state === "stagger") {
    // Rolls on and slows, turning away a little; harmless.
    const fx = -Math.sin(d.angle), fz = -Math.cos(d.angle);
    drive(d, d.x + fx * 10 + (d.x - p.x) * 0.3, d.z + fz * 10 + (d.z - p.z) * 0.3, 5, D.accel, D.turnRate * 0.6, dt);
    if (now - d.stateAt > (d.state === "stagger" ? 1 : D.recoverSeconds)) setState(sim, d, "chase");
  }
  // Move (walls, levels, ramps, jumps, a broken deck: as every car).
  const before = { x: d.x, z: d.z };
  const wall = sim.move(d, dt, D.radius);
  updateJump(sim, d, dt, D.mass);
  // (Its own scrapes along walls barely dent it; a real smash does.)
  if (wall && (d.lastImpact || 0) > 16) {
    d.health -= (d.lastImpact - 16) * 0.8;
    d.lastCause = "wall";
  }
  if (wall) d.speed *= 0.7;
  // Stuck (pinned on a corner, a wreck pile): back off and turn; recalled
  // off screen if it gets nowhere for long.
  if (dist(d, d.lastProgress) > 3) d.lastProgress = { x: d.x, z: d.z, t: now };
  else if (now - d.lastProgress.t > 2.2 && d.state !== "recover") {
    d.angle += Math.PI * 0.6;
    d.speed = -4;
    d.route = null;
    d.lastProgress.t = now - 0.8;
    d.unstick = (d.unstick || 0) + 1;
    const view = spawnView(sim.cameraRig?.camera);
    if (d.unstick >= 4 && (!view || inspectSpawn(view, d, 0, 6).outside)) {
      const s = spawnPoint(sim);
      if (s) {
        Object.assign(d, { x: s.n.x, z: s.n.z, vx: 0, vz: 0, speed: 0, route: s.route, routeAt: now, unstick: 0, state: "chase", charge: 0 });
        d.lastProgress = { x: d.x, z: d.z, t: now };
        S.recalls++;
      }
    }
  }
  void before;
  contactPlayer(sim, d);
  contactOthers(sim, d, dt);
  if (d.health <= 0) wreckDestroyer(sim, d);
}

// The truck and the player's car touching: they push apart (by weight);
// a charged lunge hurts (once), ordinary contact a little; the player's own
// hit hurts the truck.
function contactPlayer(sim, d) {
  const p = sim.player;
  if ((d.level || 0) !== (p.level || 0) || p.falling || d.falling) return;
  const pr = sim.vehicle?.stats.radius || CONFIG.radius;
  const dx = p.x - d.x, dz = p.z - d.z, dd = Math.hypot(dx, dz), reach = pr + DESTROYER.radius;
  if (dd >= reach || dd < 1e-6) return;
  const nx = dx / dd, nz = dz / dd;
  const st = sim.vehicle?.stats || {};
  const pm = st.mass || 1, dm = DESTROYER.mass;
  // Separate by weight.
  const over = reach - dd, share = dm / (pm + dm);
  p.x += nx * over * share;
  p.z += nz * over * share;
  d.x -= nx * over * (1 - share);
  d.z -= nz * over * (1 - share);
  // Speeds along the line between them.
  const pv = (p.vx || 0) * nx + (p.vz || 0) * nz, dv = d.vx * nx + d.vz * nz;
  const closing = dv - pv;
  if (closing <= 0) return;
  // Momentum exchange (a little bounce).
  const j = (1.25 * closing) / (1 / pm + 1 / dm);
  p.vx += (nx * j) / pm;
  p.vz += (nz * j) / pm;
  d.vx -= (nx * j) / dm;
  d.vz -= (nz * j) / dm;
  d.speed *= 0.4;
  const S = sim.destroyerStats, now = sim.elapsed;
  // Who drove into whom: the truck's speed toward the car, the car's toward
  // the truck.
  const truckHit = Math.max(0, dv), carHit = Math.max(0, -pv);
  if (d.state === "attack" && !d.hitThisAttack && truckHit > 6) {
    d.hitThisAttack = true;
    const hp = hurt(sim, "destroyer", DESTROYER.attackDamage, `destroyer:${d.id}:atk:${S.attacks}`, DESTROYER.attackCap);
    S.hits++;
    S.damageToPlayer += hp;
    d.lastRamHp = hp;
    sim.cameraKick = Math.max(sim.cameraKick || 0, 0.55);
    sim.city?.events.push({ id: ++sim.city.eventId, type: "jump", action: "land", x: p.x, z: p.z, strength: 15, sound: "thud" });
  } else if (truckHit > 6 && d.state !== "recover") {
    const hp = hurt(sim, "destroyer", DESTROYER.touchDamage, `destroyer:${d.id}:touch`);
    S.damageToPlayer += hp;
  }
  // The player's hit: speed into the truck, the car's mass and punch, more
  // from the side or the back than head-on into the ram.
  // (One hit per contact: at most every half second.)
  if (carHit > 4 && !(now - (d.lastHitAt ?? -9) < 0.5)) {
    const fx = -Math.sin(d.angle), fz = -Math.cos(d.angle);
    const front = -(nx * fx + nz * fz); // 1: the car hit its nose
    const dir = front > 0.6 ? 0.6 : front < -0.4 ? 1.3 : 1.1;
    // (Weight and punch count, but not linearly: a bulldozer hits about
    // three times as hard as a coupe, not ten.)
    const dmg = (carHit - 4) * 2.3 * Math.sqrt(pm * (st.impact || 1)) * dir;
    d.health -= dmg;
    d.lastCause = "rammed";
    S.playerHits++;
    S.damageTaken += dmg;
    d.lastHitAt = now;
    d.lastHitDamage = dmg;
    if (dmg >= DESTROYER.interruptHit && (d.state === "charge" || d.state === "attack")) {
      d.charge = 0;
      S.interrupts++;
      setState(sim, d, "stagger");
    }
  }
}

// Police cars and traffic in its way: shoved; police cars smashed (it does
// not tell them apart from obstacles), the truck a little dented; street
// props flattened.
function contactOthers(sim, d, dt) {
  for (const c of sim.police) {
    if (c.state !== "active" || (c.level || 0) !== (d.level || 0)) continue;
    const dx = c.x - d.x, dz = c.z - d.z, dd = Math.hypot(dx, dz), reach = CONFIG.policeRadius + DESTROYER.radius;
    if (dd >= reach || dd < 1e-6) continue;
    const nx = dx / dd, nz = dz / dd, over = reach - dd;
    c.x += nx * over * 0.7;
    c.z += nz * over * 0.7;
    d.x -= nx * over * 0.3;
    d.z -= nz * over * 0.3;
    const closing = (d.vx - c.vx) * nx + (d.vz - c.vz) * nz;
    if (closing > 5 && !(c.destroyerHitAt > sim.elapsed - 0.6)) {
      c.destroyerHitAt = sim.elapsed;
      c.health -= closing * 3.2;
      c.lastDamageCause = "destroyer";
      d.health -= closing * 0.4;
      d.lastCause = "police";
      c.vx += nx * closing * 0.8;
      c.vz += nz * closing * 0.8;
    }
  }
  for (const t of sim.city?.traffic || []) {
    if (t.parked && t.state === "wreck") continue;
    const dx = t.x - d.x, dz = t.z - d.z, dd = Math.hypot(dx, dz), reach = 1.3 + DESTROYER.radius;
    if (dd >= reach || dd < 1e-6 || (t.level || 0) !== (d.level || 0)) continue;
    const nx = dx / dd, nz = dz / dd, over = reach - dd;
    t.x += nx * over;
    t.z += nz * over;
  }
  if (sim.city && !d.level) hitProps(sim, sim.city, d, DESTROYER.radius, false, 1.4);
  void dt;
}

// Blasts (blast.js): health by distance and strength, a shove.
export function blastDestroyer(sim, e, R, s, policeDamage) {
  const d = sim.destroyer;
  if (!d || d.state === "wrecked") return;
  const dd = Math.hypot(d.x - e.x, d.z - e.z);
  if (dd >= R || e.cause === "destroyer") return;
  const k = 1 - dd / R;
  d.health -= policeDamage * k * s * 0.6;
  d.lastCause = "blast";
  const push = (9 * k * Math.sqrt(s)) / DESTROYER.mass;
  d.vx += ((d.x - e.x) / (dd || 1)) * push;
  d.vz += ((d.z - e.z) / (dd || 1)) * push;
  if (d.health <= 0) wreckDestroyer(sim, d);
}

export function wreckDestroyer(sim, d) {
  if (d.state === "wrecked") return;
  d.state = "wrecked";
  d.health = 0;
  d.charge = 0;
  d.wreckedAt = sim.elapsed;
  d.vx = d.vz = d.speed = 0;
  const S = sim.destroyerStats;
  S.kills++;
  const p = sim.player;
  const byPlayer = d.lastCause === "rammed" || Math.hypot(p.x - d.x, p.z - d.z) < 45;
  addWreck(sim, d, 0);
  sim.events.push({ id: ++sim.eventId, type: "explosion", cause: "destroyer", strength: 1.8, byPlayerCar: d.lastCause === "rammed", x: d.x, z: d.z, angle: d.angle, time: sim.elapsed, delay: 0, chainDepth: 1, playerX: p.x, playerZ: p.z });
  if (sim.events.length > 64) sim.events.shift();
  sim.stats.explosions = (sim.stats.explosions || 0) + 1;
  // The reward, once.
  if (!d.rewarded && byPlayer) {
    d.rewarded = true;
    const R = DESTROYER.reward;
    chaosReward(sim, { text: `DESTROYER DOWN! +${R.coins}`, kind: "destroyer", coins: R.coins, score: R.score, heat: R.heat, x: d.x, z: d.z });
  }
  sim.destroyerDueAt = sim.elapsed + rand(sim, DESTROYER.respawn);
  sim.refreshNavigation?.();
}

// Tests and the dev preview: one put down at a given spot (no spawn rules).
export function placeDestroyer(sim, x, z, angle = 0) {
  if (!sim.destroyerStats) resetDestroyer(sim);
  sim.destroyerStats.spawns++;
  sim.destroyer = {
    id: ++sim.destroyerSerial, x, z, y: 0, angle, vx: 0, vz: 0, speed: 0, level: 0,
    health: DESTROYER.health, maxHealth: DESTROYER.health, state: "chase", stateAt: sim.elapsed, charge: 0,
    route: null, routeAt: -9, stuck: 0, lastProgress: { x, z, t: sim.elapsed }, hitThisAttack: false, spawnedAt: sim.elapsed,
  };
  sim.destroyerDueAt = null;
  return sim.destroyer;
}
