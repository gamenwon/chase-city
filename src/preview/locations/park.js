// Fountain park: striped lawn, paved cross paths that run from all four
// pavements into an octagonal plaza, a tiered fountain in the middle,
// flower beds on the diagonals, benches in pairs at each path mouth
// (facing the fountain), lamps, bins and four corner trees. A car that
// hits the fountain breaks it: a burst of water, then the broken fountain
// (tiers toppled, basin wall gone on the impact side, a leaking pipe and a
// puddle) stays until restart.
import * as THREE from "three";
import { C, B, G, cyl, ico, bake, tree, octRing, octDisc, pieceMesh, mergeGeometries } from "./parts.js";
import { PARK } from "./layout.js";

const TOP = 0.4;
const PLAZA = 5.0; // apothem of the plaza octagon
const PATH = 2.6;
const cos8 = Math.cos(Math.PI / 8);

function fountainBase(g, broken) {
  // Step, basin wall with coping (8 segments; the broken one loses the two
  // facing +z), inner floor.
  octDisc(g, 2.75 / cos8, 0.22, C.stone, 0, 0, 0);
  const skip = broken ? [0, 7] : [];
  octRing(g, 2.35, 0.55, 0.3, 0xd9cdb8, 0.22, skip);
  octRing(g, 2.43, 0.1, 0.46, C.stone, 0.77, skip);
  octDisc(g, 2.05 / cos8, 0.05, 0x3a7f9c, 0, 0.22, 0);
}
function fountainTiers(g) {
  cyl(g, 0.42, 0.5, 1.1, C.stone, 0, 0.27, 0, 8);
  cyl(g, 1.1, 0.5, 0.32, 0xd9cdb8, 0, 1.37, 0, 8);
  cyl(g, 0.22, 0.26, 0.75, C.stone, 0, 1.69, 0, 8);
  cyl(g, 0.62, 0.24, 0.24, 0xd9cdb8, 0, 2.44, 0, 8);
  ico(g, 0.17, C.stone, 0, 2.86, 0);
}
function fountainBroken(g) {
  // Blown apart toward +z (the runtime turns it to face the car): three
  // basin segments gone, the two beside the gap cracked and leaning out,
  // the pedestal snapped, the lower bowl split in two, column and top bowl
  // thrown out onto the plaza, a broken pipe sticking up, rubble.
  octDisc(g, 2.75 / cos8, 0.22, C.stone, 0, 0, 0);
  octRing(g, 2.35, 0.55, 0.3, 0xd9cdb8, 0.22, [0, 1, 7, 2, 6]);
  octRing(g, 2.43, 0.1, 0.46, C.stone, 0.77, [0, 1, 7, 2, 6]);
  octDisc(g, 2.05 / cos8, 0.05, 0x2f6f8c, 0, 0.22, 0);
  const side = 2 * 2.35 * Math.tan(Math.PI / 8);
  for (const i of [2, 6]) {
    // Cracked segments beside the gap: lower than the rest, tilted out.
    const a = (i * Math.PI) / 4;
    const s = B(g, side * 0.8, 0.42, 0.3, 0xd9cdb8, Math.sin(a) * 2.25, 0.2, Math.cos(a) * 2.25, a);
    s.rotation.x = 0.28;
  }
  // Pipe and the snapped pedestal stump.
  cyl(g, 0.42, 0.5, 0.45, C.stone, 0, 0.27, 0, 8);
  const cap = cyl(g, 0.4, 0.42, 0.08, 0x8f8778, 0.05, 0.72, 0, 8);
  cap.rotation.z = 0.35;
  cyl(g, 0.07, 0.07, 0.8, C.metal, 0.05, 0.6, -0.05, 6);
  // Lower bowl split: one half tipped in the basin, one out on the plaza.
  const h1 = cyl(g, 1.1, 0.5, 0.32, 0xd9cdb8, -0.7, 0.3, -0.5, 8);
  h1.rotation.set(-0.6, 0.4, 0.5);
  h1.scale.x = 0.55;
  const h2 = cyl(g, 1.1, 0.5, 0.32, 0xd9cdb8, 1.4, 0.05, 3.4, 8);
  h2.rotation.set(1.35, 0.9, 0.2);
  h2.scale.x = 0.55;
  // Column and top bowl thrown out.
  const c1 = cyl(g, 0.22, 0.26, 0.75, C.stone, -0.5, 0.25, 3.8, 8);
  c1.rotation.set(Math.PI / 2, 0.6, 0);
  const tb = cyl(g, 0.62, 0.24, 0.24, 0xd9cdb8, -1.6, 0.3, 4.4, 8);
  tb.rotation.set(1.2, 0.3, 0.4);
  ico(g, 0.17, C.stone, 0.9, 0.17, 4.7);
  // Rubble fan through the gap and round the basin.
  for (let i = 0; i < 16; i++) {
    const a = -1.1 + i * 0.15, r = 2.6 + (i % 4) * 0.55;
    const piece = B(g, 0.3 + (i % 3) * 0.18, 0.18 + (i % 2) * 0.12, 0.28 + (i % 2) * 0.1, i % 2 ? 0xd9cdb8 : C.stone, Math.sin(a) * r, 0, Math.cos(a) * r, i * 0.7);
    piece.rotation.z = (i % 3) * 0.25;
  }
}
function bed(g) {
  // Raised bed: stone border (4 pieces, ends between the sides), soil,
  // rows of faceted flowers in four colours on short stems.
  const w = 2.8, d = 1.5, t = 0.18, h = 0.32;
  B(g, w, h, t, C.stone, 0, 0, -d / 2 + t / 2);
  B(g, w, h, t, C.stone, 0, 0, d / 2 - t / 2);
  B(g, t, h, d - 2 * t, C.stone, -w / 2 + t / 2, 0, 0);
  B(g, t, h, d - 2 * t, C.stone, w / 2 - t / 2, 0, 0);
  B(g, w - 2 * t, h - 0.06, d - 2 * t, C.soil, 0, 0, 0);
  for (let i = 0; i < 9; i++)
    for (let j = 0; j < 3; j++) {
      const x = -1.08 + i * 0.27, z = -0.34 + j * 0.34;
      B(g, 0.04, 0.2, 0.04, C.leaf[1], x, h - 0.06, z);
      ico(g, 0.09, C.flower[(i + j) % 4], x, h + 0.2, z);
    }
}

