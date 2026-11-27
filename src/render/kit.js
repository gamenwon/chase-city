// Art kit for the game (approved direction: angular low-poly, vivid
// colours; see docs/art-direction-v3.md and art-district.html). Builds the
// player car, the police car, civilian cars, buildings and park furniture
// from parts, with sharp edges and flat shading. Rendering only: sizes are
// chosen to sit inside the existing collision shapes, which are unchanged.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const K = {
  sky: 0xa9c0d6,
  asphalt: 0x37363b,
  lineWhite: 0xf4f4f0,
  lineYellow: 0xf2b705,
  walk: 0xbdbab3,
  walkJoint: 0xa8a49c,
  curb: 0xd9d6cf,
  grass: 0x43a047,
  grassStripe: 0x4caa50,
  pave: 0xcbbfa8,
  paveEdge: 0x8f8778,
  leaf: [0x2e8b3e, 0x3da04a, 0x5cb23a],
  trunk: 0x7a4a2a,
  stone: 0xe6dccb,
  cream: 0xefe3c8,
  glass: 0x8fd0e8,
  glassDark: 0x22303f,
  white: 0xf4f4f0,
  metal: 0x55535c,
  chrome: 0xc9ccd3,
  rubber: 0x1f1e22,
  trim: 0x2a292e,
  well: 0x161519,
  seam: 0x1b1a1e,
  red: 0xd62f2a,
  blue: 0x2457c5,
  yellow: 0xf5c01a,
  green: 0x2fa36b,
  orange: 0xf0781e,
  brick: 0xb84a2e,
  teal: 0x1f6e6a,
  amber: 0xe8a33a,
  player: 0xe0367a,
};

const mats = new Map();
export function mat(color, opts = {}) {
  const key = `${color}|${JSON.stringify(opts)}`;
  if (!mats.has(key))
    mats.set(
      key,
      new THREE.MeshStandardMaterial({ color, roughness: 0.82, flatShading: true, ...opts }),
    );
  return mats.get(key);
}
export function add(p, geo, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(geo, mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  p.add(m);
  return m;
}
const boxes = new Map();
const boxGeo = (w, h, d) => {
  const k = `${w}|${h}|${d}`;
  if (!boxes.has(k)) boxes.set(k, new THREE.BoxGeometry(w, h, d));
  return boxes.get(k);
};
// Box by base centre (x, z) and bottom y.
export const B = (p, w, h, d, c, x = 0, y = 0, z = 0, ry = 0, o) => {
  const m = add(p, boxGeo(w, h, d), c, x, y + h / 2, z, o);
  m.rotation.y = ry;
  return m;
};
const cyl = (p, rt, rb, h, c, x, y, z, seg = 8, o) =>
  add(p, new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y + h / 2, z, o);
const G = (p, x = 0, y = 0, z = 0, ry = 0) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  p.add(g);
  return g;
};
function frustum(p, w, d, h, taper, c, x, y, z) {
  const g = new THREE.CylinderGeometry(taper * Math.SQRT1_2, Math.SQRT1_2, h, 4, 1);
  g.rotateY(Math.PI / 4);
  g.scale(w, 1, d);
  return add(p, g, c, x, y + h / 2, z);
}
// A box between two points in the y-z plane.
export function slant(p, x, a, b, w, t, c, o) {
  const dy = b.y - a.y,
    dz = b.z - a.z;
  const m = add(p, new THREE.BoxGeometry(w, t, Math.hypot(dy, dz)), c, x, (a.y + b.y) / 2, (a.z + b.z) / 2, o);
  m.rotation.x = Math.atan2(-dy, dz); // Rx maps +z to (0, -sin, cos)
  return m;
}

