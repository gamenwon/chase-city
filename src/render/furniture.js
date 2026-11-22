// Loose breakable street furniture in the main game (generated cities):
// the same pieces and physics as the location previews (preview/
// locations/furniture.js FlyerSystem: café tables, chairs and parasols,
// market stalls and fruit crates, sandwich boards, goods racks, flower
// pots, news boxes, vendor carts, shopping carts, signs, buckets...). The
// generator places them (layout.flyers); cars knock them flying or smash
// them (and drive on: never solid), blasts throw them, and every piece
// stays where it lands for the rest of the run. All of them are one
// batched mesh.
import { CONFIG } from "../game/config.js";
import { PropBatch, PropInstances } from "../preview/locations/batch.js";
import { FlyerSystem } from "../preview/locations/furniture.js";

export class StreetFurniture {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.flyers = null;
    this.speeds = new WeakMap();
  }
  setLayout(layout) {
    this.dispose();
    const specs = layout.flyers || [];
    if (!specs.length) return;
    const multi = !!this.renderer?.extensions?.has?.("WEBGL_multi_draw");
    this.batch = multi ? new PropBatch(this.scene) : new PropInstances(this.scene);
    this.flyers = new FlyerSystem(this.batch, specs, {
      // A piece never comes to rest inside a building or a wall.
      outside: (it) => {
        const sim = this.sim;
        if (!sim) return;
        for (const b of sim.nearSolids(it.x, it.z, 1)) {
          const px = b.w / 2 + 0.3 - Math.abs(it.x - b.x), pz = b.d / 2 + 0.3 - Math.abs(it.z - b.z);
          if (px <= 0 || pz <= 0) continue;
          if (px < pz) it.x += Math.sign(it.x - b.x || 1) * px;
          else it.z += Math.sign(it.z - b.z || 1) * pz;
        }
      },
    });
    this.layout = layout;
    this.run = null;
  }
  dispose() {
    if (!this.batch) return;
    const meshes = this.batch.mesh ? [this.batch.mesh] : (this.batch.models || []).flatMap((m) => [...m.groups.values()].map((g) => g.mesh).filter(Boolean));
    for (const m of meshes) {
      this.scene.remove(m);
      m.dispose?.();
    }
    this.batch = null;
    this.flyers = null;
  }
  // After every simulation step: cars on the ground knock what they touch.
  step(sim, dt) {
    if (!this.flyers) return;
    this.sim = sim;
    if (this.run !== sim.runNumber) {
      // Same city again (fixed seed): back to how it was placed.
      if (this.run != null) this.flyers.reset();
      this.run = sim.runNumber;
    }
    const cars = [sim.player, ...sim.police.filter((c) => c.state === "active")];
    if (sim.target?.state === "fleeing") cars.push(sim.target);
    for (const car of cars) {
      if (car.level) continue; // up on the elevated road
      const sp = Math.hypot(car.vx || 0, car.vz || 0);
      const before = this.speeds.get(car) ?? sp;
      this.speeds.set(car, sp);
      this.flyers.touch(sim, car, car === sim.player ? CONFIG.radius : CONFIG.policeRadius, Math.max(sp, before));
    }
    this.flyers.update(sim, dt);
  }
  // Explosions throw everything near them (blast.js listener).
  blast(sim, e, R, s) {
    if (!this.flyers) return;
    for (const it of this.flyers.items) {
      if (it.state === "fly" || it.hidden || it.hits >= 3) continue;
      const dx = it.x - e.x, dz = it.z - e.z, d = Math.hypot(dx, dz);
      if (d >= R || d < 1e-6) continue;
      const sp = 20 * (1 - d / R) * Math.sqrt(s);
      if (sp < 3) continue;
      this.flyers.launch(sim, it, { vx: (dx / d) * sp, vz: (dz / d) * sp }, sp, dx / d, dz / d);
    }
  }
}
