// CHASE CITY exaggerated cartoon vehicles (art direction: the vehicle
// reference sheet). The identity is the cabin: an extremely tall cabin
// with an oversized trapezoid windshield leaning back, tall side windows
// with angular frames and planar glass highlights, sitting on a low, very
// short lower body (stubby hood and tail, short wheelbase, small wheels
// at the corners) with a chunky grille, square lamps and blocky bumpers.
// Built from a few angular primitives (no rounded toy shapes):
//   hexa(p, v8, color)   any six-sided solid from 8 corners (tapers, wedges)
//   panel(p, quad, t, c) a thin plate laid on a face (glass, decals, seams)
//   facePt(quad, u, v)   a point on a face, for insets and stripes
// and baked like every game car (kit.js bakeVehicle: one mesh per material,
// wheels kept as groups that spin). Front is -z; visual only: the game's
// collision shapes are unchanged.
import * as THREE from "three";
import { add, bakeVehicle, scaled, coloredGeometry, CAR_SCALE } from "./kit.js";

export const GLASS = 0x2a74c8;
export const GLASS_HI = 0x9fd6ff;
export const TRIM = 0x2b2a30; // rubber, grille, mirrors
export const STEEL = 0x9aa0a8; // bumpers, rims
export const LAMP = { emissive: 0xffc94a, emissiveIntensity: 1.1 };
export const TAIL = { emissive: 0xc0101c, emissiveIntensity: 0.55 };
const GLASS_OPTS = { roughness: 0.25 };

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
// (Body parts are merged with the angular solids: no index buffers.)
const ni = (geo) => {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute("uv");
  return g;
};
const lerp = (a, b, t) => a.clone().lerp(b, t);
// Bilinear point on a quad [bl, br, tr, tl] (u along the bottom edge, v up).
export function facePt(q, u, v) {
  return lerp(lerp(q[0], q[1], u), lerp(q[3], q[2], u), v);
}
export function subQuad(q, u0, u1, v0, v1, skew = 0) {
  return [facePt(q, u0, v0), facePt(q, u1, v0), facePt(q, u1 + skew, v1), facePt(q, u0 + skew, v1)];
}

