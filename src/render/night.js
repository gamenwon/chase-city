// Night: cheap light, no dynamic lights. Everything here is a few
// instanced, unlit (or additive) meshes that are only drawn at night:
//   - warm light pools on the ground under every standing street lamp and
//     park lamp, and a glowing bulb in each lamp head;
//   - lit windows: every shopfront, and a mix of upper-floor windows
//     (hidden with their building when it fades for the camera);
//   - headlight beams and lamp dots on the player, the police, the hunted
//     target and civilian traffic.
// Signs glow by using their own texture as an emissive map (scene.js).
import * as THREE from "three";

export const NIGHT = Object.freeze({
  sky: 0x142247, // background and fog
  hemiSky: 0x86a0e6,
  hemiGround: 0x2a3456,
  hemi: 1.15,
  moon: 0xa4b8ff,
  moonIntensity: 1.4,
  exposure: 1.1,
});

// A soft round falloff (white centre to clear edge), drawn once.
function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.35, "rgba(255,255,255,0.55)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const hash = (a, b) => {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

// Window rectangles of a game building (the same layout as kit.js
// buildingGroup): { x, y, z, ry, w, h, lit } in world space.
export function buildingWindows(b, outward) {
  const base = 0.4, GF = 3.4, FH = 3.0;
  const floors = Math.max(0, Math.floor((b.h - GF - 0.6) / FH));
  const seed = Math.abs(Math.round(b.x * 7 + b.z * 13 + b.h * 3));
  const sf = b.street;
  const faces = [
    { ry: 0, span: b.w, half: b.d / 2, street: sf ? sf[0] : outward[1] > 0 },
    { ry: Math.PI, span: b.w, half: b.d / 2, street: sf ? sf[1] : outward[1] < 0 },
    { ry: Math.PI / 2, span: b.d, half: b.w / 2, street: sf ? sf[2] : outward[0] > 0 },
    { ry: -Math.PI / 2, span: b.d, half: b.w / 2, street: sf ? sf[3] : outward[0] < 0 },
  ];
  const out = [];
  faces.forEach((f, k) => {
    const c = Math.cos(f.ry), s = Math.sin(f.ry);
    const at = (lx, y, w, h, kind) => {
      const lz = f.half + 0.06;
      out.push({ x: b.x + lx * c + lz * s, y, z: b.z - lx * s + lz * c, ry: f.ry, w, h, kind });
    };
    if (f.street) at(-0.3, base + 0.5 + 1.1, f.span - 1.3, 2.1, "shop");
    else for (const wx of [-f.span / 4, f.span / 4]) if (hash(seed + k, wx) < 0.5) at(wx, base + 2.0, 0.95, 1.15, "low");
    for (let fl = 0; fl < floors; fl++) {
      const y = base + GF + 0.22 + fl * FH + FH * 0.5 - 0.7;
      for (const wx of [-f.span / 4, f.span / 4]) if (hash(seed * 3 + fl, k * 5 + wx) < 0.42) at(wx, y, 0.95, 1.35, "upper");
    }
  });
  return out;
}

