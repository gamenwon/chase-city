// Shop-front clutter on the shopping streets: on about two street faces
// in five, one or two small things stand on the pavement just in front of
// the shop (a sandwich board in the shop's colour, a goods rack, a pair of
// flower pots, a newspaper box). They are flyers (furniture.js): a car
// knocks them flying or smashes them and drives on; nothing here is solid,
// so no route is ever blocked. Spots are kept clear of the game's own
// street furniture (lamps, bins, trees, signs, hydrants).
import { cityProps } from "../../game/city.js";

const hash = (a, b) => {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
};
const SIGN = [0xd62f2a, 0x2457c5, 0x2fa36b, 0xf5c01a, 0xf0781e];
const OUT = 4.0; // from the building centre: 0.5 m in front of the wall

export function streetFlyers(buildings, layout) {
  const fixed = cityProps(layout);
  const clear = (x, z) => fixed.every((p) => Math.hypot(p.x - x, p.z - z) > 1.2);
  const out = [];
  for (const b of buildings) {
    const cx = Math.round((b.x - 15) / 30) * 30 + 15, cz = Math.round((b.z - 15) / 30) * 30 + 15;
    const o = [Math.sign(b.x - cx), Math.sign(b.z - cz)];
    const seed = Math.abs(Math.round(b.x * 7 + b.z * 13 + b.h * 3));
    const faces = [];
    if (o[1]) faces.push({ ry: o[1] > 0 ? 0 : Math.PI, k: o[1] > 0 ? 0 : 1 });
    if (o[0]) faces.push({ ry: o[0] > 0 ? Math.PI / 2 : -Math.PI / 2, k: o[0] > 0 ? 2 : 3 });
    for (const f of faces) {
      const h = hash(b.x * 0.37 + f.k, b.z * 0.53 - f.k);
      if (h > 0.4) continue;
      const nx = Math.sin(f.ry), nz = Math.cos(f.ry); // outward
      const tx = nz, tz = -nx; // along the face
      const at = (u, v = OUT) => ({ x: b.x + tx * u + nx * v, z: b.z + tz * u + nz * v });
      const pick = Math.floor(h * 10) % 4;
      const spots = [-2.5, 2.5, -1.4, 1.4].map((u) => ({ u, ...at(u) })).filter((p) => clear(p.x, p.z));
      if (!spots.length) continue;
      const s = spots[0];
      const color = SIGN[(seed + f.k) % SIGN.length];
      if (pick === 0) out.push({ kind: "sandwichBoard", x: s.x, z: s.z, y: 0.37, ry: f.ry + 0.25, color });
      else if (pick === 1) out.push({ kind: "displayRack", x: s.x, z: s.z, y: 0.37, ry: f.ry });
      else if (pick === 2) {
        out.push({ kind: "flowerPot", x: s.x, z: s.z, y: 0.37, ry: 0 });
        const t = at(s.u + (s.u > 0 ? -0.9 : 0.9));
        if (clear(t.x, t.z)) out.push({ kind: "flowerPot", x: t.x, z: t.z, y: 0.37, ry: 1 });
      } else out.push({ kind: "newsStand", x: s.x, z: s.z, y: 0.37, ry: f.ry });
      // A second thing at some shops: a board out by the kerb side.
      if (h < 0.12 && spots[1] && pick !== 0) out.push({ kind: "sandwichBoard", x: spots[1].x, z: spots[1].z, y: 0.37, ry: f.ry - 0.2, color });
    }
  }
  return out;
}