// Everything under `group` as one geometry with per-vertex colours (from
// each part's material colour), for a single-material merged mesh.
// `dropDown`: leave out faces that point straight down (undersides that the
// chase camera, looking down on the city, never sees). `flush` ({ w, d }):
// also leave out faces lying on the walls of a w x d body and facing into
// it (the backs of window frames, bands and signs), which are never seen.
export function coloredGeometry(group, { dropDown = false, flush = null } = {}) {
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  const list = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
    g.clearGroups();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const c = o.material.color;
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = c.r;
      colors[i + 1] = c.g;
      colors[i + 2] = c.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    list.push(g);
  });
  const merged = mergeGeometries(list);
  list.forEach((g) => g.dispose());
  return dropDown || flush ? withoutHiddenFaces(merged, dropDown, flush) : merged;
}
function withoutHiddenFaces(g, dropDown, flush) {
  const n = g.attributes.normal.array;
  const p = g.attributes.position.array;
  const keep = [];
  const hidden = (i) => {
    const nx = (n[i] + n[i + 3] + n[i + 6]) / 3,
      ny = (n[i + 1] + n[i + 4] + n[i + 7]) / 3,
      nz = (n[i + 2] + n[i + 5] + n[i + 8]) / 3;
    if (dropDown && ny < -0.99) return true;
    if (!flush) return false;
    const cx = (p[i] + p[i + 3] + p[i + 6]) / 3,
      cz = (p[i + 2] + p[i + 5] + p[i + 8]) / 3;
    const on = (v, at) => Math.abs(v - at) < 0.005;
    return (
      (nx < -0.99 && on(cx, flush.w / 2)) ||
      (nx > 0.99 && on(cx, -flush.w / 2)) ||
      (nz < -0.99 && on(cz, flush.d / 2)) ||
      (nz > 0.99 && on(cz, -flush.d / 2))
    );
  };
  for (let t = 0; t < n.length / 9; t++) if (!hidden(t * 9)) keep.push(t);
  const out = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "color"]) {
    const src = g.attributes[name].array;
    const dst = new Float32Array(keep.length * 9);
    keep.forEach((t, k) => dst.set(src.subarray(t * 9, t * 9 + 9), k * 9));
    out.setAttribute(name, new THREE.BufferAttribute(dst, 3));
  }
  g.dispose();
  return out;
}

