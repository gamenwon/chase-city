// Arrest audit on the preview layout (locations, park features, yards):
// natural chases; every arrest is checked with the full-game escape
// attempts. Also reports police stuck (not moving for 10 s while active
// and far from the player).
import { Simulation } from "../src/game/simulation.js";
import { CONFIG } from "../src/game/config.js";
import { previewLayout } from "../src/preview/locations/layout.js";
import { random } from "./autoplay.js";
import { stageDriver } from "./pursuit.js";
import { escapeAttempts } from "./audit-arrests.js";
import { createLayout } from "../src/world/layout.js";
const layout = process.env.BASE ? createLayout() : previewLayout();
const seeds = +(process.argv[2] || 3);
let arrests = 0, falseArrests = 0, stuckPolice = 0, errors = 0;
for (const width of [390, 1100])
  for (const mode of ["roads", "evasive"])
    for (let seed = 1; seed <= seeds; seed++) {
      const height = width === 390 ? 664 : 740;
      const s = new Simulation(layout, { width, height, random: random(seed + 50000), city: true, cityProfile: width === 390 ? "mobile" : "desktop" });
      let drive = stageDriver(seed, mode), r = 0;
      s.start();
      const still = new Map();
      try {
        for (let f = 0; f < 3600; f++) {
          if (s.result) { s.reset(); s.start(); drive = stageDriver(seed + ++r, mode); still.clear(); }
          if (s.arrest >= CONFIG.arrestSeconds - 1 / 60 - 1e-9 && !s.result) {
            arrests++;
            const best = Math.max(...escapeAttempts(layout, s, width, height).map((a) => a.best));
            if (best > 9) { falseArrests++; console.log("FALSE", width, mode, seed, s.elapsed.toFixed(1), best); }
          }
          s.update(1 / 60, drive(s));
          if (f % 60 === 0)
            for (const c of s.police) {
              if (c.state !== "active") continue;
              const far = Math.hypot(c.x - s.player.x, c.z - s.player.z) > 25;
              const prev = still.get(c.id);
              const moved = !prev || Math.hypot(c.x - prev.x, c.z - prev.z) > 1;
              const n = far && !moved ? (prev.n || 0) + 1 : 0;
              still.set(c.id, { x: c.x, z: c.z, n });
              if (n === 10) { stuckPolice++; console.log("STUCK-POLICE", width, mode, seed, c.id, c.x.toFixed(1), c.z.toFixed(1), c.role); }
            }
        }
      } catch (e) { errors++; console.log("ERROR", e.message); }
    }
console.log(JSON.stringify({ runs: 4 * seeds, arrests, falseArrests, stuckPolice, errors }));