export function buildPark(scene) {
  const root = new THREE.Group();
  root.position.set(PARK.x, 0, PARK.z);
  scene.add(root);
  const s = new THREE.Group();
  B(s, 18.4, 0.1, 18.4, C.grass, 0, 0.3, 0);
  for (let i = -2; i <= 2; i++) B(s, 18.4, 0.006, 1.8, C.grassStripe, 0, TOP, i * 3.6);
  // Plaza: octagon of paving, a darker ring of setts, edging between the
  // path mouths.
  octDisc(s, PLAZA / cos8, 0.04, C.pave, 0, TOP, 0);
  octDisc(s, 3.4 / cos8, 0.045, 0xb8ab92, 0, TOP, 0);
  octRing(s, PLAZA + 0.15, 0.08, 0.15, C.paveEdge, TOP, [0, 2, 4, 6]);
  // Paths from the plaza to the pavement on all four sides, edged.
  const start = PLAZA * Math.tan(Math.PI / 8) > PATH / 2 ? PLAZA - 0.05 : PLAZA;
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const p = G(s, 0, 0, 0, a);
    const len = 9.2 - start;
    B(p, PATH, 0.04, len, C.pave, 0, TOP, start + len / 2);
    for (const e of [-1, 1]) B(p, 0.15, 0.08, len - 0.15, C.paveEdge, e * (PATH / 2 + 0.075), TOP, start + 0.15 + (len - 0.15) / 2);
  }
  // Flower beds on the diagonals, tangent to the plaza.
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    bed(G(s, Math.sin(a) * 7.0, TOP, Math.cos(a) * 7.0, a));
  }
  // (The corner trees are breakable city trees: locationTrees.)
  // Fountain foundation (never breaks) under both states.
  root.add(bake(s));

  const intact = pieceMesh((g) => {
    fountainBase(g, false);
    fountainTiers(g);
  });
  intact.position.set(0, TOP, 0);
  root.add(intact);
  const broken = pieceMesh((g) => fountainBroken(g));
  broken.position.set(0, TOP, 0);
  broken.visible = false;
  root.add(broken);
  // Water: basin surface, bowl surfaces, falling sheets and the jet.
  const waterMat = new THREE.MeshStandardMaterial({ color: C.water, transparent: true, opacity: 0.78, roughness: 0.15, flatShading: true });
  const sheetMat = new THREE.MeshBasicMaterial({ color: C.waterLight, transparent: true, opacity: 0.55, depthWrite: false });
  const water = new THREE.Group();
  water.position.set(0, TOP, 0);
  const disc = (r, y) => {
    const g = new THREE.CylinderGeometry(r / cos8, r / cos8, 0.04, 8);
    g.rotateY(Math.PI / 8);
    const m = new THREE.Mesh(g, waterMat);
    m.position.y = y;
    water.add(m);
    return m;
  };
  // Basin and bowl surfaces as one mesh, falling sheets as one mesh.
  const discs = [disc(2.04, 0.62), disc(0.98, 1.66), disc(0.52, 2.66)];
  const discGeo = mergeGeometries(discs.map((m) => m.geometry.clone().translate(0, m.position.y, 0)));
  discs.forEach((m) => water.remove(m));
  water.add(new THREE.Mesh(discGeo, waterMat));
  const sheets = [];
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4 + Math.PI / 8;
    for (const [r0, y0, r1, y1] of [[1.1, 1.66, 1.3, 0.64], [0.62, 2.66, 0.78, 1.7]]) {
      const len = Math.hypot(r1 - r0, y1 - y0);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.42, len, 0.03), sheetMat);
      m.position.set(Math.sin(a) * (r0 + r1) / 2, (y0 + y1) / 2, Math.cos(a) * (r0 + r1) / 2);
      m.rotation.set(Math.atan2(r1 - r0, y0 - y1) * Math.cos(a), a, 0, "YXZ");
      m.rotation.x = -Math.atan2(r1 - r0, y0 - y1);
      water.add(m);
      sheets.push(m);
    }
  }
  const sheetGeo = mergeGeometries(
    sheets.map((m) => {
      m.updateMatrix();
      return m.geometry.clone().applyMatrix4(m.matrix);
    }),
  );
  sheets.forEach((m) => water.remove(m));
  const sheetMesh = new THREE.Mesh(sheetGeo, sheetMat);
  water.add(sheetMesh);
  sheets.length = 0;
  sheets.push(sheetMesh);
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.09, 0.9, 6), sheetMat);
  jet.position.y = 3.3;
  water.add(jet);
  root.add(water);
  // Broken: a low puddled basin, water spilling out of the gap, a leak.
  const spill = new THREE.Group();
  spill.position.set(0, TOP, 0);
  spill.visible = false;
  const low = disc.call(null, 2.04, 0.3);
  spill.add(low);
  // Puddles: a big one spreading out through the gap, two smaller ones;
  // they grow to full size after the burst (runtime).
  const puddles = [];
  for (const [x, z, sx, sz] of [[0, 3.6, 2.6, 2.0], [-2.6, 2.4, 1.0, 0.8], [2.4, 2.8, 1.1, 0.9]]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.02, 9), waterMat);
    m.position.set(x, 0.07, z);
    m.userData.full = new THREE.Vector3(sx, 1, sz);
    spill.add(m);
    puddles.push(m);
  }
  // Water pouring over the broken rim into the gap.
  const pour = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 0.04), sheetMat);
  pour.position.set(0, 0.32, 2.2);
  pour.rotation.x = -0.5;
  spill.add(pour);
  // The broken pipe keeps spouting (a steady jet, 3.5 m).
  const leakJet = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 3.5, 6), sheetMat);
  leakJet.geometry.translate(0, 1.75, 0);
  leakJet.position.set(0.05, 0.95, -0.05);
  spill.add(leakJet);
  root.add(spill);

  const w = (x, z) => ({ x: PARK.x + x, z: PARK.z + z });
  // Benches: a pair at each path mouth, on the plaza, facing the fountain
  // (back to the outside), clear of the path lane.
  const benches = [];
  for (let k = 0; k < 4; k++)
    for (const off of [-0.52, 0.52]) {
      const phi = (k * Math.PI) / 2 + off;
      benches.push({ ...w(Math.sin(phi) * 4.35, Math.cos(phi) * 4.35), ry: phi });
    }
  const lamps = [];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    lamps.push({ ...w(Math.sin(a) * 5.7, Math.cos(a) * 5.7), ry: 0 });
  }
  const bins = [];
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    // Beside each path, on the lawn, long side along the path.
    bins.push({ ...w(Math.sin(a) * 6.4 + Math.cos(a) * 2.2, Math.cos(a) * 6.4 - Math.sin(a) * 2.2), ry: a + Math.PI / 2 });
  }
  return {
    root,
    fountain: { x: PARK.x, z: PARK.z, intact, broken, water, sheets, jet, spill, puddles, pour, leakJet, root, state: "intact" },
    benches,
    lamps,
    bins,
  };
}
