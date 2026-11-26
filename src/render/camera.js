import * as THREE from "three";
import { segmentHitsBuilding } from "./occlusion.js";
export class ChaseCamera {
  constructor(width = 1100, height = 740) {
    this.camera = new THREE.PerspectiveCamera(43, width / height, 0.1, 350);
    this.follow = new THREE.Vector3(0, 0, 8);
    this.lead = new THREE.Vector3();
    this.point = new THREE.Vector3();
    this.resize(width, height);
  }
  // Phones (either orientation) and desktop. The view keeps its angle; on
  // a phone the field of view and the distance follow the screen shape so
  // a portrait screen still sees enough road to the sides and ahead:
  //   desktop             fov 43, distance as before
  //   phone, landscape    fov 48 (as before)
  //   phone, portrait     fov up to 64 and up to 15 % further back as the
  //                       screen gets narrower, plus a look-ahead along
  //                       the car's motion (see update)
  resize(width, height) {
    const aspect = width / height;
    this.phone = Math.min(width, height) < 600;
    this.mobile = this.phone || width < 700;
    this.portrait = aspect < 1;
    const t = this.mobile ? Math.min(1, Math.max(0, (1.2 - aspect) / 0.75)) : 0;
    this.distance = 1 + 0.15 * t;
    // Look-ahead (m) at full speed: more where the view is narrow.
    this.leadMax = !this.mobile ? 0 : 5 + 3 * t;
    this.camera.aspect = aspect;
    this.camera.fov = this.mobile ? 48 + 16 * t : 43;
    this.camera.updateProjectionMatrix();
  }
  reset() {
    this.follow.set(0, 0, 8);
    this.lead.set(0, 0, 0);
    this.shake = 0;
  }
  // V1.8 crash shake. It is only added around the actual draw call (see
  // withShake), so spawning/visibility maths never see a shaken camera.
  kick(amount) {
    this.shake = Math.min(1.1, (this.shake || 0) + amount);
  }
  withShake(dt, time, draw) {
    this.shake = (this.shake || 0) * Math.exp(-dt * 5);
    if (this.shake < 0.01) return draw();
    const s = this.shake,
      offset = this.point.set(
        Math.sin(time * 53) * s,
        Math.sin(time * 41) * s * 0.6,
        Math.cos(time * 47) * s,
      ),
      x = offset.x,
      y = offset.y,
      z = offset.z;
    this.camera.position.x += x;
    this.camera.position.y += y;
    this.camera.position.z += z;
    this.camera.updateMatrixWorld(true);
    try {
      return draw();
    } finally {
      this.camera.position.x -= x;
      this.camera.position.y -= y;
      this.camera.position.z -= z;
      this.camera.updateMatrixWorld(true);
    }
  }
  update(player, dt) {
    // (V2.1: rises with the car on an overpass.)
    this.follow.lerp(
      this.point.set(player.x, player.y || 0, player.z),
      1 - Math.exp(-dt * 5),
    );
    // Look ahead along the car's motion (phones): the car sits back from
    // the centre, leaving more of the road in front of it on screen.
    if (this.leadMax) {
      const k = Math.min(1, Math.hypot(player.vx || 0, player.vz || 0) / 24) * this.leadMax;
      const sp = Math.hypot(player.vx || 0, player.vz || 0) || 1;
      this.point.set(((player.vx || 0) / sp) * k, 0, ((player.vz || 0) / sp) * k);
      this.lead.lerp(this.point, dt ? 1 - Math.exp(-dt * 1.6) : 1);
    } else this.lead.set(0, 0, 0);
    const d = this.distance || 1, fx = this.follow.x + this.lead.x, fz = this.follow.z + this.lead.z;
    this.camera.position.set(
      fx + (this.mobile ? 26 : 30) * d,
      (this.mobile ? 64 : 60) * d + this.follow.y,
      fz + 40 * d,
    );
    this.camera.lookAt(fx, this.follow.y, fz - 6);
    this.camera.updateMatrixWorld(true);
  }
  visible(point, entries, player = null) {
    const target = { x: point.x, y: point.y ?? 1.1, z: point.z };
    const ndc = this.point
      .set(target.x, target.y, target.z)
      .project(this.camera);
    if (
      Math.abs(ndc.x) > 0.98 ||
      Math.abs(ndc.y) > 0.98 ||
      ndc.z < -1 ||
      ndc.z > 1
    )
      return false;
    return !entries.some((entry) => {
      const bounds = entry.bounds || entry;
      if (entry.opacity !== undefined && entry.opacity < 0.6) return false;
      if (
        player &&
        entry.opacity === undefined &&
        segmentHitsBuilding(
          this.camera.position,
          { x: player.x, y: 1, z: player.z },
          bounds,
        )
      )
        return false;
      return (
        segmentHitsBuilding(
          this.camera.position,
          target,
          bounds,
          entry.visualBounds,
        ) &&
        (!entry.intersects || entry.intersects(this.camera.position, target))
      );
    });
  }
}
