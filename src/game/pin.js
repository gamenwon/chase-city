// V2.0 pin arrest: police cars have the player's car physically stuck.
//
// The cordon rule (cordon.js) arrests when parked cordon cars close every gap
// a car-width circle could pass. That test is generous on purpose (a car can
// pivot and thread a crooked gap), but it also sees "gaps" the real car body
// (2.1 x 3.6 m box) cannot get through, so a player boxed in by police could
// sit there for many seconds, never arrested, while the speedometer still
// showed the throttle speed (velocity, not movement).
//
// The pin rule works from what really happens instead:
//   1. the car has not actually moved (position change, not speedometer)
//      for STILL_SECONDS, although the throttle is always on;
//   2. police cars are what holds it: two or more right next to it, one
//      touching it or within a metre of its body, and on a copy of the world without the police the car
//      does get out (a car stuck on an ordinary obstacle or a wall is never
//      arrested);
//   3. it has no way out: the real driving physics is run on a copy (the
//      player against the walls, the posts it cannot knock over and the
//      police where they stand) for every simple escape steering; if any
//      gets clear, there is no arrest.
// Then the normal 3 s arrest countdown runs. It is cancelled as soon as the
// player really gets away (moves ESCAPE_DISTANCE from where it was pinned)
// or the probe finds a way out. A police car crashing or exploding next to
// the player does not reset it by itself: only an actual way out does.
import { CONFIG } from "./config.js";
import { bump } from "./city.js";

export const PIN = Object.freeze({
  STILL_SECONDS: 2, // no real movement for this long...
  STILL_DISTANCE: 1, // ...means moving less than this (m)
  CONFIRM_SECONDS: 0.5, // pinned this long before the countdown starts
  NEAR: 5, // police car centres within this distance hold the car
  MIN_NEAR: 2,
  TOUCH_SECONDS: 1, // touched a police car this recently...
  HOLD_GAP: 1, // ...or one stands this close to the car body (m)
  ESCAPE_DISTANCE: 2.5, // moved this far from the pin point = got away
  PROBE_EVERY: 0.5,
  PROBE_SECONDS: 4,
  PROBE_CLEAR: 7, // a probe that gets this far away found a way out
});

// Simple forward-driving escapes (as in scripts/audit-arrests.js).
const POLICIES = [
  () => ({}),
  () => ({ left: true }),
  () => ({ right: true }),
  ...[0.3, 0.6, 1.0].flatMap((t) => [
    (e) => ({ left: e < t }),
    (e) => ({ right: e < t }),
  ]),
  (e) => (e < 0.6 ? { left: true } : e < 1.4 ? { right: true } : {}),
  (e) => (e < 0.6 ? { right: true } : e < 1.4 ? { left: true } : {}),
  (e) => ({ left: Math.floor(e * 3) % 2 === 0 }),
];

export function createPin() {
  return {
    samples: [],
    candidateFor: 0,
    trapped: false,
    anchor: null,
    probeAt: -Infinity,
    probe: null,
    probeKey: "",
    lastProbe: null,
    reason: "free",
    events: [],
  };
}

// The world the escape probe drives in: the game's walls/buildings/wrecks/
// fallen trees, plus the street furniture a slow car cannot knock over
// (lamps, trees, park trees: they act as posts below their break speed;
// trash cans and signs give way and are left out). Built once per probe.
const POST_KINDS = new Set(["lamp", "tree", "bigTree"]);
function probeWorld(sim) {
  const w = Object.create(sim);
  const p = sim.player;
  const posts = (sim.city?.props || [])
    .filter(
      (q) =>
        POST_KINDS.has(q.kind) &&
        q.state === "stand" &&
        Math.abs(q.x - p.x) < 16 &&
        Math.abs(q.z - p.z) < 16,
    )
    .map((q) => ({ x: q.x, z: q.z, w: 1.2, d: 1.2, kind: "post" }));
  w.solids = posts.length ? [...sim.solids, ...posts] : sim.solids;
  // Civilian cars near the player (parked, stopped, wrecked): the car can
  // shove them, as in the game (same push and masses as city.js).
  w.probeTraffic = (sim.city?.traffic || []).filter(
    (c) => Math.abs(c.x - p.x) < 12 && Math.abs(c.z - p.z) < 12,
  );
  w.nearSolids(p.x, p.z, 1); // build its collision grid once
  return w;
}

