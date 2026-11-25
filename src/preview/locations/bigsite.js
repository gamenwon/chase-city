// Large construction site (destruction pass): a whole block of dirt,
// machines and materials with a big earth jump ramp down the middle.
//
//   ramps     one big dirt mound along the block's long axis (1.7 m high,
//             12.4 m long, usable from either end: drive up it fast and
//             the car flies off the crest, jumps.js), two low dirt piles
//             either side for small hops; chevron boards at the feet
//   machines  an excavator and a dump truck (heavy: they barely move),
//             a light tower, a generator, a tool bench
//   materials concrete pipes (roll), brick pallets (burst into bricks),
//             plank stacks, pallets, scaffolding bays (come down in turn),
//             barriers, cones, work signs
//   fence     site fence panels all round with wide openings at both ends
//             of the ramp and in the middle of each long side
//
// Only the site cabin in one corner is solid (and the machines push back
// by their weight); the ramp lanes and the landing area stay clear, so a
// car can come in, jump, smash things and leave any way it likes.
import * as THREE from "three";
import { B, G, cyl } from "./parts.js";
import { JUMP } from "../../game/jumps.js";

const SIDEWALK = 2.4;
const Y = 0.05; // site ground: road level

export function bigsitePlan(b, R) {
  const x0 = b.kx0 + SIDEWALK, x1 = b.kx1 - SIDEWALK, z0 = b.kz0 + SIDEWALK, z1 = b.kz1 - SIDEWALK;
  const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const alongX = W >= D;
  const L = alongX ? W : D, S = alongX ? D : W; // long and short spans
  // Local frame: u along the ramp axis, v across it.
  const at = (u, v) => (alongX ? { x: cx + u, z: cz + v } : { x: cx + v, z: cz + u });
  const ux = alongX ? 1 : 0, uz = alongX ? 0 : 1;
  const ry = alongX ? 0 : Math.PI / 2;
  const f = { kind: "bigsite", block: { x0, x1, z0, z1, cx, cz, alongX }, items: [], flyers: [], vehicles: [], solids: [] };
  // The ramp lane (|v| < 4.2 the whole length) stays clear of everything
  // but the fence posts at its ends: run-up, take-off, landing.
  const lane = (u, v) => Math.abs(v) < 4.2 && Math.abs(u) < L / 2 - 0.8;
  const fly = (kind, u, v, r = 0, extra = {}) => !lane(u, v) && f.flyers.push({ kind, ...at(u, v), y: Y, ry: ry + r, ...extra });
  const item = (kind, u, v, r = 0, extra = {}) => !lane(u, v) && f.items.push({ kind, ...at(u, v), y: Y, ry: ry + r, ...extra });
  const veh = (kind, u, v, r = 0) => f.vehicles.push({ kind, ...at(u, v), y: Y, ry: ry + r });
  // Ramps.
  const mounds = [{ ...at(0, 0), ux, uz, len: 6.2, w: 2.2, h: 1.7, main: true }];
  const side = S / 2 - 3.2;
  if (side > 4.5) for (const sv of [-1, 1]) mounds.push({ ...at(-L / 2 + 6 + R() * 2, sv * side), ux, uz, len: 3.0, w: 1.3, h: 0.75 });
  f.mounds = mounds;
  // Fence: panels along the long sides (a gap in the middle) and the short
  // sides (a wide opening on the ramp line).
  const panel = 2.4;
  for (const sv of [-1, 1])
    for (let u = -L / 2 + 1.2; u <= L / 2 - 1.2; u += panel) if (Math.abs(u) > 4.2) fly("siteFence", u, sv * (S / 2 - 0.3), 0);
  for (const su of [-1, 1])
    for (let v = -S / 2 + 1.2; v <= S / 2 - 1.2; v += panel) if (Math.abs(v) > 4.6) fly("siteFence", su * (L / 2 - 0.3), v, Math.PI / 2);
  // Machines in two opposite corners, off the ramp lanes.
  const mv = S / 2 - 2.6;
  veh("excavator", -L / 2 + 4.5, -mv, 0.4);
  veh("dumpTruck", L / 2 - 4.8, mv, Math.PI);
  // Site cabin (solid) in a third corner.
  const cab = at(L / 2 - 3.6, -S / 2 + 1.7);
  f.cabin = { ...cab, ry, w: 5, d: 2.4 };
  f.solids.push({ x: cab.x, z: cab.z, w: alongX ? 5 : 2.4, d: alongX ? 2.4 : 5, kind: "cabin" });
  // Materials, all loose or breakable.
  fly("pipe", -L / 2 + 3.2, mv - 3.2, 0);
  fly("pipe", -L / 2 + 3.2, mv - 1.7, 0);
  fly("pipe", 2.2, -S / 2 + 1.6, Math.PI / 2);
  fly("bricks", L / 2 - 8.2, mv, 0.2);
  fly("bricks", -L / 2 + 7.8, -mv, -0.3);
  fly("plankStack", L / 2 - 7.0, -mv, 0.1);
  fly("toolTable", -2.8, mv, 0.15);
  fly("generator", -5.0, mv + 0.3, 0.3);
  fly("lightTower", L / 2 - 1.6, S / 2 - 1.2, 0);
  for (let k = 0; k < 3; k++) fly("scaffold", -3.6 + k * 2.45, -S / 2 + 1.4, 0, { group: 900 + Math.floor(R() * 99), level: k });
  for (const [u, v] of [[-L / 2 + 2, 3.4], [-L / 2 + 2, -3.4], [L / 2 - 2, 3.4], [L / 2 - 2, -3.4]]) item("cone", u, v);
  item("barrier", 7.2, 4.8, 0);
  item("barrier", -7.2, -4.8, 0);
  for (const [u, v] of [[4.4, -mv + 0.6], [-4.4, mv - 0.6], [0.8, mv + 0.4], [L / 2 - 6, -mv - 0.2]]) item("pallet", u, v, R() - 0.5);
  for (const [u, v, r] of [[-L / 2 + 1.4, 5.6, 0.3], [L / 2 - 1.4, -5.6, -0.3], [0, S / 2 - 1.2, 0]]) fly("workSign", u, v, r);
  return { feature: f, mounds };
}

