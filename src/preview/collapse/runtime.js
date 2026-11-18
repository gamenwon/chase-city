// Scripted tower collapse (prototype). One designated tower; a special-
// mission trigger (the detonator pad at its foot) starts a 3 s warning,
// then a pre-authored collapse plays out over ~4.3 s:
//   0.0-2.1  the tower shakes, charges pop at the base, windows burst
//   1.4-2.1  floors 2-5 crush flat (pancake), the upper part drops
//   2.0-3.8  the middle section tips north and settles on the rubble
//   2.6-4.25 the crown breaks off, swings over and falls onto the road
//   4.25     impact: dust clouds, debris, police and props react,
//            the rubble becomes solid (one road segment closed)
// Swaps between intact and broken pieces happen inside dust. Effects come
// from small pools (instanced: one draw call each); settled debris stops
// updating. Everything resets when the run restarts.
import * as THREE from "three";
import { CONFIG } from "../../game/config.js";
import { C, B, pieceGeometry, pieceMesh, bakedMaterial } from "../locations/parts.js";
import { TOWER, RUBBLE } from "./layout.js";
import * as T from "./tower.js";

const TOP = 0.4;
const WARN = 3;
const IMPACT = 4.25;
const X = new THREE.Vector3(1, 0, 0);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

export class CollapseRuntime {
  constructor(scene, sim, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    const root = (this.root = new THREE.Group());
    root.position.set(TOWER.x, 0, TOWER.z);
    scene.add(root);
    const at = (mesh, x, y, z) => (mesh.position.set(x, y, z), root.add(mesh), mesh);
    this.A = at(pieceMesh(T.sectionA), 0, TOP, 0);
    this.stump = at(pieceMesh(T.stumpA), 0, TOP, 0);
    this.B = at(pieceMesh(T.sectionB), 0, TOP + 6, 0);
    this.pile = at(pieceMesh(T.pile), 0, TOP, 0);
    // C and D hang from pivots on their north bottom edges (they tip north).
    this.Cp = new THREE.Group();
    root.add(this.Cp);
    this.C = pieceMesh(T.sectionC);
    this.C.position.z = 6.5;
    this.Cp.add(this.C);
    this.Dp = new THREE.Group();
    root.add(this.Dp);
    this.D = pieceMesh(T.sectionD);
    this.D.position.z = 4.7;
    this.Dp.add(this.D);
    this.wreck = at(pieceMesh(T.crownWreck), 0, 0.1, -9.5);
    const padMesh = pieceMesh(T.pad);
    padMesh.position.set(TOWER.pad.x, 0.36, TOWER.pad.z);
    scene.add(padMesh);
    // Beacon over the pad: a tall pulsing light column.
    const beamGeo = new THREE.CylinderGeometry(0.9, 1.4, 40, 8, 1, true);
    beamGeo.translate(0, 20, 0);
    this.beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
    this.beam.position.set(TOWER.pad.x, 0.4, TOWER.pad.z);
    scene.add(this.beam);
    // Pools.
    const ico = new THREE.IcosahedronGeometry(1, 0);
    this.dust = new THREE.InstancedMesh(ico, new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.82, depthWrite: false }), 110);
    this.dust.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(110 * 3), 3);
    // Lingering haze: the same puffs, much fainter.
    this.haze = new THREE.InstancedMesh(ico, new THREE.MeshLambertMaterial({ color: 0xd9cfbf, transparent: true, opacity: 0.28, depthWrite: false }), 12);
    this.flash = new THREE.InstancedMesh(ico, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false }), 24);
    this.flash.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(24 * 3), 3);
    const chunkGeo = pieceGeometry((g) => {
      B(g, 1.6, 1.1, 0.35, 0x1f8fb3, 0, -0.55, 0);
      B(g, 0.8, 0.6, 0.03, 0x9fdcf0, 0, -0.35, 0.19);
      B(g, 1.7, 0.14, 0.4, C.white, 0, 0.42, 0);
    });
    const slabGeo = pieceGeometry((g) => B(g, 1.4, 0.3, 1.0, 0xbdb7ae, 0, -0.15, 0));
    const shardGeo = new THREE.BoxGeometry(0.35, 0.03, 0.25);
    this.pieces = [
      new THREE.InstancedMesh(chunkGeo, bakedMaterial, 40),
      new THREE.InstancedMesh(slabGeo, bakedMaterial, 40),
      new THREE.InstancedMesh(shardGeo, new THREE.MeshStandardMaterial({ color: 0x9fdcf0, roughness: 0.2, flatShading: true }), 50),
    ];
    for (const m of [this.dust, this.haze, this.flash, ...this.pieces]) {
      m.frustumCulled = false;
      m.count = 0;
      m.visible = false;
      scene.add(m);
    }
    this.pieces.forEach((m) => (m.castShadow = true));
    this.dustColors = [0xd9cfbf, 0xc4b8a6, 0xe6ded2, 0xb3a896].map((c) => new THREE.Color(c));
    this.fireColors = [0xff6a1a, 0xffe14a, 0xe8401c].map((c) => new THREE.Color(c));
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.e = new THREE.Euler();
    this.baseSolids = sim.staticSolids.slice();
    this.hud = document.createElement("div");
    this.hud.id = "collapse-hud";
    Object.assign(this.hud.style, {
      position: "fixed", left: "50%", top: "calc(max(10px, env(safe-area-inset-top)) + 96px)", transform: "translateX(-50%)",
      zIndex: 6, pointerEvents: "none", padding: "8px 14px", borderRadius: "6px", background: "#232227e6", color: "#ffe14a",
      font: "800 13px/1.4 'Noto Sans KR', system-ui, sans-serif", textAlign: "center", maxWidth: "calc(100vw - 32px)",
    });
    if (Math.min(innerWidth, innerHeight) < 600 || innerWidth < 640)
      Object.assign(this.hud.style, { top: "calc(max(10px, env(safe-area-inset-top)) + 200px)", font: "800 11px/1.35 'Noto Sans KR', system-ui, sans-serif", padding: "5px 9px" });
    document.body.appendChild(this.hud);
    this.stats = { triggered: 0, policeWrecked: 0, policeShoved: 0, propsDown: 0, pedsMoved: 0 };
    this.reset(sim);
  }

  reset(sim) {
    this.run = sim.runNumber;
    this.state = "armed";
    this.t0 = 0;
    this.impactDone = false;
    this.puffs = [];
    this.flashes = [];
    this.flying = [];
    this.counts = [0, 0, 0];
    this.onceKeys = new Set();
    this.pieces.forEach((m) => ((m.count = 0), (m.visible = false)));
    this.A.visible = this.B.visible = this.C.visible = this.D.visible = true;
    this.stump.visible = this.pile.visible = this.wreck.visible = false;
    this.root.position.set(TOWER.x, 0, TOWER.z);
    this.B.scale.y = 1;
    this.pose(0);
    this.beam.visible = true;
    sim.staticSolids.length = 0;
    sim.staticSolids.push(...this.baseSolids);
    sim.refreshNavigation();
    for (const k in this.stats) this.stats[k] = 0;
    this.setHud("특수 미션 · 동쪽 노란 빛기둥의 기폭 패드를 밟아 타워를 무너뜨리세요");
  }
  setHud(text) {
    if (this.hudText !== text) this.hud.textContent = this.hudText = text;
  }

  // After each simulation step.
  step(sim) {
    if (sim.runNumber !== this.run) this.reset(sim);
    const p = sim.player, now = sim.elapsed;
    if (this.state === "armed") {
      if (Math.hypot(p.x - TOWER.pad.x, p.z - TOWER.pad.z) < TOWER.pad.r + 0.6) {
        this.state = "warning";
        this.t0 = now;
        this.stats.triggered++;
        this.beam.visible = false;
      }
      return;
    }
    const t = now - this.t0 - WARN;
    // Pedestrians near the tower run away from the moment the alarm goes.
    if (t < IMPACT + 6) this.clearPedestrians(sim);
    if (this.state === "warning" && t >= 0) this.state = "collapsing";
    if (this.state === "collapsing" && t >= IMPACT && !this.impactDone) {
      this.impactDone = true;
      this.impact(sim);
      this.state = "collapsed";
    }
  }
  clearPedestrians(sim) {
    for (const q of sim.city?.pedestrians || []) {
      const dx = q.x - TOWER.x, dz = q.z - (TOWER.z - 8), d = Math.hypot(dx, dz);
      if (d > 40 || q.state === "flee") continue;
      q.state = "flee";
      q.fleeX = dx / (d || 1);
      q.fleeZ = dz / (d || 1);
      q.timer = 5;
      this.stats.pedsMoved++;
    }
  }
  impact(sim) {
    // The rubble becomes solid: the tower's footprint stays, the crown
    // closes the road segment to the north. Anything inside is moved out.
    sim.staticSolids.length = 0;
    sim.staticSolids.push(...this.baseSolids.filter((b) => b.kind !== "tower"), ...RUBBLE);
    const road = RUBBLE[1];
    const inside = (b, r) => Math.abs(b.x - road.x) < road.w / 2 + r && Math.abs(b.z - road.z) < road.d / 2 + r;
    const pushOut = (b, r) => {
      const dx = b.x - road.x, dz = b.z - road.z;
      const px = road.w / 2 + r - Math.abs(dx), pz = road.d / 2 + r - Math.abs(dz);
      if (px < pz) b.x += Math.sign(dx || 1) * (px + 0.05);
      else b.z += Math.sign(dz || 1) * (pz + 0.05);
    };
    const p = sim.player;
    if (inside(p, CONFIG.radius)) {
      sim.damage(20);
      pushOut(p, CONFIG.radius);
    }
    // Police: under the falling crown or right at the tower -> wrecked;
    // within 30 m -> shoved away by the blast of air and dust, damaged.
    const cx = TOWER.x, cz = TOWER.z - 12;
    for (const c of sim.police) {
      if (c.state !== "active") continue;
      const under = inside(c, CONFIG.policeRadius) || (Math.abs(c.x - TOWER.x) < 8 && Math.abs(c.z - TOWER.z) < 8);
      if (under) {
        c.lastDamageCause = "collapse";
        sim.explodePolice(c);
        this.stats.policeWrecked++;
        continue;
      }
      const dx = c.x - cx, dz = c.z - cz, d = Math.hypot(dx, dz);
      if (d < 30) {
        const k = 1 - d / 30;
        c.health = Math.max(1, c.health - 35 * k);
        c.vx += (dx / d) * 14 * k;
        c.vz += (dz / d) * 14 * k;
        this.stats.policeShoved++;
      }
    }
    for (const c of sim.city?.traffic || []) if (inside(c, 1.0)) pushOut(c, 1.0);
    // Street furniture round the impact falls away from it.
    for (const q of sim.city?.props || []) {
      if (q.state !== "stand" || q.kind === "bigTree") continue;
      const dx = q.x - cx, dz = q.z - cz, d = Math.hypot(dx, dz);
      if (d > 20) continue;
      q.fallDir = Math.atan2(dx, dz);
      if (q.kind === "trash") {
        q.state = "tumble";
        q.vx = (dx / d) * 6;
        q.vz = (dz / d) * 6;
        q.vy = 3;
      } else {
        q.state = "falling";
        q.fall = 0;
      }
      q.dirty = true;
      sim.city.moving.add(q);
      this.stats.propsDown++;
    }
    sim.refreshNavigation();
    this.renderer?.cameraRig?.kick?.(1.0);
  }

  // ---------------------------------------------------------- per frame --
  render(dt, sim) {
    if (sim.runNumber !== this.run) this.reset(sim);
    const now = sim.elapsed;
    if (this.state === "armed") {
      this.beam.material.opacity = 0.2 + Math.sin(now * 4) * 0.08;
      this.effects(dt, now);
      return;
    }
    const t = now - this.t0 - WARN;
    if (t < 0) {
      this.setHud(`철거 경보! ${Math.ceil(-t)}… 타워에서 멀어지세요`);
      // Warning: lights flash, the tower creaks a little.
      const j = 0.02 * Math.sin(now * 40);
      this.root.position.set(TOWER.x + j, 0, TOWER.z);
    } else if (t < IMPACT + 2) {
      this.setHud("붕괴!");
      this.collapse(t, now);
    } else {
      this.setHud("타워 붕괴 · 북쪽 도로 한 구간 막힘 — 다른 길로");
      this.pose(IMPACT + 3);
    }
    this.effects(dt, now);
  }
  pose(t) {
    // Pre-authored stage curves (see the header).
    const k = clamp01((t - 1.4) / 0.7);
    const crush = k * k * 0.78;
    this.B.scale.y = 1 - crush;
    const drop = 12 * crush;
    const settle = 2.2 * clamp01((t - 2.1) / 1.5) ** 2;
    const a = 0.6 * clamp01((t - 2.0) / 1.8) ** 2;
    this.Cp.position.set(0, TOP + 18 - drop - settle, -6.5);
    this.Cp.rotation.x = -a;
    // D rides on C's roof until it breaks off, swings, then falls.
    const att = new THREE.Vector3(0, 9, 1.8).applyAxisAngle(X, -a).add(this.Cp.position);
    const b = (Math.PI / 2 - a - 0.12) * clamp01((t - 2.6) / 1.1) ** 2;
    const f = clamp01((t - 3.5) / (IMPACT - 3.5)) ** 2;
    this.Dp.position.set(0, att.y + (1.2 - att.y) * f, att.z + (-9.5 - att.z) * f);
    this.Dp.rotation.x = -(a + b);
    const done = t >= 2.1;
    this.B.visible = !done;
    this.pile.visible = done;
    this.A.visible = !done;
    this.stump.visible = done;
    this.D.visible = t < IMPACT;
    this.wreck.visible = t >= IMPACT;
  }
  collapse(t, now) {
    const shake = t < 2.1 ? 0.04 + 0.22 * (t / 2.1) : t < IMPACT ? 0.08 : 0;
    this.root.position.set(TOWER.x + Math.sin(now * 47) * shake, 0, TOWER.z + Math.cos(now * 39) * shake);
    this.pose(t);
    // One-shot stage effects.
    const at = (time, key, fn) => {
      if (t >= time && !this.onceKeys.has(key)) {
        this.onceKeys.add(key);
        fn();
      }
    };
    const X0 = TOWER.x, Z0 = TOWER.z;
    at(0, "charges", () => {
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        this.flashAt(X0 + sx * 6.7, TOP + 1.2, Z0 + sz * 6.7, 1.6);
        for (let i = 0; i < 2; i++) this.puff(X0 + sx * 7.5, TOP + 1, Z0 + sz * 7.5, 1.2, 3.2, 2.0, sx * 1.5, 1.2, sz * 1.5);
      }
      this.renderer?.cameraRig?.kick?.(0.35);
    });
    at(0.7, "charges2", () => {
      for (const [sx, sz] of [[-1, 0], [1, 0], [0, 1], [0, -1]]) this.flashAt(X0 + sx * 6.7, TOP + 7.5, Z0 + sz * 6.7, 1.2);
    });
    at(0.5, "glass", () => {
      for (let i = 0; i < 46; i++) {
        const face = i % 4, a = (face * Math.PI) / 2, u = (Math.random() - 0.5) * 11;
        const nx = Math.sin(a), nz = Math.cos(a);
        this.throwPiece(2, X0 + nx * 6.8 + nz * u, TOP + 4 + Math.random() * 26, Z0 + nz * 6.8 - nx * u, nx * (3 + Math.random() * 4), 1 + Math.random() * 2, nz * (3 + Math.random() * 4));
      }
    });
    at(1.5, "crushDust", () => {
      // A ring of dust bursts out at the crushed floors.
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        this.puff(X0 + Math.sin(a) * 7, TOP + 5 + Math.random() * 3, Z0 + Math.cos(a) * 7, 1.6, 4.5, 3.0, Math.sin(a) * 5, 0.6, Math.cos(a) * 5);
      }
      for (let i = 0; i < 10; i++) this.throwPiece(i % 2, X0 + (Math.random() - 0.5) * 12, TOP + 8, Z0 + (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 10, 3 + Math.random() * 4, (Math.random() - 0.5) * 10);
      this.renderer?.cameraRig?.kick?.(0.55);
    });
    at(2.1, "pileDust", () => {
      for (let i = 0; i < 10; i++) this.puff(X0 + (Math.random() - 0.5) * 14, TOP + 2 + Math.random() * 6, Z0 + (Math.random() - 0.5) * 14, 2.5, 5.5, 3.5, 0, 1.2, 0);
    });
    at(2.7, "breakDust", () => {
      for (let i = 0; i < 8; i++) this.puff(X0 + (Math.random() - 0.5) * 10, TOP + 14 + Math.random() * 2, Z0 - 6 + (Math.random() - 0.5) * 3, 1.2, 3.5, 2.2, (Math.random() - 0.5) * 3, 0.5, -1);
      for (let i = 0; i < 8; i++) this.throwPiece(0, X0 + (Math.random() - 0.5) * 9, TOP + 15, Z0 - 6, (Math.random() - 0.5) * 6, 2, -3 - Math.random() * 4);
    });
    at(IMPACT, "impactFx", () => {
      // The crown hits the road: a long wall of dust rolls out both ways.
      const rz = TOWER.z - 15.9;
      for (let i = 0; i < 30; i++) {
        const u = (Math.random() - 0.5) * 16, w = (Math.random() - 0.5) * 12;
        const dirx = Math.sign(u || 1), dirz = Math.sign(w || 1);
        this.puff(X0 + u, TOP + 0.8 + Math.random() * 2, rz + w, 2.0, 7.0, 4.5, dirx * (3 + Math.random() * 6), 0.8 + Math.random(), dirz * (2 + Math.random() * 5));
      }
      for (let i = 0; i < 26; i++) this.throwPiece(i % 2, X0 + (Math.random() - 0.5) * 9, TOP + 2, rz + (Math.random() - 0.5) * 11, (Math.random() - 0.5) * 16, 4 + Math.random() * 6, (Math.random() - 0.5) * 16);
      // A lingering haze over the site.
      for (let i = 0; i < 8; i++) this.puff(X0 + (Math.random() - 0.5) * 18, TOP + 4 + i, Z0 - 8 + (Math.random() - 0.5) * 18, 5, 9, 8, 0, 0.3, 0, true);
    });
  }
  flashAt(x, y, z, r) {
    this.flashes.push({ x, y, z, r, born: performance.now() / 1000 });
  }
  puff(x, y, z, r0, r1, life, vx = 0, vy = 1, vz = 0, haze = false) {
    if (this.puffs.length >= 120) this.puffs.shift();
    this.puffs.push({ x, y, z, r0, r1, life, vx, vy, vz, age: 0, c: Math.floor(Math.random() * 4), haze });
  }
  throwPiece(kind, x, y, z, vx, vy, vz) {
    if (this.counts[kind] >= (kind === 2 ? 50 : 40)) return;
    const index = this.counts[kind]++;
    this.pieces[kind].count = this.counts[kind];
    this.pieces[kind].visible = true;
    this.flying.push({ kind, index, x, y, z, vx, vy, vz, rx: Math.random() * 3, ry: Math.random() * 6, spin: 3 + Math.random() * 8, done: false });
  }
  effects(dt, now) {
    // Dust: grows, drifts, slows, fades (scale to nothing).
    let n = 0, h = 0;
    const keep = [];
    for (const p of this.puffs) {
      p.age += dt;
      if (p.age >= p.life) continue;
      keep.push(p);
      const k = p.age / p.life, drag = Math.exp(-dt * 1.4);
      p.vx *= drag;
      p.vz *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      const r = (p.r0 + (p.r1 - p.r0) * Math.sqrt(k)) * (k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1);
      this.m.compose(this.v.set(p.x, p.y, p.z), this.q.setFromEuler(this.e.set(0, p.c * 1.3 + k, 0)), this.s.set(r, r * 0.8, r));
      if (p.haze) {
        if (h < 12) this.haze.setMatrixAt(h++, this.m);
        continue;
      }
      this.dust.setMatrixAt(n, this.m);
      this.dust.setColorAt(n++, this.dustColors[p.c]);
    }
    this.puffs = keep;
    this.haze.count = h;
    this.haze.visible = h > 0;
    if (h) this.haze.instanceMatrix.needsUpdate = true;
    this.dust.count = n;
    this.dust.visible = n > 0;
    if (n) {
      this.dust.instanceMatrix.needsUpdate = true;
      this.dust.instanceColor.needsUpdate = true;
    }
    // Flashes (charges going off): 0.35 s.
    const wall = performance.now() / 1000;
    let f = 0;
    this.flashes = this.flashes.filter((x) => wall - x.born < 0.35);
    for (const x of this.flashes) {
      const k = (wall - x.born) / 0.35;
      for (let i = 0; i < 2; i++) {
        const r = x.r * (0.6 + k) * (i ? 0.6 : 1);
        this.m.compose(this.v.set(x.x, x.y, x.z), this.q.identity(), this.s.setScalar(r * (1 - k * 0.5)));
        this.flash.setMatrixAt(f, this.m);
        this.flash.setColorAt(f++, this.fireColors[i]);
      }
    }
    this.flash.count = f;
    this.flash.visible = f > 0;
    if (f) {
      this.flash.instanceMatrix.needsUpdate = true;
      this.flash.instanceColor.needsUpdate = true;
    }
    // Debris: flies, lands, freezes (no more updates once down).
    const touched = new Set();
    for (const c of this.flying) {
      if (c.done) continue;
      c.vy -= 16 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.z += c.vz * dt;
      c.rx += c.spin * dt;
      if (c.y <= TOP + 0.05) {
        c.y = TOP + 0.05;
        c.rx = Math.round(c.rx / Math.PI) * Math.PI;
        c.done = true;
      }
      this.m.compose(this.v.set(c.x, c.y, c.z), this.q.setFromEuler(this.e.set(c.rx, c.ry, 0)), this.s.set(1, 1, 1));
      this.pieces[c.kind].setMatrixAt(c.index, this.m);
      touched.add(c.kind);
    }
    for (const k of touched) this.pieces[k].instanceMatrix.needsUpdate = true;
  }
}