// Run the real player physics on a copy for one escape steering (police
// frozen where they are, or left out). Returns how far the car got.
function tryPolicy(world, sim, steer, withPolice, seconds, clear) {
  const start = { x: sim.player.x, z: sim.player.z };
  let best = 0;
  const t = Object.create(world);
  t.player = { ...sim.player };
  t.previousPlayer = { ...start };
  t.police = withPolice
    ? sim.police.map((c) => ({ ...c, vx: 0, vz: 0 }))
    : [];
  t.impacts = [];
  t.events = [];
  t.contactEvents = [];
  t.stats = { ...sim.stats };
  t.hitCooldown = Infinity; // no damage on the copy
  t.collisions = 0;
  const traffic = world.probeTraffic.map((c) => ({ ...c, vx: 0, vz: 0 }));
  const steps = Math.round(seconds * 60);
  for (let f = 0; f < steps; f++) {
    const back = { x: t.player.x, z: t.player.z };
    t.drivePlayer(1 / 60, steer(f / 60));
    t.resolvePlayerPolice();
    t.constrain(t.player, CONFIG.radius, back);
    t.wedgePlayer(back);
    for (const c of traffic) {
      const m = c.parked || c.state === "wreck" ? 1.6 : 1;
      const closing = bump(t.player, CONFIG.radius, 1.3, c, 1.1, m);
      if (closing > 0) t.player.speed = Math.max(0, t.player.speed - closing * 0.4);
    }
    const d = Math.hypot(t.player.x - start.x, t.player.z - start.z);
    if (d > best) best = d;
    if (best >= clear) return best;
  }
  return best;
}

// All escape steerings at once (tests and tools). Returns { escaped, best }.
export function probeEscape(
  sim,
  { withPolice = true, seconds = PIN.PROBE_SECONDS, clear = PIN.PROBE_CLEAR } = {},
) {
  const world = probeWorld(sim);
  let best = 0;
  for (const steer of POLICIES) {
    best = Math.max(best, tryPolicy(world, sim, steer, withPolice, seconds, clear));
    if (best >= clear) return { escaped: true, best };
  }
  return { escaped: false, best };
}

// The game spreads a probe over several steps (one steering per step) so a
// phone never stalls a frame on it. A "confirm" probe first drives without
// the police: if the car cannot get out even then, it is stuck on walls or
// obstacles alone and this is not an arrest. Returns the result when done.
// The probe world is kept outside the pin state (which stays plain data, so
// a copied game state carries no stale copy of it).
const worlds = new WeakMap();
function stepProbe(sim) {
  const pin = sim.pin,
    pr = pin.probe,
    p = sim.player;
  let world = worlds.get(pr);
  if (!world) worlds.set(pr, (world = probeWorld(sim)));
  // The car moved meanwhile: the question has changed, start again.
  if (Math.hypot(p.x - pr.x, p.z - pr.z) > PIN.STILL_DISTANCE) {
    pin.probe = null;
    return null;
  }
  const got = tryPolicy(
    world,
    sim,
    POLICIES[pr.next++],
    pr.phase === "police",
    PIN.PROBE_SECONDS,
    PIN.PROBE_CLEAR,
  );
  if (pr.phase === "no-police") {
    if (got >= PIN.PROBE_CLEAR) {
      pr.phase = "police";
      pr.next = 0;
      return null;
    }
    if (pr.next < POLICIES.length) return null;
    pin.probe = null;
    pin.lastProbe = { obstacle: true, escaped: false, best: 0, purpose: pr.purpose };
    return pin.lastProbe;
  }
  pr.best = Math.max(pr.best, got);
  const escaped = pr.best >= PIN.PROBE_CLEAR;
  if (!escaped && pr.next < POLICIES.length) return null;
  pin.probe = null;
  pin.lastProbe = { escaped, best: pr.best, purpose: pr.purpose };
  return pin.lastProbe;
}
function startProbe(sim, purpose) {
  sim.pin.probeAt = sim.elapsed;
  sim.pin.probe = {
    purpose,
    phase: purpose === "confirm" ? "no-police" : "police",
    next: 0,
    best: 0,
    x: sim.player.x,
    z: sim.player.z,
  };
}

