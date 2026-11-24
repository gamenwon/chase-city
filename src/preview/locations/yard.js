// Container logistics yard (casual pass): a whole block of stacked shipping
// containers under a gantry crane, a giant robot mascot, pallets and cargo.
//
//   lanes     a lane straight through along the block (entrances at both
//             ends) and one across it (entrances in both long sides): four
//             ways in and out, all clear
//   stacks    one stack of 2-3 containers in each quarter (one quarter has
//             the robot instead), each container its own colour
//   crane     a gantry over the cross lane (only its four feet are solid,
//             outside the lanes)
//   fence     panels all round, open at the four entrances
// Containers are moved by bigprops.js: shoved, they slide; a hard hit
// brings the upper ones down off the stack (onto whatever is beside it),
// sometimes setting off the next stack; a very hard one rolls a container
// over; blasts do the same. Nothing is ever fixed in place: a car can push
// any container aside, so the yard never traps it.
import { B, G, cyl } from "./parts.js";

const SIDEWALK = 2.4;
const Y = 0.05;
export const CONTAINER = Object.freeze({ w: 6.06, d: 2.44, h: 2.59 });
const COLORS = [0xd62f2a, 0x2457c5, 0x2fa36b, 0xf0781e, 0xf5c01a, 0x1f6e6a, 0x8a3ab8, 0xe8e4da];

export function yardPlan(b, R) {
  const x0 = b.kx0 + SIDEWALK, x1 = b.kx1 - SIDEWALK, z0 = b.kz0 + SIDEWALK, z1 = b.kz1 - SIDEWALK;
  const W = x1 - x0, D = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const alongX = W >= D;
  const L = alongX ? W : D, S = alongX ? D : W;
  const at = (u, v) => (alongX ? { x: cx + u, z: cz + v } : { x: cx + v, z: cz + u });
  const ry = alongX ? 0 : Math.PI / 2;
  const f = { kind: "containers", block: { x0, x1, z0, z1, cx, cz, alongX, L, S }, items: [], flyers: [], vehicles: [], solids: [], containers: [], crane: null, landmark: null };
  const LANE_V = 3.6, LANE_U = 3.3;
  const lane = (u, v) => Math.abs(v) < LANE_V + 0.4 || Math.abs(u) < LANE_U + 0.4;
  // The robot stands in the quarter the chase camera sees best (+x, +z).
  const robotQ = [Math.sign(alongX ? 1 : 1), 1];
  const rowV = LANE_V + CONTAINER.d / 2 + 0.35;
  const segLo = LANE_U + 0.35, segHi = L / 2 - 0.7;
  let stack = 0;
  for (const su of [-1, 1])
    for (const sv of [-1, 1]) {
      const u = su * ((segLo + segHi) / 2), v = sv * rowV;
      if (su === robotQ[0] && sv === robotQ[1]) {
        f.landmark = { kind: "robot", ...at(u, v + sv * 0.6), y: Y, ry: ry + (alongX ? 0 : 0) };
        continue;
      }
      if (segHi - segLo < CONTAINER.w + 0.2) continue;
      const n = 2 + (R() < 0.45 ? 1 : 0);
      for (let lv = 0; lv < n; lv++)
        f.containers.push({ ...at(u + (R() - 0.5) * 0.3, v), y: Y + lv * CONTAINER.h, ry: ry + (R() - 0.5) * 0.04, level: lv, stack, color: COLORS[Math.floor(R() * COLORS.length)] });
      stack++;
    }
  // A second row behind the first where the block is deep enough.
  const row2 = rowV + CONTAINER.d + 0.5;
  if (S / 2 - row2 > CONTAINER.d / 2 + 0.5)
    for (const su of [-1, 1])
      for (const sv of [-1, 1]) {
        if (su === robotQ[0] && sv === robotQ[1]) continue;
        if (segHi - segLo < CONTAINER.w + 0.2) continue;
        const u = su * ((segLo + segHi) / 2);
        f.containers.push({ ...at(u, sv * row2), y: Y, ry, level: 0, stack, color: COLORS[Math.floor(R() * COLORS.length)] });
        if (R() < 0.6) f.containers.push({ ...at(u, sv * row2), y: Y + CONTAINER.h, ry, level: 1, stack, color: COLORS[Math.floor(R() * COLORS.length)] });
        stack++;
      }
  // Gantry crane over the cross lane: four solid feet by the fence.
  const footU = LANE_U + 0.45, footV = S / 2 - 0.6;
  f.crane = { ...at(0, 0), ry, footU, footV, h: 12.5 };
  for (const su of [-1, 1])
    for (const sv of [-1, 1]) {
      const p = at(su * footU, sv * footV);
      f.solids.push({ x: p.x, z: p.z, w: 0.9, d: 0.9, kind: "craneFoot" });
    }
  // Fence all round, open at the four entrances.
  const panel = 2.4;
  const fly = (kind, u, v, r = 0, extra = {}) => f.flyers.push({ kind, ...at(u, v), y: Y, ry: ry + r, ...extra });
  for (const sv of [-1, 1])
    for (let u = -L / 2 + 1.2; u <= L / 2 - 1.2; u += panel) if (Math.abs(u) > LANE_U + 1.4) fly("siteFence", u, sv * (S / 2 - 0.3), 0);
  for (const su of [-1, 1])
    for (let v = -S / 2 + 1.2; v <= S / 2 - 1.2; v += panel) if (Math.abs(v) > LANE_V + 1.4) fly("siteFence", su * (L / 2 - 0.3), v, Math.PI / 2);
  // Cargo and pallets in the corners (off the lanes, off the stacks).
  for (const [u, v] of [[-(L / 2 - 1.4), -(S / 2 - 1.4)], [L / 2 - 1.4, -(S / 2 - 1.4)], [-(L / 2 - 1.4), S / 2 - 1.4]]) {
    if (lane(u, v)) continue;
    fly("cargo", u, v, R(), { color: COLORS[Math.floor(R() * COLORS.length)] });
  }
  for (const [u, v] of [[-(LANE_U + 1.0), -(S / 2 - 1.3)], [LANE_U + 1.0, S / 2 - 1.3]]) if (!lane(u, v)) f.items.push({ kind: "pallet", ...at(u, v), y: Y, ry: ry + R() });
  // The robot's plinth is solid.
  if (f.landmark) f.solids.push({ x: f.landmark.x, z: f.landmark.z, w: 2.2, d: 2.2, kind: "plinth" });
  return { feature: f };
}

