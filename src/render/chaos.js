// CITY CHAOS in the scene: the parcel drop-off (a blue ring with a soft
// light column and a bobbing arrow, only while parcels are carried, with a
// burst when they are delivered), and the screen-edge markers for what is
// off screen (target red, drop-off blue, nearest parcel orange, nearest
// repair green when the car is hurt). The markers are plain data for the
// HUD (ui/interface.js draws them); nothing here runs outside CITY CHAOS.
import * as THREE from "three";

const COLORS = { target: "#ff4b5c", delivery: "#3aa0ff", parcel: "#ffb347", repair: "#4cd964" };

export class ChaosRenderer {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    const blue = 0x3aa0ff;
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(5.6, 7, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: blue, transparent: true, opacity: 0.7, depthWrite: false }),
    );
    this.ring.position.y = 0.15;
    this.disc = new THREE.Mesh(
      new THREE.CircleGeometry(5.6, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: blue, transparent: true, opacity: 0.16, depthWrite: false }),
    );
    this.disc.position.y = 0.12;
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 14, 20, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x7cc4ff, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.beam.position.y = 7;
    // A downward arrow over it.
    const arrow = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.7), mat);
    shaft.position.y = 1.1;
    const head = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.3, 4), mat);
    head.rotation.x = Math.PI;
    arrow.add(shaft, head);
    this.arrow = arrow;
    this.group.add(this.ring, this.disc, this.beam, arrow);
    // Delivered: an expanding ring.
    this.burst = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x9fd4ff, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.burst.visible = false;
    scene.add(this.burst);
    this.burstAt = -9;
    this.lastEvent = 0;
    this.v = new THREE.Vector3();
    this.h = new THREE.Vector3();
    this.marks = [];
  }
  reset() {
    this.group.visible = false;
    this.burst.visible = false;
    this.burstAt = -9;
    this.lastEvent = 0;
    this.marks = [];
  }
  update(sim, camera) {
    const c = sim.chaos;
    if (!c) {
      if (this.group.visible || this.marks.length) this.reset();
      return;
    }
    const now = sim.elapsed;
    const d = c.carried > 0 ? c.delivery : null;
    this.group.visible = !!d;
    if (d) {
      this.group.position.set(d.x, 0, d.z);
      this.arrow.position.y = 5.2 + Math.sin(now * 3) * 0.5;
      this.arrow.rotation.y = now * 1.5;
      this.ring.scale.setScalar(1 + 0.06 * Math.sin(now * 5));
    }
    for (const e of sim.events) {
      if (e.id <= this.lastEvent) continue;
      this.lastEvent = e.id;
      if (e.type === "delivery") {
        this.burstAt = now;
        this.burst.position.set(e.x, 0.2, e.z);
      }
    }
    const age = now - this.burstAt;
    this.burst.visible = age >= 0 && age < 0.8;
    if (this.burst.visible) {
      this.burst.scale.setScalar(2 + age * 18);
      this.burst.material.opacity = 0.9 * (1 - age / 0.8);
    }
    this.marks = sim.started && !sim.result ? this.markers(sim, camera) : [];
  }
  // Screen-edge markers for what is off screen.
  markers(sim, camera) {
    const p = sim.player, c = sim.chaos, out = [];
    const near = (list) => {
      let best = null, bd = Infinity;
      for (const q of list) {
        const dd = Math.hypot(q.x - p.x, q.z - p.z);
        if (dd < bd) (bd = dd), (best = q);
      }
      return best;
    };
    const t = sim.target;
    if (t && t.state !== "wrecked") out.push({ kind: "target", x: t.x, z: t.z });
    if (c.carried > 0 && c.delivery) out.push({ kind: "delivery", x: c.delivery.x, z: c.delivery.z });
    const parcel = near(sim.pickups.filter((q) => !q.taken));
    if (parcel) out.push({ kind: "parcel", x: parcel.x, z: parcel.z });
    if ((sim.health ?? 100) <= 60) {
      const r = near((sim.repairs || []).filter((q) => !q.taken));
      if (r) out.push({ kind: "repair", x: r.x, z: r.z });
    }
    this.h.set(p.x, 1, p.z).project(camera);
    const marks = [];
    for (const m of out) {
      this.v.set(m.x, 1, m.z).project(camera);
      const behind = this.v.z > 1;
      const onScreen = !behind && Math.abs(this.v.x) < 0.9 && Math.abs(this.v.y) < 0.85;
      if (onScreen) continue;
      let x = this.v.x - this.h.x, y = this.v.y - this.h.y;
      if (behind) (x = -x), (y = -y);
      const k = 1 / Math.max(Math.abs(x) / 0.9, Math.abs(y) / 0.8, 1e-6);
      marks.push({
        kind: m.kind,
        color: COLORS[m.kind],
        // Screen position (0..1, from the top left) on the edge, and the
        // arrow's direction.
        sx: 0.5 + (this.h.x + x * k) * 0.5,
        sy: 0.5 - (this.h.y + y * k) * 0.5,
        angle: (Math.atan2(x, y) * 180) / Math.PI,
        distance: Math.round(Math.hypot(m.x - p.x, m.z - p.z)),
      });
    }
    return marks;
  }
}
