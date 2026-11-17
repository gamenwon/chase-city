// V2.0 collect-mission items: a parcel with a soft light column so it reads
// from the chase camera, and the on-screen arrow to the nearest one.
import * as THREE from "three";

const MAX = 8;

export class PickupRenderer {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const box = new THREE.BoxGeometry(1.4, 1.1, 1.4);
    const tape = new THREE.BoxGeometry(1.45, 0.18, 1.45);
    const beam = new THREE.CylinderGeometry(1.6, 1.6, 9, 16, 1, true);
    const ring = new THREE.RingGeometry(2.4, 3.1, 32);
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0xf4b26b,
      roughness: 0.8,
    });
    const tapeMat = new THREE.MeshStandardMaterial({ color: 0xfff1cf });
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xffe08a,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xfff3b0,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    this.items = Array.from({ length: MAX }, () => {
      const g = new THREE.Group();
      const parcel = new THREE.Mesh(box, boxMat);
      parcel.position.y = 1.2;
      parcel.castShadow = true;
      parcel.add(new THREE.Mesh(tape, tapeMat));
      const b = new THREE.Mesh(beam, beamMat);
      b.position.y = 4.5;
      const r = new THREE.Mesh(ring, ringMat);
      r.rotation.x = -Math.PI / 2;
      r.position.y = 0.2;
      g.add(parcel, b, r);
      g.userData = { parcel, ring: r };
      g.visible = false;
      this.group.add(g);
      return g;
    });
    this.point = new THREE.Vector3();
    this.heroPoint = new THREE.Vector3();
    this.view = null;
  }
  update(sim, camera) {
    const list = sim.pickups || [];
    this.items.forEach((g, i) => {
      const item = list[i];
      g.visible = !!item && !item.taken;
      if (!g.visible) return;
      g.position.set(item.x, 0, item.z);
      g.userData.parcel.rotation.y = sim.elapsed * 1.6 + i;
      g.userData.parcel.position.y = 1.2 + 0.25 * Math.sin(sim.elapsed * 3 + i);
      g.userData.ring.scale.setScalar(1 + 0.08 * Math.sin(sim.elapsed * 4 + i));
    });
    // Arrow to the nearest parcel still out there.
    const p = sim.player;
    let best = null;
    for (const item of list)
      if (
        !item.taken &&
        (!best ||
          Math.hypot(item.x - p.x, item.z - p.z) <
            Math.hypot(best.x - p.x, best.z - p.z))
      )
        best = item;
    if (!best || !sim.started || sim.result) {
      this.view = null;
      return;
    }
    this.point.set(best.x, 1, best.z).project(camera);
    this.heroPoint.set(p.x, 1, p.z).project(camera);
    let dx = this.point.x - this.heroPoint.x,
      dy = this.point.y - this.heroPoint.y;
    if (this.point.z > 1) {
      dx = -dx;
      dy = -dy;
    }
    this.view = {
      angle: (Math.atan2(dx, dy) * 180) / Math.PI,
      distance: Math.hypot(best.x - p.x, best.z - p.z),
      name: "택배",
    };
  }
  reset() {
    this.view = null;
    for (const g of this.items) g.visible = false;
  }
}
