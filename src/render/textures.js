// Material test pass (render/pbr.js): procedural surface textures, drawn
// once on canvases at start-up (no image files, no network). Each surface
// has a DETAIL map (grey around 0.5: it modulates the existing vertex
// colour, so the day/night palette stays as it is) and a NORMAL map made
// from the same height field. Small (256-512 px), tiling, mipmapped.
import * as THREE from "three";

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0) / 4294967296);
}
// Smooth value noise on a wrapping grid (tiles seamlessly).
function valueNoise(n, cells, R) {
  const g = Array.from({ length: cells * cells }, () => R());
  const at = (x, y) => g[((y % cells) + cells) % cells * cells + (((x % cells) + cells) % cells)];
  const s = (t) => t * t * (3 - 2 * t);
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const fx = (x / n) * cells, fy = (y / n) * cells, ix = Math.floor(fx), iy = Math.floor(fy), tx = s(fx - ix), ty = s(fy - iy);
      const a = at(ix, iy), b = at(ix + 1, iy), c = at(ix, iy + 1), d = at(ix + 1, iy + 1);
      out[y * n + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  return out;
}
// Height field -> { detail, normal } canvas textures.
function toTextures(n, height, tone, strength) {
  const dc = document.createElement("canvas"), nc = document.createElement("canvas");
  dc.width = dc.height = nc.width = nc.height = n;
  const di = dc.getContext("2d").createImageData(n, n), ni = nc.getContext("2d").createImageData(n, n);
  const h = (x, y) => height[((y + n) % n) * n + ((x + n) % n)];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4, k = y * n + x;
      const v = Math.max(0, Math.min(255, tone[k] * 255));
      di.data[i] = di.data[i + 1] = di.data[i + 2] = v;
      di.data[i + 3] = 255;
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      ni.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      ni.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      ni.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      ni.data[i + 3] = 255;
    }
  dc.getContext("2d").putImageData(di, 0, 0);
  nc.getContext("2d").putImageData(ni, 0, 0);
  const wrap = (c, srgb) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return t;
  };
  return { detail: wrap(dc, false), normal: wrap(nc, false) };
}

// Asphalt: fine aggregate grain, larger worn patches, a few hairline
// cracks and darker tar seams. Tile: 8 m.
export function asphaltTextures(n = 512) {
  const R = rng(7);
  const fine = new Float32Array(n * n).map(() => R());
  const mid = valueNoise(n, 16, R), big = valueNoise(n, 4, R);
  const height = new Float32Array(n * n), tone = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    height[i] = fine[i] * 0.6 + mid[i] * 0.4;
    tone[i] = 0.5 + (fine[i] - 0.5) * 0.16 + (mid[i] - 0.5) * 0.12 + (big[i] - 0.5) * 0.14;
  }
  // Cracks: random walks, a little darker and lower.
  for (let c = 0; c < 9; c++) {
    let x = R() * n, y = R() * n, a = R() * Math.PI * 2;
    for (let s = 0; s < 60 + R() * 90; s++) {
      a += (R() - 0.5) * 0.7;
      x = (x + Math.cos(a) + n) % n;
      y = (y + Math.sin(a) + n) % n;
      const k = Math.floor(y) * n + Math.floor(x);
      tone[k] *= 0.55;
      height[k] -= 0.6;
    }
  }
  return toTextures(n, height, tone, 2.2);
}
// Paving blocks: rectangular pavers (0.5 x 0.25 m) in a running bond,
// grout joints, each block its own shade, slightly domed. Tile: 2 m.
export function pavingTextures(n = 512) {
  const R = rng(11);
  const height = new Float32Array(n * n), tone = new Float32Array(n * n);
  const rows = 8, cols = 4, bw = n / cols, bh = n / rows;
  const shade = Array.from({ length: rows * cols * 2 }, () => (R() - 0.5) * 0.18);
  const grain = new Float32Array(n * n).map(() => R());
  for (let y = 0; y < n; y++) {
    const r = Math.floor(y / bh), off = r % 2 ? bw / 2 : 0;
    for (let x = 0; x < n; x++) {
      const xx = (x + off) % n, c = Math.floor(xx / bw);
      const lx = (xx % bw) / bw, ly = (y % bh) / bh;
      const edge = Math.min(lx, 1 - lx) * bw, edgeY = Math.min(ly, 1 - ly) * bh;
      const joint = Math.min(edge, edgeY);
      const k = y * n + x;
      if (joint < 2.2) {
        height[k] = 0;
        tone[k] = 0.32;
      } else {
        const dome = Math.min(1, joint / 7);
        height[k] = 0.55 + dome * 0.45 + grain[k] * 0.08;
        tone[k] = 0.52 + shade[r * cols + c] + (grain[k] - 0.5) * 0.08;
      }
    }
  }
  return toTextures(n, height, tone, 2.6);
}
// Brick: running bond, mortar joints recessed and lighter, each brick a
// little different. Tile: 2 m wide, 1 m high (bricks 0.5 x 0.17 m, big
// enough not to shimmer at the game camera's distance).
export function brickTextures(n = 512) {
  const R = rng(23);
  const height = new Float32Array(n * n), tone = new Float32Array(n * n);
  const rows = 6, cols = 4, bw = n / cols, bh = n / 2 / rows; // the tile is 2:1 -> two halves of the canvas height
  const shade = Array.from({ length: 64 }, () => (R() - 0.5) * 0.22);
  const grain = new Float32Array(n * n).map(() => R());
  for (let y = 0; y < n; y++) {
    const r = Math.floor(y / (n / 12)), off = r % 2 ? bw / 2 : 0, rh = n / 12;
    for (let x = 0; x < n; x++) {
      const xx = (x + off) % n, c = Math.floor(xx / bw);
      const lx = (xx % bw) / bw, ly = (y % rh) / rh;
      const joint = Math.min(Math.min(lx, 1 - lx) * bw, Math.min(ly, 1 - ly) * rh);
      const k = y * n + x;
      if (joint < 2.5) {
        height[k] = 0.1;
        tone[k] = 0.72;
      } else {
        height[k] = 0.7 + grain[k] * 0.12;
        tone[k] = 0.5 + shade[(r * cols + c) % 64] + (grain[k] - 0.5) * 0.12;
      }
    }
  }
  void bh;
  return toTextures(n, height, tone, 2.4);
}
// Plaster (painted render) for the coloured walls, and the roofs at a
// larger scale: fine sand grain, soft blotches, faint vertical rain
// streaks. Tile: 4 m.
export function plasterTextures(n = 512) {
  const R = rng(41);
  const fine = new Float32Array(n * n).map(() => R());
  const mid = valueNoise(n, 12, R), big = valueNoise(n, 3, R), streak = valueNoise(n, 24, R);
  const height = new Float32Array(n * n), tone = new Float32Array(n * n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      // (Streaks: noise stretched along the height of the wall.)
      const s = streak[x % n];
      height[i] = fine[i] * 0.5 + mid[i] * 0.5;
      tone[i] = 0.5 + (fine[i] - 0.5) * 0.07 + (mid[i] - 0.5) * 0.08 + (big[i] - 0.5) * 0.1 - Math.max(0, s - 0.62) * 0.35;
    }
  return toTextures(n, height, tone, 1.4);
}
