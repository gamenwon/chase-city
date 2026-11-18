// Natural-chase soak for the critical collision bugs: full game (city on,
// police, reinforcements, roadblocks), seeded drivers that either follow the
// road loop or wander (steer at random, often through the parks). Counts
// player stuck episodes (< 1.5 m in 4 s, not arrested and no countdown),
// police stuck far from the player, shakes from sustained contact, and every
// arrest is checked against the full-game escape attempts (ground truth).
import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
import { driver, random } from "./autoplay.js";
import { escapeAttempts } from "./audit-arrests.js";

const layout = createLayout();
function wanderer(seed) {
  const rng = random(seed * 7 + 1);
  let steer = 0, until = 0;
  return (sim) => {
    if (sim.elapsed > until) {
      const r = rng();
      steer = r < 0.45 ? 0 : r < 0.72 ? 1 : -1;
      until = sim.elapsed + 0.3 + rng() * 2.2;
    }
    return { left: steer > 0, right: steer < 0 };
  };
}
export function soak({ seeds = 12, seconds = 90, profile = "mobile" } = {}) {
  const out = { runs: 0, minutes: 0, stuck: [], policeStuck: 0, policeStuckSeconds: 0, arrests: 0, falseArrests: [], sustainedShakes: 0, shakes: 0 };
  for (let seed = 1; seed <= seeds; seed++)
    for (const kind of ["loop", "wander"]) {
      const s = new Simulation(layout, { width: 390, height: 664, random: random(seed), city: true, cityProfile: profile });
      s.start();
      const ctl = kind === "loop" ? driver(seed) : wanderer(seed);
      const hist = [];
      let lastEv = s.city.eventId, lastShake = { at: -9, x: 0, z: 0 }, stuckFrom = null;
      const pStill = new Map();
      for (let f = 0; f < seconds * 60; f++) {
        if (s.result) {
          if (s.result === "arrested") out.arrests++;
          s.reset(); s.start(); hist.length = 0; stuckFrom = null; lastEv = s.city.eventId;
        }
        s.update(1 / 60, ctl(s));
        // Arrest ground truth: when the countdown first starts.
        if (s.arrest > 0 && !s._checked) {
          s._checked = true;
          if (s.pin?.trapped) {
            const best = Math.max(...escapeAttempts(layout, s, 390, 664).map((a) => a.best));
            if (best >= 10) out.falseArrests.push({ seed, kind, t: +s.elapsed.toFixed(1), best: +best.toFixed(1) });
          }
        }
        if (s.arrest === 0) s._checked = false;
        // Shakes the renderer would make; "sustained" = same spot again within 0.5 s.
        for (const e of s.city.events) {
          if (e.id <= lastEv || !e.byPlayer || !(e.strength > 5)) continue;
          out.shakes++;
          if (s.elapsed - lastShake.at < 0.5 && Math.hypot(e.x - lastShake.x, e.z - lastShake.z) < 1.5) out.sustainedShakes++;
          lastShake = { at: s.elapsed, x: e.x, z: e.z };
        }
        lastEv = s.city.eventId;
        // Player stuck episodes.
        hist.push({ t: s.elapsed, x: s.player.x, z: s.player.z });
        while (hist.length && s.elapsed - hist[0].t > 4) hist.shift();
        const moved = Math.hypot(s.player.x - hist[0].x, s.player.z - hist[0].z);
        const stuckNow = s.elapsed - hist[0].t > 3.9 && moved < 1.5 && s.arrest === 0 && !s.result;
        if (stuckNow && !stuckFrom) stuckFrom = { seed, kind, t: +s.elapsed.toFixed(1), x: +s.player.x.toFixed(1), z: +s.player.z.toFixed(1), police: s.police.filter((c) => c.state === "active" && Math.hypot(c.x - s.player.x, c.z - s.player.z) < 8).length, reason: s.pin?.reason,
          // Could the full game get out from here (best of 12 steerings)?
          ...(() => { const a = escapeAttempts(layout, s, 390, 664); return { truth: +Math.max(...a.map((x) => x.best)).toFixed(1), noInput: a[0].best, attempts: a.map((x) => x.best) }; })() };
        if (!stuckNow && stuckFrom) { stuckFrom.seconds = +(s.elapsed - stuckFrom.t + 4).toFixed(1); out.stuck.push(stuckFrom); stuckFrom = null; }
        // Police stuck: active, chasing (not holding a block), > 10 m away, < 1 m in 4 s.
        for (const c of s.police) {
          if (c.state !== "active" || c.blockState === "hold") { pStill.delete(c); continue; }
          const far = Math.hypot(c.x - s.player.x, c.z - s.player.z) > 10;
          const prev = pStill.get(c);
          if (!far || !prev || Math.hypot(c.x - prev.x, c.z - prev.z) > 1) { pStill.set(c, { x: c.x, z: c.z, t: s.elapsed, counted: false }); continue; }
          if (s.elapsed - prev.t > 4 && !prev.counted) { out.policeStuck++; prev.counted = true; }
          if (prev.counted) out.policeStuckSeconds += 1 / 60;
        }
      }
      if (stuckFrom) { stuckFrom.seconds = +(s.elapsed - stuckFrom.t + 4).toFixed(1); out.stuck.push(stuckFrom); }
      out.runs++;
      out.minutes += seconds / 60;
    }
  return out;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = soak({ seeds: +(process.env.SEEDS || 12), seconds: +(process.env.SECONDS || 90) });
  console.log(JSON.stringify({ ...r, stuck: r.stuck.length, longestStuck: Math.max(0, ...r.stuck.map((x) => x.seconds)) }));
  for (const x of r.stuck.sort((a, b) => b.seconds - a.seconds).slice(0, 8)) console.log("stuck", JSON.stringify(x));
  for (const x of r.falseArrests) console.log("false arrest", JSON.stringify(x));
}
