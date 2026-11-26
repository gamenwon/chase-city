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
  // Phones (either orientation) and desktop. The view keeps its angle
  // everywhere; desktop keeps its framing (fov 43). Phones (mobile test
  // build, after play on real phones):
  //   - about 28 % closer than before (cars look ~1.4x bigger)
  //   - landscape fov 48; portrait fov widens up to 64 and the camera moves
  //     back up to 15 % as the screen narrows (side view)
  //   - the view is shifted forward (8 m landscape, 12 m portrait) so the
  //     car sits a little below the middle of the screen, plus a small
  //     look-ahead along the car's motion
  //   - at the city edge the view stops instead of showing the empty
  //     ground beyond (bounds, set by the renderer)
  resize(width, height) {
    const aspect = width / height;
    this.phone = Math.min(width, height) < 600;
    this.mobile = this.phone || width < 700;
    this.portrait = aspect < 1;
    const t = this.mobile ? Math.min(1, Math.max(0, (1.2 - aspect) / 0.75)) : 0;
    this.distance = this.mobile ? 0.72 * (1 + 0.15 * t) : 1;
    this.shift = this.mobile ? 8 + 4 * t : 0;
    this.leadMax = this.mobile ? 3.5 : 0;
    this.camera.aspect = aspect;
    this.camera.fov = this.mobile ? 48 + 16 * t : 43;
    this.camera.updateProjectionMatrix();
    this.footprint = null;
  }
  // Ground the view covers around its look-at point (offsets in x and z
  // to the middle of each screen edge), for the edge stop.
  measureFootprint() {
    const d = this.distance, cam = this.camera;
    const pos = new THREE.Vector3(26 * d, 64 * d, 40 * d);
    const probe = new THREE.PerspectiveCamera(cam.fov, cam.aspect, 0.1, 400);
    probe.position.copy(pos);
    probe.lookAt(0, 0, 0);
    probe.updateMatrixWorld(true);
    const f = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
    const v = new THREE.Vector3();
    for (const [x, y] of [[0, 1], [0, -1], [-1, 0], [1, 0]]) {
      v.set(x, y, 0.5).unproject(probe).sub(pos);
      if (v.y >= -1e-6) continue;
      const k = -pos.y / v.y, gx = pos.x + v.x * k, gz = pos.z + v.z * k;
      f.minX = Math.min(f.minX, gx);
      f.maxX = Math.max(f.maxX, gx);
      f.minZ = Math.min(f.minZ, gz);
      f.maxZ = Math.max(f.maxZ, gz);
    }
    return f;
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
    if (!this.mobile) {
      this.camera.position.set(this.follow.x + 30, 60 + this.follow.y, this.follow.z + 40);
      this.camera.lookAt(this.follow.x, this.follow.y, this.follow.z - 6);
      this.camera.updateMatrixWorld(true);
      return;
    }
    // Phones: a short look-ahead along the car's motion.
    const sp = Math.hypot(player.vx || 0, player.vz || 0);
    const k = (Math.min(1, sp / 24) * this.leadMax) / (sp || 1);
    this.point.set((player.vx || 0) * k, 0, (player.vz || 0) * k);
    this.lead.lerp(this.point, dt ? 1 - Math.exp(-dt * 1.6) : 1);
    let fx = this.follow.x + this.lead.x, fz = this.follow.z + this.lead.z - this.shift;
    // Edge stop: keep the covered ground inside the city (a little of the
    // outskirts may show), never moving the view more than part of the
    // way from the car (it stays on screen).
    if (this.bounds) {
      const f = (this.footprint ||= this.measureFootprint()), B = this.bounds;
      // (The far edge, at the top of the screen, may show more of the
      // outskirts: it is small and hazy up there.)
      const clampAxis = (c, lo, hi, cap, farAllow = 0) => {
        let n = c;
        if (hi - lo <= 2 * B + farAllow) {
          if (c + lo < -B - farAllow) n = -B - farAllow - lo;
          if (c + hi > B) n = B - hi;
        } else n = 0;
        return Math.max(c - cap, Math.min(c + cap, n));
      };
      fx = clampAxis(fx, f.minX, f.maxX, (f.maxX - f.minX) * 0.2);
      fz = clampAxis(fz, f.minZ, f.maxZ, (f.maxZ - f.minZ) * 0.2, 28);
    }
    const d = this.distance;
    this.camera.position.set(fx + 26 * d, 64 * d + this.follow.y, fz + 40 * d);
    this.camera.lookAt(fx, this.follow.y, fz);
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