// Six-sided solid from 8 corners: b0..b3 the bottom loop, t0..t3 the top
// loop above them (any shape: tapers, wedges, slanted fronts). Flat shaded
// with outward faces (each triangle is checked against the centre).
export function hexa(p, v, color, o) {
  const faces = [[0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
  const c = v.reduce((a, q) => a.add(q), v3(0, 0, 0)).multiplyScalar(1 / 8);
  const pos = [];
  const tri = (a, b, d) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
    const mid = a.clone().add(b).add(d).multiplyScalar(1 / 3).sub(c);
    if (n.dot(mid) < 0) pos.push(a.x, a.y, a.z, d.x, d.y, d.z, b.x, b.y, b.z);
    else pos.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z);
  };
  for (const [a, b, d, e] of faces) {
    tri(v[a], v[b], v[d]);
    tri(v[a], v[d], v[e]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return add(p, g, color, 0, 0, 0, o);
}
// Axis box by centre-bottom, as a hexa (so it bakes like the rest).
export function box(p, w, h, d, color, x = 0, y = 0, z = 0, o) {
  const X = [x - w / 2, x + w / 2], Z = [z - d / 2, z + d / 2];
  return hexa(p, [v3(X[0], y, Z[0]), v3(X[1], y, Z[0]), v3(X[1], y, Z[1]), v3(X[0], y, Z[1]), v3(X[0], y + h, Z[0]), v3(X[1], y + h, Z[0]), v3(X[1], y + h, Z[1]), v3(X[0], y + h, Z[1])], color, o);
}
// A plate of thickness t laid on face quad q, pushed out along the face
// normal (away from `inside`).
export function panel(p, q, t, color, inside, o) {
  const n = new THREE.Vector3().subVectors(q[1], q[0]).cross(new THREE.Vector3().subVectors(q[3], q[0])).normalize();
  const mid = q.reduce((a, b) => a.add(b), v3(0, 0, 0)).multiplyScalar(0.25);
  if (inside && n.dot(mid.clone().sub(inside)) < 0) n.negate();
  const lift = (a, k) => a.clone().addScaledVector(n, k);
  return hexa(p, [lift(q[0], 0.002), lift(q[1], 0.002), lift(q[2], 0.002), lift(q[3], 0.002), lift(q[0], t), lift(q[1], t), lift(q[2], t), lift(q[3], t)], color, o);
}
// Glass pane on a face with two slanted planar highlight stripes.
export function glass(p, q, inside, { stripes = 2, tint = GLASS } = {}) {
  panel(p, q, 0.03, tint, inside, GLASS_OPTS);
  const marks = stripes === 2 ? [[0.16, 0.24], [0.3, 0.34]] : stripes === 1 ? [[0.2, 0.28]] : [];
  for (const [a, b] of marks) panel(p, subQuad(q, a, b, 0.12, 0.88, 0.16), 0.04, GLASS_HI, inside, GLASS_OPTS);
}
// A chunky cartoon wheel (spins and steers: kept as a group).
export function wheel(p, x, z, r, w, rim = STEEL, tread = false) {
  const g = new THREE.Group();
  g.position.set(x, r, z);
  g.rotation.order = "YXZ";
  p.add(g);
  const s = Math.sign(x) || 1;
  const cyl = (rr, len, c, dx, seg) => {
    const m = add(g, ni(new THREE.CylinderGeometry(rr, rr, len, seg)), c, dx, 0, 0);
    m.rotation.z = Math.PI / 2;
    return m;
  };
  cyl(r, w, 0x1d1c21, 0, 12);
  cyl(r * 0.6, w + 0.03, rim, s * 0.01, 8);
  cyl(r * 0.22, w + 0.07, 0x55535c, s * 0.02, 6);
  if (tread)
    for (let i = 0, n = r > 0.7 ? 16 : 10; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const lug = add(g, new THREE.BoxGeometry(w * 0.9, 0.09, Math.min(0.22, r * 0.3)), 0x141317, 0, Math.sin(a) * (r + 0.02), Math.cos(a) * (r + 0.02));
      lug.rotation.x = -a;
    }
  (p.userData.wheels ||= []).push(g);
  return g;
}
// Square lamp with a chrome-free dark bezel.
export function lamp(p, w, h, x, y, z, color = 0xffe58a, o = LAMP, face = -1) {
  box(p, w + 0.08, h + 0.08, 0.06, TRIM, x, y - 0.04, z - face * 0.005);
  box(p, w, h, 0.08, color, x, y, z + face * 0.02, o);
}
// A flat text decal (canvas texture), facing +x/-x/-z/+z or up.
export function decal(text, bg, fg, w, h, { font = "Arial Black", weight = 900 } = {}) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = Math.max(32, Math.round((256 * h) / w));
  const g = c.getContext("2d");
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, c.width, c.height);
  }
  g.fillStyle = fg;
  g.font = `${weight} ${Math.round(c.height * 0.66)}px "${font}", Impact, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: !bg }));
}
// A police star badge decal.
export function badge(size = 0.5) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#1f3f8f";
  g.beginPath();
  g.moveTo(64, 6);
  g.lineTo(118, 26);
  g.lineTo(108, 92);
  g.lineTo(64, 122);
  g.lineTo(20, 92);
  g.lineTo(10, 26);
  g.closePath();
  g.fill();
  g.fillStyle = "#f5c01a";
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 18 : 40;
    g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
}
// Bake a model, keeping textured decals (and blinking lenses) as their own
// meshes: the colour bake would drop their textures.
export function bake(g, keep = []) {
  const decals = [];
  g.traverse((o) => {
    if (o.isMesh && o.material?.map) decals.push(o);
  });
  bakeVehicle(g, [...keep, ...decals]);
}
export function sideDecal(g, mesh, x, y, z) {
  for (const s of [-1, 1]) {
    const m = s < 0 ? mesh : mesh.clone();
    m.position.set(s * x, y, z);
    m.rotation.y = (s * Math.PI) / 2;
    g.add(m);
  }
}
// Red/blue light bar lenses (the renderer blinks them: kept unbaked).
export function lightBar(g, y, z, w = 1.4, d = 0.38) {
  box(g, w, 0.1, d, TRIM, 0, y, z);
  const lens = (color, emissive, x) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, 0.2, d - 0.04), new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.9, flatShading: true }));
    m.position.set(x, y + 0.2, z);
    g.add(m);
    return m;
  };
  const red = lens(0xff2a3c, 0xff2040, -w * 0.27);
  const blue = lens(0x2a6dff, 0x2a60ff, w * 0.27);
  box(g, w * 0.14, 0.2, d - 0.04, 0xf4f4f0, 0, y + 0.1, z);
  return { red, blue };
}

// ------------------------------------------------------------- the shell
// A tall-cabin car shell. Returns the group and the named faces so each
// model can lay its own decals, stripes and parts on it.
//   W, L       width and length of the lower body
//   clear      lower body bottom; belt its top (hood height at the cabin)
//   hood       hood length (front of body to the windshield base)
//   tail       rear overhang behind the cabin base
//   cabH       cabin height above the belt
//   lean       how far the windshield top leans back
//   taper      cabin top width / bottom width
export function shell(opts) {
  const o = {
    W: 1.86, L: 3.0, clear: 0.32, belt: 1.02, hood: 0.42, tail: 0.12, cabH: 1.66, lean: 0.56, backLean: 0.1, taper: 0.74,
    noseDrop: 0.06, body: 0xf1ead8, cabin: null, roof: null, r: 0.44, wheelZ: null, rim: STEEL, tread: false, wheelW: 0.38,
    ...opts,
  };
  const g = new THREE.Group();
  const { W, L, clear, belt } = o;
  const zf = -L / 2, zb = L / 2;
  // Lower body: a slab whose front top edge drops toward the nose (a
  // short sloped hood) and whose front face leans in a little.
  const lb = [
    v3(-W / 2, clear, zf + 0.06), v3(W / 2, clear, zf + 0.06), v3(W / 2, clear, zb), v3(-W / 2, clear, zb),
    v3(-W / 2, belt - o.noseDrop, zf), v3(W / 2, belt - o.noseDrop, zf), v3(W / 2, belt, zb), v3(-W / 2, belt, zb),
  ];
  hexa(g, lb, o.body);
  // Cabin: tapered, windshield leaning far back, rear nearly upright.
  const cf = zf + o.hood, cb = zb - o.tail, top = belt + o.cabH;
  const w0 = W - 0.04, w1 = W * o.taper;
  const cab = {
    bl: v3(-w0 / 2, belt, cf), br: v3(w0 / 2, belt, cf), rbl: v3(-w0 / 2, belt, cb), rbr: v3(w0 / 2, belt, cb),
    tl: v3(-w1 / 2, top, cf + o.lean), tr: v3(w1 / 2, top, cf + o.lean), rtl: v3(-w1 / 2, top, cb - o.backLean), rtr: v3(w1 / 2, top, cb - o.backLean),
  };
  const cabColor = o.cabin ?? o.body;
  hexa(g, [cab.bl, cab.br, cab.rbr, cab.rbl, cab.tl, cab.tr, cab.rtr, cab.rtl], cabColor);
  const inside = v3(0, (belt + top) / 2, (cf + cb) / 2);
  const faces = {
    front: [cab.bl, cab.br, cab.tr, cab.tl],
    back: [cab.rbr, cab.rbl, cab.rtl, cab.rtr],
    left: [cab.rbl, cab.bl, cab.tl, cab.rtl],
    right: [cab.br, cab.rbr, cab.rtr, cab.tr],
    top: [cab.tl, cab.tr, cab.rtr, cab.rtl],
  };
  // Roof cap, a touch proud of the cabin.
  const rc = o.roof ?? cabColor;
  const tq = faces.top;
  hexa(g, [tq[0].clone().add(v3(-0.04, 0, -0.04)), tq[1].clone().add(v3(0.04, 0, -0.04)), tq[2].clone().add(v3(0.04, 0, 0.04)), tq[3].clone().add(v3(-0.04, 0, 0.04)),
    tq[0].clone().add(v3(-0.02, 0.1, -0.02)), tq[1].clone().add(v3(0.02, 0.1, -0.02)), tq[2].clone().add(v3(0.02, 0.1, 0.02)), tq[3].clone().add(v3(-0.02, 0.1, 0.02))], rc);
  // Glass: an oversized windshield, tall side windows split by a B pillar,
  // a rear window.
  glass(g, subQuad(faces.front, 0.08, 0.92, 0.06, 0.93), inside);
  glass(g, subQuad(faces.left, 0.06, 0.47, 0.1, 0.9), inside, { stripes: 1 });
  glass(g, subQuad(faces.left, 0.55, 0.94, 0.1, 0.9), inside, { stripes: 1 });
  glass(g, subQuad(faces.right, 0.06, 0.45, 0.1, 0.9), inside, { stripes: 1 });
  glass(g, subQuad(faces.right, 0.53, 0.94, 0.1, 0.9), inside, { stripes: 1 });
  glass(g, subQuad(faces.back, 0.12, 0.88, 0.2, 0.88), inside, { stripes: 0 });
  // Wipers, mirrors.
  for (const u of [0.28, 0.62]) panel(g, subQuad(faces.front, u, u + 0.2, 0.06, 0.1, 0.03), 0.06, TRIM, inside);
  // Big cartoon side mirrors on short stalks.
  for (const s of [-1, 1]) {
    box(g, 0.2, 0.06, 0.08, TRIM, s * (W / 2 + 0.06), belt + 0.34, cf + 0.28);
    box(g, 0.12, 0.34, 0.26, TRIM, s * (W / 2 + 0.18), belt + 0.24, cf + 0.28);
  }
  // Wheels at the corners.
  const wz = o.wheelZ ?? L / 2 - o.r - 0.05;
  for (const z of [-wz, wz]) for (const s of [-1, 1]) wheel(g, s * (W / 2 - 0.1), z, o.r, o.wheelW, o.rim, o.tread);
  return { g, o, faces, inside, cab, zf, zb, cf, cb, top, belt };
}
// Common lower-body face details: grille, lamps, bumpers, taillights,
// door seams and handles.
export function faceKit(s, { grille = 0x55535c, bumper = STEEL, lampW = 0.44, lampH = 0.3, round = false, bumperH = 0.26, grilleW = 0.78 } = {}) {
  const { g, o, zf, zb } = s;
  const fy = o.clear + 0.16;
  const fh = Math.max(0.3, o.belt - o.noseDrop - fy - 0.1);
  box(g, grilleW, fh, 0.08, TRIM, 0, fy, zf + 0.02);
  for (let i = 0; i < 4; i++) box(g, grilleW - 0.08, 0.04, 0.1, grille, 0, fy + 0.05 + (i * (fh - 0.1)) / 3, zf + 0.0);
  for (const sx of [-1, 1]) {
    if (round) {
      const m = add(g, ni(new THREE.CylinderGeometry(lampH, lampH, 0.1, 10)), 0xfff3c4, sx * (o.W / 2 - 0.3), fy + 0.2, zf - 0.02, LAMP);
      m.rotation.x = Math.PI / 2;
    } else lamp(g, lampW, lampH, sx * (o.W / 2 - 0.3), fy + fh - lampH - 0.02, zf + 0.0);
    box(g, 0.14, 0.12, 0.08, 0xffa020, sx * (o.W / 2 - 0.08), fy + 0.12, zf + 0.03, { emissive: 0xff8a00, emissiveIntensity: 0.4 }); // turn signal
    box(g, 0.32, 0.24, 0.07, 0xd8202c, sx * (o.W / 2 - 0.26), o.clear + 0.36, zb - 0.02, TAIL);
  }
  box(g, o.W + 0.06, bumperH, 0.18, bumper, 0, o.clear - 0.08, zf - 0.05);
  box(g, o.W + 0.04, bumperH * 0.9, 0.16, bumper, 0, o.clear - 0.08, zb + 0.04);
  // Door seams and handles (thin dark plates on the sides).
  for (const sx of [-1, 1]) {
    const x = sx * (o.W / 2 + 0.005);
    box(g, 0.02, o.belt - o.clear - 0.12, 0.03, TRIM, x, o.clear + 0.06, s.cf + 0.05);
    box(g, 0.02, o.belt - o.clear - 0.12, 0.03, TRIM, x, o.clear + 0.06, (s.cf + s.cb) / 2 + 0.1);
    box(g, 0.03, 0.06, 0.22, TRIM, x, o.belt - 0.22, s.cf + 0.4);
  }
}
// Racing stripes along the hood, cabin top and tail.
export function stripes(s, color, xs = [-0.22, 0.22], wd = 0.2) {
  const { g, o, faces, inside, zf, cf } = s;
  for (const x of xs) {
    const y0 = o.belt - o.noseDrop, y1 = o.belt;
    hexa(g, [v3(x - wd / 2, y0 + 0.004, zf + 0.02), v3(x + wd / 2, y0 + 0.004, zf + 0.02), v3(x + wd / 2, y1 + 0.004, cf), v3(x - wd / 2, y1 + 0.004, cf),
      v3(x - wd / 2, y0 + 0.02, zf + 0.02), v3(x + wd / 2, y0 + 0.02, zf + 0.02), v3(x + wd / 2, y1 + 0.02, cf), v3(x - wd / 2, y1 + 0.02, cf)], color);
    const u = (x + o.W * o.taper * 0.5) / (o.W * o.taper);
    panel(g, subQuad(faces.top, u - wd / (2 * o.W * o.taper), u + wd / (2 * o.W * o.taper), 0, 1), 0.13, color, inside);
  }
}

// ======================================================= PLAYER VEHICLES
// Coupe: pink, white racing stripes, angular lamps, a sharp front bumper
// and a rear spoiler; the cabin as tall as the police car's.
export function coupe() {
  const PINK = 0xf0479a;
  const s = shell({ body: PINK, cabin: PINK, roof: 0xffffff, hood: 0.52 });
  faceKit(s, { bumper: 0xf4f4f0, lampW: 0.42, lampH: 0.18 });
  stripes(s, 0xffffff);
  const { g, o, zb, cb } = s;
  // Chin splitter and a spoiler on the tail.
  box(g, o.W + 0.2, 0.06, 0.34, TRIM, 0, o.clear - 0.14, s.zf - 0.14);
  for (const x of [-0.7, 0.7]) box(g, 0.08, 0.36, 0.1, TRIM, x, o.belt, zb - 0.12);
  hexa(g, [v3(-1.05, o.belt + 0.36, zb - 0.32), v3(1.05, o.belt + 0.36, zb - 0.32), v3(1.05, o.belt + 0.36, zb + 0.06), v3(-1.05, o.belt + 0.36, zb + 0.06),
    v3(-1.05, o.belt + 0.46, zb - 0.28), v3(1.05, o.belt + 0.46, zb - 0.28), v3(1.05, o.belt + 0.52, zb + 0.08), v3(-1.05, o.belt + 0.52, zb + 0.08)], PINK);
  const num = decal("01", "#ffffff", "#e0367a", 0.4, 0.3);
  sideDecal(g, num, o.W / 2 + 0.03, o.belt + 0.25, cb - 0.3);
  bake(g);
  return scaled(g);
}
// Supercar: yellow with black accents, a very short angular wedge nose,
// black air intakes, slit lamps, a big rear wing; the cabin stays tall.
export function supercar() {
  const YEL = 0xffcf1f, BLK = 0x1f1e24;
  const s = shell({ body: YEL, cabin: YEL, roof: BLK, W: 1.94, L: 3.15, hood: 0.66, noseDrop: 0.4, belt: 0.88, clear: 0.24, cabH: 1.56, lean: 0.7, r: 0.44, wheelW: 0.44 });
  const { g, o, zf, zb, faces, inside } = s;
  // Slit headlamps on the wedge, black intakes, splitter, side intakes.
  for (const sx of [-1, 1]) {
    lamp(g, 0.46, 0.1, sx * 0.6, o.clear + 0.26, zf + 0.02);
    box(g, 0.42, 0.22, 0.1, BLK, sx * 0.55, o.clear + 0.0, zf - 0.02);
    hexa(g, [v3(sx * (o.W / 2 + 0.01), o.clear + 0.12, 0.1), v3(sx * (o.W / 2 + 0.06), o.clear + 0.12, 0.1), v3(sx * (o.W / 2 + 0.06), o.clear + 0.12, 0.9), v3(sx * (o.W / 2 + 0.01), o.clear + 0.12, 0.9),
      v3(sx * (o.W / 2 + 0.01), o.belt - 0.18, 0.5), v3(sx * (o.W / 2 + 0.06), o.belt - 0.18, 0.5), v3(sx * (o.W / 2 + 0.06), o.belt - 0.18, 0.9), v3(sx * (o.W / 2 + 0.01), o.belt - 0.18, 0.9)], BLK);
    box(g, 0.36, 0.2, 0.07, 0xd8202c, sx * (o.W / 2 - 0.26), o.clear + 0.34, zb - 0.02, TAIL);
  }
  box(g, 0.5, 0.14, 0.1, BLK, 0, o.clear + 0.0, zf - 0.02);
  box(g, o.W + 0.1, 0.06, 0.24, BLK, 0, o.clear - 0.12, zf - 0.08);
  box(g, o.W + 0.06, 0.2, 0.2, BLK, 0, o.clear - 0.06, zb + 0.04);
  // Black hood stripes and the big wing on struts.
  stripes(s, BLK, [-0.26, 0.26], 0.16);
  for (const x of [-0.6, 0.6]) box(g, 0.08, 0.52, 0.12, BLK, x, o.belt, zb - 0.14);
  hexa(g, [v3(-1.15, o.belt + 0.52, zb - 0.4), v3(1.15, o.belt + 0.52, zb - 0.4), v3(1.15, o.belt + 0.52, zb + 0.1), v3(-1.15, o.belt + 0.52, zb + 0.1),
    v3(-1.15, o.belt + 0.6, zb - 0.36), v3(1.15, o.belt + 0.6, zb - 0.36), v3(1.15, o.belt + 0.7, zb + 0.12), v3(-1.15, o.belt + 0.7, zb + 0.12)], BLK);
  for (const sx of [-1, 1]) box(g, 0.06, 0.3, 0.56, BLK, sx * 1.15, o.belt + 0.46, zb - 0.15);
  void faces, inside;
  bake(g);
  return scaled(g);
}

// ============================================================ POLICE UNITS
// Standard police car: black-and-white, extremely tall cabin, short nose
// and tail, angular grille, red/blue light bar, door badge and POLICE.
export function policeCar() {
  const BLK = 0x1f1e24, WHT = 0xf6f6f2;
  const s = shell({ body: WHT, cabin: WHT, roof: WHT });
  faceKit(s, { bumper: 0x8c9198, grille: 0x8c9198 });
  const { g, o, cf, cb } = s;
  // Black skirt all round, black grille surround: reads black-and-white.
  for (const sx of [-1, 1]) box(g, 0.04, 0.22, o.L - 0.1, BLK, sx * (o.W / 2 + 0.01), o.clear, 0);
  box(g, o.W - 0.1, 0.3, 0.04, BLK, 0, o.clear + 0.14, s.zf + 0.04);
  sideDecal(g, badge(0.4), o.W / 2 + 0.04, o.clear + 0.4, cf + 0.36);
  sideDecal(g, decal("POLICE", null, "#1f1e24", 0.95, 0.26), o.W / 2 + 0.04, o.clear + 0.42, cb - 0.6);
  // Push bar.
  for (const x of [-0.42, 0.42]) box(g, 0.08, 0.5, 0.08, TRIM, x, o.clear - 0.12, s.zf - 0.24);
  box(g, 1.0, 0.07, 0.08, TRIM, 0, o.clear + 0.26, s.zf - 0.24);
  const lens = lightBar(g, s.top + 0.1, (s.cf + s.o.lean + s.cb) / 2 - 0.1);
  // POLICE across the roof for the camera above.
  const roofText = decal("POLICE", null, "#1f1e24", 1.1, 0.3);
  roofText.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  roofText.position.set(0, s.top + 0.112, cb - 0.55);
  g.add(roofText);
  bake(g, [lens.red, lens.blue]);
  const out = scaled(g);
  out.userData.red = lens.red;
  out.userData.blue = lens.blue;
  return out;
}
// Police armored truck: van proportions (tall windshield, very short nose),
// dark navy armour panels with rivets, a reinforced bumper with yellow /
// black warning stripes, caged side windows, light bar, POLICE.
export function policeArmored() {
  const NV = 0x27324f, PL = 0x334064, YEL = 0xf5c01a;
  const s = shell({ body: NV, cabin: NV, roof: PL, W: 2.16, L: 3.35, clear: 0.42, belt: 1.36, hood: 0.36, tail: 0.04, cabH: 1.66, lean: 0.34, backLean: 0.02, taper: 0.88, noseDrop: 0.06, r: 0.5, wheelW: 0.46, rim: 0x6a717b });
  faceKit(s, { bumper: 0x1d1c22, grille: 0x6a717b, lampW: 0.32, lampH: 0.2, bumperH: 0.4 });
  const { g, o, faces, inside, zf, zb, cf, cb } = s;
  // Warning stripes across the ram bumper.
  for (let i = 0; i < 7; i++) {
    const x = -o.W / 2 + 0.12 + i * 0.34;
    hexa(g, [v3(x, o.clear - 0.08, zf - 0.215), v3(x + 0.16, o.clear - 0.08, zf - 0.215), v3(x + 0.16, o.clear - 0.08, zf - 0.2), v3(x, o.clear - 0.08, zf - 0.2),
      v3(x + 0.12, o.clear + 0.32, zf - 0.215), v3(x + 0.28, o.clear + 0.32, zf - 0.215), v3(x + 0.28, o.clear + 0.32, zf - 0.2), v3(x + 0.12, o.clear + 0.32, zf - 0.2)], YEL);
  }
  // Armour plates and rivets on the cabin sides; cages over the windows.
  for (const side of ["left", "right"]) {
    const q = faces[side];
    panel(g, subQuad(q, 0.03, 0.97, 0.0, 0.08), 0.05, PL, inside);
    for (let i = 0; i < 6; i++) for (const v of [0.04, 0.95]) panel(g, subQuad(q, 0.08 + i * 0.165, 0.11 + i * 0.165, v, v + 0.03), 0.08, 0x8a92a0, inside);
    for (let i = 0; i < 4; i++) panel(g, subQuad(q, 0.1 + i * 0.1, 0.12 + i * 0.1, 0.12, 0.88), 0.07, 0x1d1c22, inside);
  }
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) box(g, 0.05, 0.05, 0.05, 0x8a92a0, sx * (o.W / 2 + 0.02), o.clear + 0.5, cf + 0.2 + i * 0.75);
  sideDecal(g, decal("POLICE", null, "#f4f4f0", 1.2, 0.34), o.W / 2 + 0.03, o.clear + 0.5, (cf + cb) / 2 + 0.25);
  sideDecal(g, badge(0.5), o.W / 2 + 0.03, o.clear + 0.5, cf + 0.35);
  // Roof gear, lamps and light bar.
  box(g, 0.9, 0.16, 0.7, 0x1d1c22, 0, s.top + 0.1, cb - 0.6);
  const lens = lightBar(g, s.top + 0.1, cf + s.o.lean + 0.25, 1.7);
  void zb;
  bake(g, [lens.red, lens.blue]);
  const out = scaled(g);
  out.userData.red = lens.red;
  out.userData.blue = lens.blue;
  return out;
}

// --------------------------------------------------------- the helicopter
// Police helicopter body for render/helicopter.js (pieceGeometry build):
// a tall, compact angular cockpit with oversized windows, short fuselage,
// a clearly defined tail boom and fin, skids, a searchlight under the
// nose; white and blue. Nose toward -z, same size as before.
export function heliBody(g) {
  const WHT = 0xf6f6f2, BLU = 0x2552b8, D = 0x2b2a30;
  // Fuselage: a tapered angular pod (wide bottom, narrower top).
  hexa(g, [v3(-1.15, -0.9, -1.4), v3(1.15, -0.9, -1.4), v3(1.15, -0.9, 2.1), v3(-1.15, -0.9, 2.1),
    v3(-0.95, 1.9, -0.2), v3(0.95, 1.9, -0.2), v3(0.95, 1.9, 1.9), v3(-0.95, 1.9, 1.9)], WHT);
  // Blue belly band and lower sides.
  hexa(g, [v3(-1.17, -0.92, -1.42), v3(1.17, -0.92, -1.42), v3(1.17, -0.92, 2.12), v3(-1.17, -0.92, 2.12),
    v3(-1.12, -0.25, -1.1), v3(1.12, -0.25, -1.1), v3(1.12, -0.25, 2.12), v3(-1.12, -0.25, 2.12)], BLU);
  // Nose: a slanted angular cockpit, mostly glass.
  const nose = [v3(-1.1, -0.9, -2.5), v3(1.1, -0.9, -2.5), v3(1.15, -0.9, -1.4), v3(-1.15, -0.9, -1.4),
    v3(-0.8, 1.5, -1.0), v3(0.8, 1.5, -1.0), v3(0.95, 1.9, -0.2), v3(-0.95, 1.9, -0.2)];
  hexa(g, nose, WHT);
  const inside = v3(0, 0.4, -0.6);
  glass(g, subQuad([nose[0], nose[1], nose[5], nose[4]], 0.06, 0.94, 0.25, 0.96), inside);
  glass(g, subQuad([nose[4], nose[5], nose[6], nose[7]], 0.08, 0.92, 0.05, 0.85), inside, { stripes: 1 });
  for (const sx of [-1, 1]) {
    const q = sx < 0 ? [nose[3], nose[0], nose[4], nose[7]] : [nose[1], nose[2], nose[6], nose[5]];
    glass(g, subQuad(q, 0.1, 0.92, 0.32, 0.92), inside, { stripes: 1 });
    // Big side door windows.
    const side = sx < 0 ? [v3(-1.15, -0.9, 2.1), v3(-1.15, -0.9, -1.4), v3(-0.95, 1.9, -0.2), v3(-0.95, 1.9, 1.9)] : [v3(1.15, -0.9, -1.4), v3(1.15, -0.9, 2.1), v3(0.95, 1.9, 1.9), v3(0.95, 1.9, -0.2)];
    glass(g, subQuad(side, sx < 0 ? 0.42 : 0.1, sx < 0 ? 0.9 : 0.58, 0.45, 0.88), v3(0, 0.4, 0.4), { stripes: 1 });
  }
  // Engine housing, mast.
  hexa(g, [v3(-0.7, 1.9, 0.0), v3(0.7, 1.9, 0.0), v3(0.7, 1.9, 2.0), v3(-0.7, 1.9, 2.0), v3(-0.5, 2.5, 0.3), v3(0.5, 2.5, 0.3), v3(0.5, 2.5, 1.8), v3(-0.5, 2.5, 1.8)], 0xdfe3ea);
  box(g, 0.24, 0.6, 0.24, 0x55585f, 0, 2.5, 0.4);
  // Tail boom (tapering), fin, stabiliser, blue stripe.
  hexa(g, [v3(-0.45, 0.4, 1.9), v3(0.45, 0.4, 1.9), v3(0.2, 0.75, 6.7), v3(-0.2, 0.75, 6.7), v3(-0.45, 1.3, 1.9), v3(0.45, 1.3, 1.9), v3(0.2, 1.15, 6.7), v3(-0.2, 1.15, 6.7)], WHT);
  hexa(g, [v3(-0.47, 0.92, 1.95), v3(0.47, 0.92, 1.95), v3(0.22, 0.92, 6.7), v3(-0.22, 0.92, 6.7), v3(-0.47, 1.08, 1.95), v3(0.47, 1.08, 1.95), v3(0.22, 1.02, 6.7), v3(-0.22, 1.02, 6.7)], BLU);
  hexa(g, [v3(-0.12, 0.8, 6.1), v3(0.12, 0.8, 6.1), v3(0.12, 0.8, 6.9), v3(-0.12, 0.8, 6.9), v3(-0.1, 2.5, 6.6), v3(0.1, 2.5, 6.6), v3(0.1, 2.5, 7.1), v3(-0.1, 2.5, 7.1)], BLU);
  box(g, 2.0, 0.1, 0.5, WHT, 0, 1.0, 5.7);
  // Skids.
  for (const sx of [-1, 1]) {
    box(g, 0.14, 0.12, 4.0, 0x6a6e76, sx * 1.2, -1.45, 0.3);
    hexa(g, [v3(sx * 1.2 - 0.07, -1.45, -1.62), v3(sx * 1.2 + 0.07, -1.45, -1.62), v3(sx * 1.2 + 0.07, -1.33, -1.7), v3(sx * 1.2 - 0.07, -1.33, -1.7),
      v3(sx * 1.2 - 0.07, -1.3, -2.05), v3(sx * 1.2 + 0.07, -1.3, -2.05), v3(sx * 1.2 + 0.07, -1.2, -2.0), v3(sx * 1.2 - 0.07, -1.2, -2.0)], 0x6a6e76);
    for (const z of [-0.7, 1.3]) box(g, 0.1, 0.62, 0.1, 0x6a6e76, sx * 1.08, -1.4, z);
  }
  // Searchlight under the nose.
  box(g, 0.44, 0.3, 0.44, D, 0, -1.2, -1.7);
  box(g, 0.32, 0.22, 0.06, 0xfff3c4, 0, -1.16, -1.95, LAMP);
}

// Mini car: red, twin white stripes, an extremely short wheelbase, a tall
// narrow cabin, small wheels, round lamps and a bar of roof lamps.
export function miniCar() {
  const RED = 0xe0262e;
  const s = shell({ body: RED, cabin: RED, roof: 0xffffff, W: 1.74, L: 2.6, hood: 0.36, tail: 0.08, cabH: 1.74, taper: 0.76, r: 0.36, wheelW: 0.32, wheelZ: 0.9 });
  faceKit(s, { round: true, lampH: 0.17, grilleW: 0.6, bumper: 0xf4f4f0 });
  stripes(s, 0xffffff, [-0.18, 0.18], 0.16);
  const { g, o, top, cf, cb } = s;
  // Roof lamp bar: three round lamps on a black rail.
  box(g, 1.2, 0.08, 0.16, TRIM, 0, top + 0.1, cf + o.lean + 0.18);
  for (const x of [-0.38, 0, 0.38]) {
    const m = add(g, ni(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10)), 0xffe58a, x, top + 0.34, cf + o.lean + 0.14, LAMP);
    m.rotation.x = Math.PI / 2;
    const r = add(g, ni(new THREE.CylinderGeometry(0.19, 0.19, 0.08, 10)), TRIM, x, top + 0.34, cf + o.lean + 0.2);
    r.rotation.x = Math.PI / 2;
  }
  // Checker decal on the sides.
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2 === 0) box(g, 0.02, 0.1, 0.1, 0xffffff, sx * (o.W / 2 + 0.01), o.clear + 0.3 + j * 0.1, cb - 0.55 + i * 0.1);
  bake(g);
  // (Smaller than the other cars, like its collision radius.)
  const out = scaled(g);
  out.scale.setScalar(0.84);
  return out;
}
// Monster truck: purple body high on huge treaded tyres with yellow coil
// springs, yellow flame decals, a compact tall cabin, a roof lamp bar.
export function monsterTruck() {
  const PUR = 0x7b3fd1, YEL = 0xf7c51e;
  const R = 0.92, lift = 0.95;
  const s = shell({ body: PUR, cabin: PUR, roof: PUR, W: 1.96, L: 2.9, clear: lift, belt: lift + 0.7, hood: 0.44, tail: 0.1, cabH: 1.46, taper: 0.78, r: R, wheelW: 0.66, wheelZ: 1.12, tread: true, rim: 0xb9bdc4 });
  const { g, o, top, cf, zf, zb } = s;
  // Push the wheels out (wide stance) and add axles and springs.
  for (const w of g.userData.wheels) w.position.x = Math.sign(w.position.x) * (o.W / 2 + 0.2);
  for (const z of [-o.wheelZ, o.wheelZ]) {
    box(g, o.W + 0.5, 0.16, 0.16, TRIM, 0, R - 0.08, z);
    for (const sx of [-1, 1]) {
      box(g, 0.1, lift - R + 0.3, 0.1, 0x55535c, sx * 0.62, R, z);
      for (let i = 0; i < 4; i++) {
        const c = add(g, ni(new THREE.TorusGeometry(0.13, 0.035, 4, 8)), YEL, sx * 0.62, R + 0.06 + i * 0.1, z);
        c.rotation.x = Math.PI / 2;
      }
    }
  }
  faceKit(s, { bumper: 0x3a3940, grilleW: 0.7, lampW: 0.36, lampH: 0.24 });
  // Flame decals along the sides (angular tongues).
  for (const sx of [-1, 1]) {
    const x = sx * (o.W / 2 + 0.02);
    for (let i = 0; i < 4; i++) {
      const z0 = zf + 0.5 + i * 0.42, y0 = o.clear + 0.1;
      hexa(g, [v3(x - 0.01, y0, z0), v3(x + 0.01, y0, z0), v3(x + 0.01, y0, z0 + 0.34), v3(x - 0.01, y0, z0 + 0.34),
        v3(x - 0.01, y0 + 0.42, z0 + 0.42), v3(x + 0.01, y0 + 0.42, z0 + 0.42), v3(x + 0.01, y0 + 0.2, z0 + 0.5), v3(x - 0.01, y0 + 0.2, z0 + 0.5)], i % 2 ? 0xff8a1a : YEL);
    }
  }
  // Roof lamp bar.
  box(g, 1.3, 0.08, 0.16, TRIM, 0, top + 0.1, cf + o.lean + 0.2);
  for (const x of [-0.45, -0.15, 0.15, 0.45]) {
    const m = add(g, ni(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 10)), 0xffe58a, x, top + 0.3, cf + o.lean + 0.16, LAMP);
    m.rotation.x = Math.PI / 2;
  }
  void zb;
  bake(g);
  return scaled(g);
}
// Armored truck (player): gray armour, van-tall windshield over a very
// short nose, riveted angular plates, a heavy bumper, roof lamps; no
// police markings (a yellow hazard band instead).
export function armoredTruck() {
  const GY = 0x8f969f, PL = 0x7c838d, D = 0x2b2a30;
  const s = shell({ body: GY, cabin: GY, roof: PL, W: 2.14, L: 3.35, clear: 0.42, belt: 1.32, hood: 0.36, tail: 0.04, cabH: 1.66, lean: 0.34, backLean: 0.02, taper: 0.88, noseDrop: 0.06, r: 0.5, wheelW: 0.48, rim: 0x55535c });
  faceKit(s, { bumper: D, grille: 0x6a717b, lampW: 0.34, lampH: 0.22, bumperH: 0.42 });
  const { g, o, faces, inside, zf, cf, cb, top } = s;
  for (const sx of [-1, 1]) box(g, 0.14, 0.62, 0.14, D, sx * 0.6, o.clear - 0.1, zf - 0.22);
  box(g, 1.3, 0.12, 0.14, D, 0, o.clear + 0.44, zf - 0.22);
  for (const side of ["left", "right"]) {
    const q = faces[side];
    panel(g, subQuad(q, 0.03, 0.97, 0.0, 0.07), 0.05, PL, inside);
    for (let i = 0; i < 6; i++) for (const v of [0.03, 0.95]) panel(g, subQuad(q, 0.08 + i * 0.165, 0.11 + i * 0.165, v, v + 0.03), 0.08, 0xb8bec6, inside);
  }
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) box(g, 0.05, 0.05, 0.05, 0xb8bec6, sx * (o.W / 2 + 0.02), o.clear + 0.68, zf + 0.35 + i * 0.6);
    box(g, 0.05, 0.5, o.L - 0.5, PL, sx * (o.W / 2 + 0.02), o.clear + 0.1, 0.1);
    // A yellow hazard band (no police markings on the player's truck).
    for (let i = 0; i < 6; i++) box(g, 0.03, 0.14, 0.18, i % 2 ? D : 0xf5c01a, sx * (o.W / 2 + 0.04), o.belt - 0.3, cb - 1.2 + i * 0.18);
  }
  // Roof: hatch and four lamps.
  box(g, 0.8, 0.14, 0.7, D, 0, top + 0.1, cb - 0.6);
  box(g, 1.4, 0.08, 0.16, D, 0, top + 0.1, cf + o.lean + 0.18);
  for (const x of [-0.48, -0.16, 0.16, 0.48]) {
    const m = add(g, ni(new THREE.CylinderGeometry(0.13, 0.13, 0.12, 10)), 0xffe58a, x, top + 0.3, cf + o.lean + 0.14, LAMP);
    m.rotation.x = Math.PI / 2;
  }
  bake(g);
  return scaled(g);
}

// ====================================================== CIVILIAN TRAFFIC
// One coloured geometry per type (instanced in the city; civilian cars
// keep one material). Built from the same shell, a little simpler.
export function cityCar() {
  const s = shell({ body: 0xf1e7cf, cabin: 0xf1e7cf, roof: 0xf7f2e4 });
  faceKit(s, {});
  return s.g;
}
export function compactCar() {
  const s = shell({ body: 0xd83a3a, cabin: 0xd83a3a, roof: 0xffffff, W: 1.72, L: 2.6, hood: 0.36, tail: 0.08, cabH: 1.7, r: 0.36, wheelW: 0.32, wheelZ: 0.88 });
  faceKit(s, { round: true, lampH: 0.16, grilleW: 0.58 });
  stripes(s, 0xffffff, [0], 0.3);
  return s.g;
}
export function taxi() {
  const YEL = 0xffcc1f;
  const s = shell({ body: YEL, cabin: YEL, roof: YEL });
  faceKit(s, {});
  const { g, o, top, cf, cb } = s;
  const zc = (cf + o.lean + cb) / 2;
  box(g, 0.9, 0.34, 0.3, YEL, 0, top + 0.1, zc);
  box(g, 0.92, 0.06, 0.32, 0x1f1e24, 0, top + 0.1, zc);
  // "TAXI" in block letters on both faces (geometry: instancing has no
  // textures): T A X I as small dark bars.
  for (const f of [-1, 1]) {
    const z = zc + f * 0.16;
    // (Mirrored on the front face so it reads left to right from both ends.)
    const bar = (x, y, w, h) => box(g, w, h, 0.02, 0x1f1e24, x * f, top + 0.2 + y, z);
    bar(-0.33, 0.14, 0.16, 0.04); bar(-0.33, 0, 0.05, 0.16);
    bar(-0.12, 0, 0.04, 0.17); bar(-0.04, 0, 0.04, 0.17); bar(-0.08, 0.14, 0.12, 0.04); bar(-0.08, 0.07, 0.12, 0.03);
    bar(0.1, 0, 0.04, 0.17); bar(0.18, 0, 0.04, 0.17); bar(0.14, 0.07, 0.06, 0.04);
    bar(0.33, 0, 0.05, 0.17);
  }
  for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2 === 0) box(g, 0.02, 0.1, 0.12, 0x1f1e24, sx * (o.W / 2 + 0.01), o.clear + 0.36 + j * 0.1, cf + 0.2 + i * 0.12);
  return s.g;
}
export function van() {
  const TQ = 0x3fc2b0;
  const s = shell({ body: TQ, cabin: TQ, roof: 0xf4f4f0, W: 1.98, L: 3.3, belt: 1.02, hood: 0.36, tail: 0.04, cabH: 1.78, lean: 0.38, backLean: 0.02, taper: 0.88 });
  faceKit(s, {});
  const { g, o, top, cf, cb } = s;
  // Roof rack and luggage.
  for (const z of [cf + o.lean + 0.2, (cf + cb) / 2 + 0.2, cb - 0.2]) box(g, o.W * 0.86, 0.06, 0.08, 0x2b2a30, 0, top + 0.18, z);
  for (const sx of [-1, 1]) box(g, 0.06, 0.16, cb - cf - o.lean - 0.2, 0x2b2a30, sx * o.W * 0.42, top + 0.1, (cf + o.lean + cb) / 2 + 0.05);
  box(g, 0.5, 0.36, 0.6, 0x3a6b3a, -0.38, top + 0.24, (cf + cb) / 2 + 0.05);
  box(g, 0.42, 0.3, 0.5, 0xd9822b, 0.2, top + 0.24, (cf + cb) / 2 + 0.6);
  box(g, 0.36, 0.26, 0.4, 0x2f5fb0, 0.3, top + 0.24, (cf + cb) / 2 - 0.3);
  return s.g;
}
export function bus() {
  const WHT = 0xf6f6f2, BLU = 0x2552b8;
  const s = shell({ body: BLU, cabin: WHT, roof: WHT, W: 2.2, L: 4.6, clear: 0.34, belt: 0.96, hood: 0.12, tail: 0.04, cabH: 2.0, lean: 0.12, backLean: 0.02, taper: 0.94, noseDrop: 0.02, r: 0.46, wheelW: 0.4, wheelZ: 1.6 });
  const { g, o, faces, inside, top } = s;
  // Big windscreen already; add the tall passenger windows as a strip and
  // the route number board.
  for (const side of ["left", "right"]) for (let i = 0; i < 4; i++) glass(g, subQuad(faces[side], 0.08 + i * 0.22, 0.26 + i * 0.22, 0.22, 0.84), inside, { stripes: 1 });
  for (const sx of [-1, 1]) box(g, 0.04, 0.24, o.L - 0.3, BLU, sx * (o.W / 2 + 0.02), o.belt + 0.06, 0);
  // Route board over the windscreen: dark plate with an amber "102".
  panel(g, subQuad(faces.front, 0.24, 0.76, 0.84, 0.97), 0.05, 0x1f1e24, inside);
  for (const [u0, u1] of [[0.33, 0.36], [0.42, 0.5], [0.42, 0.45], [0.47, 0.5], [0.56, 0.64], [0.56, 0.59], [0.61, 0.64]]) panel(g, subQuad(faces.front, u0, u1, 0.87, 0.94), 0.07, 0xffc23a, inside);
  faceKit(s, { grilleW: 0.9 });
  return s.g;
}
export function cargoTruck() {
  const WHT = 0xf4f4f0, ORG = 0xf28a1e;
  const s = shell({ body: WHT, cabin: WHT, roof: WHT, W: 2.0, L: 4.2, belt: 1.0, hood: 0.36, tail: 2.2, cabH: 1.56, lean: 0.36, backLean: 0.02, taper: 0.86, wheelZ: 1.5 });
  faceKit(s, {});
  const { g, o, zb } = s;
  // The cargo box: taller than the cab, overhanging it a little.
  const z0 = zb - 2.3, z1 = zb + 0.05;
  box(g, o.W + 0.16, 2.0, z1 - z0, ORG, 0, o.belt - 0.08, (z0 + z1) / 2);
  box(g, o.W + 0.2, 0.1, z1 - z0 + 0.04, 0xd8741a, 0, o.belt + 1.9, (z0 + z1) / 2);
  // A white box logo on both sides (geometry, no texture).
  for (const sx of [-1, 1]) {
    const x = sx * (o.W / 2 + 0.09), zc = (z0 + z1) / 2, y = o.belt + 0.6;
    for (const [dz, dy, w, h] of [[0, 0, 0.8, 0.08], [0, 0.72, 0.8, 0.08], [-0.36, 0, 0.08, 0.8], [0.36, 0, 0.08, 0.8], [0, 0.36, 0.08, 0.4]]) box(g, 0.03, h, w, 0xffffff, x, y + dy, zc + dz);
  }
  return s.g;
}
export const TRAFFIC_TYPES = Object.freeze({ city: cityCar, compact: compactCar, taxi, van, bus, cargo: cargoTruck });

// The five player cars of the evaluation lineup (ids as in vehicles.js).
export const PLAYER_MODELS = Object.freeze({ starter: coupe, super: supercar, mini: miniCar, monster: monsterTruck, armored: armoredTruck });
// Civilian types as single bakeable groups for previews.
export function civilian(type) {
  const g = TRAFFIC_TYPES[type]();
  bake(g);
  return scaled(g);
}

// Civilian traffic geometry for the city's instanced cars (one coloured
// mesh per type, same scale as the game cars).
export function trafficGeometry(type) {
  const g = TRAFFIC_TYPES[type]();
  g.scale.setScalar(CAR_SCALE);
  const wrap = new THREE.Group();
  wrap.add(g);
  return coloredGeometry(wrap);
}

// TARGET: the fleeing getaway car, orange-red with black stripes and bags
// on a roof rack (never confused with the yellow taxi).
export function targetCar() {
  const OR = 0xff5a1f, BLK = 0x1f1e24;
  const s = shell({ body: OR, cabin: OR, roof: BLK });
  faceKit(s, { bumper: BLK });
  stripes(s, BLK, [-0.2, 0.2], 0.16);
  const { g, o, top, cf, cb } = s;
  const zc = (cf + o.lean + cb) / 2;
  for (const z of [zc - 0.35, zc + 0.35]) box(g, o.W * 0.8, 0.06, 0.08, BLK, 0, top + 0.16, z);
  box(g, 0.55, 0.3, 0.5, 0x3a6b3a, -0.25, top + 0.2, zc);
  box(g, 0.4, 0.24, 0.42, 0x6b4a2a, 0.3, top + 0.2, zc - 0.05);
  bake(g);
  return scaled(g);
}
