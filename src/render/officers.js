import * as THREE from "three";

// V1.8 dismounted officers: small low-poly figures in the game's flat style
// (navy uniform, cap, two-handed pistol stance). They walk out from the cars,
// aim at the player and, for the scanning officers, sweep their aim round
// the surroundings. Pooled; positions come from sim.officers.
const COLORS = {
  uniform: 0x1d3a5f,
  trousers: 0x14263d,
  skin: 0xe8b98a,
  cap: 0x0f1d2e,
  badge: 0xffd120,
  gun: 0x101418,
  boots: 0x0b0f14,
};

export class OfficerRenderer {
  constructor(scene) {
    this.scene = scene;
    this.box = new THREE.BoxGeometry(1, 1, 1);
    this.materials = Object.fromEntries(
      Object.entries(COLORS).map(([k, color]) => [
        k,
        new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
      ]),
    );
    this.pool = [];
    this.active = new Map();
  }
  createFigure() {
    const g = new THREE.Group();
    const part = (w, h, d, x, y, z, mat) => {
      const m = new THREE.Mesh(this.box, this.materials[mat]);
      m.scale.set(w, h, d);
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    // Legs pivot at the hip so they can swing while walking.
    const leg = (x) => {
      const hip = new THREE.Group();
      hip.position.set(x, 0.78, 0);
      const thigh = new THREE.Mesh(this.box, this.materials.trousers);
      thigh.scale.set(0.2, 0.7, 0.24);
      thigh.position.y = -0.35;
      const boot = new THREE.Mesh(this.box, this.materials.boots);
      boot.scale.set(0.22, 0.12, 0.32);
      boot.position.set(0, -0.72, -0.04);
      hip.add(thigh, boot);
      g.add(hip);
      return hip;
    };
    const legs = [leg(-0.13), leg(0.13)];
    part(0.5, 0.6, 0.3, 0, 1.08, 0, "uniform"); // torso
    part(0.1, 0.1, 0.02, -0.12, 1.22, -0.16, "badge");
    part(0.26, 0.26, 0.26, 0, 1.53, 0, "skin"); // head
    part(0.32, 0.08, 0.34, 0, 1.69, -0.03, "cap");
    part(0.3, 0.03, 0.14, 0, 1.66, -0.2, "cap"); // peak
    // Both arms forward in a two-handed aim, pistol at the hands.
    const arms = new THREE.Group();
    arms.position.set(0, 1.28, 0);
    for (const x of [-0.2, 0.2]) {
      const arm = new THREE.Mesh(this.box, this.materials.uniform);
      arm.scale.set(0.14, 0.14, 0.55);
      arm.position.set(x * 0.6, -0.04, -0.3);
      arm.rotation.y = -x * 0.5;
      arms.add(arm);
    }
    const hands = new THREE.Mesh(this.box, this.materials.skin);
    hands.scale.set(0.16, 0.12, 0.12);
    hands.position.set(0, -0.05, -0.6);
    const gun = new THREE.Mesh(this.box, this.materials.gun);
    gun.scale.set(0.07, 0.11, 0.3);
    gun.position.set(0, 0.02, -0.76);
    arms.add(hands, gun);
    g.add(arms);
    g.scale.setScalar(0.95);
    return { group: g, legs, arms };
  }
  update(sim, time) {
    const seen = new Set();
    for (const o of sim.officers) {
      seen.add(o.id);
      let fig = this.active.get(o.id);
      if (!fig) {
        fig = this.pool.pop() || this.createFigure();
        this.active.set(o.id, fig);
        this.scene.add(fig.group);
      }
      fig.group.visible = o.t >= o.delay;
      fig.group.position.set(o.x, 0.12, o.z);
      fig.group.rotation.y = o.angle;
      // Walking: legs swing and the gun is held low; in position: legs
      // planted and arms up in the aim.
      const swing = o.walking ? Math.sin(time * 11 + o.id) * 0.6 : 0;
      fig.legs[0].rotation.x = swing;
      fig.legs[1].rotation.x = -swing;
      fig.arms.rotation.x = o.walking ? 0.6 : 0;
    }
    for (const [id, fig] of this.active)
      if (!seen.has(id)) {
        this.scene.remove(fig.group);
        this.active.delete(id);
        this.pool.push(fig);
      }
  }
  reset() {
    for (const fig of this.active.values()) {
      this.scene.remove(fig.group);
      this.pool.push(fig);
    }
    this.active.clear();
  }
}
