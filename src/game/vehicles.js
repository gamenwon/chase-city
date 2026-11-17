// V2.0 player vehicles: driving stats per car and the data a later unlock /
// collection screen needs. Only the starter car is in play now; its numbers
// are exactly the values the game used before V2.0 (CONFIG), so choosing it
// changes nothing about difficulty.
//
//   topSpeed   m/s the car settles at (auto-forward driving)
//   turnRate   rad/s at full steering
//   grip       how fast the car's velocity follows its heading (1/s)
//   durability damage taken is scaled by 100 / durability
//   unlock     how a car is obtained: { type: "starter" } or
//              { type: "credits", cost } (game credits, never app points)
import { CONFIG } from "./config.js";

export const VEHICLES = Object.freeze({
  starter: Object.freeze({
    id: "starter",
    name: "스타터 쿠페",
    description: "기본 차량. 모든 미션의 기준 성능.",
    stats: Object.freeze({
      topSpeed: CONFIG.playerSpeed,
      turnRate: CONFIG.turnRate,
      grip: 10,
      durability: 100,
    }),
    unlock: Object.freeze({ type: "starter" }),
    model: "classic",
  }),
  // Data-only sample for the unlock structure (and the V2.0 art sample car).
  // Not selectable yet: there is no unlock screen in this version.
  boxy: Object.freeze({
    id: "boxy",
    name: "박스 미니",
    description: "짧고 단단한 박스카. 느리지만 잘 버틴다.",
    stats: Object.freeze({
      topSpeed: 22,
      turnRate: 1.9,
      grip: 11,
      durability: 125,
    }),
    unlock: Object.freeze({ type: "credits", cost: 3000 }),
    model: "boxy",
    available: false,
  }),
});

export const DEFAULT_VEHICLE = "starter";

export function getVehicle(id = DEFAULT_VEHICLE) {
  return VEHICLES[id] || VEHICLES[DEFAULT_VEHICLE];
}

// Ratings 1-5 for a car card (relative to the slowest/fastest defined car).
export function vehicleRatings(vehicle) {
  const all = Object.values(VEHICLES).map((v) => v.stats);
  const rate = (key) => {
    const values = all.map((s) => s[key]);
    const lo = Math.min(...values),
      hi = Math.max(...values);
    return hi === lo
      ? 3
      : Math.round(1 + ((vehicle.stats[key] - lo) / (hi - lo)) * 4);
  };
  return {
    speed: rate("topSpeed"),
    handling: rate("turnRate"),
    durability: rate("durability"),
  };
}
