// V2.0 audio: the steering tire screech only sounds on a real, held turn
// at speed (not on a tap, not when slow), and a gas-station explosion uses
// the big layered explosion, a car explosion the ordinary one.
import test from "node:test";
import assert from "node:assert/strict";
import { Simulation } from "../src/game/simulation.js";
import { createLayout } from "../src/world/layout.js";
import { SoundSystem, soundTargets } from "../src/audio/sound.js";

function screech(holdSeconds, warm = 2) {
  const s = new Simulation(createLayout(), { reinforcements: false, barricades: false });
  s.start();
  s.police = [];
  for (let f = 0; f < warm * 60; f++) s.update(1 / 60, {});
  let peak = 0;
  for (let f = 0; f < 90; f++) {
    s.update(1 / 60, f < holdSeconds * 60 ? { left: true } : {});
    peak = Math.max(peak, soundTargets(s).skidGain);
  }
  return peak;
}

test("tire screech: silent on a tap, full on a held turn at speed, silent when slow", () => {
  const full = soundTargets({ player: { x: 0, z: 0, vx: 0, vz: -24, angle: 0, turn: 1.75 }, police: [] }).skidGain;
  assert.ok(screech(0.1) < full * 0.05, "a 0.1 s tap stays quiet");
  assert.ok(screech(1.0) >= full * 0.95, "a held turn screeches");
  const slow = soundTargets({ player: { x: 0, z: 0, vx: 0, vz: -8, angle: 0, turn: 1.75 }, police: [] });
  assert.equal(slow.skidGain, 0);
  // Pitch rises with speed.
  const fast = soundTargets({ player: { x: 0, z: 0, vx: 0, vz: -24, angle: 0, turn: 1.75 }, police: [] });
  const mid = soundTargets({ player: { x: 0, z: 0, vx: 0, vz: -14, angle: 0, turn: 1.75 }, police: [] });
  assert.ok(fast.skidHz > mid.skidHz);
});

test("gas-station explosions use the big explosion; car explosions the ordinary one", () => {
  const param = () => ({ setTargetAtTime() {}, value: 0 });
  const s = new SoundSystem(() => null);
  s.context = { state: "running", currentTime: 0 };
  s.running = true;
  s.loops = {
    engine: { source: { frequency: param() }, gain: { gain: param() } },
    siren: { source: { frequency: param() }, gain: { gain: param() } },
    skid: { pitch() {}, gain: { gain: param() }, level: 0 },
  };
  const played = [];
  s.voice = (kind) => played.push(kind);
  const sim = { player: { x: 0, z: 0, vx: 0, vz: -20, angle: 0, turn: 0 }, police: [], impacts: [], events: [
    { id: 1, type: "explosion", cause: "vehicle", x: 5, z: 0 },
    { id: 2, type: "explosion", cause: "gas", x: 10, z: 0 },
  ] };
  s.update(sim);
  assert.deepEqual(played, ["explosion", "bigExplosion"]);
});
