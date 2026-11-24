// Police helicopter (pursuit missions only). One at most. It joins after a
// set pursuit time, flying in from well outside the view, then shadows the
// player from an offset station off to the side (never overhead), with an
// occasional flyby across the scene. Smooth: it steers its velocity toward
// where it wants to be (limited speed and acceleration) and turns to face
// where it flies, banking into turns. No collisions, no weapons, no damage.
//
// While it has the player in sight ("tracking") the ground units are a
// little better coordinated (police.js: flankers on both sides with three
// cars, front blockers sooner); arrest rules and reinforcement spawning are
// unchanged. Its searchlight point follows the player with a short lag.
export const HELI = Object.freeze({
  spawnAfter: 18, // s of pursuit before it is called in
  entryDistance: 150, // m from the player where it starts (off screen)
  altitude: 21, // m
  station: 30, // m from the player (beside it, off its path)
  maxSpeed: 38, // m/s
  accel: 22, // m/s^2
  flybyEvery: [22, 34], // s between flybys
  flybySpeed: 34,
  trackRange: 70, // m: tracking the player within this
  spotLag: 2.6, // 1/s: searchlight follow rate (lower = more lag)
});

export function createHelicopter() {
  return null;
}

// Screen geometry of the chase camera (render/camera.js: it sits about
// (+30, +60, +40) from the car, looking down at ~47 degrees). Seen from it,
// something h metres up shows where a ground point SHIFT*h further from
// the camera would (higher up the screen). The helicopter keeps to a station whose on-screen place is
// at the left or right edge of the view, a little ahead of the car (never
// over it or the road ahead); it switches side when the car heads toward
// the side it is on. Flybys cross the far (top) part of the screen.
const RIGHT = { x: 0.84, z: -0.55 }, AHEAD = { x: -0.55, z: -0.84 };
const SHIFT = 0.92;
function groundFor(sim, h, ax, az) {
  // The ground point under the helicopter for an on-screen offset (ax, az).
  return { x: sim.player.x + ax - AHEAD.x * SHIFT * h.y, z: sim.player.z + az - AHEAD.z * SHIFT * h.y };
}
function stationPoint(sim, h) {
  const p = sim.player;
  const vr = (p.vx || 0) * RIGHT.x + (p.vz || 0) * RIGHT.z;
  const want = vr > 7 ? -1 : vr < -7 ? 1 : h.side;
  if (want !== h.side && h.mode === "station" && sim.elapsed - (h.switchedAt ?? -99) > 4) {
    // Changing sides: by way of the top of the screen (never across the
    // car).
    h.side = want;
    h.switchedAt = sim.elapsed;
    h.mode = "flyby";
    h.flyLeg = 0;
  }
  // The renderer tells it the screen shape (sim.heliView): on a wide
  // screen it sits out at the side; on a tall phone screen it keeps to the
  // upper part, toward one side, so it stays in view without covering the
  // car or the road in front.
  const view = sim.heliView || { side: HELI.station, ahead: 6 };
  const wob = Math.sin(sim.elapsed * 0.23) * 3;
  const side = view.side + Math.sin(sim.elapsed * 0.17) * 2;
  return groundFor(sim, h, RIGHT.x * h.side * side + AHEAD.x * (view.ahead + wob), RIGHT.z * h.side * side + AHEAD.z * (view.ahead + wob));
}

