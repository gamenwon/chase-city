import { resetDurability, hurt, hurtImpact, hurtPolice } from "./durability.js";
import { ChaseCamera } from "../render/camera.js";
import { CONFIG, clamp, angleDelta } from "./config.js";
import { RoadNavigation, distance } from "./navigation.js";
import { resolveBuilding } from "../world/layout.js";
import { inspectEnclosure } from "./arrest.js";
import { addWreck, updateWrecks } from "./wrecks.js";
import { spawnView, inspectSpawn } from "./spawning.js";
import { chooseExit, constrainToWorld } from "./escape.js";
import { updateBarricades, MINI_GAP } from "./barricades.js";
import { gapFillers } from "../world/layout.js";
import { clearSegment } from "./navigation.js";
import { createMission, updateMission, getMission } from "./missions.js";
import { getVehicle } from "./vehicles.js";
import { createTally, recordCityEvent } from "./tally.js";
import { createPin, updatePin, cordonVerdict, clearCordonVerdict } from "./pin.js";
import { updateTarget, resolveTargetContact } from "./target.js";
import { updateJump } from "./jumps.js";
import { updateBlasts } from "./blast.js";
import { updateHelicopter } from "./helicopter.js";
import { CHAOS, chaosDestroyed, chaosFleet, chaosNextPoliceKind } from "./chaos.js";
import { makeHeavyPolice } from "./police.js";
import { resetCoins, updateCoins, awardCoins } from "./coins.js";
import { resetRepairs, updateRepairs } from "./repairs.js";
import { createOverpasses, pillarSolids, constrainLevels, hitPillar, updateOverpasses, updateFalling, sameLevel } from "./overpass.js";
import { createBuildingCells, cellSolids, hitWall } from "./buildings.js";
import { updateRoadblock } from "./roadblock.js";
import { updateCordon, cordonSealed } from "./cordon.js";
import { createCity, updateCity, cityBudget, standingPostsNear, PROPS } from "./city.js";
import {
  makePolice,
  steerPolice,
  trafficBrake,
  collidePolice,
  policeContact,
  wallImpact,
} from "./police.js";
export class Simulation {
  constructor(layout, options = {}) {
    this.layout = layout;
    this.cameraRig =
      options.cameraRig ||
      new ChaseCamera(options.width || 1100, options.height || 740);
    // Narrow gaps between buildings are closed for physics (gapFillers).
    this.staticSolids = [...layout.buildings, ...(layout.obstacles || []), ...gapFillers(layout.buildings, undefined, layout.miniPassages)];
    this.random = options.random || Math.random;
    this.reinforcementsEnabled = options.reinforcements !== false;
    this.helicopterOption = options.helicopter;
    this.barricadesEnabled = options.barricades !== false;
    // V1.9 city life (props, pedestrians, traffic). On in the real game
    // (main.js); off by default so older fixed scenarios keep their meaning.
    this.cityEnabled = options.city === true;
    this.cityBudget = options.cityBudget || cityBudget(options.cityProfile);
    this.lastExitId = null;
    this.runNumber = 0;
    // V2.0: which mission and car this simulation runs (reset() keeps them
    // unless told otherwise).
    this.missionId = options.mission || "survival60";
    this.vehicleId = options.vehicle;
    // Day or night: picked at random for every run (50/50), unless fixed
    // (a development override). Visual only, and drawn with Math.random,
    // never the game's own random source, so gameplay is not affected.
    this.fixedTimeOfDay = options.timeOfDay === "day" || options.timeOfDay === "night" ? options.timeOfDay : null;
    // V2.1: a new generated city for every run (world/citygen.js), or the
    // same one again with a fixed seed (?seed=..., for replaying a map).
    this.cityGenerator = options.cityGenerator || null;
    this.fixedSeed = Number.isFinite(options.seed) ? options.seed : null;
    // CITY CHAOS wanted-level pace (2 in the evaluation preset).
    this.chaosPace = options.chaosPace || 1;
    // Destruction for the result screen, counted as city events happen.
    this.onCityEvent = (e) => {
      const added = recordCityEvent(this.tally, e);
      // CITY CHAOS: what the player knocked down counts for the combo.
      if (added && this.chaos) chaosDestroyed(this, e.type === "traffic" ? "traffic" : "prop", `tally:${e.type}:${e.targetId}`, e.x ?? this.player.x, e.z ?? this.player.z, 0, true);
      return added;
    };
    this.reset();
  }
  refreshNavigation() {
    this.solids = [
      ...this.staticSolids,
      ...pillarSolids(this),
      ...cellSolids(this),
      ...this.barricades,
      ...this.wrecks.filter((w) => w.solid),
      ...(this.city?.solids || []),
    ];
    this.navigation.setSolids([
      ...this.solids,
      ...(this.city?.navObstacles || []),
    ]);
    for (const car of this.police) {
      car.route = [];
      car.routeTimer = 0;
    }
  }
  openEscape() {
    this.escape.phase = "open";
    this.escape.openedAt = this.elapsed;
    this.barricades = [];
    this.barricadeWarning = null;
    this.refreshNavigation();
    this.navigation.addExit(this.escape.exit);
  }
  // Physics boxes of the current layout (buildings, fixed obstacles, the
  // closed narrow gaps).
  setLayout(layout) {
    this.layout = layout;
    // Destructible low-rise buildings are solid as wall cells instead
    // (buildings.js), not as one box.
    this.staticSolids = [...layout.buildings.filter((b) => !b.destructible), ...(layout.obstacles || []), ...gapFillers(layout.buildings, undefined, layout.miniPassages)];
  }
  reset(missionId = this.missionId, vehicleId = this.vehicleId) {
    this.runNumber++;
    if (this.cityGenerator) {
      // A fresh city each run (the seed drawn with Math.random, never the
      // game's own random source), or the fixed replay seed.
      const seed = this.fixedSeed ?? ((Math.random() * 2 ** 31) >>> 0);
      this.setLayout(this.cityGenerator(seed));
    }
    this.timeOfDay = this.fixedTimeOfDay ?? (Math.random() < 0.5 ? "day" : "night");
    this.missionId = missionId;
    this.vehicleId = vehicleId;
    const missionRules = getMission(missionId).rules;
    // Police (chase, cordon, roadblocks, barricades, reinforcements) only in
    // missions that use them.
    this.policeEnabled = missionRules.police !== false;
    this.heliEnabled = this.helicopterOption !== false;
    this.vehicle = getVehicle(vehicleId);
    this.tally = createTally();
    this.pin = createPin();
    this.pickups = [];
    this.target = null; // TARGET HUNT: the fleeing car (target.js)
    this.chaos = null; // CITY CHAOS state (chaos.js), set by its setup
    this.chaosMode = !!missionRules.chaos;
    this.blastQueue = []; // chain links waiting to go off (blast.js)
    this.cameraRig.reset();
    this.cameraRig.update(this.layout.start || { x: 0, z: 8, angle: 0 }, 0);
    this.spawnEvents = [];
    this.spawnRetryAt = 0;
    this.captureOpenTime = 0;
    this.motionSamples = [];
    this.wrecks = [];
    this.heli = null;
    this.wreckId = 0;
    this.enclosure = { trapped: false, exits: 1, nearby: 0 };
    this.enclosureTimer = 0;
    this.cordonSamples = [];
    this.roadblock = null;
    this.roadblockEvents = [];
    this.cordon = null;
    this.cordonEvents = [];
    this.cordonCooldownUntil = 0;
    this.cordonId = 0;
    this.officers = [];
    this.officerId = 0;
    this.roadblockCooldownUntil = 0;
    this.roadblockCheckAt = 0;
    this.roadblockId = 0;
    this.barricades = [];
    this.barricadeEvents = [];
    this.barricadeWarnings = new Set();
    this.barricadeWarning = null;
    this.city = this.cityEnabled
      ? createCity(this.layout, {
          seed: 9031 + this.runNumber,
          budget: this.cityBudget,
        })
      : null;
    // V2.1 elevated road(s) of a generated city (overpass.js).
    this.overpasses = createOverpasses(this.layout);
    this.buildingCells = createBuildingCells(this.layout);
    this.solids = [...this.staticSolids, ...pillarSolids(this), ...cellSolids(this)];
    this.navigation = new RoadNavigation([
      ...this.solids,
      ...(this.city?.navObstacles || []),
    ], this.layout.graph || null);
    // Gold coins for this run (coins.js).
    resetCoins(this);
    resetRepairs(this);
    const exit = chooseExit(this.staticSolids, this.random, this.lastExitId, this.layout.exits || undefined);
    this.lastExitId = exit.id;
    this.escape = { phase: "locked", exit, openedAt: null };
    const start = this.layout.start || { x: 0, z: 8, angle: 0 };
    this.previousPlayer = { x: start.x, z: start.z };
    this.player = {
      x: start.x,
      z: start.z,
      angle: start.angle,
      vx: -Math.sin(start.angle) * this.vehicle.stats.topSpeed,
      vz: -Math.cos(start.angle) * this.vehicle.stats.topSpeed,
      speed: this.vehicle.stats.topSpeed,
      turn: 0,
      steering: 0,
      slip: 0,
      wallContacts: 0,
    };
    this.health = 100;
    resetDurability(this);
    this.elapsed = 0;
    this.arrest = 0;
    this.hitCooldown = 0;
    this.result = null;
    this.collisions = 0;
    this.started = false;
    this.credits = 0;
    this.mission = createMission(missionId);
    this.events = [];
    this.eventId = 0;
    this.impactId = 0;
    this.contactEvents = [];
    this.impacts = [];
    this.stats = {
      explosions: 0,
      chainExplosions: 0,
      wallCollisions: 0,
      pairCollisions: 0,
      wallDamage: 0,
      pairDamage: 0,
      barricadeCollisions: 0,
      barricadeDamage: 0,
      boostSeconds: 0,
      spawnDeferrals: 0,
      lethalPairCollisions: 0,
    };

    this.police = this.policeEnabled
      ? Array.from({ length: this.chaosMode ? CHAOS.startPolice : CONFIG.policeCount }, (_, i) => makePolice(i))
      : [];
    if (this.layout.start) this.placeStartPolice();
    this.mission.definition.setup?.(this);
  }
  // Generated city: the police start behind the player on the road
  // network (20-55 m back along the roads), facing the way it goes.
  placeStartPolice() {
    const p = this.player, nav = this.navigation;
    const fx = -Math.sin(p.angle), fz = -Math.cos(p.angle);
    const origin = nav.nodes.map((n) => ({ n, d: Math.hypot(n.x - p.x, n.z - p.z) })).sort((a, b) => a.d - b.d)[0]?.n;
    if (!origin) return;
    const dist = new Map([[origin.id, 0]]), queue = [origin];
    for (let k = 0; k < queue.length; k++)
      for (const id of queue[k].neighbors) {
        const m = nav.nodes[id], d = dist.get(queue[k].id) + distance(queue[k], m);
        if (!dist.has(id) || d < dist.get(id)) {
          if (!dist.has(id)) queue.push(m);
          dist.set(id, d);
        }
      }
    const spots = nav.nodes
      .filter((n) => n.id < (nav.baseNodeCount ?? nav.nodes.length) && !n.level)
      .map((n) => ({ n, d: dist.get(n.id) ?? Infinity, ahead: (n.x - p.x) * fx + (n.z - p.z) * fz }))
      .filter((v) => v.d >= 20 && v.d <= 60 && v.ahead < -8)
      .sort((a, b) => a.d - b.d);
    const used = [];
    for (const c of this.police) {
      const s = spots.find((v) => used.every((u) => distance(u, v.n) > 7));
      if (!s) break;
      used.push(s.n);
      c.x = s.n.x;
      c.z = s.n.z;
      c.angle = Math.atan2(-(p.x - c.x), -(p.z - c.z));
    }
  }
  start() {
    if (!this.result) {
      this.started = true;
      this.mission.status = "active";
    }
  }
  applyPoliceObstacleDamage(car, strength) {
    const kind = car.lastObstacleKind === "barricade" ? "barricade" : "wall";
    const damage = wallImpact(car, strength, kind);
    if (damage > 0) {
      if (kind === "barricade") {
        this.stats.barricadeCollisions++;
        this.stats.barricadeDamage += damage;
      } else {
        this.stats.wallCollisions++;
        this.stats.wallDamage += damage;
      }
      this.recordImpact(car, strength, `police-${kind}`);
    }
    return damage;
  }
  recordImpact(body, strength, kind) {
    if (strength < CONFIG.minimumImpact) return;
    this.impacts.push({
      id: ++this.impactId,
      type: "collision",
      x: body.x,
      z: body.z,
      strength,
      kind,
      time: this.elapsed,
    });
    if (this.impacts.length > 64) this.impacts.shift();
  }
  // Player durability (restored, durability.js): every source of damage
  // has a category and goes through hurt(); this generic entry is for
  // anything uncategorised (scaled to the guideline range).
  damage(amount, kind = "misc", key = null) {
    return hurt(this, kind, amount * 0.4, key);
  }
  // V1.9 (phones): solids near a point, from a 10 m grid rebuilt whenever
  // the solids list changes. Same boxes in the same order as scanning the
  // whole list, so collision results are unchanged; only far boxes that
  // cannot touch are skipped.
  nearSolids(x, z, reach) {
    if (
      this.solidGridFor !== this.solids ||
      this.solidGridLength !== this.solids.length
    ) {
      this.solidGridFor = this.solids;
      this.solidGridLength = this.solids.length;
      this.solidGrid = new Map();
      this.solids.forEach((b, i) => {
        for (
          let gx = Math.floor((b.x - b.w / 2) / 10);
          gx <= Math.floor((b.x + b.w / 2) / 10);
          gx++
        )
          for (
            let gz = Math.floor((b.z - b.d / 2) / 10);
            gz <= Math.floor((b.z + b.d / 2) / 10);
            gz++
          ) {
            const k = gx * 1000 + gz;
            if (!this.solidGrid.has(k)) this.solidGrid.set(k, []);
            this.solidGrid.get(k).push(i);
          }
      });
    }
    const seen = new Set();
    for (
      let gx = Math.floor((x - reach) / 10);
      gx <= Math.floor((x + reach) / 10);
      gx++
    )
      for (
        let gz = Math.floor((z - reach) / 10);
        gz <= Math.floor((z + reach) / 10);
        gz++
      )
        for (const i of this.solidGrid.get(gx * 1000 + gz) || []) seen.add(i);
    return [...seen].sort((a, b) => a - b).map((i) => this.solids[i]);
  }
  constrain(body, radius, fallback) {
    if (this.overpasses?.length) {
      // Two levels: on the overpass only its parapets count.
      const deckHit = constrainLevels(this, body, radius);
      if (body.level === 1) return deckHit;
    }
    let hit = false;
    const near = this.nearSolids(body.x, body.z, radius + 4);
    // Tight alleys can be narrower than a car. Iterate neighboring contacts,
    // then keep the last valid pose instead of pushing through another wall.
    for (let pass = 0; pass < 8; pass++) {
      let contact = false;
      for (const b of near)
        if (this.passesBarricade(body, b)) continue;
        else if (resolveBuilding(body, b, radius)) {
          if (b.kind === "wreck" && body === this.player) (this.pushedWrecks ||= new Set()).add(b);
          contact = true;
          body.lastObstacleKind = b.kind || "wall";
          body.lastObstacle = b;
          hit = true;
        }
      if (!contact) break;
    }
    if (near.some((b) => !this.passesBarricade(body, b, false) && resolveBuilding({ ...body }, b, radius - 1e-6))) {
      body.x = fallback.x;
      body.z = fallback.z;
      hit = true;
    }
    const x = body.x,
      z = body.z;
    constrainToWorld(body, this.escape, fallback);
    return hit || x !== body.x || z !== body.z;
  }
  // Vehicle collection: the mini slips past a barricade over the pavement
  // (only the carriageway part stops it), the monster truck goes over it
  // (a hop). Police and traffic are always stopped.
  passesBarricade(body, b, act = true) {
    // (MINI_GAP: how much of the carriageway next to the kerb is open to
    // the mini, render/road-events.js draws cones there.)
    // (A mini passage between two buildings: only the mini fits.)
    if (b.kind === "minigap") return body === this.player && !!this.vehicle?.stats.slipsBarricade;
    if (b.kind !== "barricade" || body !== this.player) return false;
    const s = this.vehicle?.stats || {};
    if (s.climbs) {
      if (act && !body.falling && (body.level || 0) === 0 && Math.hypot(body.vx, body.vz) > 1.5) {
        Object.assign(body, { falling: true, vy: 5.2, y: Math.max(body.y || 0, 0.05) });
        this.stats.barricadeVaults = (this.stats.barricadeVaults || 0) + 1;
        this.city?.events.push({ id: ++this.city.eventId, type: "jump", action: "takeoff", x: body.x, z: body.z, strength: 10, sound: "whoosh" });
      }
      return true;
    }
    if (s.slipsBarricade && b.road && b.roadHalf != null) {
      const lat = b.vertical ? body.x - b.road.x : body.z - b.road.z;
      // (Open over the pavement and the outer lane: easy to aim for.)
      if (Math.abs(lat) > b.roadHalf - MINI_GAP) {
        if (!act) return true;
        if (!body.slipAt || this.elapsed - body.slipAt > 2) this.stats.barricadeSlips = (this.stats.barricadeSlips || 0) + 1;
        body.slipAt = this.elapsed;
        return true;
      }
    }
    return false;
  }
  move(body, dt, radius = CONFIG.radius) {
    const v0 = { x: body.vx, z: body.vz };
    let hit = false;
    body.lastImpact = 0;
    body.lastObstacleKind = null;
    const steps = Math.ceil((Math.hypot(body.vx, body.vz) * dt) / 0.5) || 1;
    for (let i = 0; i < steps; i++) {
      const previous = { x: body.x, z: body.z };
      body.x += (body.vx * dt) / steps;
      body.z += (body.vz * dt) / steps;
      const predicted = { x: body.x, z: body.z };
      if (this.constrain(body, radius, previous)) {
        hit = true;
        const nx = body.x - predicted.x,
          nz = body.z - predicted.z,
          length = Math.hypot(nx, nz);
        if (length > 1e-8) {
          body.lastImpact = Math.max(
            body.lastImpact,
            Math.max(0, -(body.vx * nx + body.vz * nz) / length),
          );
          if (body === this.player) {
            const ux = nx / length,
              uz = nz / length,
              inward = Math.min(0, body.vx * ux + body.vz * uz);
            body.vx -= ux * inward;
            body.vz -= uz * inward;
            const side = body.steering < 0 ? -1 : 1;
            let tx = -uz * side,
              tz = ux * side;
            if (body.vx * tx + body.vz * tz < 0) {
              tx = -tx;
              tz = -tz;
            }
            const tangent = Math.atan2(-tx, -tz);
            // Sliding along a wall into something at both ends (a short
            // pocket between columns or posts): after the slide has turned
            // back twice in a few seconds, turn away from the wall instead.
            const prev = body.escapeAngle;
            if (prev !== undefined && Math.abs(angleDelta(tangent, prev)) > 2)
              body.escapeFlips = [
                ...(body.escapeFlips || []).filter((at) => this.elapsed - at < 3),
                this.elapsed,
              ];
            body.escapeAngle =
              (body.escapeFlips || []).filter((at) => this.elapsed - at < 3)
                .length >= 2
                ? Math.atan2(-ux, -uz)
                : tangent;
          }
        }
      }
    }
    // Core recovery pass: the player's car shoves a wreck it drives into
    // (a burnt-out police car is far lighter than a car under power), so
    // wrecks piled against a building never close a pocket for good. The
    // wreck slides along the car's heading, never into anything solid.
    // Only once the car has been pressing wrecks for a while (a pocket,
    // not a passing bump) and never while the police hold it (an arrest
    // countdown: a real immobilization stays one).
    if (body === this.player && !this.pushedWrecks?.size && this.elapsed - (body.wreckPressLast ?? -9) > 0.5) body.wreckPressSince = null;
    if (body === this.player && this.pushedWrecks?.size) {
      body.wreckPressLast = this.elapsed;
      body.wreckPressSince ??= this.elapsed;
      const sp = Math.hypot(v0.x, v0.z);
      if (sp > 2.5 && this.elapsed - body.wreckPressSince > 1.2 && !(this.arrest > 0)) {
        const ux = v0.x / sp, uz = v0.z / sp, step = Math.min(0.3, sp * dt * 0.45);
        let moved = false;
        for (const w of this.pushedWrecks) {
          const nx = w.x + ux * step, nz = w.z + uz * step;
          const blocked = Math.max(Math.abs(nx), Math.abs(nz)) > 104 || this.nearSolids(nx, nz, 5).some((q) => q !== w && Math.abs(q.x - nx) < (q.w + w.w) / 2 - 0.05 && Math.abs(q.z - nz) < (q.d + w.d) / 2 - 0.05);
          if (blocked) continue;
          w.x = nx;
          w.z = nz;
          moved = true;
          this.solidGridFor = null; // re-bin the solids
        }
        // Wedged in (an alley sealed by a pile of wrecks): pressing one
        // that cannot move for 3 s flattens it (still there, no longer
        // solid), so a pile never shuts the car in for good.
        if (moved) body.wreckBlockedSince = null;
        else body.wreckBlockedSince ??= this.elapsed;
        if (body.wreckBlockedSince != null && this.elapsed - body.wreckBlockedSince > 3) {
          for (const w of this.pushedWrecks) (w.solid = false), (w.flattened = true);
          body.wreckBlockedSince = null;
          this.stats.wrecksFlattened = (this.stats.wrecksFlattened || 0) + 1;
          this.refreshNavigation();
        }
      }
      this.pushedWrecks.clear();
    }
    // A hard hit on an overpass pillar damages it (V2.1).
    if (body.lastObstacle?.kind === "pillar" && body.lastImpact > 0) {
      const s = this.vehicle.stats;
      const mass = body === this.player ? (s.mass || 1) * (s.env || 1) : 1.2;
      hitPillar(this, body.lastObstacle, body.lastImpact, mass);
    }
    // ...or on the wall of a low-rise building: it may break through.
    if (body.lastObstacle?.kind === "bcell" && body.lastImpact > 0) {
      const mass = body === this.player ? (this.vehicle.stats.mass || 1) * (this.vehicle.stats.env || 1) : body.health != null && body.role ? 1.2 : 1;
      if (hitWall(this, body, body.lastObstacle, body.lastImpact, mass, v0)) hit = false;
    }
    body.lastObstacle = null;
    return hit;
  }
  explodePolice(car) {
    if (car.state !== "active") return;
    // V2.5: one car goes up; what its blast does to everything around it
    // (other police cars, traffic, props, parked cars...) is the shared
    // explosion system's job (blast.js), with short varied delays between
    // the links of a chain.
    const c = car;
    const depth = c.blastDepth || 0;
    this.stats.explosions++;
    // (CITY CHAOS: a car the player rammed or crushed is the player's.)
    if (this.chaos) chaosDestroyed(this, "police", `police:${c.id}:${c.generation ?? 0}`, c.x, c.z, depth, ["rammed", "crushed"].includes(c.lastDamageCause));
    awardCoins(this, `police:${c.id}:${c.generation ?? 0}`, "police", c.x, c.z, depth);
    if (c.lastDamageCause === "blast") this.stats.chainExplosions++;
    const crashSpeed = Math.hypot(c.vx, c.vz);
    addWreck(this, c, 0);
    c.state = "wreck";
    c.health = 0;
    c.wreckAge = 0;
    c.vx = 0;
    c.vz = 0;
    const event = {
      id: ++this.eventId,
      type: "explosion",
      cause: c.lastDamageCause || "unknown",
      mode: c.mode || "pursuit",
      crashSpeed,
      x: c.x,
      z: c.z,
      angle: c.angle,
      time: this.elapsed,
      delay: 0,
      chainDepth: depth,
      playerX: this.player.x,
      playerZ: this.player.z,
    };
    event.chainRoot = event.id;
    this.events.push(event);
    if (this.events.length > 64) this.events.shift();
    // Existing wrecks caught in the blast flare up again on screen.
    for (const w of this.wrecks)
      if (w.born < this.elapsed && Math.hypot(w.x - c.x, w.z - c.z) < CONFIG.explosionRadius)
        w.flaredAt = this.elapsed;
    this.refreshNavigation();
  }
  // Durability lives in hp; health (%) is what the HUD and tests read.
  // health written directly (debug tools, tests) is honoured.
  syncHealth() {
    if (!this.maxHp) return;
    if (this.health !== this.healthWritten) this.hp = Math.max(0, Math.min(this.maxHp, (this.maxHp * this.health) / 100));
    this.health = this.healthWritten = (this.hp / this.maxHp) * 100;
  }
  // V2.0 continue (after a rewarded ad): undo a failure once per run and
  // play on from where it happened. Returns false if not allowed.
  revive() {
    const m = this.mission,
      kind = this.result;
    if (!kind || kind === "success" || m.continued) return false;
    if (!m.definition.continueOn.includes(kind)) return false;
    m.continued = true;
    if (kind === "destroyed") {
      // Back on the road with 60 % of the car's durability.
      this.hp = this.maxHp * 0.6;
      this.health = this.healthWritten = 60;
      this.damageLog = [];
    }
    if (kind === "arrested") {
      // The police pull back: every car near the player drives off (is
      // re-placed off screen like a reinforcement), officers get back in,
      // and no cordon or roadblock may form again for a few seconds.
      for (let i = 0; i < this.police.length; i++) {
        const c = this.police[i];
        if (Math.hypot(c.x - this.player.x, c.z - this.player.z) > 30) continue;
        const spawn = this.navigation.spawn(
          this.player,
          this.police,
          c.id,
          c.generation + 1,
          this.cameraRig.camera,
        );
        if (spawn)
          this.police[i] = Object.assign(
            makePolice(c.id, c.generation + 1),
            spawn,
            { spawnedAt: this.elapsed },
          );
        else this.police[i].stunTimer = 6;
      }
      this.cordon = null;
      this.roadblock = null;
      this.officers = [];
      this.cordonCooldownUntil = this.elapsed + 6;
      this.roadblockCooldownUntil = this.elapsed + 6;
      this.arrest = 0;
      this.enclosure = { trapped: false, exits: 1, nearby: 0 };
      this.cordonSamples = [];
      this.captureOpenTime = 0;
    }
    if (kind === "timeout") m.extraTime += 20;
    this.pin = createPin();
    this.result = null;
    m.status = "active";
    m.revivedAt = this.elapsed;
    return true;
  }
  // Player driving for one step: steering, speed, grip, moving with wall
  // contacts and the wall-slide recovery. (Also used by the pin-arrest
  // escape probe, on a copy.)
  // A big tree or post the car is pressed against and did not knock over
  // (it touched it in the last moments, the prop still stands, the car is
  // barely moving and points at it). side: +1 if it is on the car's right.
  postAhead(p) {
    const c = p.propContact;
    if (!this.city || !c || this.elapsed - c.at > 0.15) return null;
    if (Math.hypot(p.vx, p.vz) > 3) return null; // stopped by it first
    const fx = -Math.sin(p.angle), fz = -Math.cos(p.angle);
    // Any standing post touching the nose (a lamp beside a tree can be the
    // last thing touched while the tree is what blocks the way).
    for (const q of standingPostsNear(this.city, p.x, p.z, 3)) {
      const dx = q.x - p.x, dz = q.z - p.z, d = Math.hypot(dx, dz);
      if (d > CONFIG.radius + PROPS[q.kind].r + 0.6 || d < 1e-6) continue;
      if ((dx * fx + dz * fz) / d < 0.3) continue; // not in front
      return { prop: q, side: Math.sign(dx * -fz + dz * fx) || 1 };
    }
    return null;
  }
  // Headings (of those given) the player car could drive 4 m along from
  // here without hitting a building, wall, standing post or police car.
  clearHeadings(p, directions, reach = 8) {
    const slideSolids = this.nearSolids(p.x, p.z, reach * 0.5 + CONFIG.radius);
    const posts = this.city ? standingPostsNear(this.city, p.x, p.z, reach * 0.5 + CONFIG.radius) : [];
    // Police cars in the way block a slide too (one braced in a
    // roadblock does not give way).
    const cops = this.police.filter(
      (c) => c.state === "active" && Math.hypot(c.x - p.x, c.z - p.z) < reach * 0.5 + CONFIG.radius + CONFIG.policeRadius,
    );
    return directions.filter((a) => {
      for (let step = 1; step <= reach; step++) {
        const pose = {
          x: p.x - Math.sin(a) * step * 0.5,
          z: p.z - Math.cos(a) * step * 0.5,
        };
        if (
          !this.navigation.allowed(pose) ||
          slideSolids.some((b) =>
            resolveBuilding({ ...pose }, b, CONFIG.radius - 0.01),
          ) ||
          posts.some(
            (q) =>
              Math.hypot(q.x - pose.x, q.z - pose.z) <
              CONFIG.radius + PROPS[q.kind].r - 0.01,
          ) ||
          cops.some(
            (c) =>
              Math.hypot(c.x - pose.x, c.z - pose.z) <
              CONFIG.radius + CONFIG.policeRadius - 0.3,
          )
        )
          return false;
      }
      return true;
    });
  }
  // V2.1 wedge guard. Pressed against walls for 2.5 s without getting
  // 2.5 m anywhere, even while steering (the slide above only runs with
  // no input): turn towards the most open heading and commit to it. If no
  // heading is open at all (wedged), glide along a clear line to the
  // nearest road point. Never while police are close, an arrest is
  // counting or the car is held: a real police box still arrests.
  watchWedge(p, touching, steering) {
    if (p.level) return (p.wedge = null);
    const w = p.wedge;
    if (!touching) {
      if (w && Math.hypot(p.x - w.x, p.z - w.z) > 2.5) p.wedge = null;
      return;
    }
    if (!w || Math.hypot(p.x - w.x, p.z - w.z) > 2.5) {
      p.wedge = { x: p.x, z: p.z, at: this.elapsed };
      return;
    }
    if (this.elapsed - w.at < 2.5 || p.postEscape) return;
    p.wedge = { x: p.x, z: p.z, at: this.elapsed };
    const policeNear = this.police.some((c) => c.state === "active" && Math.hypot(c.x - p.x, c.z - p.z) < 9);
    if (policeNear || this.arrest > 0 || p.contained || this.pin?.trapped) return;
    const all = Array.from({ length: 24 }, (_, i) => p.angle + Math.PI + (i / 24) * Math.PI * 2);
    const open = this.clearHeadings(p, all, 12);
    this.stats.unwedges = (this.stats.unwedges || 0) + 1;
    if (open.length) {
      const heading = open.sort((x, y) => Math.abs(angleDelta(x, p.angle)) - Math.abs(angleDelta(y, p.angle)))[0];
      p.postEscape = { heading, until: this.elapsed + 1.4, forced: this.elapsed + 0.7 };
      return;
    }
    const to = this.recoveryPoint(p);
    if (!to) return;
    const d = Math.hypot(to.x - p.x, to.z - p.z);
    p.recover = { from: { x: p.x, z: p.z }, to, t: 0, seconds: clamp(d / 14, 0.25, 0.9), heading: to.heading };
    this.stats.recoveryGlides = (this.stats.recoveryGlides || 0) + 1;
  }
  // The nearest road node reachable on a straight clear line (a thin
  // probe, so it can leave a pocket the car is jammed in), with a heading
  // along an open way from there.
  recoveryPoint(p) {
    const nodes = this.navigation.nodes
      .filter((n) => n.id < (this.navigation.baseNodeCount ?? this.navigation.nodes.length) && !n.level)
      .map((n) => ({ n, d: Math.hypot(n.x - p.x, n.z - p.z) }))
      .filter((v) => v.d > 1 && v.d < 30)
      .sort((a, b) => a.d - b.d);
    for (const { n } of nodes) {
      if (!clearSegment(p, n, this.solids, 0.45)) continue;
      if (this.nearSolids(n.x, n.z, 3).some((b) => resolveBuilding({ x: n.x, z: n.z }, b, CONFIG.radius))) continue;
      const next = n.neighbors.map((id) => this.navigation.nodes[id])[0];
      const heading = next ? Math.atan2(-(next.x - n.x), -(next.z - n.z)) : p.angle;
      return { x: n.x, z: n.z, heading };
    }
    return null;
  }
  drivePlayer(dt, input) {
    const p = this.player;
    const steering = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    // Vehicle collection (vehicles.js): steering response, turn rate,
    // acceleration and top speed per car.
    const car = this.vehicle.stats;
    p.steering =
      (p.steering || 0) +
      (steering - (p.steering || 0)) * (1 - Math.exp(-dt * (car.steerResponse || 7)));
    p.turn = p.steering * car.turnRate;
    p.angle += p.turn * dt;
    p.speed += (car.topSpeed - p.speed) * (1 - Math.exp(-(car.accel || 2) * dt));
    const grip = 1 - Math.exp(-car.grip * dt);
    p.vx += (-Math.sin(p.angle) * p.speed - p.vx) * grip;
    p.vz += (-Math.cos(p.angle) * p.speed - p.vz) * grip;
    // Big trees and posts stop the car too (city.js); against one the car
    // looks for a way to slide off exactly as it does at a wall, instead
    // of bouncing on the spot into it for ever.
    const post = this.postAhead(p);
    const esc = p.postEscape;
    if (!post && esc) {
      if (this.elapsed > esc.until || (Math.abs(steering) > 0 && !(esc.forced && this.elapsed < esc.forced)) ||
          Math.abs(angleDelta(esc.heading, p.angle)) < 0.08) p.postEscape = null;
      else {
        p.angle += clamp(angleDelta(esc.heading, p.angle), -5 * dt, 5 * dt);
        p.vx = -Math.sin(esc.heading) * 7;
        p.vz = -Math.cos(esc.heading) * 7;
      }
    }
    if (p.recover) {
      // V2.1 recovery glide (unwedge): along a clear straight line to a
      // road point, over a fraction of a second, then driving on.
      const r = p.recover;
      r.t = Math.min(1, r.t + dt / r.seconds);
      const e = r.t * r.t * (3 - 2 * r.t);
      p.x = r.from.x + (r.to.x - r.from.x) * e;
      p.z = r.from.z + (r.to.z - r.from.z) * e;
      p.angle += clamp(angleDelta(r.heading, p.angle), -6 * dt, 6 * dt);
      p.vx = -Math.sin(p.angle) * 6;
      p.vz = -Math.cos(p.angle) * 6;
      if (r.t >= 1) p.recover = null;
      return;
    }
    const hitWall = this.move(p, dt, car.radius || CONFIG.radius);
    // Dirt ramps (jumps.js): up the slope, over the crest, through the air.
    updateJump(this, p, dt, car.mass || 1);
    this.watchWedge(p, hitWall || !!post, steering);
    // Pressed against walls or posts for over a second without getting
    // anywhere (a pocket the sideways slide only shuttles about in): turn
    // round towards the most open way out and commit to it.
    if ((hitWall || post) && !p.postEscape && !steering) {
      const a = p.wallStuck;
      if (!a || Math.hypot(p.x - a.x, p.z - a.z) > 2.5)
        p.wallStuck = { x: p.x, z: p.z, at: this.elapsed };
      else if (this.elapsed - a.at > 1.2) {
        const all = Array.from({ length: 24 }, (_, i) => p.angle + Math.PI + (i / 24) * Math.PI * 2);
        const open = this.clearHeadings(p, all, 12);
        if (open.length) {
          // Of the open ways, the one that turns least away from straight back.
          const heading = open.sort(
            (x, y) => Math.abs(angleDelta(x, p.angle + Math.PI)) - Math.abs(angleDelta(y, p.angle + Math.PI)),
          )[0];
          p.postEscape = { heading, until: this.elapsed + 1.1 };
        }
        p.wallStuck = { x: p.x, z: p.z, at: this.elapsed };
      }
    } else if (!hitWall && !post && p.wallStuck && Math.hypot(p.x - p.wallStuck.x, p.z - p.wallStuck.z) > 2.5)
      p.wallStuck = null;
    if (hitWall || post) {
      if (hitWall) p.wallContacts++;
      if (p.lastObstacleKind === "barricade") {
        p.speed = Math.min(p.speed, 12);
        p.vx *= 0.55;
        p.vz *= 0.55;
      }
      // A building wall at speed hurts (one hurt per wall contact: the
      // shared "wall" source has its cooldown, scraping along does not).
      // (Head-on-ish only: a glancing slide along a facade costs nothing.)
      if (hitWall && p.lastObstacleKind !== "barricade" && (p.lastImpact || 0) > 0.55 * Math.max(1, p.speed + (p.lastImpact || 0)))
        hurtImpact(this, "wall", p.lastImpact || 0, "wall");
      if (hitWall && this.elapsed - (p.lastWallSound || -1) > 0.5) {
        this.recordImpact(p, p.lastImpact, "player-wall");
        p.lastWallSound = this.elapsed;
      }
      // Sliding along a wall while still facing into it (the slide keeps
      // the car above the head-on speed, so the branch below would not
      // turn it): turn the nose along the slide instead of crabbing.
      if (hitWall && !post && !steering && p.escapeAngle !== undefined &&
          Math.hypot(p.vx, p.vz) >= 5) {
        const off = angleDelta(p.escapeAngle, p.angle);
        if (Math.abs(off) > 0.3) p.angle += clamp(off, -3 * dt, 3 * dt);
      }
      // Preserve tangential movement. When head-on, smoothly choose a wall
      // tangent so auto-forward driving never locks the car against a facade.
      if (Math.hypot(p.vx, p.vz) < 5 || post) {
        // Against a post: turn away from the side it is on (unless the
        // player is steering).
        const desired = post && !p.steering
          ? p.angle + (post.side > 0 ? 1 : -1) * (Math.PI / 2)
          : p.escapeAngle ?? p.angle + ((p.steering < 0 ? -1 : 1) * Math.PI) / 2;
        // At concave contacts, a single wall tangent can point into the next
        // facade. Find a genuinely clear short slide instead of oscillating.
        const directions = [
          desired,
          ...Array.from(
            { length: 16 },
            (_, i) => p.angle + (i / 16) * Math.PI * 2,
          ),
        ];
        const free = this.clearHeadings(p, directions);
        if (free.length) {
          const heading = free.sort(
            (a, b) =>
              Math.abs(angleDelta(a, desired)) -
              Math.abs(angleDelta(b, desired)),
          )[0];
          p.angle += clamp(angleDelta(heading, p.angle), -5 * dt, 5 * dt);
          p.vx = -Math.sin(heading) * 7;
          p.vz = -Math.cos(heading) * 7;
          // Off a post, keep to that heading until the nose has turned
          // (else auto-forward drives straight back into it next frame).
          if (post) p.postEscape = { heading, until: this.elapsed + 0.7 };
        } else if (!post)
          p.angle += clamp(angleDelta(desired, p.angle), -3 * dt, 3 * dt);
        // (Boxed in against a post with no way to slide: hold the heading
        // rather than twitch left and right on the spot.)
      }
    }
  }
  // Push the player out of police cars it touches (and damage it on a real hit).
  resolvePlayerPolice() {
    const p = this.player;
    for (const c of this.police) {
      if (c.state !== "active" || !sameLevel(p, c)) continue;
      const contact = policeContact(p, c);
      if (contact) {
        // V2.0 pin arrest: when the player last touched a police car.
        p.policeContactAt = this.elapsed;
        const { x: nx, z: nz, depth } = contact;
        // Vehicle collection: who gives way depends on the player car's
        // weight (vehicles.js). A car holding a roadblock is braced across
        // the road: only the heaviest cars shove it at all, a little.
        // (Heavy police: the weight that counts is the player's against
        // the police car's.)
        const car = this.vehicle.stats, cm = c.mass || 1, mass = (car.mass || 1) / cm;
        const braced = c.blockState === "hold";
        const closing = Math.max(0, (p.vx - c.vx) * nx + (p.vz - c.vz) * nz);
        // Monster truck: up and over a (not braced) police car, crushing it.
        // (Only driving into it at speed; never a car forming a cordon, so
        // a monster truck can still be boxed in and arrested.)
        const ownHit = Math.max(0, p.vx * nx + p.vz * nz);
        // (A roadblock car parked across the road is climbed at almost any
        // speed: the monster truck goes over roadblocks.)
        if (car.climbs && c.mode !== "contain" && c.heavy !== "armored" && (braced ? ownHit > 3 : ownHit > 12 && closing > 6) && !(c.climbedAt > this.elapsed - 1)) {
          c.climbedAt = this.elapsed;
          c.health = 0;
          c.lastDamageCause = "crushed";
          this.stats.crushedByPlayer = (this.stats.crushedByPlayer || 0) + 1;
          if (!p.air) Object.assign(p, { air: true, vy: 4.2, y: p.y || 0, jumpFrom: { x: p.x, z: p.z, t: this.elapsed } });
          this.recordImpact(p, closing, "player-police");
          continue;
        }
        // (A car closing a cordon round the player holds its place against
        // any vehicle, as for the classic car: heavy cars are not immune to
        // a legitimate arrest.)
        const cordon = c.mode === "contain" || this.arrest > 0;
        const share = braced ? (car.breakBlocks && !cordon ? 0.12 : 0) : cordon ? Math.min(0.2, 0.2 * mass) : Math.min(0.75, Math.max(0.08, 0.2 + ((mass - 1) / 1.5) * 0.5));
        p.x -= nx * (depth * (1 - share) + 0.001);
        p.z -= nz * (depth * (1 - share) + 0.001);
        c.x += nx * depth * share;
        c.z += nz * depth * share;
        const keep = car.retain ?? 0;
        p.vx -= nx * closing * 0.9 * (1 - keep);
        p.vz -= nz * closing * 0.9 * (1 - keep);
        // A light car bounces back off.
        if (mass < 1) {
          p.vx -= nx * closing * 0.3 * (1 - mass);
          p.vz -= nz * closing * 0.3 * (1 - mass);
        }
        if (share) {
          // (The classic car: exactly the old 0.1.)
          const k = (Math.max(0.05, 0.1 + (share - 0.2) * 0.6) * Math.sqrt(car.impact || 1)) / cm;
          c.vx += nx * closing * k;
          c.vz += nz * closing * k;
        }
        // A heavy car's hit damages the police car (more the stronger).
        // (Only the player's own hit, not a police car ramming it.)
        if (ownHit > 8 && closing > 8 && (car.impact || 1) > 1 && c.mode !== "contain" && this.elapsed - (c.playerHitAt ?? -9) > 0.4) {
          c.playerHitAt = this.elapsed;
          c.health -= ((Math.min(closing, ownHit) - 8) * 2.6 * Math.max(0, (car.impact || 1) - 1)) / cm;
          if (c.health <= 0) c.lastDamageCause = "rammed";
        }
        // Only a real hit hurts: a car pressed nose-first against a parked
        // police car (throttle on, not actually moving) takes no damage, the
        // same as pressing against a building.
        if (closing > 3 && (p.groundSpeed ?? closing) > 3) {
          if (this.hitCooldown <= 0) {
            this.recordImpact(p, closing, "player-police");
            this.hitCooldown = 0.8;
          }
          hurtPolice(this, closing, Math.max(0, p.vx * nx + p.vz * nz), `police:${c.id}`, Math.min(1.6, Math.sqrt(cm)));
          // A heavy police car driving into the player shoves it.
          const push = -((c.vx || 0) * nx + (c.vz || 0) * nz);
          if (cm > 1 && push > 2) {
            const k = Math.min(0.6, 0.35 * (cm - 1)) / Math.max(0.8, car.mass || 1);
            p.vx -= nx * push * k;
            p.vz -= nz * push * k;
          }
        }
        p.speed = Math.max(0, p.speed - closing * 0.25 * (1 - (car.retain ?? 0)));
      }
    }
  }
  // A braced police car and a wall never both give way (see update).
  wedgePlayer(back) {
    const p = this.player;
    // A parked (braced) police car and a wall must not both give way: after
    // the wall pushed the player back, push it out of any parked police car
    // again; if it is still wedged between the two, it stays where it was
    // this step (it cannot scrape through a gap narrower than the car).
    for (let pass = 0; pass < 2; pass++) {
      let moved = false;
      for (const c of this.police) {
        if (c.state !== "active" || c.blockState !== "hold" || c.health <= 0) continue;
        const contact = policeContact(p, c);
        if (!contact) continue;
        p.x -= contact.x * (contact.depth + 0.001);
        p.z -= contact.z * (contact.depth + 0.001);
        moved = true;
      }
      if (!moved) break;
      // Held by a police car (pin arrest bookkeeping only).
      p.policeContactAt = this.elapsed;
      this.constrain(p, CONFIG.radius, back);
    }
    if (
      this.police.some(
        (c) =>
          c.state === "active" &&
          c.blockState === "hold" && c.health > 0 &&
          policeContact(p, c)?.depth > 0.05,
      )
    ) {
      p.x = back.x;
      p.z = back.z;
      p.policeContactAt = this.elapsed;
    }
  }
  update(dt, input = {}) {
    this.syncHealth();
    this.lastDt = dt;
    if (!this.started || this.result || dt <= 0) return;
    dt = Math.min(dt, 0.05);
    this.elapsed += dt;
    this.hitCooldown -= dt;
    const p = this.player;
    updateWrecks(this);
    // (A shoved wreck moves in place: physics sees it at once; police
    // routing keeps its clearance cache until the next real change, as a
    // full navigation refresh on every shove made a car pushing a pile of
    // wrecks cost seconds a frame.)
    this.previousPlayer = { x: p.x, z: p.z };
    if (
      this.escape.phase === "locked" &&
      this.barricadesEnabled &&
      this.policeEnabled
    )
      updateBarricades(this);
    const previous = new Map(
      [p, ...this.police].map((c) => [c, { x: c.x, z: c.z }]),
    );
    this.drivePlayer(dt, input);
    p.slip = Math.abs(p.vx * Math.cos(p.angle) - p.vz * Math.sin(p.angle));
    this.motionSamples.push({ x: p.x, z: p.z, time: this.elapsed });
    while (
      this.motionSamples.length > 1 &&
      this.elapsed - this.motionSamples[0].time > 0.5
    )
      this.motionSamples.shift();
    const motion = this.motionSamples[0],
      motionSpan = this.elapsed - motion.time;
    p.netSpeed =
      motionSpan > 0
        ? Math.hypot(p.x - motion.x, p.z - motion.z) / motionSpan
        : 24;
    // Smoothed escape speed for V1.8 police role selection (a circling or
    // pinned player reads slow even if one 0.5 s sample looks fast).
    p.fleeSpeed =
      (p.fleeSpeed ?? CONFIG.playerSpeed) +
      (p.netSpeed - (p.fleeSpeed ?? CONFIG.playerSpeed)) *
        (1 - Math.exp(-dt / 1.2));
    this.cameraRig.update(p, dt);
    // (CITY CHAOS: the fleet follows the wanted level.)
    const desiredFleet = this.chaos
      ? Math.min(CONFIG.maxPolice, chaosFleet(this))
      : Math.min(CONFIG.maxPolice, 4 + Math.floor((this.elapsed + 1e-7) / 10));
    while (
      this.reinforcementsEnabled &&
      this.policeEnabled &&
      this.police.length < desiredFleet &&
      this.elapsed >= this.spawnRetryAt
    ) {
      const id = this.police.length,
        spawn = this.navigation.spawn(
          p,
          this.police,
          id,
          0,
          this.cameraRig.camera,
        );
      if (!spawn) {
        this.stats.spawnDeferrals++;
        this.spawnRetryAt = this.elapsed + 0.3;
        break;
      }
      const c = Object.assign(makePolice(id), spawn);
      c.spawnedAt = this.elapsed;
      // CITY CHAOS wanted 4-5: heavy police SUVs and an armored truck.
      const heavy = this.chaos && chaosNextPoliceKind(this);
      if (heavy) makeHeavyPolice(c, heavy);
      this.spawnEvents.push({
        time: this.elapsed,
        kind: "reinforcement",
        id,
        generation: 0,
        x: c.x,
        z: c.z,
        angle: c.angle,
        ...spawn.spawnProof,
      });
      this.police.push(c);
      previous.set(c, { x: c.x, z: c.z });
    }
    if (this.policeEnabled) {
      // (CITY CHAOS: roadblocks only from wanted level 3.)
      if (!this.chaos || this.chaos.level >= CHAOS.roadblockFrom || this.roadblock) updateRoadblock(this, dt);
      updateCordon(this, dt);
    }
    p.cordonActive = !!this.cordon;
    for (let i = 0; i < this.police.length; i++) {
      const c = this.police[i];
      if (c.state !== "active") {
        c.wreckAge += dt;
        if (
          c.wreckAge >= CONFIG.respawnSeconds &&
          this.elapsed >= (c.respawnRetryAt || 0)
        ) {
          const spawn = this.navigation.spawn(
            p,
            this.police,
            c.id,
            c.generation + 1,
            this.cameraRig.camera,
          );
          if (!spawn) {
            this.stats.spawnDeferrals++;
            c.respawnRetryAt = this.elapsed + 0.3;
            continue;
          }
          this.police[i] = Object.assign(
            makePolice(c.id, c.generation + 1),
            spawn,
          );
          // (CITY CHAOS: the replacement may be a heavy unit.)
          const heavy = this.chaos && chaosNextPoliceKind(this);
          if (heavy) makeHeavyPolice(this.police[i], heavy);
          this.police[i].spawnedAt = this.elapsed;
          this.spawnEvents.push({
            time: this.elapsed,
            kind: "respawn",
            respawnDelay: c.wreckAge,
            id: c.id,
            generation: c.generation + 1,
            x: spawn.x,
            z: spawn.z,
            angle: spawn.angle,
            ...spawn.spawnProof,
          });
          previous.set(this.police[i], {
            x: this.police[i].x,
            z: this.police[i].z,
          });
        }
        continue;
      }
      c.wallCooldown = Math.max(0, (c.wallCooldown || 0) - dt);
      c.pairCooldown = Math.max(0, (c.pairCooldown || 0) - dt);
      steerPolice(c, i, p, dt, this.navigation, this.police, this.elapsed);
      // Up a ramp only to chase the player onto the elevated road, or on a
      // route that runs over it.
      c.noRamp = !(p.level === 1 || c.route?.some((q) => q.level === 1));
      trafficBrake(c, this.police, p, dt);
      if (c.boostTimer > 0) this.stats.boostSeconds += dt;
      const policeHit = this.move(c, dt, CONFIG.policeRadius);
      updateJump(this, c, dt, 1.2);
      if (policeHit) {
        this.applyPoliceObstacleDamage(c, c.lastImpact);
        c.stuck += dt;
        c.routeTimer = 0;
        c.vx *= 0.75;
        c.vz *= 0.75;
      } else c.stuck = Math.max(0, c.stuck - dt * 0.5);
      if (c.stuck > 2.5) c.stuck = 0;
      // Boxed in for good away from the chase (wrecks all round it, say):
      // after 6 s without getting anywhere, and only while it is off
      // screen, the car is recalled and comes back in from a fresh spawn.
      const anchor = c.recallAnchor;
      if (
        c.blockState === "hold" ||
        Math.hypot(c.x - p.x, c.z - p.z) < 25 ||
        !anchor ||
        Math.hypot(c.x - anchor.x, c.z - anchor.z) > 1
      )
        c.recallAnchor = { x: c.x, z: c.z, at: this.elapsed };
      else if (this.elapsed - anchor.at > 6) {
        const view = spawnView(this.cameraRig.camera);
        const hidden = view && inspectSpawn(view, c, c.angle).outside;
        const spawn = hidden && this.navigation.spawn(p, this.police, c.id, c.generation + 1, this.cameraRig.camera);
        if (spawn) {
          this.police[i] = Object.assign(makePolice(c.id, c.generation + 1), spawn);
          if (c.heavy) makeHeavyPolice(this.police[i], c.heavy);
          this.police[i].spawnedAt = this.elapsed;
          this.stats.policeRecalls = (this.stats.policeRecalls || 0) + 1;
          this.spawnEvents.push({ time: this.elapsed, kind: "recall", ...spawn });
        } else c.recallAnchor = { x: c.x, z: c.z, at: this.elapsed - 5 };
      }
    }
    // Contacts use the same fixed simulation step as vehicle movement.
    for (let i = 0; i < this.police.length; i++)
      for (let j = 0; j < i; j++) {
        const a = this.police[i],
          b = this.police[j];
        if (!sameLevel(a, b)) continue;
        const speed = Math.hypot(a.vx - b.vx, a.vz - b.vz);
        const modes = [a.mode || "pursuit", b.mode || "pursuit"];
        const damage = collidePolice(a, b);
        if (damage > 0) {
          this.contactEvents.push({
            time: this.elapsed,
            a: a.id,
            b: b.id,
            x: (a.x + b.x) / 2,
            z: (a.z + b.z) / 2,
            relativeSpeed: speed,
            closingSpeed:
              a.lastCollisionStrength || b.lastCollisionStrength || 0,
            damage,
            modes,
          });
          this.stats.pairCollisions++;
          this.stats.pairDamage += damage * 2;
          if (damage >= CONFIG.policeHealth) this.stats.lethalPairCollisions++;
          this.recordImpact(a, a.lastCollisionStrength || speed, "police-pair");
        }
      }
    for (const c of this.police)
      if (c.state === "active" && c.health <= 0) this.explodePolice(c);
    this.resolvePlayerPolice();
    // TARGET HUNT: the fleeing car drives, and the player can ram it.
    if (this.target) {
      updateTarget(this, dt);
      if (this.target?.state === "fleeing") updateJump(this, this.target, dt, 1.1);
      resolveTargetContact(this);
    }
    for (const c of [p, ...this.police.filter((c) => c.state === "active")]) {
      if (c === p && p.recover) continue; // gliding out along a clear line
      const before = { x: c.x, z: c.z };
      const hit = this.constrain(
        c,
        c === p ? this.vehicle?.stats.radius || CONFIG.radius : CONFIG.policeRadius,
        previous.get(c),
      );
      if (hit && c !== p && c.state === "active") {
        const nx = c.x - before.x,
          nz = c.z - before.z,
          length = Math.hypot(nx, nz);
        if (length > 1e-8)
          this.applyPoliceObstacleDamage(
            c,
            Math.max(0, -(c.vx * nx + c.vz * nz) / length),
          );
      }
    }
    this.wedgePlayer(previous.get(p));
    // V2.1: never left inside a building. If all the pushing this step
    // still leaves the car overlapping one, it goes back to its last legal
    // spot (normally the previous frame).
    if (!p.recover && !p.level) {
      // (A barricade the car may pass (the mini by the cones, the monster
      // truck over it) does not count.)
      const inside = this.nearSolids(p.x, p.z, CONFIG.radius + 4).some((b) => !this.passesBarricade(p, b, false) && resolveBuilding({ x: p.x, z: p.z }, b, (this.vehicle?.stats.radius || CONFIG.radius) - 0.08));
      if (inside && p.lastLegal) {
        p.x = p.lastLegal.x;
        p.z = p.lastLegal.z;
        this.stats.overlapRestores = (this.stats.overlapRestores || 0) + 1;
      } else if (!inside) p.lastLegal = { x: p.x, z: p.z };
    }
    // V1.9: street props, pedestrians and traffic react to where the cars
    // ended up this step (props/traffic can still nudge them).
    if (this.city) updateCity(this, dt);
    for (const c of this.police)
      if (c.state === "active" && c.health <= 0) this.explodePolice(c);
    // Explosions damage, shove and set off what is around them (blast.js).
    updateBlasts(this);
    if (this.overpasses.length) updateOverpasses(this, dt);
    else updateFalling(this, dt);
    // Police helicopter (pursuit missions): spawns, follows, tracks.
    updateHelicopter(this, dt);
    // Coins and repair toolboxes the player drives through.
    updateCoins(this);
    updateRepairs(this);
    const groundSpeed =
      Math.hypot(p.x - this.previousPlayer.x, p.z - this.previousPlayer.z) / dt;
    p.groundSpeed = groundSpeed;
    const near = this.police.filter(
      (c) =>
        c.state === "active" &&
        sameLevel(c, p) &&
        Math.hypot(c.x - p.x, c.z - p.z) < (this.arrest > 0 ? 10.5 : 9.5),
    );
    const center = near.reduce(
      (a, c) => ({ x: a.x + c.x / near.length, z: a.z + c.z / near.length }),
      { x: 0, z: 0 },
    );
    const relative = {
      x: p.x - center.x,
      z: p.z - center.z,
      time: this.elapsed,
    };
    this.cordonSamples.push(relative);
    while (
      this.cordonSamples.length > 1 &&
      this.elapsed - this.cordonSamples[0].time > 0.5
    )
      this.cordonSamples.shift();
    const oldest = this.cordonSamples[0],
      span = this.elapsed - oldest.time;
    p.effectiveEscapeSpeed =
      span > 0
        ? Math.hypot(relative.x - oldest.x, relative.z - oldest.z) / span
        : 0;
    this.enclosureTimer -= dt;
    if (near.length < 2) {
      this.enclosure = {
        trapped: false,
        exits: 1,
        nearby: near.length,
        reason: "outside-cordon",
      };
      this.enclosureTimer = 0;
    } else if (
      this.enclosureTimer <= 0 ||
      this.enclosure.nearby !== near.length ||
      this.arrest >= CONFIG.arrestSeconds - 0.12
    ) {
      this.enclosure = inspectEnclosure(p, this.police, this.solids, (pose) =>
        this.navigation.allowed(pose),
      );
      // A real cordon also leaves no gap the player's car fits through in any
      // direction (walls count, moving police cars do not).
      if (this.enclosure.trapped && !cordonSealed(this))
        this.enclosure = {
          ...this.enclosure,
          trapped: false,
          reason: "escape-gap",
        };
      this.enclosureTimer = 0.15;
    }
    // V2.0: also arrested when police cars hold the car physically stuck
    // with no way out (pin.js), not only inside a complete parked cordon.
    updatePin(this, dt);
    // The geometric cordon check must be confirmed by a real escape probe:
    // a gap the car can actually steer out of is not an arrest.
    let cordon = this.enclosure.trapped && near.length >= 2;
    if (cordon) cordon = cordonVerdict(this) !== "escape";
    else clearCordonVerdict(this);
    const sealed = cordon || this.pin.trapped;
    this.captureOpenTime = sealed ? 0 : this.captureOpenTime + dt;
    const holding =
      sealed ||
      (this.arrest > 0 && near.length >= 2 && this.captureOpenTime < 0.35);
    p.contained = holding;
    p.captureProgress = this.arrest;
    p.cordonCandidate = near.length >= 2 && (p.netSpeed < 5 || holding);
    if (holding && p.cordonHeading === undefined) p.cordonHeading = p.angle;
    if (!holding && this.arrest === 0) p.cordonHeading = undefined;
    this.arrest = clamp(
      this.arrest + (sealed ? dt : holding ? 0 : -dt * 5),
      0,
      CONFIG.arrestSeconds,
    );
    // WRECKED (durability gone) or BUSTED (arrested), decided once.
    if (this.hp <= 0) {
      this.result = "destroyed";
      // The getaway car goes up (once: the result ends the run).
      this.events.push({ id: ++this.eventId, type: "explosion", cause: "player", byPlayerCar: true, x: p.x, z: p.z, angle: p.angle, time: this.elapsed, delay: 0, chainDepth: 0, playerX: p.x, playerZ: p.z });
      if (this.events.length > 64) this.events.shift();
    }
    else if (this.arrest >= CONFIG.arrestSeconds) this.result = "arrested";
    updateMission(this);
  }
}
