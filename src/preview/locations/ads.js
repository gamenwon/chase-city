// Casual visual pass: the city's commercial signage and its destruction.
//
// One brand per shop building (world/brands.js) gives it:
//   - a fascia sign over every shopfront (its name), and a small "OPEN"-type
//     neon in the window;
//   - on commercial buildings, a vertical blade sign at a corner and a neon
//     tube along the roof edge;
//   - on some, a rooftop billboard (painted, or a digital screen cycling
//     through ads), or a giant 3D sculpture (burger, donut, pizza...).
// The same signs serve day and night: painted boards by day; at night
// they are drawn at full brightness with an additive glow behind them
// (no real lights). All the text comes from one canvas atlas; all signs
// are one draw call, all glows one, all neon tubes one, all screens one.
//
// Destruction:
//   - a smashed shopfront's fascia and window neon go out (the fallen sign
//     is drawn by storefronts.js); the building's other signs flicker,
//     spark and may die;
//   - a blast nearby makes signs flicker or die, knocks sculptures off,
//     can set off the fireworks shop;
//   - a sculpture knocked off its roof stays lit a moment, falls, bounces
//     and rolls along the road (round ones a long way), hitting cars
//     (damage, fire), props, shop windows; at rest it is never solid: a
//     car shoves it on. Damaged screens glitch.
//   - the fireworks shop sends up rockets and coloured bursts in sequence;
//     a few skim across the street and go off at ground level (small
//     blasts that can set off more).
// Everything stays as it is until restart.
import * as THREE from "three";
import { B, G, cyl, pieceGeometry, bakedMaterial, coloredGeometry } from "./parts.js";
import { BRANDS, BRAND_KEYS, SMALL_SIGNS, ADS } from "../../world/brands.js";
import { SCULPTURES } from "./sculptures.js";
import { Tumblers } from "./tumble.js";

const BASE = 0.4;
const ATLAS = 1024;
// Atlas tiles (px): fascia 256x32 (4 a row), blade 40x160 (one row),
// billboard 256x96 (4 a row), crown 128x32 (8 a row), small 52x26 (two
// columns beside the blades).
const T = { fw: 256, fh: 32, vw: 40, vh: 160, bw: 256, bh: 96, cw: 128, ch: 32, sw: 52, sh: 26 };
const ROW = { fascia: 0, blade: 192, board: 352, crown: 928, small: 192 };
const hexCss = (h) => "#" + h.toString(16).padStart(6, "0");

