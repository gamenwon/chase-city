// Broken fire hydrants: a strong water jet shooting straight up from the
// broken pipe (well above a car), spray falling back round it, a splash
// ring and a wet patch on the pavement. Every jet keeps going until
// restart (city.jets). Stylized and cheap: four instanced meshes for all
// jets, the droplets placed analytically (no simulation), fewer of them
// far from the camera. Unlit, so it stays visible at night.
import * as THREE from "three";

const BASE = 0.36; // sidewalk top
const HEIGHT = 8.4; // jet height (a car is 1.5); casual pass: taller
const BURST = 1.45; // the first second overshoots (the main bursting)
const DROPS = 34; // per jet up close
const MAX_JETS = 40;

export class WaterJets {
  constructor(scene) {
    const inst = (geo, mat, n) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.count = 0;
      m.frustumCulled = false;
      m.visible = false; // no draw call until a hydrant breaks
      scene.add(m);
      return m;
    };
    // Column: a tapered open tube (wider at the top where it breaks up),
    // a brighter core inside it.
    const col = new THREE.CylinderGeometry(0.42, 0.16, 1, 8, 1, true);
    col.translate(0, 0.5, 0);
    this.columns = inst(col, new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }), MAX_JETS);
    const core = new THREE.CylinderGeometry(0.2, 0.09, 1, 6, 1, true);
    core.translate(0, 0.5, 0);
    this.cores = inst(core, new THREE.MeshBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: 0.85, depthWrite: false }), MAX_JETS);
    this.drops = inst(new THREE.IcosahedronGeometry(0.11, 0), new THREE.MeshBasicMaterial({ color: 0xd8f1ff }), MAX_JETS * DROPS);
    const ring = new THREE.RingGeometry(0.6, 1.0, 18);
    ring.rotateX(-Math.PI / 2);
    this.rings = inst(ring, new THREE.MeshBasicMaterial({ color: 0xe6f6ff, transparent: true, opacity: 0.55, depthWrite: false }), MAX_JETS * 2);
    const wet = new THREE.CircleGeometry(1, 16);
    wet.rotateX(-Math.PI / 2);
    this.wet = inst(wet, new THREE.MeshBasicMaterial({ color: 0x0e1c2c, transparent: true, opacity: 0.35, depthWrite: false }), MAX_JETS);
    // Casual pass: the water runs off into the road: a wet sheen spreading
    // over the asphalt (darker, with a pale glint), and mist puffs.
    this.road = inst(wet, new THREE.MeshBasicMaterial({ color: 0x0a1622, transparent: true, opacity: 0.32, depthWrite: false }), MAX_JETS);
    const glint = new THREE.RingGeometry(0.82, 1, 24);
    glint.rotateX(-Math.PI / 2);
    this.glint = inst(glint, new THREE.MeshBasicMaterial({ color: 0xcfeaff, transparent: true, opacity: 0.22, depthWrite: false }), MAX_JETS);
    this.mist = inst(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: 0xeaf7ff, transparent: true, opacity: 0.35, depthWrite: false }), MAX_JETS * 3);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.counts = { jets: 0, drops: 0 };
  }
  reset() {
    for (const m of [this.columns, this.cores, this.drops, this.rings, this.wet, this.road, this.glint, this.mist]) {
      m.count = 0;
      m.visible = false;
    }
  }
  update(city, now, camera) {
    const jets = city?.jets || [];
    if (!jets.length) {
      if (this.columns.visible) this.reset();
      return;
    }
    let nd = 0, nr = 0;
    const n = Math.min(jets.length, MAX_JETS);
    const cx = camera?.position.x ?? 0, cz = camera?.position.z ?? 0;
    for (let j = 0; j < n; j++) {
      const jet = jets[j];
      const age = now - jet.born;
      // Bursts up in the first moments, then holds with a pressure pulse.
      const rise = Math.min(1, age / 0.25);
      const burst = age < 1.2 ? 1 + (BURST - 1) * Math.sin(Math.min(1, age / 1.2) * Math.PI) : 1;
      const pulse = 1 + 0.06 * Math.sin(now * 13 + j) + 0.04 * Math.sin(now * 29 + j * 2);
      const h = HEIGHT * rise * pulse * burst;
      // The puddle spreads over the road for half a minute.
      const spread = 2.2 + Math.min(1, age / 30) * 4.6;
      this.m.compose(this.v.set(jet.x, 0.03, jet.z), this.q.identity(), this.s.set(spread, 1, spread * 0.85));
      this.road.setMatrixAt(j, this.m);
      this.m.compose(this.v.set(jet.x, 0.035, jet.z), this.q, this.s.set(spread * 0.92, 1, spread * 0.8));
      this.glint.setMatrixAt(j, this.m);
      for (let k = 0; k < 3; k++) {
        const ph = (now * 0.4 + k / 3 + j * 0.13) % 1;
        this.m.compose(this.v.set(jet.x + Math.sin(k * 2.1 + j) * (1 + ph * 1.5), BASE + h * (0.55 + 0.4 * ph), jet.z + Math.cos(k * 2.1 + j) * (1 + ph * 1.5)), this.q, this.s.setScalar(1.2 + ph * 1.8));
        this.mist.setMatrixAt(j * 3 + k, this.m);
      }
      this.q.identity();
      this.m.compose(this.v.set(jet.x, BASE, jet.z), this.q, this.s.set(1 + 0.08 * Math.sin(now * 17 + j), h, 1));
      this.columns.setMatrixAt(j, this.m);
      this.m.compose(this.v.set(jet.x, BASE, jet.z), this.q, this.s.set(1, h * 0.96, 1));
      this.cores.setMatrixAt(j, this.m);
      this.m.compose(this.v.set(jet.x, BASE + 0.02, jet.z), this.q, this.s.set(2.6, 1, 2.6));
      this.wet.setMatrixAt(j, this.m);
      // Spray falling back: fewer drops far away (but always some).
      const far = Math.hypot(jet.x - cx, jet.z - cz);
      const drops = far > 90 ? 6 : far > 55 ? 14 : DROPS;
      for (let k = 0; k < drops && nd < MAX_JETS * DROPS; k++) {
        const ph = (now * 0.75 + k / drops + j * 0.37) % 1;
        const a = k * 2.399 + j;
        const T = ph * 1.35;
        const r = (0.9 + (k % 5) * 0.35) * T;
        const y = BASE + h + 1.6 * T - 0.5 * 9.8 * T * T;
        if (y < BASE) continue;
        this.m.compose(this.v.set(jet.x + Math.cos(a) * r, y, jet.z + Math.sin(a) * r), this.q, this.s.setScalar(0.7 + (k % 3) * 0.35));
        this.drops.setMatrixAt(nd++, this.m);
      }
      // Two splash rings spreading where the water lands.
      for (let k = 0; k < 2; k++) {
        const ph = (now * 1.6 + k * 0.5 + j * 0.21) % 1;
        this.m.compose(this.v.set(jet.x, BASE + 0.04, jet.z), this.q, this.s.set(0.8 + ph * 2.0, 1, 0.8 + ph * 2.0));
        this.rings.setMatrixAt(nr++, this.m);
      }
    }
    this.columns.count = this.cores.count = this.wet.count = this.road.count = this.glint.count = n;
    this.mist.count = n * 3;
    this.drops.count = nd;
    this.rings.count = nr;
    for (const m of [this.columns, this.cores, this.drops, this.rings, this.wet, this.road, this.glint, this.mist]) {
      m.instanceMatrix.needsUpdate = true;
      m.visible = m.count > 0;
    }
    this.counts = { jets: n, drops: nd };
  }
}