export class NightLights {
  constructor(scene, layout) {
    this.on = false;
    const tex = glowTexture();
    const flat = new THREE.PlaneGeometry(1, 1);
    flat.rotateX(-Math.PI / 2);
    const additive = (color, opacity = 1) =>
      new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    const inst = (geo, mat, n) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.count = 0;
      m.frustumCulled = false;
      m.visible = false;
      m.renderOrder = 1;
      scene.add(m);
      return m;
    };
    // Lamps.
    this.pools = inst(flat, additive(0xffb85a, 0.7), 320);
    this.bulbs = inst(new THREE.IcosahedronGeometry(0.32, 0), new THREE.MeshBasicMaterial({ color: 0xfff1c4 }), 320);
    this.halos = inst(new THREE.PlaneGeometry(1, 1), additive(0xffd08a, 0.7), 320);
    // Vehicles.
    this.beams = inst(flat, additive(0xfff2c8, 0.55), 64);
    this.dots = inst(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshBasicMaterial({ color: 0xfffbe8 }), 128);
    this.tails = inst(new THREE.IcosahedronGeometry(0.13, 0), new THREE.MeshBasicMaterial({ color: 0xff3a30 }), 128);
    this.scene = scene;
    this.buildWindows(layout);
    this.lampKey = "";
    this.lampAt = -1;
  }
  // V2.1: a new city's windows.
  setLayout(layout) {
    this.scene.remove(this.windows);
    this.windows.geometry.dispose();
    this.windows.material.dispose();
    this.buildWindows(layout);
    this.windows.visible = this.on;
  }
  buildWindows(layout) {
    // Windows: built once; one instance range per building.
    const wins = [];
    this.ranges = [];
    this.layoutBuildings = layout.buildings || [];
    for (const b of layout.buildings || []) {
      const cx = Math.round((b.x - 15) / 30) * 30 + 15, cz = Math.round((b.z - 15) / 30) * 30 + 15; // (b.street wins when set)
      const list = buildingWindows(b, [Math.sign(b.x - cx), Math.sign(b.z - cz)]);
      this.ranges.push({ start: wins.length, count: list.length, hidden: false });
      wins.push(...list);
    }
    this.winList = wins;
    this.windows = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), Math.max(1, wins.length));
    this.windows.frustumCulled = false;
    this.windows.visible = false;
    this.windows.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, wins.length) * 3), 3);
    this.scene.add(this.windows);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.e = new THREE.Euler();
    this.c = new THREE.Color();
    const warm = [0xffd27a, 0xffc35c, 0xffe3a6, 0xcfe2ff];
    wins.forEach((w, i) => {
      this.placeWindow(i, w, 1);
      this.c.setHex(w.kind === "shop" ? 0xffe0a0 : warm[Math.floor(hash(w.x, w.z) * warm.length)]);
      this.windows.setColorAt(i, this.c);
    });
    this.windows.count = wins.length;
  }
  // V2.1: a broken low-rise building's windows go dark for good.
  hideBuilding(i) {
    const r = this.ranges[i];
    if (!r || r.gone) return;
    r.gone = true;
    for (let k = r.start; k < r.start + r.count; k++) this.placeWindow(k, this.winList[k], 0);
    this.windows.instanceMatrix.needsUpdate = true;
  }
  // Casual pass: a smashed shopfront's lit window goes dark.
  hideShopWindow(b, ry) {
    const i = this.layoutBuildings?.indexOf(b);
    const r = this.ranges[i];
    if (!r) return;
    for (let k = r.start; k < r.start + r.count; k++) {
      const w = this.winList[k];
      if (w.kind === "shop" && Math.abs(w.ry - ry) < 1e-3) {
        w.out = true;
        this.placeWindow(k, w, 0);
      }
    }
    this.windows.instanceMatrix.needsUpdate = true;
  }
  placeWindow(i, w, scale) {
    if (w.out) scale = 0;
    this.q.setFromAxisAngle(this.v.set(0, 1, 0), w.ry);
    this.m.compose(this.v.set(w.x, w.y, w.z), this.q, this.s.set(w.w * scale, w.h * scale, 1));
    this.windows.setMatrixAt(i, this.m);
  }
  setOn(on) {
    this.on = on;
    for (const m of [this.pools, this.bulbs, this.halos, this.beams, this.dots, this.tails, this.windows]) m.visible = on;
  }
  // extraLamps: [{ x, z, y }] lamp heads from elsewhere (preview parks).
  update(sim, buildingEntries, camera, extraLamps = null) {
    if (!this.on) return;
    // Lamps: rebuilt twice a second (they can be knocked down).
    if (sim.elapsed - this.lampAt > 0.5 || sim.elapsed < this.lampAt) {
      this.lampAt = sim.elapsed;
      const heads = [];
      for (const q of sim.city?.props || [])
        if (q.kind === "lamp" && q.state === "stand") heads.push({ x: q.x + Math.sin(q.angle || 0) * 1.1, z: q.z + Math.cos(q.angle || 0) * 1.1, y: 4.3 });
      for (const l of extraLamps?.() || []) heads.push(l);
      let n = 0;
      for (const h of heads) {
        if (n >= 320) break;
        this.m.compose(this.v.set(h.x, 0.2 + (h.ground || 0), h.z), this.q.identity(), this.s.set(10, 1, 10));
        this.pools.setMatrixAt(n, this.m);
        this.m.compose(this.v.set(h.x, h.y - 0.08, h.z), this.q.identity(), this.s.set(1, 0.45, 1));
        this.bulbs.setMatrixAt(n, this.m);
        n++;
      }
      this.pools.count = this.bulbs.count = n;
      this.pools.instanceMatrix.needsUpdate = this.bulbs.instanceMatrix.needsUpdate = true;
      this.heads = heads.slice(0, n);
    }
    // Halos face the camera.
    if (this.heads && camera) {
      this.q.copy(camera.quaternion);
      this.heads.forEach((h, i) => {
        this.m.compose(this.v.set(h.x, h.y - 0.1, h.z), this.q, this.s.set(2.2, 2.2, 1));
        this.halos.setMatrixAt(i, this.m);
      });
      this.halos.count = this.heads.length;
      this.halos.instanceMatrix.needsUpdate = true;
    }
    // Vehicles: a beam on the road ahead, two head lamps, two tail lamps.
    const cars = [sim.player];
    for (const c of sim.police) if (c.state === "active") cars.push(c);
    if (sim.target?.state === "fleeing") cars.push(sim.target);
    for (const t of sim.city?.traffic || []) if (t.state !== "wreck" && !t.parked) cars.push(t);
    let nb = 0, nd = 0;
    for (const car of cars) {
      if (nb >= 64) break;
      const fx = -Math.sin(car.angle), fz = -Math.cos(car.angle), rx = Math.cos(car.angle), rz = -Math.sin(car.angle);
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), car.angle);
      this.m.compose(this.v.set(car.x + fx * 6.5, 0.22, car.z + fz * 6.5), this.q, this.s.set(4.6, 1, 10));
      this.beams.setMatrixAt(nb++, this.m);
      for (const side of [-1, 1]) {
        this.m.compose(this.v.set(car.x + fx * 2.15 + rx * side * 0.68, 0.62, car.z + fz * 2.15 + rz * side * 0.68), this.q, this.s.set(1, 0.7, 0.5));
        this.dots.setMatrixAt(nd, this.m);
        this.m.compose(this.v.set(car.x - fx * 2.15 + rx * side * 0.7, 0.7, car.z - fz * 2.15 + rz * side * 0.7), this.q, this.s.set(1.2, 0.6, 0.5));
        this.tails.setMatrixAt(nd, this.m);
        nd++;
      }
    }
    this.beams.count = nb;
    this.dots.count = this.tails.count = nd;
    for (const m of [this.beams, this.dots, this.tails]) m.instanceMatrix.needsUpdate = true;
    // Windows go with their building when it fades for the camera.
    let changed = false;
    this.ranges.forEach((r, i) => {
      const hide = (buildingEntries?.[i]?.opacity ?? 1) < 0.99 || !!r.gone;
      if (hide === r.hidden) return;
      r.hidden = hide;
      changed = true;
      for (let k = r.start; k < r.start + r.count; k++) this.placeWindow(k, this.winList[k], hide ? 0 : 1);
    });
    if (changed) this.windows.instanceMatrix.needsUpdate = true;
  }
}