function drawText(g, text, x, y, w, h, fg, bg, neon, { vertical = false, size = 0.7, outline = true } = {}) {
  g.save();
  g.fillStyle = bg;
  g.fillRect(x, y, w, h);
  // A bright frame (a neon tube look by day and night).
  g.strokeStyle = hexCss(neon);
  g.lineWidth = Math.max(2, Math.min(w, h) * 0.08);
  g.strokeRect(x + g.lineWidth / 2 + 1, y + g.lineWidth / 2 + 1, w - g.lineWidth - 2, h - g.lineWidth - 2);
  g.translate(x + w / 2, y + h / 2);
  if (vertical) g.rotate(Math.PI / 2);
  const W = vertical ? h : w, H = vertical ? w : h;
  let px = Math.floor(H * size);
  g.font = `900 ${px}px "Arial Black", Impact, sans-serif`;
  while (g.measureText(text).width > W * 0.86 && px > 6) g.font = `900 ${--px}px "Arial Black", Impact, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  if (outline) {
    g.lineWidth = Math.max(1.5, px * 0.14);
    g.strokeStyle = "rgba(0,0,0,0.55)";
    g.strokeText(text, 0, px * 0.06);
  }
  g.shadowColor = hexCss(neon);
  g.shadowBlur = px * 0.35;
  g.fillStyle = fg;
  g.fillText(text, 0, px * 0.06);
  g.restore();
}
function buildAtlas() {
  const c = document.createElement("canvas");
  c.width = c.height = ATLAS;
  const g = c.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, ATLAS, ATLAS);
  const uv = {};
  const rect = (x, y, w, h) => ({ u0: x / ATLAS, u1: (x + w) / ATLAS, v0: 1 - (y + h) / ATLAS, v1: 1 - y / ATLAS });
  BRAND_KEYS.forEach((k, i) => {
    const b = BRANDS[k];
    // Fascia: 4 per row.
    const fx = (i % 4) * T.fw, fy = ROW.fascia + Math.floor(i / 4) * T.fh;
    drawText(g, b.name, fx, fy, T.fw, T.fh, b.fg, b.bg, b.neon, { size: 0.68 });
    // Blade: 25 per row.
    const vx = i * T.vw, vy = ROW.blade;
    drawText(g, b.name, vx, vy, T.vw, T.vh, b.fg, b.bg, b.neon, { vertical: true, size: 0.62 });
    // Billboard: 4 per row: the name big, a tag line, stars.
    const bx = (i % 4) * T.bw, by = ROW.board + Math.floor(i / 4) * T.bh;
    const grd = g.createLinearGradient(bx, by, bx, by + T.bh);
    grd.addColorStop(0, b.bg);
    grd.addColorStop(1, "#111");
    g.fillStyle = grd;
    g.fillRect(bx, by, T.bw, T.bh);
    drawText(g, b.name, bx + 8, by + 10, T.bw - 16, T.bh * 0.56, b.fg, "rgba(0,0,0,0)", b.neon, { size: 0.8 });
    g.font = `800 ${Math.round(T.bh * 0.17)}px sans-serif`;
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.fillText(["BEST IN TOWN", "OPEN 24H", "HOT & FRESH", "NEW!", "TRY ME!"][i % 5], bx + T.bw / 2, by + T.bh * 0.82);
    g.fillStyle = hexCss(b.neon);
    for (let s = 0; s < 3; s++) g.fillRect(bx + 14 + s * 10, by + T.bh - 14, 6, 6);
    // Crown: the big name standing on the roof edge.
    const cx = (i % 8) * T.cw, cy = ROW.crown + Math.floor(i / 8) * T.ch;
    drawText(g, b.name, cx, cy, T.cw, T.ch, b.fg, b.bg, b.neon, { size: 0.74 });
    uv[k] = { fascia: rect(fx, fy, T.fw, T.fh), blade: rect(vx, vy, T.vw, T.vh), board: rect(bx, by, T.bw, T.bh), crown: rect(cx, cy, T.cw, T.ch) };
  });
  const small = SMALL_SIGNS.map((w, i) => {
    const x = 920 + (i % 2) * T.sw, y = ROW.small + Math.floor(i / 2) * T.sh;
    drawText(g, w, x, y, T.sw, T.sh, ["#ff4a8a", "#4ae8ff", "#ffd23a", "#7aff6a"][i % 4], "#16131a", [0xff4a8a, 0x4ae8ff, 0xffd23a, 0x7aff6a][i % 4], { size: 0.62, outline: false });
    return rect(x, y, T.sw, T.sh);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, uv, small };
}
// Digital billboard frames (4 ads stacked vertically).
function buildScreens() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 384;
  const g = c.getContext("2d");
  ADS.forEach((a, i) => {
    const y = i * 96;
    g.fillStyle = a.bg;
    g.fillRect(0, y, 256, 96);
    g.fillStyle = "rgba(255,255,255,0.12)";
    for (let k = 0; k < 8; k++) g.fillRect(k * 36 - 10, y, 14, 96);
    drawText(g, a.title, 10, y + 8, 236, 52, a.fg, "rgba(0,0,0,0)", 0xffffff, { size: 0.78 });
    g.font = "800 18px sans-serif";
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.fillText(a.sub, 128, y + 80);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 0.25);
  return tex;
}
function glowTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,0.9)");
  r.addColorStop(0.5, "rgba(255,255,255,0.35)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Quads into flat arrays: centre c, half-vectors r (right) and u (up).
class Quads {
  constructor() {
    this.pos = [];
    this.uv = [];
    this.col = [];
  }
  add(c, r, u, rect, color) {
    const start = this.pos.length / 3;
    const P = (sx, sy) => [c[0] + r[0] * sx + u[0] * sy, c[1] + r[1] * sx + u[1] * sy, c[2] + r[2] * sx + u[2] * sy];
    const V = [[-1, -1, rect.u0, rect.v0], [1, -1, rect.u1, rect.v0], [1, 1, rect.u1, rect.v1], [-1, -1, rect.u0, rect.v0], [1, 1, rect.u1, rect.v1], [-1, 1, rect.u0, rect.v1]];
    for (const [sx, sy, u, v] of V) {
      this.pos.push(...P(sx, sy));
      this.uv.push(u, v);
      this.col.push(color.r, color.g, color.b);
    }
    return { start, count: 6 };
  }
  mesh(material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, material);
    m.frustumCulled = false;
    return m;
  }
}
const FULL = { u0: 0, u1: 1, v0: 0, v1: 1 };

// Sculpture material: its own colours, glowing at night (emissive = its
// vertex colour times `glow`).
function sculptureMaterial() {
  const glow = { value: 0 };
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, flatShading: true });
  m.onBeforeCompile = (s) => {
    s.uniforms.glow = glow;
    s.fragmentShader = "uniform float glow;\n" + s.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * glow;");
  };
  m.customProgramCacheKey = () => "sculpture-glow";
  m.userData.glow = glow;
  return m;
}

const PART_CAP = 700;
const UP = new THREE.Vector3(0, 1, 0);

export class AdSystem {
  constructor(scene, layout, storefronts, renderer, runtime) {
    this.scene = scene;
    this.renderer = renderer;
    this.runtime = runtime;
    this.storefronts = storefronts;
    this.layout = layout;
    const { tex, uv, small } = buildAtlas();
    this.atlas = tex;
    const signQ = new Quads(), glowQ = new Quads(), screenQ = new Quads();
    const tubes = new THREE.Group(); // neon tubes (vertex coloured)
    const frames = new THREE.Group(); // brackets, billboard frames, pedestals
    const white = new THREE.Color(1, 1, 1);
    this.signs = []; // { b, face?, kind, range, glow, neon, state }
    this.boards = []; // digital screens
    this.sculptures = [];
    this.tumblers = new Tumblers(runtime, storefronts);
    this.buildings = new Map(); // building -> { signs: [], tube, sculpture, boards }
    const faceOf = new Map();
    for (const f of storefronts.faces) {
      if (!faceOf.has(f.b)) faceOf.set(f.b, []);
      faceOf.get(f.b).push(f);
    }
    let tubeId = 0;
    for (const b of layout.buildings || []) {
      const brand = b.brand && BRANDS[b.brand];
      const faces = faceOf.get(b);
      if (!brand || !faces?.length) continue;
      const rec = { b, signs: [], tubes: null, sculpture: null, boards: [], brand };
      this.buildings.set(b, rec);
      const neon = new THREE.Color(brand.neon);
      const top = BASE + b.h;
      // The rooftop signs and the sculpture face the street side the chase
      // camera looks at (it sits south-east of the car, +z/+x).
      const view = (f) => f.nx * 0.55 + f.nz * 0.85 + f.span * 0.01;
      const main = faces.reduce((a, f) => (view(f) > view(a) ? f : a), faces[0]);
      const sign = (kind, face, c, r, u, rect, glowScale = 1.5) => {
        const range = signQ.add(c, r, u, rect, white);
        const gr = [r[0] * glowScale + Math.sign(r[0]) * 0.3, r[1] * glowScale, r[2] * glowScale + Math.sign(r[2]) * 0.3];
        const gu = [u[0] * glowScale, u[1] * glowScale + 0.3, u[2] * glowScale];
        const n = face ? [face.nx, face.nz] : [0, 0];
        const back = kind === "blade" ? 0 : -0.02;
        const glow = glowQ.add([c[0] + n[0] * back, c[1], c[2] + n[1] * back], gr, gu, FULL, neon);
        const s = { b, face, kind, range, glow, neon: neon.clone(), state: "on", since: 0 };
        this.signs.push(s);
        rec.signs.push(s);
        return s;
      };
      for (const f of faces) {
        // Fascia over the shopfront, 8:1 (as its atlas tile).
        const tx = Math.cos(f.ry), tz = -Math.sin(f.ry), nx = f.nx, nz = f.nz;
        const w = Math.min(f.span - 1.0, 6.4), h = w / 8;
        const cx = b.x + nx * (f.half + 0.16), cz = b.z + nz * (f.half + 0.16), cy = BASE + 2.98;
        sign("fascia", f, [cx, cy, cz], [tx * w / 2, 0, tz * w / 2], [0, h / 2, 0], uv[b.brand].fascia, 1.25);
        // A small neon word in the window (door side).
        const sx = -f.span / 2 + 1.3;
        const word = small[(Math.abs(Math.round(b.x * 3 + b.z)) + f.index) % small.length];
        sign("small", f, [b.x + nx * (f.half + 0.07) + tx * sx, BASE + 1.85, b.z + nz * (f.half + 0.07) + tz * sx], [tx * 0.45, 0, tz * 0.45], [0, 0.225, 0], word, 1.8);
      }
      const commercial = b.district === "commercial" || b.diner;
      // Blade signs: at the main face's right corner; a second one on the
      // other street face the camera sees (taller buildings) for a denser
      // commercial street.
      const second = faces.filter((f) => f !== main && f.nx * 0.55 + f.nz * 0.85 > 0.2)[0];
      const blades = commercial && b.h >= 8.5 ? [[main, 1], ...(second && b.h >= 10 ? [[second, -1]] : [])] : [];
      for (const [f, corner] of blades) {
        const tx = Math.cos(f.ry), tz = -Math.sin(f.ry);
        const lx = corner * (f.span / 2 - 0.35);
        const H = Math.min(5.6, b.h - 4.4), W = H / 4;
        const out = f.half + 0.25 + W / 2;
        const c = [b.x + f.nx * out + tx * lx, BASE + 3.7 + H / 2, b.z + f.nz * out + tz * lx];
        const r = [f.nx * W / 2, 0, f.nz * W / 2], u = [0, H / 2, 0];
        const rect = uv[b.brand].blade;
        // (Each face's quad faces away from the plate between them.)
        const s1 = sign("blade", f, [c[0] - tx * 0.04, c[1], c[2] - tz * 0.04], r, u, rect, 1.3);
        const s2 = sign("blade", f, [c[0] + tx * 0.04, c[1], c[2] + tz * 0.04], [-r[0], 0, -r[2]], u, rect, 1.3);
        s2.twin = s1;
        // Brackets and a thin frame.
        const fg = G(frames, b.x + f.nx * f.half + tx * lx, 0, b.z + f.nz * f.half + tz * lx, f.ry);
        for (const y of [BASE + 3.85, BASE + 3.55 + H]) B(fg, 0.08, 0.08, W + 0.3, 0x3a3940, 0, y, (W + 0.3) / 2);
        B(fg, 0.06, H + 0.1, W + 0.12, 0x2a292e, 0, BASE + 3.65, 0.25 + W / 2);
      }
      if (commercial) {
        // Neon tube along the parapet (lit at night, a coloured trim by day).
        const tg = G(tubes, b.x, top + 0.55, b.z);
        const col = brand.neon;
        B(tg, b.w + 0.1, 0.09, 0.09, col, 0, 0, b.d / 2);
        B(tg, b.w + 0.1, 0.09, 0.09, col, 0, 0, -b.d / 2);
        B(tg, 0.09, 0.09, b.d, col, b.w / 2, 0, 0);
        B(tg, 0.09, 0.09, b.d, col, -b.w / 2, 0, 0);
        // Corner uprights on taller buildings.
        if (b.h >= 11) for (const sx of [-1, 1]) B(tg, 0.09, b.h - 4.2, 0.09, col, (sx * b.w) / 2, -(b.h - 4.2), b.d / 2);
        rec.tubeId = tubeId++;
        tg.userData.tube = rec.tubeId;
      }
      // Crown: the shop's name in big letters standing on the roof edge
      // of the main face (under a sculpture, or on its own).
      if (commercial && b.billboard !== "painted" && b.billboard !== "digital") {
        const f = main, tx = Math.cos(f.ry), tz = -Math.sin(f.ry);
        const W = Math.min(f.span - 0.6, 7.2), H = W / 4;
        const lz = f.half - 0.1;
        const cy = top + 0.45 + H / 2;
        sign("crown", f, [b.x + f.nx * (lz + 0.1), cy, b.z + f.nz * (lz + 0.1)], [tx * W / 2, 0, tz * W / 2], [0, H / 2, 0], uv[b.brand].crown, 1.25);
        const fg = G(frames, b.x + f.nx * lz, top + 0.4, b.z + f.nz * lz, f.ry);
        B(fg, W + 0.2, H + 0.16, 0.14, 0x2a292e, 0, 0, 0);
        for (const sx of [-1, 1]) {
          const st = B(fg, 0.1, H, 0.1, 0x55535c, (sx * W) / 3, 0, -0.6);
          st.rotation.x = -0.45;
        }
      }
      // Rooftop billboard.
      if (b.billboard && !b.sculpture) {
        const f = main, tx = Math.cos(f.ry), tz = -Math.sin(f.ry);
        const W = Math.min(f.span - 1.2, 6.6), H = (W * 3) / 8;
        const lz = f.half - 0.9;
        const cx = b.x + f.nx * (lz + 0.09), cz = b.z + f.nz * (lz + 0.09), cy = top + 1.1 + H / 2;
        const fg = G(frames, b.x + f.nx * lz, top, b.z + f.nz * lz, f.ry);
        B(fg, W + 0.3, H + 0.3, 0.16, 0x3a3940, 0, 0.95, 0);
        for (const sx of [-1, 1]) B(fg, 0.18, 1.0, 0.18, 0x55535c, (sx * W) / 3, 0, -0.1);
        B(fg, W + 0.4, 0.06, 0.6, 0x55535c, 0, 0.92, 0.35);
        if (b.billboard === "digital") {
          const range = screenQ.add([cx, cy, cz], [tx * W / 2, 0, tz * W / 2], [0, H / 2, 0], FULL, white);
          const glow = glowQ.add([cx - f.nx * 0.02, cy, cz - f.nz * 0.02], [tx * (W * 0.7 + 0.4), 0, tz * (W * 0.7 + 0.4)], [0, H * 0.75 + 0.4, 0], FULL, new THREE.Color(0x9fd8ff));
          const s = { b, face: f, kind: "screen", range, glow, neon: new THREE.Color(0x9fd8ff), state: "on", since: 0 };
          this.boards.push(s);
          rec.signs.push(s);
          this.signs.push(s);
        } else sign("board", f, [cx, cy, cz], [tx * W / 2, 0, tz * W / 2], [0, H / 2, 0], uv[b.brand].board, 1.3);
      }
      // Giant sculpture on a pedestal in the middle of the roof.
      if (b.sculpture && SCULPTURES[b.sculpture]) {
        const def = SCULPTURES[b.sculpture];
        const pg = G(frames, b.x, top, b.z, main.ry);
        B(pg, 1.8, 0.35, 1.8, 0x3a3940, 0, 0, 0);
        cyl(pg, 0.18, 0.22, 1.0, 0x55535c, 0, 0.35, 0, 8);
        B(pg, 1.2, 0.12, 1.2, 0x3a3940, 0, 1.3, 0);
        const mat = sculptureMaterial();
        const mesh = new THREE.Mesh(pieceGeometry(def.build), mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        const home = new THREE.Vector3(b.x, top + 1.42 + def.mount, b.z);
        // At night a coloured halo behind it (no light source: a glow quad).
        const tx = Math.cos(main.ry), tz = -Math.sin(main.ry);
        const hr = def.r * 1.25;
        rec.halo = glowQ.add([b.x - main.nx * 0.8, home.y, b.z - main.nz * 0.8], [tx * hr, 0, tz * hr], [0, hr, 0], FULL, neon);
        const q0 = new THREE.Quaternion().setFromAxisAngle(UP, main.ry);
        const sc = { b, kind: b.sculpture, def, mesh, mat, home, q0, face: main, rec, state: "mounted" };
        // A donut that stops rolling topples flat.
        if (def.wheel) sc.onRest = (pc) => {
          pc.q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
          pc.pos.y = 0.05 + 0.6 * 1.65;
        };
        this.sculptures.push(sc);
        rec.sculpture = sc;
      }
    }
    // Draw calls: signs, glows, tubes, screens, frames (+ one a sculpture).
    this.signMat = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true });
    this.signMesh = signQ.mesh(this.signMat);
    this.signMesh.renderOrder = 1;
    this.glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), vertexColors: true, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.glowMesh = glowQ.mesh(this.glowMat);
    this.glowMesh.renderOrder = 2;
    this.screenTex = buildScreens();
    this.screenMat = new THREE.MeshBasicMaterial({ map: this.screenTex, vertexColors: true });
    this.screenMesh = screenQ.mesh(this.screenMat);
    for (const m of [this.signMesh, this.glowMesh, this.screenMesh]) scene.add(m);
    this.tubeMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    if (tubes.children.length) {
      // Per-building colour ranges (a building's tube goes dark with it).
      const ranges = [];
      let at = 0;
      const geos = tubes.children.map((tg) => {
        const g = coloredGeometry(tg);
        g.applyMatrix4(tg.matrix);
        ranges[tg.userData.tube] = { start: at, count: g.attributes.position.count };
        at += g.attributes.position.count;
        return g;
      });
      const merged = new THREE.BufferGeometry();
      const pos = new Float32Array(at * 3), col = new Float32Array(at * 3);
      let o = 0;
      for (const g of geos) {
        pos.set(g.attributes.position.array, o);
        col.set(g.attributes.color.array, o);
        o += g.attributes.position.array.length;
        g.dispose();
      }
      merged.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      merged.setAttribute("color", new THREE.BufferAttribute(col, 3));
      this.tubeMesh = new THREE.Mesh(merged, this.tubeMat);
      this.tubeMesh.frustumCulled = false;
      this.tubeColors = col.slice();
      this.tubeRanges = ranges;
      scene.add(this.tubeMesh);
    }
    if (frames.children.length) {
      const fm = new THREE.Mesh(coloredGeometry(frames, { dropDown: true }), bakedMaterial);
      fm.castShadow = fm.receiveShadow = true;
      scene.add(fm);
    }
    this.signColors = this.signMesh.geometry.attributes.color.array.slice();
    this.signPos = this.signMesh.geometry.attributes.position.array.slice();
    this.glowColors = this.glowMesh.geometry.attributes.color.array.slice();
    // Particles: sign sparks and fireworks (one pool, one draw call),
    // coloured smoke puffs.
    this.parts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial({ toneMapped: false }), PART_CAP);
    this.parts.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PART_CAP * 3), 3);
    this.parts.frustumCulled = false;
    this.parts.count = 0;
    scene.add(this.parts);
    this.puffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false }), 60);
    this.puffs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(60 * 3), 3);
    this.puffs.frustumCulled = false;
    this.puffs.count = 0;
    scene.add(this.puffs);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.q2 = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.c = new THREE.Color();
    this.night = null;
    this.reset();
  }
  reset() {
    this.list = [];
    this.puffList = [];
    this.flicker = new Set();
    this.shows = [];
    this.haloOff = [];
    this.secondary = 0;
    for (const s of this.signs) Object.assign(s, { state: "on", since: 0, until: 0, lit: 1 });
    const sc = this.signMesh.geometry.attributes.color, sp = this.signMesh.geometry.attributes.position, gc = this.glowMesh.geometry.attributes.color;
    sc.array.set(this.signColors);
    sp.array.set(this.signPos);
    gc.array.set(this.glowColors);
    sc.needsUpdate = sp.needsUpdate = gc.needsUpdate = true;
    const scr = this.screenMesh.geometry.attributes.color;
    scr.array.fill(1);
    scr.needsUpdate = true;
    if (this.tubeMesh) {
      this.tubeMesh.geometry.attributes.color.array.set(this.tubeColors);
      this.tubeMesh.geometry.attributes.color.needsUpdate = true;
      this.tubeDead = new Set();
    }
    if (!this.tumblers.pieces.length) for (const sc of this.sculptures) this.tumblers.add(sc);
    this.tumblers.reset();
    for (const sc of this.sculptures) {
      Object.assign(sc, { state: "mounted", glowUntil: Infinity });
      sc.pos.copy(sc.home);
      sc.vel.set(0, 0, 0);
      sc.q.copy(sc.q0);
      sc.w.set(0, 0, 0);
      sc.mesh.position.copy(sc.pos);
      sc.mesh.quaternion.copy(sc.q);
    }
    this.stats = { sculptures: this.sculptures.length, detached: 0, sculptureHits: 0, signsOut: 0, flickering: 0, fireworks: 0, rockets: 0, bursts: 0, groundBlasts: 0, screensGlitched: 0 };
    this.parts.count = 0;
    this.puffs.count = 0;
  }

  // ---------------------------------------------------------- signs --
  setSign(s, k) {
    // k: brightness 0..1 for the sign face (and its glow).
    const col = s.kind === "screen" ? this.screenMesh.geometry.attributes.color : this.signMesh.geometry.attributes.color;
    const base = s.kind === "screen" ? null : this.signColors;
    for (let i = s.range.start; i < s.range.start + s.range.count; i++) {
      const o = i * 3;
      const r = base ? base[o] : 1;
      col.array[o] = r * (0.25 + 0.75 * k);
      col.array[o + 1] = (base ? base[o + 1] : 1) * (0.25 + 0.75 * k);
      col.array[o + 2] = (base ? base[o + 2] : 1) * (0.25 + 0.75 * k);
    }
    col.needsUpdate = true;
    const gc = this.glowMesh.geometry.attributes.color;
    for (let i = s.glow.start; i < s.glow.start + s.glow.count; i++) {
      gc.array[i * 3] = this.glowColors[i * 3] * k;
      gc.array[i * 3 + 1] = this.glowColors[i * 3 + 1] * k;
      gc.array[i * 3 + 2] = this.glowColors[i * 3 + 2] * k;
    }
    gc.needsUpdate = true;
    s.lit = k;
  }
  hideSign(s) {
    // A fascia whose shopfront is smashed (storefronts draws it fallen).
    const p = this.signMesh.geometry.attributes.position;
    const o = s.range.start * 3;
    for (let i = 1; i < s.range.count; i++) for (let k = 0; k < 3; k++) p.array[o + i * 3 + k] = p.array[o + k];
    p.needsUpdate = true;
    this.setSign(s, 0);
    s.state = "dead";
  }
  // Damaged: flicker for a while (sparks), then die or keep flickering.
  damageSign(sim, s, dur = 3) {
    if (s.state === "dead") return;
    const now = sim?.elapsed ?? 0;
    if (s.state !== "flicker") this.stats.flickering++;
    s.state = "flicker";
    s.since = now;
    s.until = now + dur + Math.random() * 2;
    s.dies = Math.random() < 0.55;
    this.flicker.add(s);
    if (s.kind === "screen") this.stats.screensGlitched++;
    this.sparksAt(s, 10);
    if (sim) sim.city?.events.push({ id: ++sim.city.eventId, type: "prop", action: "spark", x: this.signX(s), z: this.signZ(s), strength: 7, sound: "buzz" });
  }
  killSign(s) {
    if (s.state === "dead") return;
    this.setSign(s, 0);
    s.state = "dead";
    this.flicker.delete(s);
    this.stats.signsOut++;
  }
  signX(s) {
    const a = this.signPos, o = s.range.start * 3;
    return (a[o] + a[o + 6]) / 2;
  }
  signZ(s) {
    const a = this.signPos, o = s.range.start * 3;
    return (a[o + 2] + a[o + 8]) / 2;
  }
  signY(s) {
    const a = this.signPos, o = s.range.start * 3;
    return (a[o + 1] + a[o + 7]) / 2;
  }
  sparksAt(s, n) {
    if (s.kind === "screen") return this.burst(this.signX(s), this.signY(s), this.signZ(s), n, [0xffffff, 0x9fd8ff], 4, 14, 0.5);
    this.burst(this.signX(s), this.signY(s), this.signZ(s), n, [0xffe14a, 0xffffff, 0xffa03a], 4, 14, 0.6);
  }
  tubeOff(rec) {
    if (!this.tubeMesh || rec.tubeId == null || this.tubeDead.has(rec.tubeId)) return;
    this.tubeDead.add(rec.tubeId);
    const r = this.tubeRanges[rec.tubeId], c = this.tubeMesh.geometry.attributes.color;
    for (let i = r.start * 3; i < (r.start + r.count) * 3; i++) c.array[i] = this.tubeColors[i] * 0.22;
    c.needsUpdate = true;
  }

  // A shopfront smashed (storefronts.js): its fascia and window neon go,
  // the building's other signs flicker and spark; a hard hit may knock
  // the sculpture off the roof.
  shopBroken(sim, f, speed) {
    const rec = this.buildings.get(f.b);
    if (!rec) return;
    for (const s of rec.signs) {
      if (s.face === f && (s.kind === "fascia" || s.kind === "small")) this.hideSign(s);
      else if (s.kind === "blade" || s.kind === "board" || s.kind === "screen" || s.kind === "crown") {
        if (speed >= 9 && Math.random() < 0.8) this.damageSign(sim, s, 2 + speed * 0.12);
      }
    }
    this.renderer?.night?.hideShopWindow?.(f.b, f.ry);
    const sc = rec.sculpture;
    if (sc?.state === "mounted" && (speed >= 16 || (speed >= 11 && Math.random() < 0.55))) this.detach(sim, sc, f.nx, f.nz, speed);
  }
  // A blast (runtime.blast): signs flicker or die, sculptures knocked off,
  // the fireworks shop set off.
  blast(sim, e, R, s) {
    for (const rec of this.buildings.values()) {
      const b = rec.b;
      const d = Math.max(0, Math.hypot(b.x - e.x, b.z - e.z) - Math.max(b.w, b.d) / 2);
      if (d > R + 2) continue;
      const k = (1 - d / (R + 2)) * Math.sqrt(s);
      for (const sg of rec.signs) {
        if (sg.state === "dead") continue;
        if (k > 0.9 && Math.random() < 0.5) {
          this.sparksAt(sg, 8);
          this.killSign(sg);
        } else if (k > 0.25 && Math.random() < 0.85) this.damageSign(sim, sg, 1.5 + k * 3);
      }
      if (k > 0.8) this.tubeOff(rec);
      const sc = rec.sculpture;
      if (sc?.state === "mounted" && k > 0.35 && Math.random() < 0.4 + k * 0.5) {
        let nx = b.x - e.x, nz = b.z - e.z;
        const l = Math.hypot(nx, nz) || 1;
        this.detach(sim, sc, nx / l, nz / l, 8 + k * 10);
      }
      if (rec.brand.type === "fireworks" && k > 0.3) {
        const f = this.storefronts.faces.find((q) => q.b === b);
        if (f) this.fireworks(sim, f, 12);
      }
    }
  }

  // ------------------------------------------------------ sculptures --
  detach(sim, sc, nx, nz, power) {
    if (sc.state !== "mounted") return;
    if (sc.rec?.halo) this.haloOff = [...(this.haloOff || []), { range: sc.rec.halo, at: (sim?.elapsed ?? 0) + 2.4 }];
    sc.glowUntil = (sim?.elapsed ?? 0) + 2.4;
    this.stats.detached++;
    const side = Math.random() - 0.5;
    this.tumblers.launch(sc, nx * (3 + power * 0.18) - nz * side * 2, 3.2 + power * 0.08, nz * (3 + power * 0.18) + nx * side * 2, 3.2);
    this.burst(sc.pos.x, sc.pos.y - sc.def.r, sc.pos.z, 12, [0xffe14a, 0xffffff], 5, 14, 0.6);
    if (sim) sim.city?.events.push({ id: ++sim.city.eventId, type: "prop", action: "break", x: sc.pos.x, z: sc.pos.z, strength: 12, sound: "metal" });
  }
  step(sim, dt) {
    this.sim = sim;
    this.tumblers.step(sim, dt);
    this.stats.sculptureHits = this.tumblers.stats.hits + this.tumblers.stats.landed;
    // Fireworks: rockets and their ground hits (secondary blasts).
    this.stepShows(sim, dt);
  }
  // ------------------------------------------------------- fireworks --
  fireworks(sim, f, speed) {
    if (!sim || this.shows.some((s) => s.b === f.b)) return;
    this.stats.fireworks++;
    const now = sim.elapsed;
    const n = 16;
    const rockets = Array.from({ length: n }, (_, i) => ({ at: now + 0.15 + i * 0.42 + Math.random() * 0.25, low: i % 4 === 2, launched: false }));
    this.shows.push({ b: f.b, f, rockets, born: now });
    // The shop goes dark; its sculpture (the rocket) goes too.
    const rec = this.buildings.get(f.b);
    if (rec) {
      for (const s of rec.signs) this.damageSign(sim, s, 5);
      if (rec.sculpture?.state === "mounted") this.detach(sim, rec.sculpture, f.nx, f.nz, 14);
    }
    sim.city?.events.push({ id: ++sim.city.eventId, type: "fireworks", action: "start", x: f.b.x, z: f.b.z, strength: 12, sound: "pop" });
  }
  stepShows(sim, dt) {
    if (!this.shows.length) return;
    const now = sim.elapsed;
    const COLORS = [0xff3a3a, 0x3aff6a, 0x3a8aff, 0xffd23a, 0xff5fd8, 0x4ae8ff, 0xffffff, 0xff8a2a];
    for (const show of this.shows) {
      const { f } = show;
      for (const r of show.rockets) {
        if (!r.launched && now >= r.at) {
          r.launched = true;
          this.stats.rockets++;
          const a = Math.random() * Math.PI * 2;
          const tx = Math.cos(f.ry), tz = -Math.sin(f.ry);
          const sx = (Math.random() - 0.5) * (f.span - 1.5);
          r.x = f.b.x + f.nx * (f.half + 0.8) + tx * sx;
          r.z = f.b.z + f.nz * (f.half + 0.8) + tz * sx;
          r.y = 1.2;
          if (r.low) {
            // Skims across the street, bursting at ground level.
            const sp = 9 + Math.random() * 4;
            r.vx = f.nx * sp + tx * (Math.random() - 0.5) * 6;
            r.vz = f.nz * sp + tz * (Math.random() - 0.5) * 6;
            r.vy = 3.5 + Math.random() * 2;
          } else {
            const h = 1.5 + Math.random() * 3;
            r.vx = Math.cos(a) * h + f.nx * 2;
            r.vz = Math.sin(a) * h + f.nz * 2;
            r.vy = 17 + Math.random() * 6;
          }
          r.color = COLORS[(this.stats.rockets * 3) % COLORS.length];
          r.fuse = r.low ? 2.5 : 0.95 + Math.random() * 0.5;
          r.age = 0;
          sim.city?.events.push({ id: ++sim.city.eventId, type: "fireworks", action: "launch", x: r.x, z: r.z, strength: 9, sound: "launch" });
        }
        if (!r.launched || r.done) continue;
        r.age += dt;
        r.vy -= (r.low ? 6 : 9) * dt;
        r.x += r.vx * dt;
        r.y += r.vy * dt;
        r.z += r.vz * dt;
        // Trail sparks.
        if (Math.random() < 0.7) this.spawn(r.x, r.y, r.z, (Math.random() - 0.5) * 1.5, -1 - Math.random(), (Math.random() - 0.5) * 1.5, 0xffd8a0, 0.35, 0.6);
        const ground = r.y <= 0.3;
        if (r.age >= r.fuse || ground || (!r.low && r.vy < 1)) {
          r.done = true;
          this.stats.bursts++;
          const big = !r.low;
          this.burst(r.x, Math.max(0.6, r.y), r.z, big ? 46 : 22, [r.color, r.color, 0xffffff], big ? 9.5 : 6, big ? 3.2 : 9, big ? 1.6 : 0.9, true);
          this.puffList.push({ x: r.x, y: Math.max(0.8, r.y), z: r.z, born: now, color: r.color, size: big ? 2.2 : 1.4 });
          sim.city?.events.push({ id: ++sim.city.eventId, type: "fireworks", action: "burst", x: r.x, z: r.z, strength: big ? 11 : 13, sound: "pop" });
          if (!big && this.secondary < 3) {
            // A ground-level burst is a small blast (sets off what is near).
            this.secondary++;
            this.stats.groundBlasts++;
            sim.events.push({ id: ++sim.eventId, type: "explosion", cause: "fireworks", strength: 0.45, x: r.x, z: r.z, angle: 0, time: now, delay: 0, chainDepth: 1, playerX: sim.player.x, playerZ: sim.player.z });
            if (sim.events.length > 64) sim.events.shift();
          }
        }
      }
    }
    this.shows = this.shows.filter((s) => s.rockets.some((r) => !r.done) || now - s.born < 2);
  }
  // Particles.
  spawn(x, y, z, vx, vy, vz, color, life, size = 1, g = 14) {
    if (this.list.length >= PART_CAP) this.list.shift();
    this.list.push({ x, y, z, vx, vy, vz, color, life, max: life, size, g });
  }
  burst(x, y, z, n, colors, speed, gravity, life, sphere = false) {
    for (let i = 0; i < n; i++) {
      let vx, vy, vz;
      if (sphere) {
        const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
        const sp = speed * (0.75 + Math.random() * 0.3);
        vx = Math.cos(a) * r * sp;
        vy = u * sp;
        vz = Math.sin(a) * r * sp;
      } else {
        const a = Math.random() * Math.PI * 2;
        vx = Math.cos(a) * speed * (0.3 + Math.random());
        vz = Math.sin(a) * speed * (0.3 + Math.random());
        vy = speed * (0.3 + Math.random() * 0.8);
      }
      this.spawn(x, y, z, vx, vy, vz, colors[i % colors.length], life * (0.7 + Math.random() * 0.5), sphere ? 1.1 : 0.7, gravity);
    }
  }

  // ---------------------------------------------------------- render --
  render(dt, sim) {
    const now = sim.elapsed;
    const night = this.renderer?.tod === "night";
    if (night !== this.night) {
      this.night = night;
      // Night: full-bright signs with glows; day: painted boards.
      this.signMat.color.setScalar(night ? 1.0 : 0.92);
      this.signMat.toneMapped = !night;
      this.signMat.needsUpdate = true;
      this.screenMat.toneMapped = !night;
      this.screenMat.needsUpdate = true;
      this.glowMesh.visible = night;
      this.tubeMat.color.setScalar(night ? 1.25 : 0.62);
      this.tubeMat.toneMapped = !night;
      this.tubeMat.needsUpdate = true;
    }
    // Flickering signs (damaged neon; glitching screens).
    for (const s of this.flicker) {
      if (now > s.until) {
        if (s.dies) {
          this.sparksAt(s, 6);
          this.killSign(s);
          continue;
        }
        // Survives, damaged: a stutter now and then.
        if (Math.random() < 0.01) s.until = now + 0.3;
        if (s.lit !== 0.85) this.setSign(s, 0.85);
        continue;
      }
      const on = Math.sin(now * 37 + s.range.start) > -0.2 && Math.random() > 0.25;
      const k = on ? 1 : 0.1;
      if (k !== s.lit) this.setSign(s, k);
      if (s.kind === "screen" && Math.random() < 0.3) {
        // Glitch: colour bands.
        const col = this.screenMesh.geometry.attributes.color;
        const hue = [[1, 0.2, 0.2], [0.2, 1, 0.4], [0.3, 0.4, 1], [1, 1, 1]][Math.floor(Math.random() * 4)];
        for (let i = s.range.start; i < s.range.start + s.range.count; i++) col.array.set(hue, i * 3);
        col.needsUpdate = true;
      }
      if (Math.random() < 0.08) this.sparksAt(s, 3);
    }
    // Halos of sculptures knocked off go out (after their glow).
    if (this.haloOff?.length)
      for (const h of [...this.haloOff])
        if (now >= h.at) {
          const gc = this.glowMesh.geometry.attributes.color;
          for (let i = h.range.start; i < h.range.start + h.range.count; i++) gc.array[i * 3] = gc.array[i * 3 + 1] = gc.array[i * 3 + 2] = 0;
          gc.needsUpdate = true;
          this.haloOff.splice(this.haloOff.indexOf(h), 1);
        }
    // Screens: change ad every 3 s, scrolling into place.
    const cycle = now / 3, frame = Math.floor(cycle), t = Math.min(1, (cycle - frame) * 6);
    this.screenTex.offset.y = 1 - 0.25 * ((frame % 4) + t) - 0.25;
    // Sculptures: pose and glow.
    for (const sc of this.sculptures) {
      sc.mesh.position.copy(sc.pos);
      sc.mesh.quaternion.copy(sc.q);
      let g = 0;
      if (night) {
        if (sc.state === "mounted") g = 0.55;
        else if (now < sc.glowUntil) g = Math.random() < 0.7 ? 0.55 : 0.1;
      }
      sc.mat.userData.glow.value = g;
    }
    // Particles.
    let n = 0;
    this.list = this.list.filter((p) => (p.life -= dt) > 0);
    for (const p of this.list) {
      p.vy -= p.g * dt;
      const drag = Math.exp(-dt * 1.2);
      p.vx *= drag;
      p.vz *= drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.1) {
        p.y = 0.1;
        p.vy = 0;
        p.vx *= 0.5;
        p.vz *= 0.5;
      }
      const k = Math.min(1, p.life / Math.min(0.4, p.max)) * p.size * (p.life < 0.35 && Math.random() < 0.3 ? 0.3 : 1);
      this.m.compose(this.v.set(p.x, p.y, p.z), this.q.identity(), this.s.setScalar(k));
      this.parts.setMatrixAt(n, this.m);
      this.parts.setColorAt(n++, this.c.setHex(p.color));
    }
    this.parts.count = n;
    this.parts.instanceMatrix.needsUpdate = true;
    if (this.parts.instanceColor) this.parts.instanceColor.needsUpdate = true;
    let np = 0;
    this.puffList = this.puffList.filter((p) => now - p.born < 2.6);
    for (const p of this.puffList) {
      const a = (now - p.born) / 2.6;
      this.m.compose(this.v.set(p.x, p.y + a * 1.5, p.z), this.q.identity(), this.s.setScalar(p.size * (0.6 + a)));
      this.puffs.setMatrixAt(np, this.m);
      this.puffs.setColorAt(np++, this.c.setHex(p.color).lerp(new THREE.Color(0x888888), 0.4 + a * 0.4));
      if (np >= 60) break;
    }
    this.puffs.count = np;
    this.puffs.instanceMatrix.needsUpdate = true;
    if (this.puffs.instanceColor) this.puffs.instanceColor.needsUpdate = true;
  }
}
