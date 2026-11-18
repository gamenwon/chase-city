import { liveScene } from "./tree-pin-live.mjs";
import { escapeAttempts } from "./audit-arrests.js";
import { createLayout } from "../src/world/layout.js";
import { probeEscape } from "../src/game/pin.js";
const layout = createLayout();
const cases = [[3, 3.1], [3, 4.7], [5, 1.6], [9, 1.6]];
for (const [treeIndex, heading] of cases) {
  const s = liveScene({ treeIndex, heading, seed: treeIndex * 7 + 1 });
  for (let f = 0; f < 12 * 60 && !s.result; f++) { s.health = 100; s.update(1 / 60, {}); }
  const p = s.player;
  const near = s.police.filter((c) => c.state === "active").map((c) => ({ d: +Math.hypot(c.x - p.x, c.z - p.z).toFixed(2), role: c.role, mode: c.mode, v: +Math.hypot(c.vx, c.vz).toFixed(1) })).sort((a, b) => a.d - b.d);
  const att = escapeAttempts(layout, s, 390, 664);
  const probeP = probeEscape(s), probeN = probeEscape(s, { withPolice: false });
  console.log(JSON.stringify({ treeIndex, heading, reason: s.pin.reason, truthBest: Math.max(...att.map((a) => a.best)), attempts: att.map((a) => a.best), probeWithPolice: +probeP.best.toFixed(1), probeNoPolice: +probeN.best.toFixed(1), near: near.slice(0, 4) }));
}
