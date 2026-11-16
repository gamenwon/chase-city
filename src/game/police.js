import { CONFIG, clamp, angleDelta } from "./config.js";
export function makePolice(i, generation = 0) {
  let x = (i % 2 ? 1 : -1) * 3,
    z = 30 + i * 9;
  return {
    id: i,
    generation,
    x,
    z,
    angle: 0,
    vx: 0,
    vz: 0,
    speed: CONFIG.policeSpeed,
    type: i % 3 === 0 ? "pursuit" : "patrol",
    boostTimer: 0,
    boostCooldown: 0,
    effectiveSpeed: CONFIG.policeSpeed,
    health: CONFIG.policeHealth,
    state: "active",
    wreckAge: 0,
    stuck: 0,
    turn: 0,
    wallCooldown: 0,
    pairCooldown: 0,
    route: [],
    routeTimer: 0,
    role: "pursuit",
    mode: "pursuit",
    replans: 0,
    blocked: 0,
  };
}
export function steerPolice(
  c,
  index,
  player,
  dt,
  navigation,
  fleet = [],
  elapsed = 0,
) {
  if (!navigation) return;
  c.routeTimer = (c.routeTimer || 0) - dt;
  if (c.blockSlot) return steerBlocker(c, index, player, dt, navigation);
  const ranked = fleet
    .filter((p) => p.state === "active")
    .sort(
      (a, b) =>
        Math.hypot(a.x - player.x, a.z - player.z) -
        Math.hypot(b.x - player.x, b.z - player.z),
    );
  const rank = ranked.indexOf(c),
    close = Math.hypot(c.x - player.x, c.z - player.z);
  // V1.8 pressure roles: the nearest car presses from behind, the second
  // rides alongside, and every other car races ahead to block from the front
  // (half of the blockers via a parallel street, see `ambush`).
  const forward = { x: -Math.sin(player.angle), z: -Math.cos(player.angle) },
    side = { x: Math.cos(player.angle), z: -Math.sin(player.angle) },
    along = (c.x - player.x) * forward.x + (c.z - player.z) * forward.z;
  // A slow/pinned player (or an officer already on top of it) gets the plain
  // converge behaviour so the 3-second cordon can form; the positioning roles
  // only make sense against a car that is actually driving away.
  const playerMoving = (player.fleeSpeed ?? player.netSpeed ?? 24) > 13;
  // Side by side is where a flanker is meant to be, so being close only turns
  // an officer into a plain pursuer when it is behind or in front.
  const alongside = Math.abs(along) < 6;
  // With four or more cars the 2nd and 3rd ride on opposite sides, so with
  // the rear pursuer and the front blockers the player is boxed in.
  const flankers = ranked.length >= 4 ? 2 : 1;
  c.role =
    rank === 0 || !playerMoving || (close < 9 && !alongside)
      ? "pursuit"
      : rank <= flankers
        ? "flank"
        : elapsed >= CONFIG.frontBlockStart
          ? "front"
          : "pursuit";
  const difficulty = Math.min(1, elapsed / 60);
  const lead =
    c.role === "pursuit"
      ? 0
      : c.role === "flank"
        ? 0.3
        : 1.2 + difficulty * 0.6 + (index % 3) * 0.45;
  const surrounding =
    (player.contained ||
      player.cordonCandidate ||
      (c.mode === "contain" && player.captureProgress > 0)) &&
    close < 12;
  const slotAngle =
    (player.cordonHeading ?? player.angle) + ((c.id % 4) * Math.PI) / 2;
  const slot = {
    x: player.x - Math.sin(slotAngle) * (c.id < 4 ? 3.4 : 5.4),
    z: player.z - Math.cos(slotAngle) * (c.id < 4 ? 3.4 : 5.4),
  };
  c.mode = surrounding ? "contain" : "pursuit";
  c.role = surrounding ? "contain" : c.role;
  // Walk the predicted point back toward the player until it is on a road.
  let prediction = null;
  for (let t = lead; t > 0 && !prediction; t -= 0.25) {
    const ahead = { x: player.x + player.vx * t, z: player.z + player.vz * t };
    if (navigation.allowed(ahead)) prediction = ahead;
  }
  prediction ??= navigation.allowed(player)
    ? { x: player.x, z: player.z }
    : { x: clamp(player.x, -95, 95), z: clamp(player.z, -95, 95) };
  let chaseTarget = player;
  if (c.role === "flank") {
    // Ride alongside and squeeze in. The first flanker keeps the side it is
    // already on; the second takes the opposite side.
    const sideOf = (car) => {
      const l = (car.x - player.x) * side.x + (car.z - player.z) * side.z;
      return Math.abs(l) > 0.8 ? Math.sign(l) : car.id % 2 ? 1 : -1;
    };
    const sign = rank === 2 && ranked[1] ? -sideOf(ranked[1]) : sideOf(c);
    const offset = along > -10 && close < 16 ? 3 : 3.4;
    const at = (k) => ({
      x: prediction.x + side.x * k,
      z: prediction.z + side.z * k,
    });
    // Near corners or kerbs the preferred slot may not be reachable in a
    // straight line: try a tighter slot, then the other side, before giving
    // up and following the road route behind the player.
    chaseTarget = at(sign * offset);
    if (close < 22)
      for (const k of [sign * offset, sign * 1.9, -sign * offset, -sign * 1.9])
        if (navigation.clear(c, at(k))) {
          chaseTarget = at(k);
          break;
        }
  } else if (c.role === "front") {
    const spread = ((index % 3) - 1) * 1.4;
    // Once ahead of the player, turn into a head-on block instead of
    // continuing to chase the predicted point.
    chaseTarget =
      along > 3 && close < 24
        ? { x: player.x + side.x * spread, z: player.z + side.z * spread }
        : {
            x: prediction.x + side.x * spread,
            z: prediction.z + side.z * spread,
          };
    if (!navigation.allowed(chaseTarget)) chaseTarget = prediction;
  }
  // Diagnostic label of where this officer is pressing the player from.
  c.pressure =
    c.role === "front" && along > 3
      ? "front"
      : c.role === "flank" && Math.abs(along) < 6
        ? "side"
        : "rear";
  const target = surrounding ? slot : chaseTarget;
  // Ambushers (every other blocker) avoid the player's own road until they
  // are in front, arriving from a side street or head-on instead.
  const ambush = c.role === "front" && along < 3 && c.id % 2 === 0;
  const avoid = ambush
    ? { x: player.x, z: player.z, radius: 16, penalty: 70 }
    : null;
  const direct = !ambush && close < 22 && navigation.clear(c, target);
  let waypoint;
  if (direct) {
    waypoint = target;
    c.route = [];
    c.routeTimer = 0;
  } else {
    const goal = navigation.nearest(prediction);
    if (
      c.routeTimer <= 0 ||
      !c.route?.length ||
      c.goalId !== goal?.id ||
      c.ambush !== ambush ||
      c.navigationRevision !== navigation.revision
    ) {
      c.navigationRevision = navigation.revision;
      c.route = navigation.findPath(c, prediction, undefined, avoid);
      c.goalId = goal?.id;
      c.ambush = ambush;
      c.routeTimer = 0.5 + (index % 3) * 0.08;
      c.replans = (c.replans || 0) + 1;
    }
    while (
      c.route.length > 1 &&
      Math.hypot(c.x - c.route[0].x, c.z - c.route[0].z) < 2
    )
      c.route.shift();
    // Only shortcut a waypoint when the full swept corridor is clear.
    while (c.route.length > 1 && navigation.clear(c, c.route[1]))
      c.route.shift();
    waypoint = c.route[0];
    if (waypoint && Math.hypot(c.x - waypoint.x, c.z - waypoint.z) < 1.5) {
      c.route.shift();
      waypoint = c.route[0];
    }
    if (!waypoint) {
      c.vx *= Math.exp(-dt * 10);
      c.vz *= Math.exp(-dt * 10);
      c.turn = 0;
      return;
    }
  }
  let dx = waypoint.x - c.x,
    dz = waypoint.z - c.z,
    d = Math.hypot(dx, dz);
  // V1.8: officers travelling the same lane in the same direction must not
  // rear-end each other into pointless self-destruction. Blockers and
  // flankers overtake in the adjacent lane; the rear pursuer keeps a gap.
  // Cars arriving from different directions (front blockers vs rear
  // pursuers) are unaffected, so real crossing and head-on pile-ups remain.
  let followCap = null;
  c.following = false;
  c.overtaking = false;
  if (!surrounding && d > 0)
    for (const other of fleet) {
      if (other === c || other.state !== "active") continue;
      const ox = other.x - c.x,
        oz = other.z - c.z,
        dist = Math.hypot(ox, oz),
        otherSpeed = Math.hypot(other.vx, other.vz);
      if (dist > 9 || dist === 0) continue;
      const inPath = (ox * dx + oz * dz) / (dist * d);
      // A colleague parked in the way (a cordon or roadblock car) is braked
      // for, not rammed: arriving at speed would wreck both and break the
      // very cordon that is about to make the arrest.
      if (otherSpeed < 4) {
        if (inPath > 0.7)
          followCap = Math.min(
            followCap ?? Infinity,
            Math.max(0, dist - 4) * 2.2,
          );
        continue;
      }
      const sameWay = (other.vx * dx + other.vz * dz) / (otherSpeed * d);
      // Far from the suspect there is no reason to collide at all: oncoming
      // or crossing officers keep right and slow down. Near the suspect
      // (inside 22 units) contacts stay fully physical.
      if (close > 22 && inPath > 0.55 && sameWay <= 0.75) {
        const px = -dz / d,
          pz = dx / d;
        const keep = {
          x: c.x + (dx / d) * 5 - px * 2.6,
          z: c.z + (dz / d) * 5 - pz * 2.6,
        };
        if (
          !c.overtaking &&
          navigation.allowed(keep) &&
          navigation.clear(c, keep)
        ) {
          dx = keep.x - c.x;
          dz = keep.z - c.z;
          d = Math.hypot(dx, dz);
          c.overtaking = true;
        }
        followCap = Math.min(
          followCap ?? Infinity,
          8 + Math.max(0, dist - 3) * 2,
        );
        continue;
      }
      if (inPath <= 0.85 || sameWay <= 0.75) continue;
      if (c.role !== "pursuit" && !c.overtaking) {
        const px = -dz / d,
          pz = dx / d,
          sign = ox * px + oz * pz > 0 ? -1 : 1;
        const pass = {
          x: c.x + (dx / d) * 6 + px * sign * 3.2,
          z: c.z + (dz / d) * 6 + pz * sign * 3.2,
        };
        if (navigation.allowed(pass) && navigation.clear(c, pass)) {
          dx = pass.x - c.x;
          dz = pass.z - c.z;
          d = Math.hypot(dx, dz);
          c.overtaking = true;
          continue;
        }
      }
      followCap = Math.min(
        followCap ?? Infinity,
        otherSpeed * sameWay + Math.max(0, dist - 4.4) * 1.8,
      );
      c.following = true;
    }
  const desired = Math.atan2(-dx, -dz),
    error = angleDelta(desired, c.angle);
  const delta = clamp(error, -3.8 * dt, 3.8 * dt);
  c.angle += delta;
  c.turn = delta / dt;
  const corner = clamp(1 - Math.abs(error) * 0.45, 0.35, 1);
  c.boostCooldown = Math.max(0, (c.boostCooldown || 0) - dt);
  const behind =
    (c.x - player.x) * -Math.sin(player.angle) +
      (c.z - player.z) * -Math.cos(player.angle) <
    -6;
  // Front blockers and flankers may also sprint to get into position.
  const canBoost =
    (c.type === "pursuit" || c.role !== "pursuit") &&
    rank <= 3 &&
    behind &&
    close > 11 &&
    close < 110 &&
    Math.abs(error) < 0.32 &&
    navigation.clear(c, target);
  if (c.boostTimer > 0) {
    c.boostTimer -= dt;
    if (!canBoost || c.boostTimer <= 0) {
      c.boostTimer = 0;
      c.boostCooldown = 2.7 - difficulty;
    }
  } else if (canBoost && c.boostCooldown <= 0) {
    c.boostTimer = 2.8 + difficulty * 0.6;
  }
  c.effectiveSpeed = c.boostTimer > 0 ? 26 + difficulty * 2 : c.speed;
  // Positioning sprint: blockers must out-run the player to get in front, and
  // flankers to draw level. Only while still behind and not already close.
  if (c.role === "front" && along < 3 && close > 7)
    c.effectiveSpeed = Math.max(
      c.effectiveSpeed,
      CONFIG.frontSprintSpeed + difficulty * 2,
    );
  else if (c.role === "flank" && along < -3 && close > 5)
    c.effectiveSpeed = Math.max(
      c.effectiveSpeed,
      CONFIG.flankSprintSpeed + difficulty,
    );
  let speed = c.effectiveSpeed * corner;
  if (surrounding) {
    speed = Math.min(speed, Math.max(0, d - 0.12) * 2.2, 6);
    c.boostTimer = 0;
    // Brake on entering a low-speed cordon, before contacts are resolved.
    const current = Math.hypot(c.vx, c.vz);
    if (current > 6) {
      c.vx *= 6 / current;
      c.vz *= 6 / current;
    }
    const px = player.x - c.x,
      pz = player.z - c.z,
      range = Math.hypot(px, pz) || 1;
    const approach = (c.vx * px + c.vz * pz) / range;
    if (approach > 4) {
      c.vx -= ((approach - 4) * px) / range;
      c.vz -= ((approach - 4) * pz) / range;
    }
  }
  // Gently match a nearby slower car instead of accelerating into a stationary cordon.
  for (const other of fleet)
    if (surrounding && other !== c && other.state === "active") {
      const ox = other.x - c.x,
        oz = other.z - c.z,
        dist = Math.hypot(ox, oz);
      if (
        dist < 4.8 &&
        dist > 0 &&
        (ox * dx + oz * dz) / (dist * (d || 1)) > 0.7
      )
        speed = Math.min(
          speed,
          Math.hypot(other.vx, other.vz) + Math.max(0, dist - 3.2) * 2,
        );
    }
  if (followCap !== null) speed = Math.min(speed, followCap);
  // A blocker that is already in front brakes into a roadblock instead of a
  // 46-unit/s head-on charge: the player sees it coming and can still dodge.
  if (!surrounding && c.role === "front" && along > 3)
    speed = Math.min(
      speed,
      CONFIG.blockerApproachSpeed + Math.max(0, close - 6) * 0.6,
    );
  // Tailgate rather than grind: right behind the player the rear pursuer
  // matches its pace instead of ramming it every second.
  const playerPace = player.groundSpeed ?? player.speed ?? 24;
  if (!surrounding && c.role !== "flank" && close < 5 && along < 0)
    speed = Math.min(speed, playerPace + 2.5);
  // A flanker closes the gap from behind faster than the player drives, then
  // holds station beside it instead of falling back behind.
  if (!surrounding && c.role === "flank" && close < 18) {
    if (along < -2.5) speed = Math.max(speed, playerPace + 5);
    else speed = clamp(playerPace - along * 1.5, 0, playerPace + 5);
  }
  const grip = 1 - Math.exp(-dt * 7);
  c.vx += ((dx / (d || 1)) * speed - c.vx) * grip;
  c.vz += ((dz / (d || 1)) * speed - c.vz) * grip;
  const next = { x: c.x + c.vx * dt * 3, z: c.z + c.vz * dt * 3 };
  const safetyRadius = navigation.clear(c, c, CONFIG.policeRadius + 0.05)
    ? CONFIG.policeRadius + 0.05
    : CONFIG.policeRadius - 0.02;
  if (!navigation.clear(c, next, safetyRadius)) {
    c.vx = 0;
    c.vz = 0;
    c.routeTimer = 0;
    c.blocked = (c.blocked || 0) + dt;
  } else c.blocked = 0;
}
// V1.8 roadblock driving: get to the slot, brake to a stop exactly on it,
// turn across the road and hold still. A car pushed off its slot creeps back
// slowly instead of re-planning, so a held block does not twitch.
export function steerBlocker(c, index, player, dt, navigation) {
  const slot = c.blockSlot,
    dx = slot.x - c.x,
    dz = slot.z - c.z,
    d = Math.hypot(dx, dz);
  c.role = "block";
  c.mode = "block";
  c.boostTimer = 0;
  c.pressure = "front";
  if (c.blockState === "hold" && d > CONFIG.blockHoldLeave)
    c.blockState = "recover";
  if (
    c.blockState !== "hold" &&
    d < CONFIG.blockHoldEnter &&
    Math.hypot(c.vx, c.vz) < 3
  )
    c.blockState = "hold";
  if (c.blockState === "hold") {
    c.vx = 0;
    c.vz = 0;
    c.route = [];
    // Turn across the road on the spot (shortest way, either end first).
    let error = angleDelta(slot.angle, c.angle);
    if (Math.abs(error) > Math.PI / 2)
      error = angleDelta(slot.angle + Math.PI, c.angle);
    const delta = clamp(error, -2.5 * dt, 2.5 * dt);
    c.angle += delta;
    c.turn = delta / dt;
    return;
  }
  let waypoint = slot;
  if (d > 6 && !navigation.clear(c, slot)) {
    if (c.routeTimer <= 0 || !c.route?.length) {
      c.route = navigation.findPath(c, slot);
      c.routeTimer = 0.6 + (index % 3) * 0.08;
    }
    while (c.route.length > 1 && navigation.clear(c, c.route[1]))
      c.route.shift();
    if (c.route[0] && Math.hypot(c.x - c.route[0].x, c.z - c.route[0].z) < 1.5)
      c.route.shift();
    waypoint = c.route[0] || slot;
  }
  const wx = waypoint.x - c.x,
    wz = waypoint.z - c.z,
    wd = Math.hypot(wx, wz) || 1;
  const desired = Math.atan2(-wx, -wz),
    error = angleDelta(desired, c.angle);
  const delta = clamp(error, -3.8 * dt, 3.8 * dt);
  c.angle += delta;
  c.turn = delta / dt;
  const corner = clamp(1 - Math.abs(error) * 0.45, 0.35, 1);
  // Brake so the car comes to rest on the slot (v^2 = 2 a d).
  const cap =
    c.blockState === "recover"
      ? 5
      : Math.sqrt(2 * CONFIG.blockDecel * Math.max(0, d - 0.3));
  const speed = Math.min(CONFIG.frontSprintSpeed * corner, cap);
  c.effectiveSpeed = speed;
  const grip = 1 - Math.exp(-dt * 7);
  c.vx += ((wx / wd) * speed - c.vx) * grip;
  c.vz += ((wz / wd) * speed - c.vz) * grip;
  const next = { x: c.x + c.vx * dt * 3, z: c.z + c.vz * dt * 3 };
  if (!navigation.clear(c, next, CONFIG.policeRadius - 0.02)) {
    c.vx *= 0.5;
    c.vz *= 0.5;
    c.routeTimer = 0;
  }
}
// SAT uses the visible oriented body (width 2.1, length 3.6), rather than a
// short centre circle that let noses overlap without generating an impact.
export function policeContact(a, b) {
  const basis = (c) => [
    { x: Math.cos(c.angle), z: -Math.sin(c.angle) },
    { x: -Math.sin(c.angle), z: -Math.cos(c.angle) },
  ];
  const aa = basis(a),
    bb = basis(b),
    dx = b.x - a.x,
    dz = b.z - a.z;
  let depth = Infinity,
    normal = null;
  for (const axis of [...aa, ...bb]) {
    const project = (axes) =>
      Math.abs(axis.x * axes[0].x + axis.z * axes[0].z) * 1.05 +
      Math.abs(axis.x * axes[1].x + axis.z * axes[1].z) * 1.8;
    const offset = dx * axis.x + dz * axis.z,
      overlap = project(aa) + project(bb) - Math.abs(offset);
    if (overlap <= 0) return null;
    if (overlap < depth) {
      depth = overlap;
      const sign = offset >= 0 ? 1 : -1;
      normal = { x: axis.x * sign, z: axis.z * sign };
    }
  }
  return { depth, ...normal };
}
export function collidePolice(a, b) {
  if (a.state !== "active" || b.state !== "active") return 0;
  const contact = policeContact(a, b);
  if (!contact) return 0;
  const { x: nx, z: nz, depth } = contact;
  // Body yaw is visual steering, not extra translational crash energy.
  const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  const correction = depth / 2 + 0.001;
  a.x -= nx * correction;
  a.z -= nz * correction;
  b.x += nx * correction;
  b.z += nz * correction;
  if (closing <= 0) return 0;
  const relative = Math.hypot(a.vx - b.vx, a.vz - b.vz);
  const peakSpeed = Math.max(Math.hypot(a.vx, a.vz), Math.hypot(b.vx, b.vz));
  const impulse = closing * 0.65;
  a.vx -= nx * impulse;
  a.vz -= nz * impulse;
  b.vx += nx * impulse;
  b.vz += nz * impulse;
  // Impulse/depenetration still applies, but a slow stationary cordon has no crash damage.
  if (
    closing < 5 ||
    relative < 10 ||
    peakSpeed < 8 ||
    (a.role === "contain" && b.role === "contain" && peakSpeed < 10)
  )
    return 0;
  const tangentSquared = Math.max(0, relative * relative - closing * closing);
  const impact = Math.sqrt(closing * closing + tangentSquared * 0.15);
  // A genuinely hard hit (head-on or T-bone) wrecks both cars at once;
  // lighter knocks still accumulate damage as before.
  const damage =
    impact >= CONFIG.lethalPairImpact
      ? CONFIG.policeHealth
      : impactDamage(impact, CONFIG.pairDamageScale);
  let applied = 0;
  for (const car of [a, b])
    if ((car.pairCooldown || 0) <= 0 && damage > 0) {
      car.health = Math.max(0, car.health - damage);
      car.lastDamageCause = "vehicle";
      car.lastCollisionStrength = closing;
      car.pairCooldown = CONFIG.impactCooldown;
      applied = damage;
    }
  return applied;
}

export function impactDamage(impact, scale) {
  return Math.min(
    CONFIG.maxImpactDamage,
    Math.pow(Math.max(0, impact - CONFIG.minimumImpact), 1.15) * scale,
  );
}
export function wallImpact(car, impact, kind = "wall") {
  const damage = impactDamage(
    impact,
    kind === "barricade" ? CONFIG.barricadeDamageScale : CONFIG.wallDamageScale,
  );
  if ((car.wallCooldown || 0) > 0 || damage <= 0) return 0;
  car.health = Math.max(0, car.health - damage);
  car.lastDamageCause = kind;
  car.wallCooldown = CONFIG.impactCooldown;
  return damage;
}
