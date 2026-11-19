// Scripted structural collapse of the gas station canopy (pre-fractured
// pieces built in gas.js). One island blowing up buckles its two columns
// and brings down the row of slabs above it, the other row sags; both
// islands gone and the whole canopy is down on the wrecked pumps. The shop
// sign tears loose and hangs, soot, glass and debris are left everywhere.
// Every piece animates once to its final resting pose and stays there until
// restart. Once a row is down its footprint becomes solid (added only when
// no car is inside it, so nothing is ever trapped or embedded).
import { SLABS } from "./gas.js";

// Deterministic per-piece variation (screenshots repeat).
const jitter = (k, n) => {
  const s = Math.sin(k * 12.9898 + n * 78.233) * 43758.5453;
  return s - Math.floor(s) - 0.5;
};
// Falling under gravity, a small settle at the end.
function fallEase(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (t < 0.82) return (t / 0.82) ** 2;
  return 1 + Math.sin(((t - 0.82) / 0.18) * Math.PI) * 0.04;
}

export class GasCollapse {
  constructor(gas, origin) {
    this.gas = gas;
    this.origin = origin; // GAS block centre (root position)
    this.anims = [];
    this.rows = new Set();
    this.pendingSolids = [];
    this.stats = { rowsDown: 0, full: false };
  }
  pieces() {
    const cv = this.gas.canopy;
    return [...cv.slabs, ...cv.columns, this.gas.martSign];
  }
  reset(sim) {
    for (const p of this.pieces()) {
      p.mesh.position.set(p.home.x, p.home.y, p.home.z);
      p.mesh.rotation.set(0, 0, 0);
      p.state = "up";
    }
    this.anims = [];
    this.rows.clear();
    this.pendingSolids = [];
    this.stats.rowsDown = 0;
    this.stats.full = false;
    this.gas.scatter.visible = false;
    if (sim?.city?.solids) {
      const before = sim.city.solids.length;
      sim.city.solids = sim.city.solids.filter((b) => b.kind !== "gas-collapse");
      if (sim.city.solids.length !== before) sim.refreshNavigation();
    }
  }
  animate(piece, to, at, dur) {
    piece.state = "falling";
    const m = piece.mesh;
    this.anims.push({
      piece,
      at,
      dur,
      from: { x: m.position.x, y: m.position.y, z: m.position.z, rx: m.rotation.x, ry: m.rotation.y, rz: m.rotation.z },
      to,
    });
  }
  // An island (row 0 north, 1 south) has blown up at time `now`.
  collapse(sim, row, now) {
    if (this.rows.has(row)) return;
    this.rows.add(row);
    const cv = this.gas.canopy,
      plan = cv.plan;
    const full = this.rows.size >= 2;
    // 1. Its two columns buckle at the base and lean in over the island.
    for (const c of cv.columns.filter((c) => c.island === row)) {
      const lean = 0.55 + jitter(c.ex, row) * 0.2;
      this.animate(c, { x: c.home.x, y: c.home.y - 0.25, z: c.home.z + jitter(row, c.ex) * 0.3, rx: jitter(c.ex, 3) * 0.3, ry: 0, rz: c.ex * lean }, now + 0.12, 0.55);
    }
    // 2. The slabs of that row drop onto the wrecked pumps, tipping off the
    // island edges to the ground; the outer ones snap and hit the ground
    // at a steep angle.
    const sd = plan.d / SLABS.nz,
      sw = plan.w / SLABS.nx;
    for (const s of cv.slabs.filter((s) => s.iz === row)) {
      const outer = s.ix !== 1;
      const side = s.ix - 1; // -1 west, 0 middle, 1 east
      const away = row === 0 ? -1 : 1; // north row tips north, south row south
      this.animate(
        s,
        {
          x: s.home.x + side * 0.4 + jitter(s.ix, row) * 0.3,
          y: this.origin.y + (outer ? 1.25 : 1.55) + jitter(s.ix, 7) * 0.2,
          z: s.home.z + away * 0.5,
          rx: away * (0.32 + jitter(s.ix, 5) * 0.1),
          ry: jitter(s.ix, row + 9) * 0.25,
          rz: -side * (outer ? 0.42 : 0.06) + jitter(s.ix, 11) * 0.08,
        },
        now + 0.32 + Math.abs(side) * 0.12,
        0.75,
      );
    }
    // 3. The other row: sags on its side towards the fallen row (unless it
    // has fallen itself, or falls now as the second island goes).
    for (const s of cv.slabs.filter((s) => !this.rows.has(s.iz) && s.state === "up")) {
      const toward = row === 0 ? -1 : 1;
      this.animate(s, { x: s.home.x, y: s.home.y - 0.7, z: s.home.z + toward * 0.25, rx: toward * 0.12, ry: 0, rz: jitter(s.ix, 13) * 0.05 }, now + 0.5, 0.6);
      s.state = "sagging";
    }
    // 4. The shop: its sign tears loose at one end and hangs; soot, glass
    // and debris everywhere (scatter piece).
    const ms = this.gas.martSign;
    if (ms.state === "up")
      this.animate(ms, { x: ms.home.x - 0.3, y: ms.home.y - 0.85, z: ms.home.z + 0.25, rx: 0.35, ry: 0.05, rz: -0.32 }, now + 0.2, 0.6);
    this.gas.scatter.visible = true;
    // 5. Solid footprint of the fallen row (and of the whole canopy when
    // both are down), added once no car is inside it.
    const cx = this.origin.x + plan.x,
      cz = this.origin.z + plan.z;
    if (full) this.pendingSolids.push({ x: cx, z: cz, w: plan.w + 0.4, d: plan.d + 0.4, kind: "gas-collapse", at: now + 1 });
    else this.pendingSolids.push({ x: cx, z: cz + (row === 0 ? -sd / 2 : sd / 2), w: plan.w + 0.4, d: sd + 0.3, kind: "gas-collapse", at: now + 1 });
    this.stats.rowsDown = this.rows.size;
    this.stats.full = full;
    return full;
  }
  step(sim, now) {
    for (const a of [...this.anims]) {
      const t = (now - a.at) / a.dur;
      if (t < 0) continue;
      const e = fallEase(t),
        m = a.piece.mesh,
        f = a.from,
        to = a.to;
      m.position.set(f.x + (to.x - f.x) * e, f.y + (to.y - f.y) * e, f.z + (to.z - f.z) * e);
      m.rotation.set(f.rx + (to.rx - f.rx) * e, f.ry + (to.ry - f.ry) * e, f.rz + (to.rz - f.rz) * e);
      if (t >= 1) {
        this.anims.splice(this.anims.indexOf(a), 1);
        a.piece.state = a.piece.state === "sagging" ? "sagging" : "down";
      }
    }
    // Solids: only when the footprint is clear of every car.
    for (const b of [...this.pendingSolids]) {
      if (now < b.at || !sim?.city?.solids) continue;
      const cars = [sim.player, ...sim.police.filter((c) => c.state === "active")];
      const inside = cars.some((c) => Math.abs(c.x - b.x) < b.w / 2 + 1.6 && Math.abs(c.z - b.z) < b.d / 2 + 1.6);
      if (inside) continue;
      this.pendingSolids.splice(this.pendingSolids.indexOf(b), 1);
      // The whole-canopy box replaces the single-row one.
      if (b.w > 0 && b.d > this.gas.canopy.plan.d)
        sim.city.solids = sim.city.solids.filter((o) => o.kind !== "gas-collapse");
      sim.city.solids.push({ x: b.x, z: b.z, w: b.w, d: b.d, kind: "gas-collapse" });
      sim.refreshNavigation();
    }
  }
}
