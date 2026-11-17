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
  // Stalled by a hard knock: no steering, just coast to a halt for a moment
  // instead of grinding along the other car.
  if (c.stunTimer > 0) {
    c.stunTimer -= dt;
    c.vx *= Math.exp(-dt * 3);
    c.vz *= Math.exp(-dt * 3);
    c.turn = 0;
    return;
  }
  if (c.blockSlot) return steerBlocker(c, index, player, dt, navigation, fleet);
  // While a cordon is closing, officers without a slot stand off instead of
  // crowding in and shoving the cordon cars about.
  if (
    player.cordonActive &&
    Math.hypot(c.x - player.x, c.z - player.z) < CONFIG.cordonStandoff
  ) {
    c.mode = "standby";
    c.role = "standby";
    c.vx *= Math.exp(-dt * 6);
    c.vz *= Math.exp(-dt * 6);
    const toward = Math.atan2(-(player.x - c.x), -(player.z - c.z));
    const delta = clamp(angleDelta(toward, c.angle), -1.5 * dt, 1.5 * dt);
    c.angle += Math.hypot(c.vx, c.vz) > 0.5 ? delta : 0;
    c.turn = delta / dt;
    return;
  }
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
export function steerBlocker(c, index, player, dt, navigation, fleet = []) {
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
  // Not getting any closer (the slot is wedged behind the player or another
  // car): close to it, park where it is, still turned across; further out,
  // look for another way round.
  if (c.blockState !== "hold") {
    // Progress means really closing in (1 m per stall window), not
    // creeping along behind another car.
    if (d < (c.blockBest ?? Infinity) - 1) {
      c.blockBest = d;
      c.blockStall = 0;
    } else c.blockStall = (c.blockStall || 0) + dt;
    // Already right beside the player counts too: there it is part of the
    // wall whether or not its exact slot can be reached.
    const besidePlayer =
      c.blockKind === "cordon" &&
      Math.hypot(player.x - c.x, player.z - c.z) < 5.1;
    if (c.blockStall > 1 && (d < 4 || besidePlayer)) {
      // Park as it stands: turning on the spot next to the player would
      // swing the car's ends and open a gap it is meant to close.
      c.blockSlot = { ...slot, x: c.x, z: c.z, angle: c.angle };
      c.blockState = "hold";
      c.blockStall = 0;
      c.vx = 0;
      c.vz = 0;
      return;
    }
    if (c.blockStall > 1.5) {
      c.route = [];
      c.routeTimer = 0;
      c.blockStall = 0;
      c.blockBest = Infinity;
      // Still no way through after two tries (the slot is boxed in behind
      // other cars): give it up so another car can be sent another way.
      c.blockReroutes = (c.blockReroutes || 0) + 1;
      if (c.blockReroutes > 2 && c.blockKind === "cordon") {
        c.cordonGaveUp = 3;
        c.blockId = null;
        c.blockSlot = null;
        c.blockState = null;
        c.blockReroutes = 0;
        return;
      }
    }
  }
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
  // A cordon car that already got stuck once on the way (parked police cars
  // in its straight line, which the route map does not know about) goes
  // round instead: the route keeps away from the player's position, where
  // the wall of parked cars is, and is followed as planned.
  const detour = c.blockKind === "cordon" && (c.blockReroutes || 0) > 0;
  if (d > 6 && (detour || !navigation.clear(c, slot))) {
    if (c.routeTimer <= 0 || !c.route?.length) {
      c.route = navigation.findPath(
        c,
        slot,
        undefined,
        detour
          ? { x: player.x, z: player.z, radius: 3, penalty: 400, segment: true }
          : null,
      );
      c.routeTimer = detour ? 3 : 0.6 + (index % 3) * 0.08;
    }
    while (!detour && c.route.length > 1 && navigation.clear(c, c.route[1]))
      c.route.shift();
    if (
      c.route[0] &&
      Math.hypot(c.x - c.route[0].x, c.z - c.route[0].z) < (detour ? 4 : 1.5)
    )
      c.route.shift();
    waypoint = c.route[0] || slot;
  }
  let wx = waypoint.x - c.x,
    wz = waypoint.z - c.z;
  const wd = Math.hypot(wx, wz) || 1;
  // A parked police car straight in the way: steer round it at walking pace
  // instead of waiting behind it for good.
  for (const other of fleet) {
    if (other === c || other.state !== "active" || other.blockState !== "hold")
      continue;
    const ox = other.x - c.x,
      oz = other.z - c.z,
      od = Math.hypot(ox, oz);
    if (od > 0 && od < 6.5 && od < d && (ox * wx + oz * wz) / (od * wd) > 0.7) {
      const side = wx * oz - wz * ox > 0 ? -1 : 1,
        turn = 1.1 * side,
        cs = Math.cos(turn),
        sn = Math.sin(turn);
      [wx, wz] = [wx * cs - wz * sn, wx * sn + wz * cs];
      c.sidestep = true;
      break;
    }
  }
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
  let limit = Math.min(CONFIG.frontSprintSpeed * corner, cap);
  // Close to the player, come in slowly; never shove another police car.
  const toPlayer = Math.hypot(player.x - c.x, player.z - c.z);
  // Coming in toward the player: slow down near it. Driving past it (to get
  // in front of a car sliding along a wall) is not slowed.
  const closingOnPlayer =
    ((player.x - c.x) * wx + (player.z - c.z) * wz) / ((toPlayer || 1) * wd);
  if (toPlayer < 14 && closingOnPlayer > 0.3)
    limit = Math.min(limit, 5 + toPlayer * 1.1);
  for (const other of fleet) {
    if (other === c || other.state !== "active") continue;
    // Give way to parked cars and to the car with right of way (lower id),
    // so two approaching cars never wait for each other forever.
    if (other.blockState !== "hold" && other.id > c.id) continue;
    if (other.blockState === "hold" && c.sidestep) continue;
    const ox = other.x - c.x,
      oz = other.z - c.z,
      od = Math.hypot(ox, oz);
    if (od < 6 && od > 0 && (ox * wx + oz * wz) / (od * wd) > 0.7)
      limit = Math.min(limit, Math.max(0, (od - 3.6) * 2.2));
    // Crossing traffic: if the two paths meet within the next second, hold
    // back and let the other car through instead of T-boning it.
    const rvx = other.vx - (wx / wd) * limit,
      rvz = other.vz - (wz / wd) * limit,
      rv2 = rvx * rvx + rvz * rvz;
    if (rv2 > 1 && od < 14) {
      const t = Math.max(0, Math.min(1, -(ox * rvx + oz * rvz) / rv2));
      if (Math.hypot(ox + rvx * t, oz + rvz * t) < 3.4)
        limit = Math.min(limit, 4);
    }
  }
  if (c.sidestep) limit = Math.min(limit, 5);
  c.sidestep = false;
  const speed = limit;
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
// Close round the player (converging on it, forming a cordon) police cars
// look out for each other: if another police car will be on top of this one
// within half a second, brake hard instead of meeting it head-on. Away from
// the player (high-speed chase) nothing changes: crashes there still happen.
export function trafficBrake(c, fleet, player, dt) {
  if (c.state !== "active") return;
  if (Math.hypot(c.x - player.x, c.z - player.z) > 9) return;
  for (const other of fleet) {
    if (other === c || other.state !== "active") continue;
    const ox = other.x - c.x,
      oz = other.z - c.z,
      od = Math.hypot(ox, oz);
    if (od > 9 || od < 0.01) continue;
    const rvx = other.vx - c.vx,
      rvz = other.vz - c.vz,
      closing = -(ox * rvx + oz * rvz) / od;
    if (closing < 5) continue;
    const rv2 = rvx * rvx + rvz * rvz;
    const t = Math.max(0, Math.min(0.5, -(ox * rvx + oz * rvz) / rv2));
    if (Math.hypot(ox + rvx * t, oz + rvz * t) > 3.4) continue;
    // Only the car moving toward the other brakes.
    if ((c.vx * ox + c.vz * oz) / od <= 1) continue;
    const k = Math.exp(-dt * 12);
    c.vx *= k;
    c.vz *= k;
    return;
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
  // A car parked in a cordon or roadblock is braced: the other car takes the
  // whole push-back and the whole impulse.
  const braced = (car) => car.blockState === "hold";
  let wa = braced(a) ? 0 : 1,
    wb = braced(b) ? 0 : 1;
  // Both parked (one stopped right against the other): only one gives way,
  // so a car already holding its place is never shoved along. A roadblock
  // car outranks a cordon car; otherwise the lower id stays put.
  if (!wa && !wb) {
    const rank = (car) => (car.blockKind === "cordon" ? 1 : 2);
    if (rank(a) !== rank(b)) wa = rank(a) < rank(b) ? 1 : 0;
    else wa = a.id > b.id ? 1 : 0;
    wb = 1 - wa;
  }
  const share = wa / (wa + wb);
  const correction = depth + 0.002;
  a.x -= nx * correction * share;
  a.z -= nz * correction * share;
  b.x += nx * correction * (1 - share);
  b.z += nz * correction * (1 - share);
  if (closing <= 0) return 0;
  const relative = Math.hypot(a.vx - b.vx, a.vz - b.vz);
  const peakSpeed = Math.max(Math.hypot(a.vx, a.vz), Math.hypot(b.vx, b.vz));
  const impulse = closing * 1.3;
  a.vx -= nx * impulse * share;
  a.vz -= nz * impulse * share;
  b.vx += nx * impulse * (1 - share);
  b.vz += nz * impulse * (1 - share);
  // Impulse/depenetration still applies, but a slow stationary cordon has no crash damage.
  if (
    closing < 5 ||
    relative < 10 ||
    peakSpeed < 8 ||
    (a.role === "contain" && b.role === "contain" && peakSpeed < 10)
  )
    return 0;
  // Severity: how hard they meet head-on, or most of their relative speed
  // when one car runs into the other's corner or flank at speed (a corner hit
  // has a small head-on component but is still a violent crash). Two cars
  // drifting together in the same direction have little relative speed.
  const impact = Math.max(closing, relative * 0.75);
  // A genuinely hard hit (head-on or T-bone) wrecks both cars at once;
  // lighter knocks still accumulate damage as before.
  const lethal = impact >= CONFIG.lethalPairImpact;
  const damage = lethal
    ? CONFIG.policeHealth
    : impactDamage(impact, CONFIG.pairDamageScale);
  // A strong knock that does not wreck them still stalls both cars, so they
  // separate instead of grinding along each other at full chase speed.
  if (!lethal && impact >= CONFIG.stunImpact && peakSpeed >= 12)
    for (const car of [a, b])
      if (!braced(car)) {
        car.vx *= 0.35;
        car.vz *= 0.35;
        car.stunTimer = CONFIG.stunSeconds;
        car.route = [];
      }
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
