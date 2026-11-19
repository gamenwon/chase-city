// V2.0 mission catalog: which missions are shown, in what order.
//
// The order is a setting, not code: the hosting app can set
//   window.CHASE_CITY_CONFIG = { missionOrder: ["parcels", "survival60"] }
// before the game loads (unknown ids are ignored, missions left out are
// hidden). Without it the default order below is used.
import { MISSIONS } from "./missions.js";

export const DEFAULT_MISSION_ORDER = Object.freeze(["survival60", "parcels", "targetHunt"]);

export function missionOrder(config = globalThis.CHASE_CITY_CONFIG) {
  const wanted = Array.isArray(config?.missionOrder)
    ? config.missionOrder
    : DEFAULT_MISSION_ORDER;
  const order = [...new Set(wanted)].filter((id) => MISSIONS[id]);
  return order.length ? order : [...DEFAULT_MISSION_ORDER];
}

// The mission after `id` in the order (wraps to the first), or null if there
// is only one.
export function nextMission(id, order = missionOrder()) {
  if (order.length < 2) return null;
  const i = order.indexOf(id);
  return order[(i + 1) % order.length];
}
