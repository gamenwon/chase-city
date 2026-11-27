import * as THREE from "three";
import { MINI_GAP } from "../game/barricades.js";
export class RoadEventsRenderer {
  constructor(scene) {
    this.scene = scene;
    this.geometries = new Map();
    this.materials = new Map();
    this.barriers = Array.from({ length: 5 }, () => this.barrier());
    this.exitId = null;
    this.gate = new THREE.Group();
    scene.add(this.gate);
    this.gate.visible = false;
    this.box(this.gate, 0, -0.7, 33, 40, 1, 82, 0x116748);
    this.box(this.gate, 0, 0.06, 33, 16, 0.3, 66, 0x8b9b76);
    this.box(this.gate, 0, 0.25, 33, 11, 0.08, 66, 0x23373e);
    for (let z = 3; z <= 60; z += 6) {
      this.box(this.gate, -4.8, 0.31, z, 0.16, 0.03, 3, 0xf8eab6);
      this.box(this.gate, 4.8, 0.31, z, 0.16, 0.03, 3, 0xf8eab6);
      this.box(this.gate, 0, 0.31, z, 0.15, 0.03, 2, 0xe7efd4);
    }
    for (const x of [-7.5, 7.5]) {
      this.box(this.gate, x, 3.4, 50, 0.6, 6.8, 0.6, 0x31ff48);
      this.box(this.gate, x, 1, 50, 1.2, 2, 1.2, 0x104d28);
    }
    this.box(this.gate, 0, 6.9, 50, 15.6, 0.7, 0.7, 0x31ff48);
    const beamMaterial = new THREE.MeshBasicMaterial({
      color: 0x32ff5a,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(3.5, 3.5, 45, 8, 1, true),
      beamMaterial,
    );
    this.beam.position.set(0, 23, 50);
    this.gate.add(this.beam);
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(4.5, 0.15, 5, 32),
      new THREE.MeshBasicMaterial({ color: 0x6dff66 }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.set(0, 0.36, 50);
    this.gate.add(this.ring);
    this.point = new THREE.Vector3();
    this.heroPoint = new THREE.Vector3();
    this.view = null;
  }
  box(parent, x, y, z, w, h, d, color) {
    const key = `${w},${h},${d}`;
    if (!this.geometries.has(key))
      this.geometries.set(key, new THREE.BoxGeometry(w, h, d));
    if (!this.materials.has(color))
      this.materials.set(
        color,
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.8,
          emissive: color === 0x31ff48 ? 0x0c7a19 : 0x000000,
        }),
      );
    const mesh = new THREE.Mesh(
      this.geometries.get(key),
      this.materials.get(color),
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = h > 0.4;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  barrier() {
    const group = new THREE.Group();
    this.scene.add(group);
    group.visible = false;
    this.box(group, 0, 0.65, 0, 11.2, 1.1, 1.2, 0xffd500);
    for (let x = -5; x <= 5; x += 0.85) {
      for (const z of [-0.62, 0.62]) {
        const stripe = this.box(group, x, 0.85, z, 0.33, 0.95, 0.06, 0x101820);
        stripe.rotation.z = -0.4;
      }
    }
    for (const x of [-5, 5]) {
      this.box(group, x, 0.18, 0, 0.7, 0.3, 1.5, 0x23373e);
      this.box(group, x, 1.4, 0, 0.3, 0.4, 0.3, 0xff2e20);
    }
    return group;
  }
  // Traffic cones over the pavement parts of a barricade (beyond the
  // carriageway): the gap a small car can slip through.
  cone() {
    const g = new THREE.Group();
    this.box(g, 0, 0.03, 0, 0.5, 0.06, 0.5, 0x23373e);
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.62, 8), new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6 }));
    c.material.userData.noWeather = true; // (no snow on the cones)
    c.position.y = 0.37;
    g.add(c);
    this.box(g, 0, 0.42, 0, 0.3, 0.08, 0.3, 0xf4f4f0);
    g.scale.setScalar(1.6); // (readable from the chase camera)
    this.scene.add(g);
    return g;
  }
  update(sim, camera) {
    this.barriers.forEach((group) => (group.visible = false));
    this.cones ||= [];
    let nc = 0;
    for (const b of sim.barricades) {
      const group = this.barriers[b.id - 1];
      group.visible = true;
      // The heavy barrier across the carriageway only.
      const road = b.road || b;
      group.position.set(b.vertical ? road.x : b.x, 0, b.vertical ? b.z : road.z);
      group.rotation.y = b.vertical ? 0 : Math.PI / 2;
      // (The outer lanes are left to cones: the mini's way past.)
      group.scale.x = b.roadHalf ? Math.max(0.3, ((b.roadHalf - MINI_GAP) * 2) / 11.2) : 1;
      if (!b.roadHalf) continue;
      const span = (b.vertical ? b.w : b.d) / 2, c0 = b.vertical ? b.x : b.z, r0 = b.vertical ? road.x : road.z;
      for (const side of [-1, 1])
        for (let o = b.roadHalf - MINI_GAP + 0.6; o < 30; o += 1.3) {
          const at = r0 + side * o;
          if (Math.abs(at - c0) > span - 0.2) break;
          const cone = (this.cones[nc++] ||= this.cone());
          cone.visible = true;
          cone.position.set(b.vertical ? at : b.x, 0, b.vertical ? b.z : at);
        }
    }
    for (let i = nc; i < this.cones.length; i++) this.cones[i].visible = false;
    const open = sim.escape.phase !== "locked";
    this.gate.visible = open;
    if (open) {
      const exit = sim.escape.exit;
      if (exit.id !== this.exitId) {
        this.exitId = exit.id;
        this.gate.position.set(exit.anchor.x, 0, exit.anchor.z);
        this.gate.rotation.y = Math.atan2(exit.dx, exit.dz);
      }
      this.beam.material.opacity = 0.17 + 0.06 * Math.sin(sim.elapsed * 3);
      this.ring.scale.setScalar(1 + 0.05 * Math.sin(sim.elapsed * 4));
      this.point.set(exit.x, 1, exit.z).project(camera);
      this.heroPoint.set(sim.player.x, 1, sim.player.z).project(camera);
      let dx = this.point.x - this.heroPoint.x,
        dy = this.point.y - this.heroPoint.y;
      if (this.point.z > 1) {
        dx = -dx;
        dy = -dy;
      }
      this.view = {
        angle: (Math.atan2(dx, dy) * 180) / Math.PI,
        distance: Math.hypot(exit.x - sim.player.x, exit.z - sim.player.z),
        name: exit.name,
      };
    } else this.view = null;
  }
  reset() {
    this.exitId = null;
    this.gate.visible = false;
    this.view = null;
    this.barriers.forEach((group) => (group.visible = false));
    for (const c of this.cones || []) c.visible = false;
  }
}
