// Shared building blocks for the location preview (angular low-poly, vivid
// colours, same kit and palette as the game: src/render/kit.js). Static
// parts are baked into one vertex-coloured mesh per location; moving or
// breakable parts are baked per piece (or instanced) so they stay cheap.
import * as THREE from "three";
import { K, mat, coloredGeometry, bakedMaterial } from "../../render/kit.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export { K };
export const C = {
  ...K,
  concrete: 0xc9c5bd,
  concreteJoint: 0x9f9c95,
  court: 0x2f62b8,
  courtKey: 0xe8571c,
  courtEdge: 0x2f7d4f,
  ball: 0xf07a1e,
  water: 0x2fa4e0,
  waterLight: 0x9fe0ff,
  hedge: 0x2e8b3e,
  flower: [0xe8401c, 0xf5c01a, 0xe0367a, 0xf4f4f0],
  soil: 0x5a3a24,
  scorch: 0x1f1c1e,
  ash: 0x3a3437,
  fire: [0xe8401c, 0xff8a1a, 0xffe14a],
  smoke: 0x2a282d,
  dark: 0x232227,
  fence: 0x3d4a52,
  wire: 0x6c7a82,
};

const geoCache = new Map();
function cached(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}
export function add(p, geo, color, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(geo, mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  p.add(m);
  return m;
}
// Box by base centre (x, z) and bottom y.
export const B = (p, w, h, d, c, x = 0, y = 0, z = 0, ry = 0, o) => {
  const m = add(p, cached(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d)), c, x, y + h / 2, z, o);
  m.rotation.y = ry;
  return m;
};
export const cyl = (p, rt, rb, h, c, x, y, z, seg = 8, o) =>
  add(p, cached(`c${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), c, x, y + h / 2, z, o);
export const G = (p, x = 0, y = 0, z = 0, ry = 0) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  p.add(g);
  return g;
};
export const ico = (p, r, c, x, y, z, o) =>
  add(p, cached(`i${r}`, () => new THREE.IcosahedronGeometry(r, 0)), c, x, y, z, o);
// Octagonal ring wall (8 straight segments that meet at the corners).
export function octRing(p, r, h, t, c, y = 0, skip = []) {
  const side = 2 * r * Math.tan(Math.PI / 8);
  for (let i = 0; i < 8; i++) {
    if (skip.includes(i)) continue;
    const a = (i * Math.PI) / 4;
    B(p, side + t * 0.83, h, t, c, Math.sin(a) * (r - t / 2), y, Math.cos(a) * (r - t / 2), a);
  }
}
export function octDisc(p, r, h, c, x = 0, y = 0, z = 0) {
  const m = add(p, cached(`o${r}|${h}`, () => {
    const g = new THREE.CylinderGeometry(r, r, h, 8);
    g.rotateY(Math.PI / 8);
    return g;
  }), c, x, y + h / 2, z);
  return m;
}

// A sign: a coloured board (baked with everything else) and a text face.
// All text faces under one root are drawn from a single texture atlas in
// one draw call (signAtlas).
export function signBoard(p, text, w, h, x, y, z, ry, bg, fg) {
  B(p, w, h, 0.12, new THREE.Color(bg).getHex(), x, y - h / 2, z, ry);
  const holder = G(p, x, y, z, ry);
  holder.userData.sign = { text, w, h, bg, fg };
  return holder;
}
export function signAtlas(root) {
  const holders = [];
  root.traverse((o) => o.userData.sign && holders.push(o));
  if (!holders.length) return null;
  const RW = 512, RH = 128;
  const canvas = document.createElement("canvas");
  canvas.width = RW;
  canvas.height = RH * holders.length;
  const g = canvas.getContext("2d");
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const quads = holders.map((o, i) => {
    const s = o.userData.sign;
    g.fillStyle = s.bg;
    g.fillRect(0, i * RH, RW, RH);
    g.fillStyle = s.fg;
    g.font = `900 ${Math.round(72 * Math.min(1, (s.w / s.h) / 4))}px sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(s.text, RW / 2, i * RH + RH / 2 + 4);
    const q = new THREE.PlaneGeometry(s.w - 0.04, s.h - 0.04);
    const uv = q.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + 1 - uv.getY(k)) / holders.length);
    q.translate(0, 0, 0.065);
    q.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    o.parent.remove(o);
    return q;
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new THREE.Mesh(mergeGeometries(quads), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  quads.forEach((q) => q.dispose());
  mesh.receiveShadow = true;
  return mesh;
}

