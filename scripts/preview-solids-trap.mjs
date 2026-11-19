// Drive the auto-forward car (no steering) into every solid of the preview
// layout (park features, yards, locations): from 4 headings, dead-centre.
// A run is stuck if the car moved less than 2 m over the last 3 s of 8.
import { Simulation } from "../src/game/simulation.js";
import { previewLayout } from "../src/preview/locations/layout.js";
import { createLayout } from "../src/world/layout.js";
import { random } from "./autoplay.js";
const base = createLayout(), layout = previewLayout();
const extra = layout.obstacles.filter((b) => !base.obstacles.some((o) => o.x === b.x && o.z === b.z && o.w === b.w && o.d === b.d));
const rows = [];
for (const b of extra) for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
  const s = new Simulation(layout, { width: 390, height: 664, reinforcements: false, barricades: false, random: random(3), city: true,
    cityBudget: { profile: "test", level: 1, peds: 0, traffic: 0, parked: 0, range: 70 } });
  s.start(); s.police = [];
  const fx = -Math.sin(heading), fz = -Math.cos(heading);
  const back = Math.max(b.w, b.d) / 2 + 8;
  Object.assign(s.player, { x: b.x - fx * back, z: b.z - fz * back, angle: heading, speed: 20, vx: fx * 20, vz: fz * 20 });
  if (!s.navigation.allowed({ x: s.player.x, z: s.player.z })) continue;
  s.previousPlayer = { x: s.player.x, z: s.player.z };
  const start = { x: s.player.x, z: s.player.z }; let away = 0;
  let mark = null;
  for (let f = 0; f < 480; f++) { s.health = 100; s.update(1 / 60, {}); away = Math.max(away, Math.hypot(s.player.x - start.x, s.player.z - start.z)); if (f === 300) mark = { x: s.player.x, z: s.player.z }; }
  const late = Math.hypot(s.player.x - mark.x, s.player.z - mark.z);
  rows.push({ kind: b.kind || "?", x: +b.x.toFixed(1), z: +b.z.toFixed(1), w: +b.w.toFixed(1), d: +b.d.toFixed(1), heading: +heading.toFixed(2), away: +away.toFixed(1), late: +late.toFixed(1), at: [+s.player.x.toFixed(1), +s.player.z.toFixed(1)] });
}
const stuck = rows.filter((r) => r.late < 2);
console.log(`solids ${extra.length}, runs ${rows.length}, stuck ${stuck.length}`);
for (const r of stuck.slice(0, 15)) console.log(JSON.stringify(r));
