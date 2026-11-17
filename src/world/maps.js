// V2.0 map registry. Each map keeps its own terrain/layout, street objects
// and look; driving, camera and collision code is shared by all maps.
//
// A map entry:
//   id, name, label    identity and the HUD district label
//   createLayout()     buildings, parks and fixed obstacles (world/layout.js
//                      shape: { buildings, parks, obstacles })
//   city               V1.9 street life (props, pedestrians, traffic) on/off
//   theme              colours the renderer reads (sky, fog, ground, road)
//   ready              false = announced but not built yet (not playable)
//
// Only downtown is built. Harbour, mountain and suburb are listed as planned
// so missions and menus can already refer to map ids; adding one means
// writing its createLayout()/theme here and a renderer ground pass for it.
import { createLayout } from "./layout.js";

const DOWNTOWN_THEME = Object.freeze({
  sky: 0x83c8d3,
  fogNear: 105,
  fogFar: 240,
  grass: 0x116748,
  pavement: 0x38535a,
  road: 0x23373e,
  marking: 0xf8eab6,
});

export const MAPS = Object.freeze({
  downtown: Object.freeze({
    id: "downtown",
    name: "다운타운",
    label: "DOWNTOWN / 01",
    tagline: "자유롭게 달려. 오래 버텨.",
    createLayout,
    city: true,
    theme: DOWNTOWN_THEME,
    ready: true,
  }),
  harbor: Object.freeze({
    id: "harbor",
    name: "항구",
    label: "HARBOR / 02",
    ready: false,
  }),
  mountain: Object.freeze({
    id: "mountain",
    name: "산악 도로",
    label: "MOUNTAIN / 03",
    ready: false,
  }),
  suburb: Object.freeze({
    id: "suburb",
    name: "교외",
    label: "SUBURB / 04",
    ready: false,
  }),
});

export const DEFAULT_MAP = "downtown";

export function getMap(id = DEFAULT_MAP) {
  const map = MAPS[id];
  if (!map || !map.ready) throw new Error(`Map not available: ${id}`);
  return map;
}

// Layouts are built once per map and shared (they are read-only).
const layouts = new Map();
export function mapLayout(id = DEFAULT_MAP) {
  if (!layouts.has(id)) layouts.set(id, getMap(id).createLayout());
  return layouts.get(id);
}