export function updateHelicopter(sim, dt) {
  const p = sim.player;
  if (!sim.policeEnabled || sim.result) {
    if (sim.heli) sim.heli.leaving = true;
  }
  if (!sim.heli) {
    if (!sim.policeEnabled || sim.heliEnabled === false || sim.result || sim.elapsed < HELI.spawnAfter || !sim.police.some((c) => c.state === "active")) {
      p.heliTracked = false;
      return;
    }
    // Enter from far outside the view: behind-left of the camera's view
    // (the camera looks from +x/+z toward -x/-z), along the player's road.
    // (From beyond the top-left corner of the view.)
    const a = Math.atan2(AHEAD.z - RIGHT.z * 0.7, AHEAD.x - RIGHT.x * 0.7) + (sim.random ? (sim.random() - 0.5) * 0.5 : 0);
    sim.heli = {
      x: p.x + Math.cos(a) * HELI.entryDistance,
      z: p.z + Math.sin(a) * HELI.entryDistance,
      y: HELI.altitude + 6,
      vx: 0,
      vz: 0,
      heading: Math.atan2(p.x - (p.x + Math.cos(a)), p.z - (p.z + Math.sin(a))),
      bank: 0,
      side: 1,
      mode: "entry",
      bornAt: sim.elapsed,
      nextFlyby: sim.elapsed + HELI.flybyEvery[0],
      spot: { x: p.x, z: p.z },
      tracking: false,
      rotor: 0,
    };
    sim.stats.helicopters = (sim.stats.helicopters || 0) + 1;
    sim.events.push({ id: ++sim.eventId, type: "helicopter", action: "arrive", x: sim.heli.x, z: sim.heli.z, time: sim.elapsed });
    if (sim.events.length > 64) sim.events.shift();
  }
  const h = sim.heli;
  // Where it wants to be.
  let target, speed = HELI.maxSpeed;
  if (h.leaving) {
    target = { x: h.x + (h.x - p.x) * 3, z: h.z + (h.z - p.z) * 3 };
  } else if (h.mode === "flyby") {
    target = h.flyLeg === 0 ? groundFor(sim, h, AHEAD.x * 46, AHEAD.z * 46) : stationPoint(sim, h);
    speed = HELI.flybySpeed + Math.hypot(p.vx || 0, p.vz || 0);
    if (Math.hypot(h.x - target.x, h.z - target.z) < 9) {
      if (h.flyLeg === 0) h.flyLeg = 1;
      else h.mode = "station";
    }
  } else {
    target = stationPoint(sim, h);
    if (h.mode === "entry" && Math.hypot(h.x - target.x, h.z - target.z) < 15) h.mode = "station";
    // A flyby now and then: straight across the scene past the player
    // (high, off to one side of the road ahead) to the station's far side.
    if (h.mode === "station" && sim.elapsed >= h.nextFlyby) {
      // Across the top of the screen, then down to the other side.
      h.side = -h.side;
      h.flyLeg = 0;
      h.mode = "flyby";
      const r = sim.random ? sim.random() : Math.random();
      h.nextFlyby = sim.elapsed + HELI.flybyEvery[0] + r * (HELI.flybyEvery[1] - HELI.flybyEvery[0]);
      sim.stats.heliFlybys = (sim.stats.heliFlybys || 0) + 1;
    }
  }
  // Never over the car on screen: if its on-screen place comes within
  // 20 m of the car, it heads straight out again (in screen terms).
  if (!h.leaving) {
    const ax = h.x + AHEAD.x * SHIFT * h.y - p.x, az = h.z + AHEAD.z * SHIFT * h.y - p.z, ad = Math.hypot(ax, az);
    if (ad < 18) {
      const ux = ad > 0.1 ? ax / ad : RIGHT.x * h.side, uz = ad > 0.1 ? az / ad : RIGHT.z * h.side;
      target = groundFor(sim, h, ux * 28, uz * 28);
      speed = HELI.maxSpeed + Math.hypot(p.vx || 0, p.vz || 0);
      h.repelled = (h.repelled || 0) + dt;
    }
  }
  // Steer the velocity (arrive smoothly, limited acceleration).
  const dx = target.x - h.x, dz = target.z - h.z, d = Math.hypot(dx, dz);
  const want = Math.min(speed, d * 0.9 + Math.hypot(p.vx || 0, p.vz || 0) * (h.mode === "station" ? 1 : 0));
  const wx = d > 0.01 ? (dx / d) * want : 0, wz = d > 0.01 ? (dz / d) * want : 0;
  const ax = wx - h.vx, az = wz - h.vz, am = Math.hypot(ax, az), lim = HELI.accel * dt;
  const k = am > lim ? lim / am : 1;
  h.vx += ax * k;
  h.vz += az * k;
  h.x += h.vx * dt;
  h.z += h.vz * dt;
  const wantY = HELI.altitude + (h.mode === "entry" ? 6 : h.mode === "flyby" ? 4 : 0);
  h.y += (wantY - h.y) * Math.min(1, dt * 0.8);
  // Face where it flies (or the player when hovering), bank into turns.
  const sp = Math.hypot(h.vx, h.vz);
  const face = sp > 4 ? Math.atan2(-h.vx, -h.vz) : Math.atan2(-(p.x - h.x), -(p.z - h.z));
  let dh = face - h.heading;
  while (dh > Math.PI) dh -= Math.PI * 2;
  while (dh < -Math.PI) dh += Math.PI * 2;
  const turn = Math.max(-1.2, Math.min(1.2, dh * 1.6));
  h.heading += turn * dt;
  h.bank += (Math.max(-0.35, Math.min(0.35, -turn * 0.28)) - h.bank) * Math.min(1, dt * 3);
  h.pitch = Math.min(0.22, sp / 160);
  h.rotor += dt * 26;
  // Searchlight: lags behind the player a little.
  const f = 1 - Math.exp(-dt * HELI.spotLag);
  h.spot.x += (p.x - h.spot.x) * f;
  h.spot.z += (p.z - h.spot.z) * f;
  h.tracking = !h.leaving && h.mode !== "entry" && Math.hypot(h.x - p.x, h.z - p.z) < HELI.trackRange;
  p.heliTracked = h.tracking;
  if (h.leaving && Math.hypot(h.x - p.x, h.z - p.z) > 220) {
    sim.heli = null;
    p.heliTracked = false;
  }
}
