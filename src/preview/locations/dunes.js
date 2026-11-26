// Hill road (was the sand dunes block): a real two-lane asphalt street
// through the block along its long axis, joined to the side streets at
// both ends (citygen addHillRoad puts it in the road graph, so traffic,
// pedestrians, police and coins use it). Between the kerbs it rolls:
// up, over a round crest, down, up again and down, back to street level
// at both junctions. The hills are smooth mounds (game/jumps.js): every
// car rides them (player, police, the target; civilian traffic follows
// the surface too). Pavements run along both sides on the same rise;
// the rest of the block is grass sloping down from the embankment.
import * as THREE from "three";
import { B, G } from "./parts.js";
import { groundHeight, JUMP } from "../../game/jumps.js";

const ASPHALT = 0x37363b, WALK = 0xbdbab3, KERB = 0xd9d6cf, LINE = 0xf2efe6, LINE_Y = 0xf5c01a, GRASS = 0x79b85a, BANK = 0x6aa84f, WALL = 0x9a968e;

export function hillRoadPlan(b, road, sidewalk) {
  const { alongX, width } = road;
  // Kerb to kerb along the street (inside the block).
  const s0 = alongX ? b.kx0 : b.kz0, s1 = alongX ? b.kx1 : b.kz1;
  const c = alongX ? road.a.z : road.a.x;
  const at = (s) => (alongX ? { x: s, z: c } : { x: c, z: s });
  const ux = alongX ? 1 : 0, uz = alongX ? 0 : 1;
  // Two hills (flat for a metre at each junction).
  const span = s1 - s0 - 2, len = span / 4;
  const w = width / 2 + sidewalk;
  const mounds = [
    { ...at(s0 + 1 + len), ux, uz, len, w, h: 1.6, smooth: true, hill: true },
    { ...at(s0 + 1 + 3 * len), ux, uz, len, w, h: 1.3, smooth: true, hill: true },
  ];
  const feature = { kind: "hillroad", block: { x0: b.kx0, x1: b.kx1, z0: b.kz0, z1: b.kz1, cx: b.cx, cz: b.cz, alongX }, road: { s0, s1, c, width, sidewalk }, mounds, items: [], flyers: [], vehicles: [], solids: [] };
  return { feature, mounds };
}

export function hillRoadDecor(root, f) {
  const { x0, x1, z0, z1, cx, cz, alongX } = f.block;
  const { s0, s1, c, width, sidewalk } = f.road;
  // Grass over the whole block (under the street).
  const g = G(root, cx, 0, cz);
  B(g, x1 - x0, 0.04, z1 - z0, GRASS, 0, 0, 0);
  // The street as one mesh: cross-section strips swept along the axis,
  // each point on the hill height.
  const H = (s, v) => groundHeight(f.mounds, alongX ? s : c + v, alongX ? c + v : s);
  const P = (s, v, y) => (alongX ? [s, y, c + v] : [c + v, y, s]);
  const pos = [], col = [];
  const tint = new THREE.Color();
  const quad = (a, b, d, e, color) => {
    tint.setHex(color);
    for (const p of [a, b, d, a, d, e]) {
      pos.push(...p);
      col.push(tint.r, tint.g, tint.b);
    }
  };
  const hw = width / 2, ww = hw + sidewalk, bank = ww + JUMP.side;
  const step = 0.6, lift = 0.035;
  for (let s = s0 - 0.6; s < s1 + 0.6 - 1e-6; s += step) {
    const t = Math.min(s + step, s1 + 0.6);
    // Strips: [v from, v to, height above the hill, colour].
    const strips = [
      [-hw, hw, 0, ASPHALT],
      [hw, hw + 0.25, 0.14, KERB],
      [-hw - 0.25, -hw, 0.14, KERB],
      [hw + 0.25, ww, 0.14, WALK],
      [-ww, -hw - 0.25, 0.14, WALK],
    ];
    for (const [v0, v1, up, color] of strips)
      quad(P(s, v0, H(s, v0) + lift + up), P(t, v0, H(t, v0) + lift + up), P(t, v1, H(t, v1) + lift + up), P(s, v1, H(s, v1) + lift + up), color);
    // Kerb faces (road edge up to the pavement).
    for (const v of [hw, -hw]) quad(P(s, v, H(s, v) + lift), P(t, v, H(t, v) + lift), P(t, v, H(t, v) + lift + 0.14), P(s, v, H(s, v) + lift + 0.14), KERB);
    // Embankments: from the pavement edge down to the grass.
    for (const sg of [1, -1]) {
      const a = sg * ww, b = sg * bank;
      const ha = H(s, a), ta = H(t, a);
      if (ha < 0.02 && ta < 0.02) continue;
      quad(P(s, a, ha + lift + 0.14), P(t, a, ta + lift + 0.14), P(t, b, lift), P(s, b, lift), ha > 0.9 ? WALL : BANK);
    }
    // Lane lines: a dashed centre line and solid edge lines.
    const dash = Math.floor((s - s0) / step) % 5 < 2;
    if (dash) quad(P(s, -0.08, H(s, 0) + lift + 0.012), P(t, -0.08, H(t, 0) + lift + 0.012), P(t, 0.08, H(t, 0) + lift + 0.012), P(s, 0.08, H(s, 0) + lift + 0.012), LINE_Y);
    for (const sg of [1, -1]) {
      const v = sg * (hw - 0.35);
      quad(P(s, v - 0.07, H(s, v) + lift + 0.012), P(t, v - 0.07, H(t, v) + lift + 0.012), P(t, v + 0.07, H(t, v) + lift + 0.012), P(s, v + 0.07, H(s, v) + lift + 0.012), LINE);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  // (Faces point up whichever way the strip was swept.)
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i += 3) {
    const ay = p.getY(i), by = p.getY(i + 1), cy = p.getY(i + 2);
    const ax = p.getX(i), az = p.getZ(i), bx = p.getX(i + 1), bz = p.getZ(i + 1), cx2 = p.getX(i + 2), cz2 = p.getZ(i + 2);
    const ny = (bz - az) * (cx2 - ax) - (bx - ax) * (cz2 - az);
    if (ny < 0) {
      p.setXYZ(i + 1, cx2, cy, cz2);
      p.setXYZ(i + 2, bx, by, bz);
    }
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
  mesh.receiveShadow = true;
  root.add(mesh);
}