// Distance between two car bodies (2.1 x 3.6 m boxes), 0 if touching.
function bodyGap(a, b) {
  const axes = (c) => [
    { x: Math.cos(c.angle), z: -Math.sin(c.angle) },
    { x: -Math.sin(c.angle), z: -Math.cos(c.angle) },
  ];
  const aa = axes(a),
    bb = axes(b),
    dx = b.x - a.x,
    dz = b.z - a.z;
  let gap = 0;
  for (const axis of [...aa, ...bb]) {
    const half = (ax) =>
      Math.abs(axis.x * ax[0].x + axis.z * ax[0].z) * 1.05 +
      Math.abs(axis.x * ax[1].x + axis.z * ax[1].z) * 1.8;
    gap = Math.max(
      gap,
      Math.abs(dx * axis.x + dz * axis.z) - half(aa) - half(bb),
    );
  }
  return gap;
}

const nearPolice = (sim, range) =>
  sim.police.filter(
    (c) =>
      c.state === "active" &&
      Math.hypot(c.x - sim.player.x, c.z - sim.player.z) < range,
  );

function log(sim, type, extra = {}) {
  const pin = sim.pin;
  pin.events.push({
    type,
    time: sim.elapsed,
    x: sim.player.x,
    z: sim.player.z,
    ...extra,
  });
  if (pin.events.length > 32) pin.events.shift();
}

// Called every step (after physics, before the arrest timer).
export function updatePin(sim, dt) {
  const pin = sim.pin,
    p = sim.player;
  pin.samples.push({ x: p.x, z: p.z, time: sim.elapsed });
  while (
    pin.samples.length > 1 &&
    sim.elapsed - pin.samples[1].time >= PIN.STILL_SECONDS
  )
    pin.samples.shift();
  if (!sim.policeEnabled) return;

  if (pin.trapped) {
    // Got away: cancel.
    if (
      Math.hypot(p.x - pin.anchor.x, p.z - pin.anchor.z) > PIN.ESCAPE_DISTANCE
    ) {
      release(sim, "escaped");
      return;
    }
    const near = nearPolice(sim, PIN.NEAR + 3);
    if (!near.length) {
      release(sim, "no-police");
      return;
    }
    // Re-check for a way out regularly, and at once when the police round
    // the player change (a car wrecked, exploded or drove off).
    const key = near.map((c) => `${c.id}:${c.generation}`).join(",");
    if (key !== pin.probeKey) {
      pin.probeKey = key;
      startProbe(sim, "recheck");
    } else if (!pin.probe && sim.elapsed - pin.probeAt >= PIN.PROBE_EVERY)
      startProbe(sim, "recheck");
    if (pin.probe) {
      const done = stepProbe(sim);
      if (done?.escaped) release(sim, "way-out");
    }
    return;
  }

  const oldest = pin.samples[0];
  const still =
    sim.elapsed - oldest.time >= PIN.STILL_SECONDS - 1e-9 &&
    Math.hypot(p.x - oldest.x, p.z - oldest.z) < PIN.STILL_DISTANCE;
  const near = still ? nearPolice(sim, PIN.NEAR) : [];
  const held =
    sim.elapsed - (p.policeContactAt ?? -Infinity) <= PIN.TOUCH_SECONDS ||
    near.some((c) => bodyGap(p, c) < PIN.HOLD_GAP);
  if (!still || near.length < PIN.MIN_NEAR || !held) {
    pin.candidateFor = 0;
    pin.probe = null;
    pin.reason = !still ? "moving" : "not-held-by-police";
    return;
  }
  pin.candidateFor += dt;
  if (pin.candidateFor < PIN.CONFIRM_SECONDS) return;
  if (!pin.probe) {
    if (sim.elapsed - pin.probeAt < PIN.PROBE_EVERY) return;
    startProbe(sim, "confirm");
  }
  const done = stepProbe(sim);
  if (!done) return;
  if (done.obstacle) {
    pin.reason = "stuck-on-obstacle";
    return;
  }
  if (done.escaped) {
    pin.reason = "way-out";
    return;
  }
  pin.trapped = true;
  pin.reason = "pinned";
  pin.anchor = { x: p.x, z: p.z };
  pin.probeKey = nearPolice(sim, PIN.NEAR + 3)
    .map((c) => `${c.id}:${c.generation}`)
    .join(",");
  log(sim, "pinned", {
    police: near.map((c) => c.id),
    probeBest: +pin.lastProbe.best.toFixed(2),
  });
}

function release(sim, why) {
  const pin = sim.pin;
  pin.trapped = false;
  pin.anchor = null;
  pin.candidateFor = 0;
  pin.probe = null;
  pin.reason = why;
  // A real escape cancels the countdown straight away.
  if (why === "escaped" || why === "way-out") sim.arrest = 0;
  log(sim, "released", { why });
}