// Everything under `group` (except parts marked keep) as one baked mesh
// placed like the group; kept parts are re-parented next to it.
export function bake(group) {
  const signs = signAtlas(group);
  const keep = [];
  group.traverse((o) => o.userData.keep && keep.push(o));
  for (const o of keep) {
    o.updateMatrixWorld(true);
    o.userData.world = o.matrixWorld.clone();
    o.parent.remove(o);
  }
  const geometry = coloredGeometry(group, { dropDown: true });
  const out = new THREE.Group();
  out.position.copy(group.position);
  out.rotation.copy(group.rotation);
  const mesh = new THREE.Mesh(geometry, bakedMaterial);
  mesh.castShadow = mesh.receiveShadow = true;
  out.add(mesh);
  out.updateMatrixWorld(true);
  const inv = out.matrixWorld.clone().invert();
  for (const o of keep) {
    o.matrixAutoUpdate = false;
    o.matrix.multiplyMatrices(inv, o.userData.world);
    out.add(o);
  }
  if (signs) out.add(signs);
  return out;
}
// A piece built by `build(group)` as one coloured geometry (for instancing
// or a single breakable mesh).
export function pieceGeometry(build) {
  const g = new THREE.Group();
  build(g);
  return coloredGeometry(g);
}
export function pieceMesh(build) {
  const m = new THREE.Mesh(pieceGeometry(build), bakedMaterial);
  m.castShadow = m.receiveShadow = true;
  return m;
}
export { mergeGeometries, bakedMaterial, coloredGeometry };

// ---------------------------------------------------- shared furniture --
export function parkBench(g, color = 0xc77a45) {
  // Origin at the seat centre on the ground; back at +z.
  for (const s of [-0.85, 0.85]) {
    B(g, 0.08, 0.45, 0.55, C.dark, s, 0, 0);
    B(g, 0.08, 0.5, 0.08, C.dark, s, 0.45, 0.25);
    B(g, 0.08, 0.06, 0.5, C.dark, s, 0.68, 0);
  }
  for (let i = 0; i < 3; i++) B(g, 2.0, 0.05, 0.14, color, 0, 0.45, -0.18 + i * 0.17);
  for (let i = 0; i < 2; i++) B(g, 2.0, 0.12, 0.04, color, 0, 0.62 + i * 0.2, 0.3);
}
export function lampPost(g) {
  // Park lamp: plinth, dark pole, lantern with a warm glass and a cap.
  cyl(g, 0.2, 0.24, 0.3, C.dark, 0, 0, 0, 6);
  cyl(g, 0.07, 0.09, 3.4, C.dark, 0, 0.3, 0, 6);
  B(g, 0.42, 0.08, 0.42, C.dark, 0, 3.7, 0);
  B(g, 0.32, 0.5, 0.32, 0xffe08a, 0, 3.78, 0);
  for (const [x, z] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) B(g, 0.05, 0.5, 0.05, C.dark, x, 3.78, z);
  const cap = cyl(g, 0.02, 0.32, 0.28, C.dark, 0, 4.28, 0, 4);
  cap.rotation.y = Math.PI / 4;
}
export function binPair(g) {
  B(g, 0.6, 0.85, 0.6, 0x5e7a8f, -0.34, 0, 0);
  B(g, 0.64, 0.1, 0.64, 0x6cb6e0, -0.34, 0.85, 0);
  B(g, 0.6, 0.85, 0.6, 0x5e7a8f, 0.34, 0, 0);
  B(g, 0.64, 0.1, 0.64, C.yellow, 0.34, 0.85, 0);
}
export function tree(g, k = 0, s = 1) {
  // Faceted canopy clumps on a kinked trunk (kept clear of 1.4 m radius).
  cyl(g, 0.16 * s, 0.24 * s, 1.9 * s, C.trunk, 0, 0, 0, 5);
  const t2 = cyl(g, 0.12 * s, 0.16 * s, 1.2 * s, C.trunk, 0.18 * s, 1.75 * s, 0, 5);
  t2.rotation.z = -0.25;
  const leaf = C.leaf[k % 3];
  ico(g, 1.25 * s, leaf, 0.25 * s, 3.4 * s, 0).scale.y = 0.8;
  const c2 = ico(g, 0.8 * s, C.leaf[(k + 1) % 3], -0.55 * s, 2.8 * s, 0.35 * s);
  c2.scale.y = 0.85;
  ico(g, 0.7 * s, C.leaf[(k + 2) % 3], 0.2 * s, 4.3 * s, -0.2 * s);
}
