// Validation for the tree/wreck pin fix. For each scene and steering, the
// game is played; every time an arrest countdown starts, the moment is
// copied and the audit's full-game escape attempts give the truth. Also
// reports trapped moments the game never arrested.
import { createLayout } from "../src/world/layout.js";
import { escapeAttempts } from "./audit-arrests.js";
import { wreckScene } from "./tree-pin-wrecks.mjs";
import { liveScene } from "./tree-pin-live.mjs";
const layout = createLayout();
const scenes = [];
for (const treeIndex of [0, 3, 5, 9])
  for (const heading of [0, 1.6, 3.1, 4.7]) {
    for (const sides of [[-1, 1], [-1], [1]]) scenes.push({ family: "wreck", make: () => wreckScene({ treeIndex, heading, sides, seed: treeIndex + 11 }), cfg: { treeIndex, heading, sides } });
    scenes.push({ family: "live", make: () => liveScene({ treeIndex, heading, seed: treeIndex * 7 + 1 }), cfg: { treeIndex, heading } });
  }
let countdowns = 0, falseStarts = [], arrests = 0, falseArrests = [], missed = [];
const truthOf = (s) => Math.max(...escapeAttempts(layout, s, 390, 664).map((a) => a.best));
for (const sc of scenes)
  for (const steer of [{}, { left: true }, { right: true }]) {
    const s = sc.make();
    let was = false, startTruth = null, stillSince = 0, last = { x: s.player.x, z: s.player.z }, checkedStuck = false;
    for (let f = 0; f < 20 * 60 && !s.result; f++) {
      s.health = 100;
      s.update(1 / 60, steer);
      if (s.pin.trapped && !was) {
        countdowns++;
        startTruth = truthOf(s);
        if (startTruth > 10) falseStarts.push({ ...sc.cfg, family: sc.family, steer: Object.keys(steer)[0] || "none", t: +s.elapsed.toFixed(1), truth: startTruth });
      }
      was = s.pin.trapped;
      if (f % 60 === 0) {
        const moved = Math.hypot(s.player.x - last.x, s.player.z - last.z);
        stillSince = moved < 1 ? stillSince + 1 : 0;
        last = { x: s.player.x, z: s.player.z };
        if (stillSince >= 10 && !checkedStuck && !s.pin.trapped) {
          checkedStuck = true;
          const truth = truthOf(s);
          if (truth < 4) missed.push({ ...sc.cfg, family: sc.family, steer: Object.keys(steer)[0] || "none", t: +s.elapsed.toFixed(1), truth, reason: s.pin.reason });
        }
      }
    }
    if (s.result === "arrested") {
      arrests++;
      if (startTruth != null && startTruth > 10) falseArrests.push({ ...sc.cfg, family: sc.family, steer: Object.keys(steer)[0] || "none", truth: startTruth });
    }
  }
console.log(JSON.stringify({ runs: scenes.length * 3, countdowns, arrests, falseCountdownStarts: falseStarts.length, falseArrests: falseArrests.length, missedTrapped: missed.length }));
for (const x of falseArrests) console.log("FALSE", JSON.stringify(x));
for (const x of falseStarts) console.log("false-start", JSON.stringify(x));
for (const x of missed) console.log("MISSED", JSON.stringify(x));
