// Dirt-ramp jumps (destruction pass: the large construction site). No
// button: a mound is a height field; a car driving up its slope rises
// with it (its upward speed is its forward speed times the slope), and
// when the ground falls away past the crest it simply keeps going on a
// ballistic arc, lands, and drives on. Faster cars fly further; heavier
// ones a little lower. Steering stays as it is. Everything solid still
// collides in the air (no clipping through buildings); the loose things
// on the ground (fences, pallets, signs) are flown over.
//
// Mound: { x, z, ux, uz (its axis), len (half length), w (half width),
// h (height) }: a ridge across the axis, slopes both ways (usable from
// either side), soft side edges.
export const JUMP = Object.freeze({ gravity: 21, maxVy: 8.5, side: 1.4, land: 0.05 });

export function mountHeight(m, x, z) {
  const dx = x - m.x, dz = z - m.z;
  const a = Math.abs(dx * m.ux + dz * m.uz), b = Math.abs(-dx * m.uz + dz * m.ux);
  if (a >= m.len || b >= m.w + JUMP.side) return 0;
  const along = m.h * (1 - a / m.len);
  return b <= m.w ? along : along * (1 - (b - m.w) / JUMP.side);
}
export function groundHeight(mounds, x, z) {
  let h = 0;
  for (const m of mounds) {
    if (Math.abs(x - m.x) > m.len + m.w + 2 || Math.abs(z - m.z) > m.len + m.w + 2) continue;
    h = Math.max(h, mountHeight(m, x, z));
  }
  return h;
}

// One body, after it has moved this step. mass: its weight (1 = a car).
export function updateJump(sim, body, dt, mass = 1) {
  const mounds = sim.layout?.mounds;
  if (!mounds?.length || body.level === 1 || body.falling) return;
  const h = groundHeight(mounds, body.x, body.z);
  if (!body.air && h <= 0 && !body.onMound) return; // nowhere near a ramp
  if (!body.air) {
    const y0 = body.y || 0;
    // Where its own upward speed would carry it this step: if the ground
    // drops away below that (past a crest), it is airborne.
    const vy0 = Math.min(JUMP.maxVy, (body.jumpVy || 0) / (0.85 + 0.15 * mass));
    const carried = y0 + vy0 * dt - 0.5 * JUMP.gravity * dt * dt;
    if (vy0 > 1.5 && h < carried - 0.005) {
      body.air = true;
      body.vy = vy0 - JUMP.gravity * dt;
      body.y = carried;
      body.jumpFrom = { x: body.x, z: body.z, t: sim.elapsed };
      sim.stats.jumps = (sim.stats.jumps || 0) + 1;
      if (body === sim.player) sim.stats.playerJumps = (sim.stats.playerJumps || 0) + 1;
      sim.city?.events.push({ id: ++sim.city.eventId, type: "jump", action: "takeoff", x: body.x, z: body.z, strength: 10, sound: "whoosh" });
      return;
    } else {
      body.jumpVy = (h - y0) / dt; // rising (or settling) with the ground
      body.y = h;
      body.onMound = h > 0;
      body.vy = 0;
      return;
    }
  }
  // In the air.
  body.vy -= JUMP.gravity * dt;
  body.y = (body.y || 0) + body.vy * dt;
  if (body.y <= h) {
    const hit = -body.vy;
    body.y = h;
    body.air = false;
    body.vy = 0;
    body.jumpVy = 0;
    body.onMound = h > 0;
    const dist = body.jumpFrom ? Math.hypot(body.x - body.jumpFrom.x, body.z - body.jumpFrom.z) : 0;
    if (body === sim.player) sim.stats.longestJump = Math.max(sim.stats.longestJump || 0, dist);
    // A firm landing: dust, a thud, a little speed lost (never stopped).
    if (body === sim.player && hit > 9) body.speed = (body.speed || 0) * 0.92;
    sim.city?.events.push({ id: ++sim.city.eventId, type: "jump", action: "land", x: body.x, z: body.z, strength: Math.min(15, 6 + hit), sound: "thud", dist });
  }
}
// A car's nose-up angle for drawing (positive: nose up).
export function jumpPitch(body) {
  const sp = Math.hypot(body.vx || 0, body.vz || 0) || 1;
  if (body.air) return Math.max(-0.45, Math.min(0.45, Math.atan2(body.vy || 0, sp)));
  if (body.onMound) return Math.max(-0.35, Math.min(0.35, Math.atan2(body.jumpVy || 0, sp)));
  return 0;
}
