// Wedge sweep: the player car is shoved (as by a car crash) into the gaps
// between buildings and against building corners, at many angles, speeds
// and with each steering input, police and traffic off. Counts runs where
// the car ends up immobile (< 2 m in the last 4 s), and runs where it is
// ever left overlapping a building.
import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
import { resolveBuilding } from "../src/world/layout.js";
import { CONFIG } from "../src/game/config.js";

export function wedgeSweep({ layout = createLayout(), seconds = 8, limit = Infinity, make } = {}) {
  const out = { runs: 0, stuck: [], overlaps: 0, recoveries: 0 };
  const rng = (() => { let s = 12345; return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff); })();
  // Target points: gap mouths and corners of every building pair in a block.
  const targets = [];
  for (const b of layout.buildings) {
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) targets.push({ x: b.x + dx * (b.w / 2 + 0.6), z: b.z + dz * (b.d / 2 + 0.6) });
    for (const [dx, dz] of [[1, 0], [0, 1]]) targets.push({ x: b.x + dx * (b.w / 2 + 1.1), z: b.z + dz * (b.d / 2 + 1.1) });
  }
  for (let i = 0; i < targets.length && out.runs < limit; i += 3) {
    const t = targets[i];
    for (const steer of [0, 1, -1]) {
      const s = make ? make() : new Simulation(layout, { reinforcements: false, barricades: false });
      s.start();
      s.police = [];
      const shoveA = rng() * Math.PI * 2, shove = 8 + rng() * 14, heading = rng() * Math.PI * 2;
      const p = s.player;
      Object.assign(p, { x: t.x - Math.sin(shoveA) * 2.5, z: t.z - Math.cos(shoveA) * 2.5, angle: heading, vx: Math.sin(shoveA) * shove, vz: Math.cos(shoveA) * shove, speed: 12 });
      // Start pose must be legal.
      if (s.nearSolids(p.x, p.z, 4).some((b) => resolveBuilding({ x: p.x, z: p.z }, b, CONFIG.radius))) continue;
      s.previousPlayer = { x: p.x, z: p.z };
      out.runs++;
      const hist = [];
      let overl = false;
      for (let f = 0; f < seconds * 60 && !s.result; f++) {
        s.update(1 / 60, { left: steer > 0, right: steer < 0 });
        if (s.nearSolids(p.x, p.z, 4).some((b) => resolveBuilding({ x: p.x, z: p.z }, b, CONFIG.radius - 0.05))) overl = true;
        hist.push({ x: p.x, z: p.z });
      }
      if (overl) out.overlaps++;
      out.recoveries += s.stats.unwedges || 0;
      const tail = hist.slice(-240), a = tail[0], z = hist.at(-1);
      const spread = Math.max(...tail.map((q) => Math.hypot(q.x - a.x, q.z - a.z)));
      if (hist.length >= 240 && spread < 3) out.stuck.push({ x: +z.x.toFixed(1), z: +z.z.toFixed(1), steer, target: t, shoveA: +shoveA.toFixed(2), shove: +shove.toFixed(1), heading: +heading.toFixed(2) });
    }
  }
  return out;
}
if (process.argv[1]?.endsWith("wedge-repro.mjs")) {
  const r = wedgeSweep({});
  console.log(JSON.stringify({ runs: r.runs, stuck: r.stuck.length, overlaps: r.overlaps, recoveries: r.recoveries }));
  for (const s of r.stuck.slice(0, 6)) console.log(JSON.stringify(s));
}