// --------------------------------------------------------------- vehicles --
// Front is -z. Wheels are groups (rotation order YXZ: steer, then spin) in
// userData.wheels, as the renderer expects.
function wheel(p, x, z, r, rim = K.chrome) {
  const s = Math.sign(x) || 1;
  const w = G(p, x, r, z);
  w.rotation.order = "YXZ";
  const t = add(w, new THREE.CylinderGeometry(r, r, 0.3, 12), K.rubber);
  t.rotation.z = Math.PI / 2;
  const m = add(w, new THREE.CylinderGeometry(r * 0.6, r * 0.6, 0.06, 8), rim, s * 0.13);
  m.rotation.z = Math.PI / 2;
  const h = add(w, new THREE.CylinderGeometry(r * 0.2, r * 0.2, 0.08, 6), K.trim, s * 0.16);
  h.rotation.z = Math.PI / 2;
  return w;
}
function chassis(g, o) {
  const { L, W, clear, h, color, r, axles, rim = K.chrome, track = W / 2 - 0.16 } = o;
  B(g, W, h, L, color, 0, clear, 0);
  g.userData.wheels = g.userData.wheels || [];
  for (const z of axles) {
    B(g, W + 0.02, r * 1.35, r * 2.5, K.well, 0, 0.12, z);
    B(g, W + 0.08, 0.08, r * 2.6, color, 0, 0.12 + r * 1.35, z);
    for (const s of [-1, 1]) g.userData.wheels.push(wheel(g, s * track, z, r, rim));
  }
  const gap = axles[axles.length - 1] - axles[0] - r * 2.6;
  if (gap > 0.2) B(g, W + 0.03, 0.12, gap, K.trim, 0, clear, (axles[0] + axles[axles.length - 1]) / 2);
}
function cabin(g, o) {
  const { W, belt, roof, zf, zt1, zt2, zb, color, glass = K.glassDark, frame = color, inset = 0.14 } = o;
  const xw = W / 2 - inset;
  const fA = { y: belt, z: zf },
    fB = { y: roof, z: zt1 },
    rA = { y: roof, z: zt2 },
    rB = { y: belt, z: zb };
  B(g, W - 2 * inset + 0.1, 0.09, zt2 - zt1 + 0.06, frame, 0, roof - 0.02, (zt1 + zt2) / 2);
  for (const s of [-1, 1]) {
    slant(g, s * xw, fA, fB, 0.11, 0.11, frame);
    slant(g, s * xw, rA, rB, 0.16, 0.16, frame);
    B(g, 0.1, roof - belt, 0.12, frame, s * xw, belt, (zt1 + zt2) / 2);
    B(g, 0.03, roof - belt - 0.08, (zt2 - zt1) / 2 - 0.1, glass, s * (xw - 0.02), belt + 0.02, zt1 + (zt2 - zt1) / 4 - 0.02, 0, { roughness: 0.2 });
    B(g, 0.03, roof - belt - 0.08, (zt2 - zt1) / 2 - 0.1, glass, s * (xw - 0.02), belt + 0.02, zt1 + (3 * (zt2 - zt1)) / 4 + 0.02, 0, { roughness: 0.2 });
  }
  slant(g, 0, { y: fA.y + 0.03, z: fA.z + 0.02 }, { y: fB.y - 0.04, z: fB.z - 0.01 }, 2 * xw - 0.1, 0.03, glass, { roughness: 0.2 });
  slant(g, 0, { y: rA.y - 0.04, z: rA.z + 0.01 }, { y: rB.y + 0.03, z: rB.z - 0.02 }, 2 * xw - 0.16, 0.03, glass, { roughness: 0.2 });
  B(g, 2 * xw, 0.06, 0.1, K.trim, 0, belt - 0.03, zf + 0.04);
}
function doorsAndMirrors(g, o) {
  const { W, clear, belt, seams, handles, mirrorZ, color } = o;
  for (const s of [-1, 1]) {
    for (const z of seams) B(g, 0.02, belt - clear - 0.12, 0.03, K.seam, s * (W / 2 + 0.02), clear + 0.1, z);
    for (const z of handles) B(g, 0.04, 0.05, 0.22, K.trim, s * (W / 2 + 0.02), belt - 0.2, z);
    B(g, 0.22, 0.05, 0.06, K.trim, s * (W / 2 + 0.08), belt + 0.02, mirrorZ);
    B(g, 0.12, 0.16, 0.2, color, s * (W / 2 + 0.22), belt - 0.02, mirrorZ);
  }
}
function ends(g, o) {
  const { W, L, clear, h, bumper = K.trim, rear = true, lightW = 0.36 } = o;
  const zf = -L / 2,
    zr = L / 2;
  B(g, W + 0.08, 0.24, 0.22, bumper, 0, clear - 0.08, zf - 0.04);
  B(g, W + 0.08, 0.24, 0.22, bumper, 0, clear - 0.08, zr + 0.04);
  B(g, W * 0.46, h * 0.42, 0.05, K.trim, 0, clear + h * 0.28, zf - 0.02);
  for (let i = 0; i < 3; i++) B(g, W * 0.42, 0.03, 0.06, K.chrome, 0, clear + h * 0.33 + i * 0.07, zf - 0.03);
  for (const s of [-1, 1]) {
    B(g, lightW + 0.06, 0.2, 0.05, K.trim, s * (W / 2 - lightW / 2 - 0.1), clear + h * 0.48, zf - 0.02);
    B(g, lightW, 0.14, 0.06, 0xfff6d2, s * (W / 2 - lightW / 2 - 0.1), clear + h * 0.48 + 0.03, zf - 0.03, 0, { emissive: 0xffe9a8, emissiveIntensity: 0.5 });
    B(g, 0.12, 0.08, 0.06, 0xffa02a, s * (W / 2 - 0.08), clear + h * 0.3, zf - 0.02);
    if (rear) B(g, lightW, 0.18, 0.06, 0xd8202c, s * (W / 2 - lightW / 2 - 0.08), clear + h * 0.55, zr + 0.02, 0, { emissive: 0xa0101c, emissiveIntensity: 0.4 });
  }
  B(g, 0.46, 0.15, 0.03, K.white, 0, clear, zf - 0.16);
  if (rear) B(g, 0.46, 0.15, 0.03, K.white, 0, clear, zr + 0.16);
}
function sedanShell(color, opt = {}) {
  const g = new THREE.Group();
  const W = 1.9, L = 4.3, clear = 0.32, h = 0.58, belt = clear + h, roof = 1.5, r = 0.36;
  chassis(g, { L, W, clear, h, color, r, axles: [-1.35, 1.35], rim: opt.rim });
  B(g, W - 0.3, 0.05, 1.0, color, 0, belt, -1.55);
  cabin(g, { W, belt, roof, zf: -0.75, zt1: -0.15, zt2: 0.78, zb: 1.25, color: opt.cabin || color, frame: opt.frame || opt.cabin || color });
  doorsAndMirrors(g, { W, clear, belt, seams: [-0.75, 0.2, 1.1], handles: [-0.05, 0.85], mirrorZ: -0.62, color: opt.mirror || color });
  ends(g, { W, L, clear, h, bumper: opt.bumper || K.trim });
  return { g, W, L, clear, h, belt, roof };
}
// One shared material for every baked (vertex-coloured) part.
export const bakedMaterial = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.7,
  flatShading: true,
});
function bakedMesh(geometry) {
  const m = new THREE.Mesh(geometry, bakedMaterial);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const isLit = (o) => o.material.emissive && o.material.emissive.getHex() !== 0;
// Draw-call budget: a car built from ~100 parts becomes one painted body
// mesh, one mesh per lamp material, one mesh per wheel (wheels keep their
// groups so they still spin and steer) and the parts in `keep` (the
// blinking light-bar lenses) as they are.
export function bakeVehicle(inner, keep = []) {
  const wheels = new Set(inner.userData.wheels);
  inner.updateMatrixWorld(true);
  const inv = inner.matrixWorld.clone().invert();
  const plain = new THREE.Group();
  const lit = new Map();
  const parts = [];
  inner.traverse((o) => {
    if (!o.isMesh || keep.includes(o)) return;
    for (let q = o.parent; q && q !== inner; q = q.parent) if (wheels.has(q)) return;
    parts.push(o);
  });
  for (const o of parts) {
    const local = new THREE.Mesh(o.geometry, o.material);
    local.matrixAutoUpdate = false;
    local.matrix.multiplyMatrices(inv, o.matrixWorld);
    if (isLit(o)) {
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(local.matrix);
      if (!lit.has(o.material)) lit.set(o.material, []);
      lit.get(o.material).push(g);
    } else plain.add(local);
    o.parent.remove(o);
  }
  plain.updateMatrixWorld = function () {
    for (const c of this.children) c.matrixWorld.copy(c.matrix);
    this.matrixWorld.identity();
  };
  inner.add(bakedMesh(coloredGeometry(plain)));
  for (const [material, list] of lit) {
    const m = new THREE.Mesh(mergeGeometries(list), material);
    list.forEach((g) => g.dispose());
    inner.add(m);
  }
  for (const w of wheels) {
    const geometry = coloredGeometry(w);
    w.clear();
    w.add(bakedMesh(geometry));
  }
}
// A group of static parts as one vertex-coloured mesh in its parent's
// space (benches): the renderer then batches them all into one draw call.
export function bakeStatic(group) {
  const parent = group.parent;
  group.updateMatrix();
  const geometry = coloredGeometry(group);
  geometry.applyMatrix4(group.matrix);
  parent.remove(group);
  const mesh = bakedMesh(geometry);
  parent.add(mesh);
  return mesh;
}
// The game's car shapes are 2.1 x 3.6 m: the models are scaled to fit.
export const CAR_SCALE = 0.86;
export function scaled(inner) {
  const outer = new THREE.Group();
  inner.scale.setScalar(CAR_SCALE);
  outer.add(inner);
  outer.userData.wheels = inner.userData.wheels;
  return outer;
}
export function playerCar() {
  // Hot-magenta muscle coupe: long bonnet with a scoop, cabin set back,
  // wide rear arches, spoiler, side pipes, twin stripes.
  const g = new THREE.Group();
  const W = 1.96, L = 4.35, clear = 0.26, h = 0.56, belt = clear + h, roof = 1.3, r = 0.38;
  chassis(g, { L, W, clear, h, color: K.player, r, axles: [-1.38, 1.4] });
  B(g, W + 0.16, 0.1, r * 2.7, K.player, 0, 0.12 + r * 1.35 + 0.02, 1.4);
  B(g, W - 0.5, 0.12, 1.5, K.player, 0, belt, -1.25);
  B(g, 0.56, 0.16, 0.6, K.trim, 0, belt + 0.12, -1.05);
  B(g, 0.46, 0.08, 0.04, K.chrome, 0, belt + 0.18, -1.36);
  cabin(g, { W, belt, roof, zf: -0.4, zt1: 0.1, zt2: 0.8, zb: 1.45, color: K.player });
  doorsAndMirrors(g, { W, clear, belt, seams: [-0.38, 0.95], handles: [0.75], mirrorZ: -0.28, color: K.player });
  ends(g, { W, L, clear, h, bumper: K.chrome, lightW: 0.3 });
  B(g, W - 0.1, 0.06, 0.34, K.trim, 0, belt + 0.36, 1.92);
  for (const x of [-0.7, 0.7]) B(g, 0.08, 0.36, 0.12, K.trim, x, belt, 1.92);
  for (const s of [-1, 1]) {
    const e = add(g, new THREE.CylinderGeometry(0.07, 0.07, 1.1, 6), K.chrome, s * (W / 2 + 0.06), clear + 0.04, 0.3);
    e.rotation.x = Math.PI / 2;
  }
  for (const x of [-0.25, 0.25]) {
    B(g, 0.2, 0.012, 1.45, K.white, x, belt + 0.12, -1.25);
    B(g, 0.2, 0.012, 0.72, K.white, x, roof + 0.025, 0.45);
    B(g, 0.2, 0.012, 0.8, K.white, x, belt, 1.75);
  }
  bakeVehicle(g);
  return scaled(g);
}
export function policeCar() {
  const s = sedanShell(K.trim, { cabin: K.white, frame: K.white, bumper: K.trim, mirror: K.trim, rim: 0x9da1a8 });
  const g = s.g;
  // Classic black-and-white patrol car: black hood, trunk and lower body,
  // white doors (front and rear, full height to the window line) and a
  // white roof (the cabin), so it reads as police from far away.
  for (const side of [-1, 1]) {
    B(g, 0.07, s.h - 0.02, 1.95, K.white, side * (s.W / 2 + 0.035), s.clear + 0.02, 0.175);
    B(g, 0.05, 0.1, 1.95, K.white, side * (s.W / 2 + 0.02), s.belt - 0.06, 0.175);
    const star = add(g, new THREE.CylinderGeometry(0.17, 0.17, 0.02, 5), K.yellow, side * (s.W / 2 + 0.08), s.belt - 0.28, -0.3);
    star.rotation.z = Math.PI / 2;
  }
  const lb = G(g, 0, s.roof + 0.04, 0.15);
  for (const x of [-0.55, 0.55]) B(lb, 0.12, 0.06, 0.3, K.trim, x, 0, 0);
  B(lb, 1.4, 0.08, 0.36, K.trim, 0, 0.06, 0);
  // Separate (unshared) lens materials: the renderer blinks them.
  const red = new THREE.Mesh(boxGeo(0.56, 0.16, 0.32), new THREE.MeshStandardMaterial({ color: 0xff2a3c, emissive: 0xff2040, emissiveIntensity: 0.9, flatShading: true }));
  red.position.set(-0.4, 0.22, 0);
  const blue = new THREE.Mesh(boxGeo(0.56, 0.16, 0.32), new THREE.MeshStandardMaterial({ color: 0x2a6dff, emissive: 0x2a60ff, emissiveIntensity: 0.9, flatShading: true }));
  blue.position.set(0.4, 0.22, 0);
  lb.add(red, blue);
  red.castShadow = blue.castShadow = true;
  B(lb, 0.22, 0.12, 0.3, K.white, 0, 0.14, 0);
  const zf = -s.L / 2 - 0.2;
  for (const x of [-0.42, 0.42]) B(g, 0.08, 0.62, 0.08, K.trim, x, s.clear - 0.2, zf - 0.1);
  for (const y of [0.18, 0.42]) B(g, 1.0, 0.07, 0.08, K.trim, 0, s.clear + y - 0.2, zf - 0.1);
  B(g, 0.14, 0.14, 0.2, K.chrome, -s.W / 2 - 0.05, s.belt + 0.1, -0.68);
  add(g, new THREE.CylinderGeometry(0.01, 0.015, 0.8, 4), K.trim, 0.5, s.roof + 0.4, 0.7);
  bakeVehicle(g, [red, blue]);
  const out = scaled(g);
  out.userData.red = red;
  out.userData.blue = blue;
  return out;
}
// TARGET HUNT target: a bright yellow getaway sedan with two black racing
// stripes over the bonnet, roof and boot, black bumpers and a roof rack
// with bags, so it reads at once from the chase camera.
export function targetCar() {
  const s = sedanShell(K.yellow, { cabin: K.yellow, frame: K.trim, bumper: K.trim, mirror: K.trim, rim: 0x2a292e });
  const g = s.g;
  for (const x of [-0.28, 0.28]) {
    B(g, 0.24, 0.014, 1.05, K.trim, x, s.belt + 0.005, -1.55);
    B(g, 0.24, 0.014, 0.95, K.trim, x, s.roof + 0.01, 0.3);
    B(g, 0.24, 0.014, 0.8, K.trim, x, s.belt + 0.005, 1.7);
  }
  const rack = G(g, 0, s.roof + 0.02, 0.3);
  for (const z of [-0.4, 0.4]) B(rack, 1.3, 0.05, 0.06, K.trim, 0, 0.05, z);
  B(rack, 0.62, 0.3, 0.55, 0x3a6b3a, -0.25, 0.1, 0);
  B(rack, 0.42, 0.24, 0.45, 0x6b4a2a, 0.33, 0.1, -0.05);
  bakeVehicle(g);
  return scaled(g);
}
// Civilian sedan as one coloured geometry: the body is white so an
// instance colour paints it; glass, tyres and trim stay dark.
export function civilianCarGeometry() {
  const s = sedanShell(0xffffff, { rim: 0x9da1a8, bumper: K.trim });
  s.g.scale.setScalar(CAR_SCALE);
  const wrap = new THREE.Group();
  wrap.add(s.g);
  return coloredGeometry(wrap);
}

// -------------------------------------------------------------- buildings --
const WALLS = [K.red, K.blue, K.yellow, K.green, K.orange, K.brick, K.cream, K.teal, K.amber];
export const WALL_COLORS = WALLS;
const TRIMS = { [K.cream]: 0x9e8f78, [K.yellow]: 0xb5651d };
// Window: frame bars standing 0.22 m off the wall with the glass behind
// them, a lintel and a sill (5 boxes).
function windowAt(p, x, y, z, w, h, frame) {
  const g = G(p, x, y, z);
  const fd = 0.22,
    bar = 0.12;
  B(g, w + 2 * bar + 0.2, 0.14, fd + 0.06, frame, 0, h / 2, (fd + 0.06) / 2); // lintel / top
  B(g, w + 2 * bar + 0.2, 0.12, fd + 0.14, frame, 0, -h / 2 - 0.12, (fd + 0.14) / 2); // sill / bottom
  B(g, bar, h, fd, frame, -w / 2 - bar / 2, -h / 2, fd / 2);
  B(g, bar, h, fd, frame, w / 2 + bar / 2, -h / 2, fd / 2);
  B(g, w, h, 0.03, K.glass, 0, -h / 2, 0.015);
}
// Band round the walls (4 boxes; ends meet, no overlap).
function band(p, w, d, y, h, out, c) {
  B(p, w + 2 * out, h, out, c, 0, y, d / 2 + out / 2);
  B(p, w + 2 * out, h, out, c, 0, y, -d / 2 - out / 2);
  B(p, out, h, d, c, w / 2 + out / 2, y, 0);
  B(p, out, h, d, c, -w / 2 - out / 2, y, 0);
}
// A building on the game's footprint (w x d, body height h, standing on
// the 0.4 m pavement). `outward`: signs of the faces that look onto streets
// ([sx, sz]); the ground floor there is a shopfront. Ground-floor details
// stand at most 0.08 m off the wall and windows start on the first floor,
// so street props 0.7 m from the wall never touch the facade.
export function buildingGroup(b, seed, outward) {
  const g = new THREE.Group();
  const wall = WALLS[seed % WALLS.length];
  const trim = TRIMS[wall] ?? K.cream;
  const frame = seed % 2 ? K.white : K.cream;
  const base = 0.4,
    GF = 3.4,
    FH = 3.0;
  const top = base + b.h;
  B(g, b.w, b.h, b.d, wall, 0, base, 0);
  // Ground floor: plinth band, shopfronts on street faces, plain elsewhere.
  band(g, b.w, b.d, base, 0.5, 0.05, 0x55535c);
  band(g, b.w, b.d, base + GF, 0.22, 0.12, trim);
  const shopColors = [K.red, K.blue, K.green, K.yellow, K.orange];
  // b.street (generated cities): which faces front a street, [+z, -z,
  // +x, -x]; otherwise the faces pointing away from the block centre.
  const sf = b.street;
  const faces = [
    { ry: 0, span: b.w, half: b.d / 2, street: sf ? sf[0] : outward[1] > 0 },
    { ry: Math.PI, span: b.w, half: b.d / 2, street: sf ? sf[1] : outward[1] < 0 },
    { ry: Math.PI / 2, span: b.d, half: b.w / 2, street: sf ? sf[2] : outward[0] > 0 },
    { ry: -Math.PI / 2, span: b.d, half: b.w / 2, street: sf ? sf[3] : outward[0] < 0 },
  ];
  const floors = Math.max(0, Math.floor((b.h - GF - 0.6) / FH));
  faces.forEach((f, k) => {
    const fg = G(g, 0, 0, 0, f.ry);
    if (f.street) {
      const sc = shopColors[(seed + k) % shopColors.length];
      B(fg, f.span - 1.2, 2.2, 0.03, K.glass, -0.3, base + 0.5, f.half + 0.015);
      for (const mx of [-f.span / 2 + 0.6, -0.3 - (f.span - 1.2) / 6, -0.3 + (f.span - 1.2) / 6])
        B(fg, 0.08, 2.2, 0.06, K.trim, mx, base + 0.5, f.half + 0.03);
      B(fg, 0.9, 2.3, 0.04, K.trim, f.span / 2 - 0.85, base + 0.5, f.half + 0.02);
      B(fg, f.span - 0.4, 0.5, 0.08, sc, 0, base + 2.75, f.half + 0.04); // sign band
      B(fg, f.span * 0.4, 0.18, 0.02, K.white, 0, base + 2.91, f.half + 0.09); // lettering strip
    } else {
      // Plain lower floor: two small windows set into the wall (flush).
      for (const wx of [-f.span / 4, f.span / 4]) B(fg, 1.0, 1.2, 0.03, K.glass, wx, base + 1.4, f.half + 0.015);
    }
    // Upper floors: two recessed windows a floor, balconies from the 2nd.
    for (let fl = 0; fl < floors; fl++) {
      const y = base + GF + 0.22 + fl * FH + FH * 0.5;
      for (const wx of [-f.span / 4, f.span / 4]) {
        windowAt(fg, wx, y, f.half, 1.0, 1.4, frame);
        if (fl >= 1 && seed % 3 === 0 && f.street) {
          const bx = wx, by = y - 0.7 - 0.24 - 0.12;
          B(fg, 1.9, 0.12, 0.8, frame, bx, by, f.half + 0.4);
          for (let r = 0; r <= 5; r++) B(fg, 0.05, 0.65, 0.05, frame, bx - 0.9 + r * 0.36, by + 0.12, f.half + 0.77);
          B(fg, 1.9, 0.06, 0.06, frame, bx, by + 0.77, f.half + 0.77);
        }
      }
      if (fl < floors - 1) band(g, b.w, b.d, base + GF + 0.22 + (fl + 1) * FH - 0.08, 0.12, 0.08, trim);
    }
  });
  // Roof: low buildings may get a hip roof, the rest a cornice + parapet
  // with plant on top.
  if (b.h <= 9 && seed % 3 === 1) {
    band(g, b.w, b.d, top, 0.25, 0.2, trim);
    frustum(g, b.w + 0.5, b.d + 0.5, 2.2, 0.25, [K.teal, K.red, 0x6a4a3a][seed % 3], 0, top + 0.25, 0);
  } else {
    band(g, b.w, b.d, top - 0.35, 0.35, 0.22, trim);
    // Parapet: front/back full width, sides between them (no overlap).
    B(g, b.w, 0.5, 0.2, trim, 0, top, b.d / 2 - 0.1);
    B(g, b.w, 0.5, 0.2, trim, 0, top, -b.d / 2 + 0.1);
    B(g, 0.2, 0.5, b.d - 0.4, trim, b.w / 2 - 0.1, top, 0);
    B(g, 0.2, 0.5, b.d - 0.4, trim, -b.w / 2 + 0.1, top, 0);
    B(g, 1.4, 0.8, 1.0, 0xc5c0c8, -1.3, top, -1.2);
    B(g, 0.8, 0.6, 0.8, 0x8f8a94, 1.4, top, 1.2);
    if (seed % 4 === 0) {
      cyl(g, 0.8, 0.8, 1.4, 0x9fb3c7, 1.2, top + 0.6, -1.4, 8);
      for (const a of [-0.55, 0.55]) B(g, 0.08, 0.6, 0.08, K.metal, 1.2 + a, top, -1.4);
    }
  }
  return g;
}

// ------------------------------------------------------------- park kit --
export function parkBench(p, x, z, ry, len = 2.6) {
  const pb = G(p, x, 0, z, ry);
  for (const s of [-len / 2 + 0.1, len / 2 - 0.1]) {
    B(pb, 0.08, 0.45, 0.55, 0x1f3a2a, s, 0, 0);
    B(pb, 0.08, 0.5, 0.08, 0x1f3a2a, s, 0.45, 0.25);
    B(pb, 0.08, 0.06, 0.5, 0x1f3a2a, s, 0.68, 0);
  }
  for (let i = 0; i < 3; i++) B(pb, len, 0.05, 0.14, 0xb5703a, 0, 0.45, -0.18 + i * 0.17);
  for (let i = 0; i < 2; i++) B(pb, len, 0.12, 0.04, 0xb5703a, 0, 0.62 + i * 0.2, 0.3);
  return pb;
}