// Static decor: concrete yard, painted lanes, the gantry crane.
export function yardDecor(root, f) {
  const { cx, cz, L, S, alongX } = f.block;
  const g = G(root, cx, 0, cz, alongX ? 0 : Math.PI / 2);
  B(g, L + 0.2, 0.06, S + 0.2, 0x9c9a94, 0, 0.0, 0);
  // Lane lines (yellow) and bay marks.
  for (const sv of [-1, 1]) B(g, L - 1, 0.02, 0.14, 0xf5c01a, 0, 0.06, sv * 3.6);
  for (const su of [-1, 1]) B(g, 0.14, 0.02, S - 1, 0xf5c01a, su * 3.3, 0.06, 0);
  for (let u = -L / 2 + 2; u < L / 2 - 1; u += 2.2) B(g, 1.1, 0.02, 0.18, 0xe8e4da, u, 0.06, 0);
  // Gantry crane.
  const c = f.crane;
  const H = c.h;
  for (const su of [-1, 1])
    for (const sv of [-1, 1]) {
      B(g, 0.7, H, 0.7, 0xf5c01a, su * c.footU, 0, sv * c.footV);
      B(g, 1.1, 0.4, 1.1, 0x3a3940, su * c.footU, 0, sv * c.footV);
    }
  for (const su of [-1, 1]) {
    B(g, 0.9, 1.0, S - 0.4, 0xf5c01a, su * c.footU, H, 0);
    for (let k = 0; k < 6; k++) {
      const d = B(g, 0.12, 2.0, 0.12, 0xc89a10, su * c.footU, H - 2, -S / 2 + 1 + k * (S - 2) / 5);
      d.rotation.x = (k % 2 ? 1 : -1) * 0.6;
    }
  }
  for (const sv of [-1, 1]) B(g, c.footU * 2 + 0.9, 0.8, 0.9, 0xf5c01a, 0, H + 0.1, sv * (S / 2 - 1.2));
  // Trolley with a cabin and a spreader hanging from cables.
  B(g, c.footU * 2 + 0.4, 0.6, 2.2, 0xe8e4da, 0, H + 0.9, 1.0);
  B(g, 1.6, 1.4, 1.6, 0x2457c5, 1.6, H - 0.6, 1.0);
  for (const s of [-0.6, 0.6]) B(g, 0.05, 4.5, 0.05, 0x3a3940, s, H - 4.4, 1.0);
  B(g, 5.6, 0.3, 2.2, 0xf0781e, 0, H - 4.7, 1.0);
  // A container office (decor, in a corner behind the fence line).
  B(g, 0.2, 2.2, 0.2, 0x3a3940, -L / 2 + 0.3, 0, -S / 2 + 0.3);
}

// The robot mascot (landmark), parts in its own frame: legs (base), torso,
// head, two arms. Heights: legs 0-3, torso 3-6, head 6-7.8.
export const ROBOT_PARTS = {
  base: (g) => {
    B(g, 2.2, 0.5, 2.2, 0x3a3940, 0, 0, 0);
    for (const s of [-0.6, 0.6]) {
      B(g, 0.9, 2.6, 1.1, 0x8a9aa8, s, 0.5, 0);
      B(g, 1.1, 0.5, 1.5, 0xd62f2a, s, 0.5, 0.15);
    }
  },
  torso: (g) => {
    B(g, 3.0, 3.0, 2.0, 0x2457c5, 0, -1.5, 0);
    B(g, 1.6, 1.0, 0.1, 0x4ae8ff, 0, -0.6, 1.02);
    for (let i = 0; i < 3; i++) B(g, 0.3, 0.3, 0.1, [0xffd23a, 0xff3a3a, 0x3aff6a][i], -0.6 + i * 0.6, -1.3, 1.02);
    B(g, 3.2, 0.4, 2.2, 0xc9ccd3, 0, 1.3, 0);
  },
  head: (g) => {
    B(g, 1.8, 1.5, 1.6, 0xc9ccd3, 0, -0.75, 0);
    B(g, 1.4, 0.45, 0.1, 0x4ae8ff, 0, -0.35, 0.82);
    cyl(g, 0.06, 0.06, 0.8, 0x3a3940, 0, 0.7, 0, 6);
    B(g, 0.3, 0.3, 0.3, 0xff3a3a, 0, 1.4, 0);
    for (const s of [-1, 1]) B(g, 0.2, 0.6, 0.6, 0xd62f2a, s * 1.0, -0.95, 0);
  },
  arm: (g) => {
    B(g, 0.8, 0.8, 0.8, 0xc9ccd3, 0, -0.4, 0);
    B(g, 0.7, 2.4, 0.7, 0xd62f2a, 0, -2.6, 0);
    B(g, 0.9, 0.6, 0.9, 0x3a3940, 0, -3.1, 0);
  },
};
