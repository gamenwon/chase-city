// Sand dunes (a whole block, open on every side): a row of sand ridges
// one after another along the block's long axis, so the ground goes up,
// over a crest, down, and up again. They are jump mounds (game/jumps.js):
// drive up a ridge fast and the car leaves the ground as the crest falls
// away, flies, lands on the next slope or in the dip, and drives on.
// Slower cars just roll over them. No fences, nothing solid: drive in
// from any street, take the ridges along the axis for the biggest flights,
// or across them for a bumpy ride. Coins sit over the crests (coins.js
// puts one on every small mound).
import * as THREE from "three";
import { B, G } from "./parts.js";
import { moundMesh } from "./bigsite.js";

const SIDEWALK = 2.4;
const SAND = 0xe8c886, SAND_DARK = 0xd4ae6a, SAND_LIGHT = 0xf3dca6;

export function dunesPlan(b, R) {
  const x0 = b.kx0 + SIDEWALK, x1 = b.kx1 - SIDEWALK, z0 = b.kz0 + SIDEWALK, z1 = b.kz1 - SIDEWALK;
  const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const alongX = W >= D;
  const L = alongX ? W : D, S = alongX ? D : W;
  const at = (u, v) => (alongX ? { x: cx + u, z: cz + v } : { x: cx + v, z: cz + u });
  const ux = alongX ? 1 : 0, uz = alongX ? 0 : 1;
  const f = { kind: "dunes", block: { x0, x1, z0, z1, cx, cz, alongX }, items: [], flyers: [], vehicles: [], solids: [] };
  // Ridges side by side (each touches the next: up, crest, down, up...),
  // heights varied a little; nearly the full width of the block.
  const len = 5.2, n = Math.max(2, Math.floor((L - 3) / (2 * len)));
  const start = -((n - 1) * 2 * len) / 2;
  const mounds = [];
  for (let i = 0; i < n; i++) {
    const h = [1.7, 2.2, 1.9, 2.4][i % 4] + (R() - 0.5) * 0.2;
    mounds.push({ ...at(start + i * 2 * len, 0), ux, uz, len, w: Math.max(2, S / 2 - 2.2), h, dune: true });
  }
  f.mounds = mounds;
  return { feature: f, mounds };
}

export function dunesDecor(root, f) {
  const { x0, x1, z0, z1, cx, cz, alongX } = f.block;
  const g = G(root, cx, 0, cz);
  const W = x1 - x0, D = z1 - z0;
  // Sand floor with wind-blown streaks.
  B(g, W, 0.05, D, SAND, 0, 0, 0);
  for (let i = 0; i < 9; i++) {
    const a = ((i * 37) % 10) / 10 - 0.5, b = ((i * 61) % 10) / 10 - 0.5;
    B(g, alongX ? 0.18 : 2.4 + (i % 3), 0.012, alongX ? 2.4 + (i % 3) : 0.18, SAND_DARK, a * W * 0.9, 0.05, b * D * 0.9, 0.3);
  }
  for (const m of f.mounds) {
    root.add(moundMesh(m, SAND));
    // A lighter strip along each crest, ripples on the slopes.
    const crest = moundMesh({ ...m, len: m.len * 0.2, h: m.h + 0.02 }, SAND_LIGHT);
    crest.position.y = 0.0;
    root.add(crest);
    for (const sv of [-0.55, 0.55]) {
      const r = moundMesh({ ...m, w: 0.12, x: m.x - m.uz * sv * m.w, z: m.z + m.ux * sv * m.w, h: m.h + 0.025 }, SAND_DARK);
      root.add(r);
    }
    // A pennant on the crest at one side.
    const flag = G(root, m.x - m.uz * (m.w + 0.6), m.h * 0.2, m.z + m.ux * (m.w + 0.6));
    B(flag, 0.06, 1.8, 0.06, 0xf4f4f0, 0, 0, 0);
    B(flag, 0.7, 0.4, 0.03, 0xff6a1a, 0.35, 1.35, 0);
  }
  // Chevron boards at both ends of the run (the camera sees where to go).
  const first = f.mounds[0], last = f.mounds[f.mounds.length - 1];
  const ang = Math.atan2(first.ux, first.uz);
  for (const [m, e] of [[first, -1], [last, 1]]) {
    const fx = m.x + m.ux * e * (m.len + 0.8), fz = m.z + m.uz * e * (m.len + 0.8);
    for (const sv of [-1, 1]) {
      const p = G(root, fx - m.uz * sv * (m.w + 0.6), 0, fz + m.ux * sv * (m.w + 0.6), ang);
      B(p, 0.12, 1.1, 0.12, 0x55535c, 0, 0, 0);
      B(p, 1.0, 0.5, 0.06, 0xf5c01a, 0, 0.75, 0);
      for (let k = 0; k < 3; k++) B(p, 0.16, 0.5, 0.07, 0x232227, -0.32 + k * 0.32, 0.75, 0);
    }
  }
  void THREE;
}