// Earth ramp mesh (the same height field as jumps.js).
export function moundMesh(m, color) {
  const g = new THREE.BufferGeometry();
  const as = [-m.len, 0, m.len], bs = [-(m.w + JUMP.side), -m.w, m.w, m.w + JUMP.side];
  const h = (a, b) => m.h * (1 - Math.abs(a) / m.len) * (Math.abs(b) <= m.w ? 1 : 1 - (Math.abs(b) - m.w) / JUMP.side);
  const P = (a, b) => [m.x + m.ux * a - m.uz * b, h(a, b) + 0.06, m.z + m.uz * a + m.ux * b];
  const pos = [];
  for (let i = 0; i < 2; i++)
    for (let k = 0; k < 3; k++) {
      const p00 = P(as[i], bs[k]), p10 = P(as[i + 1], bs[k]), p11 = P(as[i + 1], bs[k + 1]), p01 = P(as[i], bs[k + 1]);
      pos.push(...p00, ...p11, ...p10, ...p00, ...p01, ...p11);
    }
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color }));
}

export function bigsiteDecor(root, f) {
  const { x0, x1, z0, z1, cx, cz, alongX } = f.block;
  const g = G(root, cx, 0, cz);
  const W = x1 - x0, D = z1 - z0;
  // Dirt ground, darker tyre-rutted patches, a gravel strip.
  B(g, W, 0.05, D, 0x9a7046, 0, 0, 0);
  for (let i = 0; i < 6; i++) B(g, 2 + (i % 3), 0.012, 1.2 + (i % 2), 0x7e5a37, ((i * 37) % 10) / 10 * W - W / 2 + 1, 0.05, ((i * 23) % 10) / 10 * D - D / 2 + 1, i * 0.7);
  // Ramps: earth, tyre tracks up the middle, yellow-black chevron boards at
  // each foot (seen from the chase camera), a red flag on the crest.
  for (const m of f.mounds) {
    root.add(moundMesh(m, m.main ? 0xa87a4c : 0x8f6a42));
    if (!m.main) continue;
    for (const s of [-0.8, 0.8]) {
      const t = moundMesh({ ...m, w: 0.25, x: m.x - m.uz * s, z: m.z + m.ux * s, h: m.h + 0.03 }, 0x6e4c2c);
      t.position.y = 0.01;
      root.add(t);
    }
    for (const e of [-1, 1]) {
      const fx = m.x + m.ux * e * (m.len + 0.6), fz = m.z + m.uz * e * (m.len + 0.6);
      const ang = Math.atan2(m.ux, m.uz);
      for (const sv of [-1, 1]) {
        const p = G(root, fx - m.uz * sv * (m.w + 0.9), 0, fz + m.ux * sv * (m.w + 0.9), ang);
        B(p, 0.12, 1.1, 0.12, 0x55535c, 0, 0, 0);
        B(p, 1.0, 0.5, 0.06, 0xf5c01a, 0, 0.75, 0);
        for (let k = 0; k < 3; k++) B(p, 0.16, 0.5, 0.07, 0x232227, -0.32 + k * 0.32, 0.75, 0);
      }
    }
    const flag = G(root, m.x - m.uz * (m.w + 0.4), m.h, m.z + m.ux * (m.w + 0.4));
    B(flag, 0.06, 1.8, 0.06, 0xdedad2, 0, 0, 0);
    B(flag, 0.7, 0.45, 0.03, 0xd62f2a, 0.35, 1.3, 0);
  }
  // The site cabin: a portacabin with windows and steps.
  const c = f.cabin;
  const cb = G(root, c.x, 0.05, c.z, c.ry);
  B(cb, c.w, 2.5, c.d, 0xf2efe6, 0, 0, 0);
  B(cb, c.w + 0.1, 0.15, c.d + 0.1, 0x2457c5, 0, 2.5, 0);
  for (const u of [-1.4, 0.4]) B(cb, 1.0, 0.7, 0.04, 0x2a3a48, u, 1.3, c.d / 2 + 0.01);
  B(cb, 0.8, 1.9, 0.04, 0x8a6a4a, 1.7, 0.15, c.d / 2 + 0.01);
  // A tower crane over the far corner (scenery, well above the cars).
  const tc = G(root, alongX ? x0 + 1.4 : x1 - 1.4, 0.05, alongX ? z1 - 1.4 : z0 + 1.4, alongX ? 0.6 : -0.9);
  B(tc, 1.4, 0.4, 1.4, 0x8a8d93, 0, 0, 0);
  for (let k = 0; k < 7; k++) B(tc, 0.9, 2.4, 0.9, k % 2 ? 0xf5c01a : 0xe8a516, 0, 0.4 + k * 2.4, 0);
  B(tc, 14, 0.7, 0.7, 0xf5c01a, 3.5, 17.2, 0);
  B(tc, 2, 1.6, 1.2, 0x55535c, -3, 16.6, 0);
  cyl(tc, 0.04, 0.04, 8, 0x232227, 9, 9.2, 0, 4);
  B(tc, 1.6, 0.6, 1.0, 0x8a8d93, 9, 8.6, 0);
  return root;
}
