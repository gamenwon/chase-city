// One explosion-damage system for everything that can blow up.
//
// Every explosion event (a police car, a civilian car, a parked car, a gas
// pump, a depot tank, the hunted target...) is applied once, when it goes
// off: damage and a shove fall off with distance and grow with the blast's
// strength, and each object takes it according to its own durability.
// Whatever it destroys that can explode does so a moment later (a short,
// varied delay), and that blast is applied the same way, so a parking lot
// or a pack of police cars can go up in a cascade. An object explodes at
// most once (it is a wreck afterwards) and every event is applied once, so
// there is no loop. Ordinary props are thrown or broken, never explode.
//
// Systems outside the simulation (the preview locations) join in through
// sim.blastListeners: (sim, event, radius, strength, later) => void.
import { blastCity } from "./city.js";
import { blastPillars } from "./overpass.js";

export const BLAST = Object.freeze({
  radius: 8, // metres at strength 1 (x sqrt(strength))
  police: 70, // damage to a police car at the centre, strength 1
  shove: 13, // m/s at the centre, strength 1
  player: 9, // damage to the player at the centre, strength 1
  target: 45,
  delay: [0.22, 0.7], // seconds before a destroyed car goes up
});

// Strength of an explosion: an ordinary car 1.4 (more in a chain), a fuel
// pump 2.6, a major blast (a depot tank, the collapsing canopy) 3.4. The
// renderer draws them to the same scale.
export function blastStrength(e) {
  if (e.major) return 3.4;
  if (e.cause === "gas") return 2.6;
  return 1.4 + Math.min(e.chainDepth || 0, 3) * 0.15;
}
export const blastRadius = (s) => BLAST.radius * Math.sqrt(s);

const jitter = (sim) => BLAST.delay[0] + Math.random() * (BLAST.delay[1] - BLAST.delay[0]);

// Called every simulation step (after cars have moved and crashed).
export function updateBlasts(sim) {
  const now = sim.elapsed;
  const later = (seconds, run) => (sim.blastQueue ||= []).push({ at: now + seconds, run });
  for (const e of sim.events) {
    if (e.type !== "explosion" || e.blasted) continue;
    if (now + 1e-9 < e.time + (e.delay || 0)) continue;
    e.blasted = true;
    applyBlast(sim, e, later);
  }
  if (sim.blastQueue?.length) {
    const due = sim.blastQueue.filter((q) => now + 1e-9 >= q.at);
    sim.blastQueue = sim.blastQueue.filter((q) => now + 1e-9 < q.at);
    for (const q of due) q.run();
  }
}

export function applyBlast(sim, e, later) {
  const s = blastStrength(e), R = blastRadius(s);
  sim.stats.blasts = (sim.stats.blasts || 0) + 1;
  const depth = (e.chainDepth || 0) + 1;
  // Police cars: damaged by distance and strength, shoved away; one
  // destroyed by it goes up a moment later (a chain).
  for (const c of sim.police) {
    if (c.state !== "active" || c.doomed) continue;
    const dx = c.x - e.x, dz = c.z - e.z, d = Math.hypot(dx, dz);
    if (d >= R) continue;
    const k = 1 - d / R;
    // A cordon holding the player right next to him is braced (as before):
    // it takes a knock, it is not wiped out by one blast.
    const braced =
      (c.role === "contain" || c.role === "block") &&
      Math.hypot(c.vx, c.vz) <= 8 &&
      Math.hypot(c.x - sim.player.x, c.z - sim.player.z) < 12;
    c.health -= BLAST.police * k * s * (braced ? 0.25 : 1);
    const push = BLAST.shove * k * Math.sqrt(s) * (braced ? 0.15 : 1);
    c.vx += (d ? dx / d : 1) * push;
    c.vz += (d ? dz / d : 0) * push;
    if (c.health <= 0) {
      c.health = 0;
      c.doomed = true;
      c.lastDamageCause = "blast";
      c.blastDepth = depth;
      later(jitter(sim), () => {
        c.doomed = false;
        if (c.state === "active") sim.explodePolice(c);
      });
    }
  }
  // The player: a shove and some damage when close.
  const p = sim.player;
  const pd = Math.hypot(p.x - e.x, p.z - e.z);
  if (pd < R * 0.75 && !e.byPlayerCar) {
    const k = 1 - pd / (R * 0.75);
    sim.damage?.(BLAST.player * k * Math.sqrt(s));
    p.vx += ((p.x - e.x) / (pd || 1)) * 6 * k;
    p.vz += ((p.z - e.z) / (pd || 1)) * 6 * k;
  }
  // TARGET HUNT: the fleeing target caught in a blast.
  const t = sim.target;
  if (t?.state === "fleeing" && e.cause !== "target") {
    const td = Math.hypot(t.x - e.x, t.z - e.z);
    if (td < R) t.health = Math.max(1, t.health - BLAST.target * (1 - td / R) * s);
  }
  // City: street props thrown or broken, civilian cars damaged and shoved;
  // a civilian car destroyed close to the blast goes up too.
  if (sim.city) {
    const wrecked = blastCity(sim, sim.city, e.x, e.z, R, s);
    for (const c of wrecked) {
      if (c.exploded || Math.hypot(c.x - e.x, c.z - e.z) > R * 0.8) continue;
      c.exploded = true;
      later(jitter(sim) + 0.08, () => {
        sim.events.push({ id: ++sim.eventId, type: "explosion", cause: "traffic", x: c.x, z: c.z, angle: c.angle, time: sim.elapsed, delay: 0, chainDepth: Math.min(3, depth), playerX: p.x, playerZ: p.z });
        if (sim.events.length > 64) sim.events.shift();
        sim.stats.explosions++;
        sim.stats.chainExplosions++;
      });
    }
  }
  // Overpass pillars (V2.1).
  if (sim.overpasses?.length) blastPillars(sim, e, R, s);
  // Everything else that listens (preview locations: parked cars, loose
  // furniture, breakable props, fuel pumps, gantries, shop windows).
  for (const fn of sim.blastListeners || []) fn(sim, e, R, s, later, depth);
}
