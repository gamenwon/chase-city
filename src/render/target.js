// TARGET HUNT: the target car on screen. The blue coin carrier (a giant
// gold coin on the roof; cartoon.js targetCar),
// a pulsing red marker above it and a ring on the road so it stays easy
// to spot in a busy street, smoke that thickens as its durability drops,
// a flash on every hit, and the takedown: it flips and lands on its roof
// (the persistent burning wreck is drawn by WreckRenderer). Also gives the
// on-screen arrow when the target is off screen (like the parcels).
import * as THREE from "three";
import { targetCar } from "./cartoon.js";
import { wreckPose } from "./wrecks.js";
import { CONFIG } from "../game/config.js";

export class TargetRenderer {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.car = targetCar();
    this.group.add(this.car);
    // Marker: an inverted pyramid bobbing over the roof, and a road ring.
    const markMat = new THREE.MeshBasicMaterial({ color: 0xff3048 });
    this.marker = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.3, 4), markMat);
    this.marker.rotation.x = Math.PI;
    this.group.add(this.marker);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.2, 28),
      new THREE.MeshBasicMaterial({ color: 0xff3048, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.16;
    this.group.add(this.ring);
    // Damage smoke and hit sparks (small fixed pools).
    const puff = new THREE.IcosahedronGeometry(1, 0);
    this.smokeMat = new THREE.MeshLambertMaterial({ color: 0x5a575c, flatShading: true });
    this.smoke = Array.from({ length: 10 }, (_, i) => {
      const m = new THREE.Mesh(puff, this.smokeMat);
      m.visible = false;
      scene.add(m);
      return { m, phase: i / 10 };
    });
    this.flash = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshBasicMaterial({ color: 0xfff1a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.flash.visible = false;
    scene.add(this.flash);
    this.lastEvent = 0;
    this.flashAt = -9;
    this.shake = 0;
    this.point = new THREE.Vector3();
    this.view = null;
  }
  // The material pass (pbr.js): the van in its detailed build (see-through
  // glass, interior, paint), or back to the flat one.
  setGfx(gfx) {
    const want = gfx?.on ? gfx : null;
    if (want === (this.gfx || null)) return;
    this.gfx = want;
    const old = this.car;
    this.car = want ? want.model(targetCar) : targetCar();
    this.car.position.copy(old.position);
    this.car.rotation.copy(old.rotation);
    this.car.visible = old.visible;
    this.group.remove(old);
    this.group.add(this.car);
  }
  reset() {
    this.group.visible = false;
    this.lastEvent = 0;
    this.flashAt = -9;
    for (const s of this.smoke) s.m.visible = false;
    this.flash.visible = false;
    this.view = null;
  }
  update(sim, camera, kick) {
    const t = sim.target;
    if (!t) {
      if (this.group.visible) this.reset();
      return;
    }
    const now = sim.elapsed;
    // New hits: a flash at the contact point, the car shakes, the camera
    // gets a kick that follows how hard it was.
    for (const e of sim.events) {
      if (e.id <= this.lastEvent || e.type !== "targetHit") continue;
      this.lastEvent = e.id;
      this.flashAt = now;
      this.flash.position.set(e.x, 1.1, e.z);
      this.flashSize = 0.8 + Math.min(2.2, e.strength * 0.12);
      this.shake = Math.min(1, e.strength / 14);
      kick?.(Math.min(0.5, 0.1 + e.strength / 40));
    }
    const ft = now - this.flashAt;
    this.flash.visible = ft < 0.18;
    if (this.flash.visible) {
      this.flash.scale.setScalar(this.flashSize * (0.6 + ft * 4));
      this.flash.material.opacity = 1 - ft / 0.18;
    }
    this.shake *= 0.85;
    this.group.visible = true;
    this.group.position.set(t.x, t.y || 0, t.z);
    const wrecked = t.state === "wrecked";
    if (wrecked) {
      // Crash: thrown up, flipped onto its roof (then WreckRenderer's wreck
      // takes over in the same pose).
      const age = now - t.wreckedAt;
      const pose = wreckPose(age);
      this.car.position.y = pose.y;
      this.car.rotation.set(pose.pitch, t.angle, pose.roll);
      this.car.visible = age < CONFIG.wreckSeconds;
      this.marker.visible = this.ring.visible = false;
    } else {
      const sway = this.shake * Math.sin(now * 60) * 0.08;
      this.car.position.y = 0;
      this.car.rotation.set(0, t.angle + sway, sway * 0.6);
      this.car.visible = true;
      this.marker.visible = this.ring.visible = true;
      this.marker.position.y = 4.9 + 0.25 * Math.sin(now * 4); // (above the roof coin)
      this.marker.rotation.y = now * 2.2;
      // The roof coin turns slowly (it catches the light from every side).
      if (this.car.userData.coin) this.car.userData.coin.rotation.y = now * 1.6;
      const pulse = 1 + 0.1 * Math.sin(now * 6);
      this.ring.scale.setScalar(pulse);
    }
    // Smoke from the bonnet as it gets damaged (grey, then black).
    const damage = 1 - t.health / 100;
    const n = wrecked ? 0 : Math.round(Math.max(0, damage - 0.25) * 13);
    this.smokeMat.color.setHex(damage > 0.7 ? 0x2a282c : 0x6a676c);
    const fx = -Math.sin(t.angle), fz = -Math.cos(t.angle);
    this.smoke.forEach((s, i) => {
      s.m.visible = i < n;
      if (!s.m.visible) return;
      const ph = (now * 0.9 + s.phase) % 1;
      s.m.position.set(t.x + fx * 1.4 + ph * 1.2, 1.2 + ph * 3.2, t.z + fz * 1.4 + ph * 0.6);
      s.m.scale.setScalar((0.25 + ph * 0.9) * (1 - ph * 0.6));
    });
    // Arrow to the target when it is off screen (or far).
    if (!sim.started || sim.result || wrecked) {
      this.view = null;
      return;
    }
    this.point.set(t.x, 1, t.z).project(camera);
    const onScreen = Math.abs(this.point.x) < 0.85 && Math.abs(this.point.y) < 0.85 && this.point.z < 1;
    const p = sim.player;
    const distance = Math.hypot(t.x - p.x, t.z - p.z);
    if (onScreen && distance < 70) {
      this.view = null;
      return;
    }
    // Screen-space direction (behind the camera: flip).
    let x = this.point.x, y = this.point.y;
    if (this.point.z > 1) {
      x = -x;
      y = -y;
    }
    this.view = { angle: (Math.atan2(x, y) * 180) / Math.PI, distance, name: "TARGET" };
  }
}
